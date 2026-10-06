/**
 * Fork work modes. `plan` stays the upstream interaction mode. `debug` and
 * `swarm` run as `default` plus the instruction below.
 */
export type WorkMode = "build" | "plan" | "debug" | "swarm";

const DEBUG_INSTRUCTION = `<t3_work_mode>
You are in Debug mode. Reproduce the issue, collect evidence, identify the root cause, make the smallest safe fix, and verify it with a focused check. State uncertainty instead of guessing.
</t3_work_mode>`;

const SWARM_INSTRUCTION = `<t3_work_mode>
You are in Swarm Lite mode. Split independent parts of the task into clear roles, track each result, and synthesize one answer. Use native subagents only when this runtime provides them; otherwise work through the roles sequentially. Do not claim parallel workers unless you actually observed them.
</t3_work_mode>`;

export function nativeInteractionMode(mode: WorkMode): "default" | "plan" {
  return mode === "plan" ? "plan" : "default";
}

export function workModeInstruction(mode: WorkMode | null): string | null {
  switch (mode) {
    case "debug":
      return DEBUG_INSTRUCTION;
    case "swarm":
      return SWARM_INSTRUCTION;
    default:
      return null;
  }
}

/** A missing row keeps the upstream plan/build choice. Debug and swarm win. */
export function displayedWorkMode(input: {
  readonly stored: WorkMode | null;
  readonly interactionMode: "default" | "plan";
}): WorkMode {
  if (
    input.stored === "debug" ||
    input.stored === "swarm" ||
    input.stored === "plan" ||
    input.stored === "build"
  ) {
    return input.stored;
  }
  return input.interactionMode === "plan" ? "plan" : "build";
}

export function workModeFromSlashCommand(command: string): WorkMode | null {
  switch (command) {
    case "build":
    case "default":
      return "build";
    case "plan":
    case "debug":
    case "swarm":
      return command;
    default:
      return null;
  }
}
