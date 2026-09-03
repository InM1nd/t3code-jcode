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
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";

import { TerminalSessionRegistryRepository } from "../persistence/TerminalSessionRegistry.ts";

const RECONCILE_KILL_GRACE_MS = 1_000;

export class TerminalSessionSignalError extends Schema.TaggedErrorClass<TerminalSessionSignalError>()(
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
  readonly isAlive: (pid: number) => boolean;
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

function makeDefaultProcessControl(platform: NodeJS.Platform): TerminalSessionProcessControl {
  return {
    isAlive,
    terminate: (pid, signal) =>
      Effect.try({
        // node-pty makes the shell a session/process-group leader, so a
        // negative pid signals the whole group on posix — the dev server
        // and its descendants, not just the shell. Windows has no such
        // group semantics, so the bare pid is used there.
        try: () => process.kill(platform === "win32" ? pid : -pid, signal),
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
 * `serverPid` liveness is a cheap, deliberately lightweight identity check:
 * it distinguishes "another currently-running server instance still owns
 * this session" (skip) from "the writing server is gone" (safe to reap").
 * It does not re-verify the terminal `pid` still runs the same command —
 * a full check would mean exporting Manager.ts's ps/wmic-based process
 * inspector out of that upstream file for a low-probability, low-blast-
 * radius edge case (pid reuse in the narrow window between a crash and the
 * next boot).
 */
function reconcileRow(
  row: { threadId: string; terminalId: string; pid: number; serverPid: number },
  registry: TerminalSessionRegistryRepository["Service"],
  processControl: TerminalSessionProcessControl,
): Effect.Effect<void> {
  const key = { threadId: row.threadId, terminalId: row.terminalId };

  return Effect.gen(function* () {
    if (processControl.isAlive(row.serverPid)) {
      return;
    }

    if (!processControl.isAlive(row.pid)) {
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
