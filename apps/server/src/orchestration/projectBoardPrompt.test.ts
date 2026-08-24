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
    expect(empty).toContain("board_archive");
    expect(empty).toContain("board_restore");
    expect(empty).toContain("t3-code");
    expect(empty).toContain("One card tracks one deliverable");
    expect(empty).toContain("Use status for workflow");
    expect(empty).toContain("Do not encode phases, priority, or ownership in titles");
    expect(empty).toContain("reuse an existing itemId");
    expect(empty).toContain("codebase-memory qualified names");
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
      {
        id: ProjectBoardItemId.make("item-3"),
        title: "Archived open item",
        status: "inProgress",
        notes: null,
        source: "user",
        sourceThreadId: null,
        archivedAt: "2026-01-02T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
    expect(populated).toContain("1 open (2 total)");
    expect(populated).not.toContain("Ship board");
    expect(populated).not.toContain("3 total");
  });

  it("appends the board block after the user turn text", () => {
    const block = formatProjectBoardPromptBlock([]);
    expect(appendProjectBoardToTurnInput("Hello", block)).toBe(`Hello\n\n${block}`);
    expect(appendProjectBoardToTurnInput(undefined, block)).toBe(block);
    expect(appendProjectBoardToTurnInput("Hello", null)).toBe("Hello");
  });

  it("drops the rules paragraph in compact mode but keeps the tool list and counts", () => {
    const compact = formatProjectBoardPromptBlock([], { compact: true });

    expect(compact).toContain("<project_board>");
    expect(compact).toContain("empty");
    expect(compact).toContain("board_digest");
    expect(compact).toContain("board_handoff");
    expect(compact).toContain("t3-code");
    expect(compact).not.toContain("One card tracks one deliverable");
    expect(compact).not.toContain("Use status for workflow");
    expect(compact).not.toContain("reuse an existing itemId");
    expect(compact).not.toContain("codebase-memory qualified names");
  });
});
