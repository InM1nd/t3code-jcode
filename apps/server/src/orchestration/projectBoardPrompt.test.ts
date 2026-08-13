import { ProjectBoardItemId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  appendProjectBoardToTurnInput,
  formatProjectBoardPromptBlock,
} from "./projectBoardPrompt.ts";

describe("projectBoardPrompt", () => {
  it("formats a short MCP hint with open-item counts", () => {
    const empty = formatProjectBoardPromptBlock([]);
    expect(empty).toContain("<project_board>");
    expect(empty).toContain("empty");
    expect(empty).toContain("board_digest");
    expect(empty).toContain("board_list");
    expect(empty).toContain("board_get_brief");
    expect(empty).toContain("board_handoff");
    expect(empty).toContain("t3-code");
    expect(empty).not.toContain("id=");

    const populated = formatProjectBoardPromptBlock([
      {
        id: ProjectBoardItemId.make("item-1"),
        title: "Ship board",
        status: "inProgress",
        notes: "keep it short",
        source: "agent",
        sourceThreadId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: ProjectBoardItemId.make("item-2"),
        title: "Done already",
        status: "completed",
        notes: null,
        source: "user",
        sourceThreadId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(populated).toContain("1 open (2 total)");
    expect(populated).not.toContain("Ship board");
  });

  it("appends the board block after the user turn text", () => {
    const block = formatProjectBoardPromptBlock([]);
    expect(appendProjectBoardToTurnInput("Hello", block)).toBe(`Hello\n\n${block}`);
    expect(appendProjectBoardToTurnInput(undefined, block)).toBe(block);
    expect(appendProjectBoardToTurnInput("Hello", null)).toBe("Hello");
  });
});
