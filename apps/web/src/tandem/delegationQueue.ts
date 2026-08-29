import type { ProjectBoardItem } from "@t3tools/contracts";

export function isTandemDelegation(item: ProjectBoardItem): boolean {
  return item.status === "ready" && item.archivedAt === null;
}

/**
 * A task-scoped capsule deliberately excludes the board digest: the executor
 * can inspect its one card when it needs more detail without loading the
 * whole project's task list into context.
 */
export function buildTandemDelegationPrompt(item: ProjectBoardItem): string {
  const lines = [`Work only on this prepared task: ${item.title}`, "", `Board item id: ${item.id}`];
  if (item.notes?.trim()) lines.push("", item.notes.trim());
  if (item.brief) {
    lines.push("", "## Task capsule", `Goal: ${item.brief.goal}`);
    if (item.brief.acceptanceCriteria.length > 0) {
      lines.push(
        "Acceptance criteria:",
        ...item.brief.acceptanceCriteria.map((value) => `- ${value}`),
      );
    }
    if (item.brief.importantFiles.length > 0) {
      lines.push("Important files:", ...item.brief.importantFiles.map((value) => `- ${value}`));
    }
    if (item.brief.notes) lines.push(`Notes: ${item.brief.notes}`);
  }
  if (item.latestHandoff) {
    lines.push("", "## Handoff", item.latestHandoff.summary);
    if (item.latestHandoff.decisions.length > 0) {
      lines.push("Decisions:", ...item.latestHandoff.decisions.map((value) => `- ${value}`));
    }
    lines.push(`Next step: ${item.latestHandoff.nextStep}`);
  }
  lines.push(
    "",
    "Use board_get_brief only if this card needs clarification. Do not call board_digest unless project-wide orientation is required. Keep the card updated with board_set_status and board_handoff.",
  );
  return lines.join("\n");
}
