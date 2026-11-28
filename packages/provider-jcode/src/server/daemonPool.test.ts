import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Scope from "effect/Scope";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

import { makeJcodeDaemonPool } from "./daemonPool.ts";

const fakeDaemons = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const spawned: Array<{
    readonly model: string;
    killed: boolean;
    readonly exit: Deferred.Deferred<ChildProcessSpawner.ExitCode>;
  }> = [];
  const spawner = ChildProcessSpawner.make((command) =>
    Effect.gen(function* () {
      const args = (command as { readonly args: ReadonlyArray<string> }).args;
      yield* fileSystem.writeFileString(args[args.indexOf("--socket") + 1]!, "");
      const daemon = {
        model: args[args.indexOf("-m") + 1]!,
        killed: false,
        exit: yield* Deferred.make<ChildProcessSpawner.ExitCode>(),
      };
      spawned.push(daemon);
      const handle = ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(spawned.length),
        exitCode: Deferred.await(daemon.exit),
        isRunning: Effect.succeed(true),
        kill: () =>
          Effect.sync(() => {
            daemon.killed = true;
          }),
        unref: Effect.succeed(Effect.void),
        stdin: Sink.drain,
        stdout: Stream.never,
        stderr: Stream.never,
        all: Stream.never,
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
      });
      yield* Effect.addFinalizer(() => handle.kill().pipe(Effect.ignore));
      return handle;
    }),
  );
  const pool = makeJcodeDaemonPool({
    spawner,
    fileSystem,
    path: yield* Path.Path,
  });
  return { pool, spawned };
});

const session = (
  pool: ReturnType<typeof makeJcodeDaemonPool>,
  model: string,
): Effect.Effect<{ readonly scope: Scope.Closeable; readonly socketPath: string }> =>
  Effect.gen(function* () {
    const scope = yield* Scope.make();
    const socketPath = yield* pool
      .acquire({ provider: "openai", model })
      .pipe(Scope.provide(scope), Effect.orDie);
    return { scope, socketPath };
  });

describe("makeJcodeDaemonPool", () => {
  it.effect("shares one daemon per model and stops it when the last session leaves", () =>
    Effect.gen(function* () {
      const { pool, spawned } = yield* fakeDaemons;
      const first = yield* session(pool, "gpt-a");
      const second = yield* session(pool, "gpt-a");
      const other = yield* session(pool, "gpt-b");

      expect(spawned.map((daemon) => daemon.model)).toEqual(["gpt-a", "gpt-b"]);
      expect(second.socketPath).toBe(first.socketPath);
      expect(other.socketPath).not.toBe(first.socketPath);

      yield* Scope.close(first.scope, Exit.void);
      expect(spawned[0]!.killed).toBe(false);
      yield* Scope.close(second.scope, Exit.void);
      expect(spawned[0]!.killed).toBe(true);
      expect(pool.size()).toBe(1);

      yield* session(pool, "gpt-a");
      expect(spawned).toHaveLength(3);
      yield* Scope.close(other.scope, Exit.void);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("replaces a daemon that exited on its own", () =>
    Effect.gen(function* () {
      const { pool, spawned } = yield* fakeDaemons;
      const stale = yield* session(pool, "gpt-a");
      yield* Deferred.succeed(spawned[0]!.exit, ChildProcessSpawner.ExitCode(1));
      yield* Effect.yieldNow;

      const fresh = yield* session(pool, "gpt-a");
      expect(spawned).toHaveLength(2);
      expect(fresh.socketPath).not.toBe(stale.socketPath);

      // The stale session leaving must not stop the replacement.
      yield* Scope.close(stale.scope, Exit.void);
      expect(spawned[1]!.killed).toBe(false);
      yield* Scope.close(fresh.scope, Exit.void);
      expect(spawned[1]!.killed).toBe(true);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
