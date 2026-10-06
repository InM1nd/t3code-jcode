// @effect-diagnostics nodeBuiltinImport:off - the packaged macOS sidecar needs Node's child process API.
import { spawn, type ChildProcess } from "node:child_process";

import { LOCAL_DOMAIN_PROXY_PORT } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";

import * as DesktopEnvironment from "./DesktopEnvironment.ts";

const LOCAL_DOMAIN_LISTENER_PORT = 80;
const LOCAL_DOMAIN_LISTENER_READY_TIMEOUT_MS = 2_000;
const LOCAL_DOMAIN_LISTENER_BINARY_NAME = "t3-local-domain-listener";

export const shouldStartLocalDomainListener = (input: {
  readonly platform: NodeJS.Platform;
  readonly isPackaged: boolean;
  readonly isDevelopment: boolean;
}) => input.platform === "darwin" && input.isPackaged && !input.isDevelopment;

export class DesktopLocalDomainListener extends Context.Service<
  DesktopLocalDomainListener,
  {
    readonly start: Effect.Effect<void, never, Scope.Scope>;
    readonly publicPort: Effect.Effect<number>;
  }
>()("@t3tools/desktop/app/DesktopLocalDomainListener") {}

const waitForReady = (binaryPath: string) =>
  Effect.callback<ChildProcess | null>((resume) => {
    let child: ChildProcess | undefined;
    let settled = false;
    const finish = (result: ChildProcess | null) => {
      if (settled) return;
      settled = true;
      resume(Effect.succeed(result));
    };

    try {
      child = spawn(
        binaryPath,
        ["--listen-port", "80", "--target-port", String(LOCAL_DOMAIN_PROXY_PORT)],
        {
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
    } catch {
      finish(null);
      return Effect.void;
    }

    child.stdout?.on("data", (chunk: Buffer) => {
      if (child && chunk.toString("utf8").includes("ready\n")) finish(child);
    });
    child.once("error", () => finish(null));
    child.once("exit", () => finish(null));

    return Effect.sync(() => {
      if (!settled) child?.kill("SIGTERM");
    });
  }).pipe(
    Effect.timeout(LOCAL_DOMAIN_LISTENER_READY_TIMEOUT_MS),
    Effect.orElseSucceed(() => null),
  );

export const layer = Layer.effect(
  DesktopLocalDomainListener,
  Effect.gen(function* () {
    const environment = yield* DesktopEnvironment.DesktopEnvironment;
    const fileSystem = yield* FileSystem.FileSystem;
    const binaryPath = environment.path.join(
      environment.resourcesPath,
      "local-domain-listener",
      LOCAL_DOMAIN_LISTENER_BINARY_NAME,
    );
    let child: ChildProcess | undefined;
    let ready = false;

    const start = Effect.gen(function* () {
      if (!shouldStartLocalDomainListener(environment) || ready) return;
      const binaryExists = yield* fileSystem
        .exists(binaryPath)
        .pipe(Effect.orElseSucceed(() => false));
      if (!binaryExists) {
        yield* Effect.logWarning("Local domain listener is unavailable; using port 7777.", {
          binaryPath,
        });
        return;
      }

      const started = yield* waitForReady(binaryPath);
      if (started === null) {
        yield* Effect.logWarning("Could not claim local domain port 80; using port 7777.");
        return;
      }

      child = started;
      ready = true;
      started.once("exit", () => {
        ready = false;
        child = undefined;
      });
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          child?.kill("SIGTERM");
        }),
      );
      yield* Effect.logInfo("Local domain listener ready on 127.0.0.1:80.");
    });

    return DesktopLocalDomainListener.of({
      start,
      publicPort: Effect.sync(() => (ready ? LOCAL_DOMAIN_LISTENER_PORT : LOCAL_DOMAIN_PROXY_PORT)),
    });
  }),
);
