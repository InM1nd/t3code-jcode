import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

import { JcodeSettings } from "../settings.ts";
import {
  buildInitialJcodeProviderSnapshot,
  checkJcodeProviderStatus,
  jcodeModelsFromModelList,
} from "../testing.ts";

const decodeSettings = Schema.decodeSync(JcodeSettings);
const encoder = new TextEncoder();

function makeHandle(output: {
  readonly code: number;
  readonly stdout?: string;
  readonly stderr?: string;
}) {
  const stdout = output.stdout ?? "";
  const stderr = output.stderr ?? "";
  return ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(900_000_101),
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(output.code)),
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    unref: Effect.succeed(Effect.void),
    stdin: Sink.drain,
    stdout: stdout.length === 0 ? Stream.empty : Stream.succeed(encoder.encode(stdout)),
    stderr: stderr.length === 0 ? Stream.empty : Stream.succeed(encoder.encode(stderr)),
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
  });
}

describe("Jcode provider status", () => {
  it("parses deduplicated model slugs for known inner providers and ignores unknown ones", () => {
    const models = jcodeModelsFromModelList(
      "claude",
      "\nclaude-opus-5\nclaude-sonnet-4-6\nclaude-opus-5\nignored with spaces\n",
    );
    assert.deepEqual(
      models.map((m) => ({
        slug: m.slug,
        subProvider: m.subProvider,
        isDefault: m.isDefault ?? false,
      })),
      [
        { slug: "claude-opus-5", subProvider: "Claude", isDefault: true },
        { slug: "claude-sonnet-4-6", subProvider: "Claude", isDefault: false },
      ],
    );
    assert.deepEqual(jcodeModelsFromModelList("unknown-provider", "foo\n"), []);
  });

  it.effect("builds an initial disabled or probing snapshot", () =>
    Effect.gen(function* () {
      const disabled = yield* buildInitialJcodeProviderSnapshot(decodeSettings({ enabled: false }));
      assert.isFalse(disabled.enabled);
      assert.isFalse(disabled.installed);
      assert.equal(disabled.status, "disabled");

      const enabled = yield* buildInitialJcodeProviderSnapshot(decodeSettings({ enabled: true }));
      assert.isTrue(enabled.enabled);
      assert.isTrue(enabled.installed);
      assert.equal(enabled.status, "warning");
      assert.isNotEmpty(enabled.models);
    }),
  );

  it.effect("returns disabled status without spawning jcode when disabled", () =>
    Effect.gen(function* () {
      let spawns = 0;
      const spawner = ChildProcessSpawner.make(() => {
        spawns += 1;
        return Effect.succeed(makeHandle({ code: 0, stdout: "jcode 1.0.0\n" }));
      });
      const draft = yield* checkJcodeProviderStatus(decodeSettings({ enabled: false }), {}).pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
      );
      assert.equal(spawns, 0);
      assert.equal(draft.status, "disabled");
      assert.isFalse(draft.enabled);
      assert.isFalse(draft.installed);
    }),
  );

  it.effect("reports not installed when jcode binary is missing (ENOENT)", () =>
    Effect.gen(function* () {
      const spawner = ChildProcessSpawner.make(() =>
        Effect.fail(
          PlatformError.systemError({
            _tag: "NotFound",
            module: "ChildProcess",
            method: "spawn",
            pathOrDescriptor: "jcode",
            cause: Object.assign(new Error("spawn jcode ENOENT"), { code: "ENOENT" }),
          }),
        ),
      );
      const draft = yield* checkJcodeProviderStatus(decodeSettings({ enabled: true }), {}).pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
      );
      assert.equal(draft.status, "error");
      assert.isFalse(draft.installed);
      assert.include(draft.message ?? "", "not installed");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("reports error when jcode version exits non-zero", () =>
    Effect.gen(function* () {
      const spawner = ChildProcessSpawner.make(() =>
        Effect.succeed(makeHandle({ code: 2, stderr: "broken installation\n" })),
      );
      const draft = yield* checkJcodeProviderStatus(decodeSettings({ enabled: true }), {}).pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
      );
      assert.equal(draft.status, "error");
      assert.isTrue(draft.installed);
      assert.include(draft.message ?? "", "failed to run");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "reports ready with discovered and custom models when version and model list succeed",
    () =>
      Effect.gen(function* () {
        const spawner = ChildProcessSpawner.make((command) => {
          if (!ChildProcess.isStandardCommand(command)) {
            return Effect.succeed(makeHandle({ code: 1 }));
          }
          if (command.args[0] === "version") {
            return Effect.succeed(makeHandle({ code: 0, stdout: "jcode 0.9.4\n" }));
          }
          if (command.args[0] === "model" && command.args[1] === "list") {
            const providerIndex = command.args.indexOf("-p");
            const providerId = providerIndex >= 0 ? command.args[providerIndex + 1] : undefined;
            if (providerId === "claude") {
              return Effect.succeed(
                makeHandle({ code: 0, stdout: "claude-opus-5\nclaude-sonnet-4-6\n" }),
              );
            }
            if (providerId === "openai") {
              return Effect.succeed(makeHandle({ code: 0, stdout: "gpt-5.4\n" }));
            }
            return Effect.succeed(makeHandle({ code: 1, stderr: "provider not configured" }));
          }
          return Effect.succeed(makeHandle({ code: 1 }));
        });

        const draft = yield* checkJcodeProviderStatus(
          decodeSettings({
            enabled: true,
            customModels: ["my-custom-jcode-model"],
          }),
          {},
        ).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner));

        assert.equal(draft.status, "ready");
        assert.isTrue(draft.installed);
        assert.equal(draft.version, "0.9.4");
        assert.deepEqual(
          draft.models.map((m) => m.slug),
          ["claude-opus-5", "claude-sonnet-4-6", "gpt-5.4", "my-custom-jcode-model"],
        );
      }).pipe(Effect.provide(NodeServices.layer)),
  );
});
