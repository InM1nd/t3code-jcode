import type { ProviderInteractionMode } from "@t3tools/contracts";
import { BotIcon, BugIcon, NetworkIcon, PencilRulerIcon, type LucideIcon } from "lucide-react";

export type ComposerWorkMode = Exclude<ProviderInteractionMode, "default">;

export const composerWorkModes: ReadonlyArray<{
  readonly mode: ComposerWorkMode;
  readonly label: string;
  readonly description: string;
  readonly icon: LucideIcon;
}> = [
  { mode: "build", label: "Build", description: "Implement the task", icon: BotIcon },
  { mode: "plan", label: "Plan", description: "Investigate before editing", icon: PencilRulerIcon },
  { mode: "debug", label: "Debug", description: "Find and verify the root cause", icon: BugIcon },
  {
    mode: "swarm",
    label: "Swarm Lite",
    description: "Coordinate independent roles",
    icon: NetworkIcon,
  },
];

export const composerWorkModeById = Object.fromEntries(
  composerWorkModes.map((option) => [option.mode, option]),
) as Record<ComposerWorkMode, (typeof composerWorkModes)[number]>;
