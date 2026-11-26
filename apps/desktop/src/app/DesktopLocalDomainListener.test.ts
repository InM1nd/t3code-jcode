import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import { LOCAL_DOMAIN_PROXY_PORT } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Scope from "effect/Scope";

import * as DesktopConfig from "./DesktopConfig.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import {
  DesktopLocalDomainListener,
  layer as DesktopLocalDomainListenerLive,
  shouldStartLocalDomainListener,
} from "./DesktopLocalDomainListener.ts";

function makeListenerLayer(resourcesPath: string, platform: NodeJS.Platform = "darwin") {
  const envLayer = DesktopEnvironment.layer({
    dirname: "/repo/apps/desktop/src",
    homeDirectory: resourcesPath,
    platform,
    processArch: "arm64",
    appVersion: "1.2.3",
    appPath: "/repo",
    isPackaged: true,
    resourcesPath,
    runningUnderArm64Translation: false,
  }).pipe(
    Layer.provide(
      Layer.mergeAll(
        NodeServices.layer,
        DesktopConfig.layerTest({
          T3CODE_HOME: resourcesPath,
          T3CODE_MODE: "desktop",
        }),
      ),
    ),
  );
  return DesktopLocalDomainListenerLive.pipe(
    Layer.provide(envLayer),
    Layer.provideMerge(NodeServices.layer),
  );
}

describe("DesktopLocalDomainListener", () => {
  it("only enables the packaged macOS listener", () => {
    assert.isTrue(
      shouldStartLocalDomainListener({
        platform: "darwin",
        isPackaged: true,
        isDevelopment: false,
      }),
    );
    assert.isFalse(
      shouldStartLocalDomainListener({
        platform: "darwin",
        isPackaged: false,
        isDevelopment: true,
      }),
    );
    assert.isFalse(
      shouldStartLocalDomainListener({ platform: "linux", isPackaged: true, isDevelopment: false }),
    );
  });

  it.live("falls back to port 7777 when the native listener binary is missing", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const tempDir = yield* fs.makeTempDirectoryScoped();
        const port = yield* Effect.gen(function* () {
          const listener = yield* DesktopLocalDomainListener;
          yield* listener.start;
          return yield* listener.publicPort;
        }).pipe(Effect.provide(makeListenerLayer(tempDir)));
        assert.strictEqual(port, LOCAL_DOMAIN_PROXY_PORT);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  // oxlint-disable-next-line t3code/no-global-process-runtime -- POSIX executable script test skips Windows.
  it.live.skipIf(process.platform === "win32")(
    "advertises port 80 once ready and stops the listener when the scope closes",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const tempDir = yield* fs.makeTempDirectoryScoped();
          const binaryDir = path.join(tempDir, "local-domain-listener");
          const binaryPath = path.join(binaryDir, "t3-local-domain-listener");
          const markerPath = path.join(tempDir, "stopped");
          yield* fs.makeDirectory(binaryDir, { recursive: true });
          yield* fs.writeFileString(
            binaryPath,
            `#!${process.execPath}
const fs = require("node:fs");
process.on("SIGTERM", () => {
  fs.writeFileSync(${JSON.stringify(markerPath)}, "stopped");
  process.exit(0);
});
process.stdout.write("rea");
setTimeout(() => process.stdout.write("dy\\n"), 10);
setInterval(() => {}, 1000);
`,
          );
          yield* fs.chmod(binaryPath, 0o755);

          const scope = yield* Scope.make();
          const port = yield* Effect.gen(function* () {
            const listener = yield* DesktopLocalDomainListener;
            yield* listener.start;
            return yield* listener.publicPort;
          }).pipe(Effect.provide(makeListenerLayer(tempDir)), Scope.provide(scope));
          assert.strictEqual(port, 80);

          yield* Scope.close(scope, Exit.void);
          let stopped = false;
          for (let attempt = 0; attempt < 40; attempt += 1) {
            if (yield* fs.exists(markerPath)) {
              stopped = true;
              break;
            }
            yield* Effect.sleep("25 millis");
          }
          assert.isTrue(stopped);
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
  );

  // oxlint-disable-next-line t3code/no-global-process-runtime -- POSIX executable script test skips Windows.
  it.live.skipIf(process.platform === "win32")(
    "falls back to port 7777 when the listener exits before ready (e.g. port 80 collision)",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const tempDir = yield* fs.makeTempDirectoryScoped();
          const binaryDir = path.join(tempDir, "local-domain-listener");
          const binaryPath = path.join(binaryDir, "t3-local-domain-listener");
          yield* fs.makeDirectory(binaryDir, { recursive: true });
          yield* fs.writeFileString(
            binaryPath,
            "#!/bin/sh\necho 'Address already in use' >&2\nexit 1\n",
          );
          yield* fs.chmod(binaryPath, 0o755);

          const port = yield* Effect.gen(function* () {
            const listener = yield* DesktopLocalDomainListener;
            yield* listener.start;
            return yield* listener.publicPort;
          }).pipe(Effect.provide(makeListenerLayer(tempDir)));
          assert.strictEqual(port, LOCAL_DOMAIN_PROXY_PORT);
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
  );
});
