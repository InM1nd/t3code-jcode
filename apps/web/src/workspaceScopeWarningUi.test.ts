import { describe, expect, it } from "vite-plus/test";

import { workspaceScopeMismatchPath } from "./workspaceScopeWarningUi.tsx";

describe("workspaceScopeMismatchPath", () => {
  const worktree = "/repo/.t3/worktrees/feature";

  it("flags a file edit outside the thread worktree", () => {
    expect(
      workspaceScopeMismatchPath({
        worktreePath: worktree,
        itemType: "file_change",
        toolData: { changes: [{ path: "/repo/apps/web/App.tsx" }] },
      }),
    ).toBe("/repo/apps/web/App.tsx");
  });

  it("ignores edits inside the worktree and reads", () => {
    expect(
      workspaceScopeMismatchPath({
        worktreePath: worktree,
        itemType: "file_change",
        toolData: { changes: [{ path: `${worktree}/App.tsx` }] },
      }),
    ).toBeUndefined();
    expect(
      workspaceScopeMismatchPath({
        worktreePath: worktree,
        itemType: "file_search",
        toolData: { path: "/somewhere/else" },
      }),
    ).toBeUndefined();
  });
});
