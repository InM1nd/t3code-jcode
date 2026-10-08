/**
 * TerminalSessionReconciliation - Startup cleanup for orphaned PTY processes.
 *
 * `TerminalManager` (./Manager.ts) tracks live PTY sessions only in memory.
 * A non-graceful `apps/server` exit (crash, `SIGKILL`, forced update) wipes
 * that state while the OS process it spawned (e.g. `next dev`) keeps
 * running, untracked, leaking RAM across restarts. `TerminalManager` mirrors
 * its spawn/exit transitions into `terminal_session_registry`
 * (../persistence/TerminalSessionRegistry.ts) so this module can walk that
 * registry on the next boot and reap anything the previous boot left behind.
 *
 * A registry row can never be reattached to — `node-pty` has no way to
 * adopt a PTY it did not spawn, so there is no output stream to resume.
 * Every live row found here is therefore terminated unconditionally; the
 * user restarts the underlying script by hand. This is preferred over
 * leaving a still-owned thread's row running untracked, which would let
 * `Manager.ts` spawn a second dev server on top of the orphaned first one
 * the next time that thread's terminal is opened.
 */
// @effect-diagnostics-next-line nodeBuiltinImport:off -- pid start time and taskkill are synchronous probes; Effect's ChildProcess is async.
import * as NodeChildProcess from "node:child_process";

import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";

import { TerminalSessionRegistryRepository } from "../persistence/TerminalSessionRegistry.ts";

const RECONCILE_KILL_GRACE_MS = 1_000;
/** The shell starts, then the row is written. A later start is a reused pid. */
const PROCESS_START_SLACK_MS = 60_000;

export type OrphanProcessIdentity = "same" | "reused" | "unknown";

/** A pid that started well after the row was written belongs to someone else. */
export function classifyProcessStart(
  processStartedAtMs: number | null,
  recordedStartedAt: string,
  slackMs = PROCESS_START_SLACK_MS,
): OrphanProcessIdentity {
  if (processStartedAtMs === null) return "unknown";
  const recorded = Date.parse(recordedStartedAt);
  if (Number.isNaN(recorded)) return "unknown";
  return processStartedAtMs <= recorded + slackMs ? "same" : "reused";
}

/** Posix signals the process group. Windows has no groups, so taskkill walks the tree. */
export function orphanTerminateArgs(
  platform: NodeJS.Platform,
  pid: number,
  signal: "SIGTERM" | "SIGKILL",
):
  | { readonly kind: "signal-group"; readonly pid: number; readonly signal: "SIGTERM" | "SIGKILL" }
  | { readonly kind: "taskkill"; readonly args: ReadonlyArray<string> } {
  if (platform === "win32") {
    return {
      kind: "taskkill",
      args: signal === "SIGKILL" ? ["/PID", String(pid), "/T", "/F"] : ["/PID", String(pid), "/T"],
    };
  }
  return { kind: "signal-group", pid: -pid, signal };
}

class TerminalSessionSignalError extends Schema.TaggedError<TerminalSessionSignalError>()(
  "TerminalSessionSignalError",
  {
    cause: Schema.optional(Schema.Defect()),
    signal: Schema.Literals(["SIGTERM", "SIGKILL"]),
    pid: Schema.Number,
  },
) {
  override get message(): string {
    return `Failed to send ${this.signal} to orphaned terminal process ${this.pid}`;
  }
}

