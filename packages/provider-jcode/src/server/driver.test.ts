import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import { ProviderInstanceId } from "@t3tools/contracts";
import * as IdAllocator from "@t3tools/provider-core/server/IdAllocator";
import * as McpProviderSessions from "@t3tools/provider-core/server/McpProviderSessions";
import * as ProviderEventLoggers from "@t3tools/provider-core/server/ProviderEventLoggers";
import * as TestProviderHost from "@t3tools/provider-testing/TestProviderHost";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

import { JcodeSettings } from "../settings.ts";
import {
  JCODE_DRIVER_KIND,
  makeJcodeAcpAdapterFlavor,
  makeJcodeAdapterV2,
  makeJcodeAdapterV2Driver,
  type JcodeAdapterV2Options,
} from "../testing.ts";
import { JcodeDriver } from "./driver.ts";

const decodeSettings = Schema.decodeSync(JcodeSettings);

describe("JcodeDriver defaults", () => {
  it("defaults to enabled=true and binaryPath=jcode", () => {
    const defaults = JcodeDriver.defaultConfig();
    assert.isTrue(defaults.enabled);
    assert.equal(defaults.binaryPath, "jcode");
    assert.equal(JcodeDriver.driverKind, JCODE_DRIVER_KIND);
  });
});

const layerTest = TestProviderHost.layer({ runBackgroundWork: false }).pipe(
  Layer.provideMerge(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer)),
  Layer.provideMerge(IdAllocator.layer),
  Layer.provideMerge(McpProviderSessions.layer),
  Layer.provideMerge(
    Layer.succeed(
      ProviderEventLoggers.ProviderEventLoggers,
      ProviderEventLoggers.NoOpProviderEventLoggers,
    ),
  ),
);

function recordingSpawner(launches: Array<string>) {
  return ChildProcessSpawner.make((command) => {
    const standard = ChildProcess.isStandardCommand(command);
    if (standard) launches.push(command.command);
    const isVersion = standard && command.args.join(" ") === "version";
    return Effect.succeed(
      ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(1),
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(isVersion ? 0 : 2)),
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        unref: Effect.succeed(Effect.void),
        stdin: Sink.drain,
        stdout: isVersion ? Stream.encodeText(Stream.make("jcode 0.9.4\n")) : Stream.empty,
        stderr: Stream.empty,
        all: Stream.empty,
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
      }),
    );
  });
}

it.layer(layerTest)("JcodeDriver runtime wiring", (it) => {
  it.effect("expands ~/ binaryPath, probes jcode, and wires adapter + textGeneration", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const launches: Array<string> = [];
      const instance = yield* JcodeDriver.create({
        instanceId: ProviderInstanceId.make("jcode-home"),
        displayName: undefined,
        enabled: true,
        environment: [],
        config: decodeSettings({ binaryPath: "~/.local/bin/jcode" }),
      }).pipe(
        Effect.provideService(HostProcess.HomeDirectory, "/test-home"),
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, recordingSpawner(launches)),
      );
      const snapshot = yield* instance.snapshot.refresh;
      assert.isNotEmpty(launches);
      assert.deepEqual([...new Set(launches)], [path.join("/test-home", ".local", "bin", "jcode")]);
      assert.isTrue(snapshot.installed);
      assert.equal(snapshot.status, "ready");
      const capabilities = yield* instance.orchestrationAdapter.getCapabilities();
      assert.isFalse(capabilities.sessions.supportsModelSwitchInSession);
      assert.isDefined(instance.textGeneration);
    }),
  );

  it.effect(
    "configures JcodeAcpAdapterFlavor with reportsPerTurnPromptUsage=true and builds adapter",
    () =>
      Effect.gen(function* () {
        const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const mcpProviderSessions = yield* McpProviderSessions.McpProviderSessions;

        const options: JcodeAdapterV2Options = {
          instanceId: ProviderInstanceId.make("jcode-flavor-test"),
          settings: decodeSettings({}),
          environment: {},
          selfInvocation: { command: process.execPath, entrypoint: undefined },
        };
        const flavor = makeJcodeAcpAdapterFlavor(options, {
          childProcessSpawner,
          fileSystem,
          path,
          secretsDir: "/tmp/t3code-jcode-secrets",
          mcpProviderSessions,
        });
        assert.isTrue(flavor.reportsPerTurnPromptUsage);
        assert.isFalse(flavor.capabilities.sessions.supportsModelSwitchInSession);

        const adapter = yield* makeJcodeAdapterV2(options);
        assert.equal(adapter.driver, JCODE_DRIVER_KIND);

        const driver = makeJcodeAdapterV2Driver();
        assert.equal(driver.driverKind, JCODE_DRIVER_KIND);
      }),
  );
});
