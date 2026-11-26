// @effect-diagnostics nodeBuiltinImport:off - the packaged macOS sidecar needs Node's child process API.
import * as NodeChildProcess from "node:child_process";

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

type WaitForReadyResult =
  | { readonly ok: true; readonly child: NodeChildProcess.ChildProcess }
  | { readonly ok: false; readonly detail: string | null };

const waitForReady = (binaryPath: string) =>
  Effect.callback<WaitForReadyResult>((resume) => {
    let child: NodeChildProcess.ChildProcess | undefined;
    let settled = false;
    let stdoutBuffer = "";
    let stderrBuffer = "";
    const finish = (result: WaitForReadyResult) => {
      if (settled) return;
      settled = true;
      resume(Effect.succeed(result));
    };

    try {
      child = NodeChildProcess.spawn(
        binaryPath,
        ["--listen-port", "80", "--target-port", String(LOCAL_DOMAIN_PROXY_PORT)],
        {
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
    } catch (error) {
      finish({
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
      return Effect.void;
    }

    child.stdout?.on("data", (chunk: Buffer) => {
      if (settled || !child) return;
      stdoutBuffer += chunk.toString("utf8");
      if (stdoutBuffer.includes("ready\n")) {
        finish({ ok: true, child });
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderrBuffer.length < 1_024) {
        stderrBuffer += chunk.toString("utf8");
      }
    });
    child.once("error", (error) => finish({ ok: false, detail: error.message }));
    child.once("exit", (code, signal) =>
      finish({
        ok: false,
        detail:
          stderrBuffer.trim() ||
          `exited (${code !== null ? `code ${code}` : `signal ${signal ?? "unknown"}`})`,
      }),
    );

    return Effect.sync(() => {
      if (!settled) child?.kill("SIGTERM");
    });
  }).pipe(
    Effect.timeout(LOCAL_DOMAIN_LISTENER_READY_TIMEOUT_MS),
    Effect.orElseSucceed((): WaitForReadyResult => ({
      ok: false,
      detail: "timed out waiting for ready",
    })),
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
    let child: NodeChildProcess.ChildProcess | undefined;
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
      if (!started.ok) {
        yield* Effect.logWarning(
          "Could not claim local domain port 80; using port 7777.",
          started.detail ? { detail: started.detail } : {},
        );
        return;
      }

      child = started.child;
      ready = true;
      started.child.once("exit", () => {
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
