import type { ProjectBoardItem } from "@t3tools/contracts";

/**
 * Short jcode turn hint for the project board.
 *
 * Full board dumps burned tokens on every turn. jcode sessions now get T3 MCP
 * tools through a stdio bridge (`.jcode/mcp.json` → `t3-code`), so agents should
 * call `board_*` on demand. This block stays tiny and only reminds the model.
 *
 * `compact: true` drops the rules paragraph: the model already saw it earlier
 * in this same session's context, so repeating it every turn just burns
 * tokens without teaching it anything new. Callers pass `compact: true` once
 * a session already exists for the thread (i.e. this isn't the first turn).
 */
export function formatProjectBoardPromptBlock(
  items: ReadonlyArray<ProjectBoardItem>,
  options?: { readonly compact?: boolean },
): string {
  const activeItems = items.filter((item) => !item.archivedAt);
  const openCount = activeItems.filter((item) => item.status !== "completed").length;
  const summary =
    activeItems.length === 0 ? "empty" : `${openCount} open (${activeItems.length} total)`;
  const toolList =
    "board_digest / board_list / board_get_brief / board_upsert / board_set_status / board_link_turn / board_handoff / board_archive / board_restore / board_delete on server t3-code.";

  if (options?.compact) {
    return [
      "<project_board>",
      `Shared project todos (${summary}). Tools: ${toolList}`,
      "</project_board>",
    ].join("\n");
  }

  return [
    "<project_board>",
    `Shared project todos (${summary}).`,
    `Use MCP tools ${toolList}`,
    "Use board_digest only when board-wide orientation is relevant, board_get_brief before working a known card, and board_handoff when transferring work.",
    "Board rules: One card tracks one deliverable, not a phase or implementation step.",
    "Use status for workflow phases.",
    "Do not encode phases, priority, or ownership in titles.",
    "Before creating a card, check the board and reuse an existing itemId when the task already exists.",
    "In notes/brief, point at codebase-memory qualified names (search_graph/get_code_snippet) instead of re-describing code, so the next agent doesn't re-explore what's already indexed.",
    "Do not ask the user to edit the Board panel for changes you can make with those tools.",
    "</project_board>",
  ].join("\n");
}

export function appendProjectBoardToTurnInput(
  input: string | undefined,
  boardBlock: string | null,
): string | undefined {
  if (!boardBlock) return input;
  const trimmed = input?.trim();
  if (!trimmed) return boardBlock;
  return `${trimmed}\n\n${boardBlock}`;
}
