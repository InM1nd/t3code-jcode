/**
 * Startup reaper for orphaned PTY processes tracked in `terminal_session_registry`.
 * `node-pty` cannot reattach across restarts, so surviving rows from dead boots are killed.
 */
// @effect-diagnostics-next-line nodeBuiltinImport:off -- pid start time and taskkill are synchronous probes; Effect's ChildProcess is async.
import * as NodeChildProcess from "node:child_process";

import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HostProcess from "@t3tools/shared/HostProcess";

import { TerminalSessionRegistryRepository } from "../persistence/TerminalSessionRegistry.ts";

const RECONCILE_KILL_GRACE_MS = 1_000;
/** The shell starts, then the row is written. A start outside this window is a different process. */
const PROCESS_START_SLACK_MS = 60_000;

export type OrphanProcessIdentity = "same" | "reused" | "unknown";

/** A pid whose start time falls outside the recorded spawn window belongs to someone else. */
export function classifyProcessStart(
  processStartedAtMs: number | null,
  recordedStartedAt: string,
  slackMs = PROCESS_START_SLACK_MS,
): OrphanProcessIdentity {
  if (processStartedAtMs === null) return "unknown";
  const recorded = Date.parse(recordedStartedAt);
  if (Number.isNaN(recorded)) return "unknown";
  return Math.abs(processStartedAtMs - recorded) <= slackMs ? "same" : "reused";
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
    env: { ...process.env, LC_ALL: "C", LC_TIME: "C" },
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
 * Keep rows owned by another live server; fail closed if start-time identity cannot be verified.
 * Rows matching our own PID come from a reused previous boot; kill (SIGTERM -> SIGKILL) and drop.
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

    if (processControl.identify(row.pid, row.startedAt) !== "same") {
      yield* registry.removeByKey(key).pipe(Effect.ignoreCause({ log: true }));
      return;
    }

    yield* processControl.terminate(row.pid, "SIGTERM");
    yield* Effect.sleep(RECONCILE_KILL_GRACE_MS);
    if (
      processControl.isAlive(row.pid) &&
      processControl.identify(row.pid, row.startedAt) === "same"
    ) {
      yield* processControl.terminate(row.pid, "SIGKILL");
    }
    yield* registry.removeByKey(key).pipe(Effect.ignoreCause({ log: true }));
  }).pipe(
    Effect.catchCauseIf(
      (cause) => !Cause.hasInterrupts(cause),
      (cause) => Effect.logWarning("failed to reconcile orphaned terminal session", { cause }),
    ),
  );
}

export const reconcileTerminalSessionsWithControl = Effect.fn(
  "reconcileTerminalSessionsWithControl",
)(
  function* (
    processControl: TerminalSessionProcessControl,
  ): Effect.fn.Return<void, never, TerminalSessionRegistryRepository> {
    const registry = yield* TerminalSessionRegistryRepository;
    const rows = yield* registry.list().pipe(Effect.orElseSucceed(() => []));
    yield* Effect.forEach(rows, (row) => reconcileRow(row, registry, processControl), {
      concurrency: "unbounded",
      discard: true,
    });
  },
  Effect.catchCauseIf(
    (cause) => !Cause.hasInterrupts(cause),
    (cause) => Effect.logWarning("terminal session startup reconciliation failed", { cause }),
  ),
);

export const reconcileTerminalSessions: Effect.Effect<
  void,
  never,
  TerminalSessionRegistryRepository
> = Effect.gen(function* () {
  const platform = yield* HostProcess.Platform;
  yield* reconcileTerminalSessionsWithControl(makeDefaultProcessControl(platform));
});
