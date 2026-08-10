import type { ProjectBoardItem } from "@t3tools/contracts";

/**
 * Short jcode turn hint for the project board.
 *
 * Full board dumps burned tokens on every turn. jcode sessions now get T3 MCP
 * tools through a stdio bridge (`.jcode/mcp.json` → `t3-code`), so agents should
 * call `board_*` on demand. This block stays tiny and only reminds the model.
 */
export function formatProjectBoardPromptBlock(items: ReadonlyArray<ProjectBoardItem>): string {
  const openCount = items.filter((item) => item.status !== "completed").length;
  const summary = items.length === 0 ? "empty" : `${openCount} open (${items.length} total)`;

  return [
    "<project_board>",
    `Shared project todos (${summary}).`,
    "Use MCP tools board_digest / board_list / board_upsert / board_set_status / board_link_turn / board_delete on server t3-code.",
    "Call board_digest for a compact status summary; board_link_turn to attach the current turn to a card.",
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
