import { describe, expect, it } from "vite-plus/test";
import type { ProjectBoardItem } from "@t3tools/contracts";

import { buildTandemDelegationPrompt, isTandemDelegation } from "./delegationQueue";

const item = (overrides: Partial<ProjectBoardItem> = {}): ProjectBoardItem => ({
  id: "board-1" as ProjectBoardItem["id"],
  title: "Tighten the executor capsule",
  status: "ready",
  source: "agent",
  sourceThreadId: null,
  createdAt: "2026-08-29T10:00:00Z",
  updatedAt: "2026-08-29T10:00:00Z",
  archivedAt: null,
  linkedTurnIds: [],
  ...overrides,
});

describe("Tandem delegation queue", () => {
  it("treats only visible ready cards as prepared delegations", () => {
    expect(isTandemDelegation(item())).toBe(true);
    expect(isTandemDelegation(item({ status: "backlog" }))).toBe(false);
    expect(isTandemDelegation(item({ archivedAt: "2026-08-29T11:00:00Z" }))).toBe(false);
  });

  it("builds a narrow executor prompt without a board digest", () => {
    const prompt = buildTandemDelegationPrompt(
      item({
        brief: {
          goal: "Ship the queue",
          acceptanceCriteria: ["One click opens a fresh worktree draft"],
          importantFiles: ["apps/web/src/tandem/delegationQueue.ts"],
          notes: "Keep it small.",
        },
      }),
    );

    expect(prompt).toContain("## Task capsule");
    expect(prompt).toContain("board_get_brief only");
    expect(prompt).toContain("Do not call board_digest");
  });
});
