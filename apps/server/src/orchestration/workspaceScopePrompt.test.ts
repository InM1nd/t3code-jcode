import { describe, expect, it } from "vite-plus/test";

import {
  formatWorkspaceScopePromptBlock,
  prependWorkspaceScopeToTurnInput,
} from "./workspaceScopePrompt.ts";

describe("workspaceScopePrompt", () => {
  it("names the assigned worktree path and branch", () => {
    const block = formatWorkspaceScopePromptBlock({
      cwd: "/tmp/worktree",
      branch: "t3code/update-main-from-github",
    });
    expect(block).toContain("<t3_workspace_scope>");
    expect(block).toContain("Path: /tmp/worktree");
    expect(block).toContain("Branch: t3code/update-main-from-github");
    expect(block).toContain("Do not switch to another clone");
  });

  it("prepends the block so the constraint is visible before the user prompt", () => {
    expect(
      prependWorkspaceScopeToTurnInput(
        "fix the bug",
        "<t3_workspace_scope>\nscoped\n</t3_workspace_scope>",
      ),
    ).toBe("<t3_workspace_scope>\nscoped\n</t3_workspace_scope>\n\nfix the bug");
  });
});