export interface TerminalSessionProcessControl {
  readonly currentPid: number;
  readonly isAlive: (pid: number) => boolean;
  readonly identify: (pid: number, startedAt: string) => OrphanProcessIdentity;
  readonly terminate: (pid: number, signal: "SIGTERM" | "SIGKILL") => Effect.Effect<void>;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readProcessStartMs(pid: number, platform: NodeJS.Platform): number | null {
  if (platform === "win32") {
    const result = NodeChildProcess.spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `(Get-Process -Id ${pid}).StartTime.ToUniversalTime().ToString('o')`,
      ],
      { encoding: "utf8" },
    );
    if (result.status !== 0) return null;
    const started = Date.parse(result.stdout.trim());
    return Number.isNaN(started) ? null : started;
  }
  const result = NodeChildProcess.spawnSync("ps", ["-o", "lstart=", "-p", String(pid)], {
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  const started = Date.parse(result.stdout.trim());
  return Number.isNaN(started) ? null : started;
}

function makeDefaultProcessControl(platform: NodeJS.Platform): TerminalSessionProcessControl {
  return {
    currentPid: process.pid,
    isAlive,
    identify: (pid, startedAt) =>
      classifyProcessStart(readProcessStartMs(pid, platform), startedAt),
    terminate: (pid, signal) =>
      Effect.try({
        try: () => {
          const plan = orphanTerminateArgs(platform, pid, signal);
          if (plan.kind === "taskkill") {
            const result = NodeChildProcess.spawnSync("taskkill", [...plan.args], {
              encoding: "utf8",
            });
            if (result.status !== 0) {
              throw new Error(result.stderr || result.stdout || `taskkill exited ${result.status}`);
            }
            return;
          }
          process.kill(plan.pid, plan.signal);
        },
        catch: (cause) => new TerminalSessionSignalError({ cause, signal, pid }),
      }).pipe(
        Effect.catch((error) =>
          Effect.logWarning("failed to signal orphaned terminal process", { cause: error }),
        ),
      ),
  };
}

/**
 * Reconcile one registry row: leave it alone if another live server owns
 * it, drop it if the target is already dead, otherwise kill (SIGTERM ->
 * grace -> SIGKILL) and drop it.
 *
 * A row whose `serverPid` is this process was written by a previous boot
 * that reused the pid (PID 1 under Docker or a supervisor). This boot does
 * not own it. A terminal pid that started after the row was written has
 * been reused; drop the row instead of signaling that new process group.
 */
function reconcileRow(
  row: { threadId: string; terminalId: string; pid: number; serverPid: number; startedAt: string },
  registry: TerminalSessionRegistryRepository["Service"],
  processControl: TerminalSessionProcessControl,
): Effect.Effect<void> {
  const key = { threadId: row.threadId, terminalId: row.terminalId };

  return Effect.gen(function* () {
    if (row.serverPid !== processControl.currentPid && processControl.isAlive(row.serverPid)) {
      return;
    }

    if (!processControl.isAlive(row.pid)) {
      yield* registry.removeByKey(key).pipe(Effect.ignoreCause({ log: true }));
      return;
    }

    if (processControl.identify(row.pid, row.startedAt) === "reused") {
      yield* registry.removeByKey(key).pipe(Effect.ignoreCause({ log: true }));
      return;
    }

    yield* processControl.terminate(row.pid, "SIGTERM");
    yield* Effect.sleep(RECONCILE_KILL_GRACE_MS);
    if (processControl.isAlive(row.pid)) {
      yield* processControl.terminate(row.pid, "SIGKILL");
    }
    yield* registry.removeByKey(key).pipe(Effect.ignoreCause({ log: true }));
  }).pipe(
    Effect.catchCause((cause) =>
      Cause.hasInterrupts(cause)
        ? Effect.failCause(cause)
        : Effect.logWarning("failed to reconcile orphaned terminal session", { cause }),
    ),
  );
}

export function reconcileTerminalSessionsWithControl(
  processControl: TerminalSessionProcessControl,
): Effect.Effect<void, never, TerminalSessionRegistryRepository> {
  return Effect.gen(function* () {
    const registry = yield* TerminalSessionRegistryRepository;
    const rows = yield* registry.list().pipe(Effect.orElseSucceed(() => []));
    yield* Effect.forEach(rows, (row) => reconcileRow(row, registry, processControl), {
      concurrency: "unbounded",
      discard: true,
    });
  }).pipe(
    Effect.catchCause((cause) =>
      Cause.hasInterrupts(cause)
        ? Effect.failCause(cause)
        : Effect.logWarning("terminal session startup reconciliation failed", { cause }),
    ),
  );
}

export const reconcileTerminalSessions: Effect.Effect<
  void,
  never,
  TerminalSessionRegistryRepository
> = Effect.gen(function* () {
  const platform = yield* HostProcessPlatform;
  yield* reconcileTerminalSessionsWithControl(makeDefaultProcessControl(platform));
});
