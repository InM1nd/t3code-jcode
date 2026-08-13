import type { ProviderInteractionMode } from "@t3tools/contracts";

type ResolvedWorkMode = {
  readonly nativeInteractionMode: "default" | "plan";
  readonly instruction?: string;
};

const PLAN_INSTRUCTION = `
<t3_work_mode>
You are in Plan mode. Investigate the request and propose a decision-complete plan. Do not edit files or perform other mutating actions until the user explicitly approves implementation.
</t3_work_mode>`;

const DEBUG_INSTRUCTION = `
<t3_work_mode>
You are in Debug mode. Reproduce the issue, collect evidence, identify the root cause, make the smallest safe fix, and verify it with a focused check. State uncertainty instead of guessing.
</t3_work_mode>`;

const SWARM_INSTRUCTION = `
<t3_work_mode>
You are in Swarm Lite mode. Split independent parts of the task into clear roles, track each result, and synthesize one answer. Use native subagents only when this runtime provides them; otherwise work through the roles sequentially. Do not claim parallel workers unless you actually observed them.
</t3_work_mode>`;

export function resolveWorkMode(
  mode: ProviderInteractionMode | undefined,
): ResolvedWorkMode | undefined {
  switch (mode) {
    case undefined:
      return undefined;
    case "default":
    case "build":
      return { nativeInteractionMode: "default" };
    case "plan":
      return { nativeInteractionMode: "plan", instruction: PLAN_INSTRUCTION };
    case "debug":
      return { nativeInteractionMode: "default", instruction: DEBUG_INSTRUCTION };
    case "swarm":
      return { nativeInteractionMode: "default", instruction: SWARM_INSTRUCTION };
  }
}

export function prependWorkModeInstruction(
  mode: ProviderInteractionMode | undefined,
  prompt: string | undefined,
): string {
  const instruction = resolveWorkMode(mode)?.instruction;
  const userPrompt = prompt?.trim() ?? "";
  if (!instruction) return userPrompt;
  return userPrompt.length > 0 ? `${instruction}\n\n${userPrompt}` : instruction;
}
