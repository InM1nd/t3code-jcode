import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import type { ChildProcessSpawner } from "effect/process";

import { startJcodeSessionDaemon, type JcodeSessionDaemonInput } from "./JcodeSessionDaemon.ts";

/**
 * One `jcode serve` per (binary, provider, model, profile), shared by every
 * session that launches with it. A daemon costs ~0.9 GB after its first turn
 * and each extra session on it ~30 MB, so per-session daemons multiply memory
 * by the number of open Jcode threads.
 *
 * Sharing is safe because jcode keys session state by the ACP session: each
 * session gets its own cwd and loads `.jcode/mcp.json` from it, so every
 * thread keeps its own t3-code credential. The model is not per session (jcode
 * takes it from `serve -m` and rejects `session/set_model`), hence the key.
 *
 * The last session to leave stops the daemon. A daemon that exits on its own
 * drops out of the pool; sessions on it fail like any lost ACP transport and
 * the next session start spawns a fresh one.
 */

type PoolInput = Omit<JcodeSessionDaemonInput, "socketPath" | "cwd" | "threadId">;

interface Entry {
  readonly scope: Scope.Closeable;
  readonly socketPath: string;
  refs: number;
}

export function jcodeDaemonPoolKey(input: PoolInput): string {
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
