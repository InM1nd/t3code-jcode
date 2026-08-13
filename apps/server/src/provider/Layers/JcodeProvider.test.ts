import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { JcodeSettings } from "@t3tools/contracts";

import {
  buildInitialJcodeProviderSnapshot,
  checkJcodeProviderStatus,
  jcodeModelsFromModelList,
} from "./JcodeProvider.ts";

const decodeJcodeSettings = Schema.decodeSync(JcodeSettings);

describe("buildInitialJcodeProviderSnapshot", () => {
  it.effect("returns a disabled snapshot when settings.enabled is false", () =>
    Effect.gen(function* () {
      const snapshot = yield* buildInitialJcodeProviderSnapshot(
        decodeJcodeSettings({ enabled: false }),
      );
      expect(snapshot.enabled).toBe(false);
      expect(snapshot.status).toBe("disabled");
      expect(snapshot.installed).toBe(false);
      expect(snapshot.message).toContain("disabled");
    }),
  );

  it.effect("returns a pending snapshot by default", () =>
    Effect.gen(function* () {
      const snapshot = yield* buildInitialJcodeProviderSnapshot(decodeJcodeSettings({}));
      expect(snapshot.enabled).toBe(true);
      expect(snapshot.installed).toBe(true);
      expect(snapshot.status).toBe("warning");
      expect(snapshot.version).toBeNull();
      expect(snapshot.message).toContain("Checking Jcode");
      expect(snapshot.requiresNewThreadForModelChange).toBe(true);
    }),
  );
});

describe("jcodeModelsFromModelList", () => {
  it("keeps Jcode reasoning and fast model variants", () => {
    expect(
      jcodeModelsFromModelList("cursor", "composer-2\ncomposer-2-fast\ncursor-grok-4.5-high\n"),
    ).toMatchObject([
      { slug: "composer-2", subProvider: "Cursor", isDefault: true },
      { slug: "composer-2-fast", subProvider: "Cursor" },
      { slug: "cursor-grok-4.5-high", subProvider: "Cursor" },
    ]);
  });
});

it.layer(NodeServices.layer)("checkJcodeProviderStatus", (it) => {
  it.effect("reports the binary as missing when the binary path does not resolve", () =>
    Effect.gen(function* () {
      const snapshot = yield* checkJcodeProviderStatus(
        decodeJcodeSettings({
          enabled: true,
          binaryPath: "/definitely/not/installed/jcode-binary",
        }),
      );
      expect(snapshot.enabled).toBe(true);
      expect(snapshot.installed).toBe(false);
      expect(snapshot.status).toBe("error");
      expect(snapshot.message).toMatch(/not installed|not on PATH|Failed to execute/);
    }),
  );

  it.effect("reports an installed CLI as unhealthy when version exits non-zero", () =>
    Effect.gen(function* () {
      const secretStderr = "broken jcode install: secret-token-value";
      const snapshot = yield* Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const dir = yield* fs.makeTempDirectoryScoped({ prefix: "t3code-jcode-version-" });
          const jcodePath = path.join(dir, "jcode");
          yield* fs.writeFileString(
            jcodePath,
            ["#!/bin/sh", `printf "%s\\n" "${secretStderr}" >&2`, "exit 2", ""].join("\n"),
          );
          yield* fs.chmod(jcodePath, 0o755);

          return yield* checkJcodeProviderStatus(
            decodeJcodeSettings({ enabled: true, binaryPath: jcodePath }),
          );
        }),
      );

      expect(snapshot.enabled).toBe(true);
      expect(snapshot.installed).toBe(true);
      expect(snapshot.status).toBe("error");
      expect(snapshot.message).toBe("Jcode CLI is installed but failed to run.");
      expect(snapshot.message).not.toContain(secretStderr);
    }),
  );

  it.effect("falls back to configured models when model discovery is unavailable", () =>
    Effect.gen(function* () {
      const snapshot = yield* Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const dir = yield* fs.makeTempDirectoryScoped({ prefix: "t3code-jcode-success-" });
          const jcodePath = path.join(dir, "jcode");
          yield* fs.writeFileString(
            jcodePath,
            ["#!/bin/sh", 'printf "jcode-cli 0.0.99\\n"', "exit 0", ""].join("\n"),
          );
          yield* fs.chmod(jcodePath, 0o755);

          return yield* checkJcodeProviderStatus(
            decodeJcodeSettings({ enabled: true, binaryPath: jcodePath }),
          );
        }),
      );

      expect(snapshot.status).toBe("ready");
      expect(snapshot.installed).toBe(true);
      expect(snapshot.models.map((model) => model.slug)).toEqual(["claude-opus-5"]);
      expect(snapshot.message).toBeUndefined();
    }),
  );
});
