import type { SidebarThreadStatus } from "../Sidebar.logic";

export type PetMood = "idle" | "thinking" | "happy" | "sad";

export type PetBaseMood = Exclude<PetMood, "happy">;

/** Map sidebar thread status onto a durable pet mood (no short-lived pulses). */
export function derivePetBaseMood(status: SidebarThreadStatus | null): PetBaseMood {
  if (status === null) return "idle";
  switch (status) {
    case "working":
    case "monitoring":
    case "approval":
    case "input":
      return "thinking";
    case "failed":
      return "sad";
    case "ready":
      return "idle";
  }
}

/**
 * Apply a one-shot happy pulse when work finishes successfully.
 * `pulseUntilMs` is compared against `nowMs`; while active and base is idle, mood is happy.
 */
export function resolvePetMood(input: {
  base: PetBaseMood;
  pulseUntilMs: number | null;
  nowMs: number;
}): PetMood {
  if (input.base === "thinking" || input.base === "sad") return input.base;
  if (input.pulseUntilMs !== null && input.nowMs < input.pulseUntilMs) return "happy";
  return "idle";
}

/** After leaving a thinking base for idle, celebrate briefly. */
export function nextHappyPulseUntilMs(input: {
  previousBase: PetBaseMood;
  nextBase: PetBaseMood;
  nowMs: number;
  durationMs?: number;
}): number | null {
  if (input.previousBase === "thinking" && input.nextBase === "idle") {
    return input.nowMs + (input.durationMs ?? 1600);
  }
  return null;
}
