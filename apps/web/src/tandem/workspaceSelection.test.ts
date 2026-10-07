import { describe, expect, it } from "vite-plus/test";

import { listKnownWorktrees, worktreeLabel } from "./workspaceSelection";

describe("listKnownWorktrees", () => {
  it("keeps the newest live thread for each worktree and sorts newest first", () => {
    expect(
      listKnownWorktrees([
        {
          branch: "feature/older",
          worktreePath: "/repo/.worktrees/older",
          updatedAt: "2026-08-01",
        },
        {
          branch: "feature/newer",
          worktreePath: "/repo/.worktrees/newer",
          updatedAt: "2026-08-03",
        },
        {
          branch: "feature/old-name",
          worktreePath: "/repo/.worktrees/newer",
          updatedAt: "2026-08-02",
        },
        {
          branch: "feature/archived",
          worktreePath: "/repo/.worktrees/archived",
          updatedAt: "2026-08-04",
          archivedAt: "2026-08-04",
        },
      ]),
    ).toEqual([
      { branch: "feature/newer", worktreePath: "/repo/.worktrees/newer" },
      { branch: "feature/older", worktreePath: "/repo/.worktrees/older" },
    ]);
  });

  it("uses the directory name when a worktree has no branch", () => {
    expect(worktreeLabel({ branch: null, worktreePath: "/repo/.worktrees/review" })).toBe("review");
  });
});
