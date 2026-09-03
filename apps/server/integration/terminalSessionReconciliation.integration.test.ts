/**
 * End-to-end smoke test for the orphaned-terminal cleanup mechanism
 * (apps/server/src/terminal/TerminalSessionReconciliation.ts): a real OS
 * process, registered as if a previous `apps/server` boot had spawned and
 * crashed without cleaning up, must actually be killed by
 * `reconcileTerminalSessions` — not a fake process-control double.
 */
// @effect-diagnostics nodeBuiltinImport:off - drives real detached OS processes to prove the reconciler's process-group kill against something node-pty would actually spawn.
import * as NodeChildProcess from "node:child_process";

import { assert, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { runMigrations } from "../src/persistence/Migrations.ts";
import * as NodeSqliteClient from "../src/persistence/NodeSqliteClient.ts";
import {
  TerminalSessionRegistryRepository,
  layer as TerminalSessionRegistryLive,
} from "../src/persistence/TerminalSessionRegistry.ts";
import { reconcileTerminalSessions } from "../src/terminal/TerminalSessionReconciliation.ts";

const TestLayer = TerminalSessionRegistryLive.pipe(
  Layer.provideMerge(NodeSqliteClient.layerMemory()),
);

// Real wall-clock time, not the virtual TestClock @effect/vitest defaults
// to — this test waits on an actual OS process to die.
const layer = it.layer(TestLayer, { excludeTestServices: true });

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** A pid guaranteed to be dead: spawn a trivial child and wait for exit. */
function spawnAndWaitForDeadPid(): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = NodeChildProcess.spawn(process.execPath, ["-e", ""]);
    child.once("exit", () => {
      const pid = child.pid;
      if (pid === undefined) {
        reject(new Error("child process has no pid"));
        return;
      }
      resolve(pid);
    });
    child.once("error", reject);
  });
}

layer("reconcileTerminalSessions (real process control)", (it) => {
  // oxlint-disable-next-line t3code/no-global-process-runtime -- the skip decision needs the real host platform, outside any Effect runtime.
  it.effect.skipIf(process.platform === "win32")(
    "kills a real orphaned process group and clears its registry row",
    () =>
      Effect.gen(function* () {
        yield* runMigrations();
        const repository = yield* TerminalSessionRegistryRepository;

        // A detached session/process-group leader, same shape node-pty
        // produces, so the reconciler's posix group-kill (-pid) is exercised
        // for real instead of asserted against a fake.
        const child = NodeChildProcess.spawn("/bin/sh", ["-c", "sleep 60"], {
          detached: true,
          stdio: "ignore",
        });
        child.unref();
        const orphanPid = child.pid;
        assert.ok(orphanPid !== undefined);
        if (orphanPid === undefined) return;

        const deadServerPid = yield* Effect.promise(() => spawnAndWaitForDeadPid());
        const startedAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso));

        yield* repository.upsert({
          threadId: "thread-orphan-smoke",
          terminalId: "default",
          pid: orphanPid,
          shellCommand: "/bin/sh",
          worktreePath: null,
          serverPid: deadServerPid,
          startedAt,
        });

        assert.strictEqual(isAlive(orphanPid), true);

        yield* reconcileTerminalSessions;
        // Real SIGTERM -> 1s grace -> SIGKILL escalation, plus OS teardown slack.
        yield* Effect.sleep(1500);

        assert.strictEqual(isAlive(orphanPid), false);

        const rows = yield* repository.list();
        assert.deepStrictEqual(rows, []);
      }),
    15_000,
  );
});
