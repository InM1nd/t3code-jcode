import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import type * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

import { startJcodeSessionDaemon, type JcodeSessionDaemonInput } from "./sessionDaemon.ts";

/**
 * Share one `jcode serve` daemon per (binary, provider, model, profile) across sessions.
 * Model is fixed at `serve -m`; the last session to leave stops the daemon.
 */

type PoolInput = Omit<JcodeSessionDaemonInput, "socketPath" | "cwd" | "threadId">;

interface Entry {
  readonly scope: Scope.Closeable;
  readonly socketPath: string;
  refs: number;
}

function jcodeDaemonPoolKey(input: PoolInput): string {
  return JSON.stringify([
    input.binaryPath?.trim() || "jcode",
    input.provider,
    input.model,
    input.providerProfile?.trim() ?? "",
  ]);
}

export const makeJcodeDaemonPool = (options: {
  readonly spawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
}) => {
  const entries = new Map<string, Entry>();
  const lock = Semaphore.makeUnsafe(1);

  const start = Effect.fn("JcodeDaemonPool.start")(function* (key: string, input: PoolInput) {
    const scope = yield* Scope.make();
    return yield* Effect.gen(function* () {
      const directory = yield* options.fileSystem.makeTempDirectoryScoped({
        prefix: "jcode-daemon-",
      });
      const daemon = yield* startJcodeSessionDaemon(
        {
          ...input,
          threadId: "pool",
          // Not a project directory: the daemon must not pick up one project's
          // `.jcode/mcp.json` for every session it serves.
          cwd: directory,
          socketPath: options.path.join(directory, "daemon.sock"),
        },
        options.spawner,
      );
      const entry: Entry = { scope, socketPath: daemon.socketPath, refs: 0 };
      yield* daemon.handle.exitCode.pipe(
        Effect.ignore,
        Effect.andThen(
          Effect.sync(() => {
            if (entries.get(key) === entry) entries.delete(key);
          }),
        ),
        Effect.forkIn(scope),
      );
      return entry;
    }).pipe(
      Scope.provide(scope),
      Effect.provideService(FileSystem.FileSystem, options.fileSystem),
      Effect.provideService(Path.Path, options.path),
      Effect.onError(() => Scope.close(scope, Exit.void)),
    );
  });

  /** The socket of a daemon for `input`, held until the caller's scope closes. */
  const acquire = (input: PoolInput) => {
    const key = jcodeDaemonPoolKey(input);
    return Effect.acquireRelease(
      lock.withPermits(1)(
        Effect.gen(function* () {
          const entry = entries.get(key) ?? (yield* start(key, input));
          entries.set(key, entry);
          entry.refs += 1;
          return entry;
        }),
      ),
      (entry) =>
        lock.withPermits(1)(
          Effect.suspend(() => {
            entry.refs -= 1;
            if (entry.refs > 0) return Effect.void;
            if (entries.get(key) === entry) entries.delete(key);
            return Scope.close(entry.scope, Exit.void);
          }),
        ),
    ).pipe(Effect.map((entry) => entry.socketPath));
  };

  return { acquire, size: () => entries.size };
};
