import { describe, expect, it } from "vite-plus/test";

import {
  findOutOfWorkspaceScopePath,
  isPathInsideWorkspaceScope,
  normalizeWorkspaceScopePath,
} from "./workspaceScope.ts";

describe("workspaceScope", () => {
  const worktree = "/Users/me/.t3-jcode/worktrees/marswalk/t3code-dae6736c";
  const otherClone = "/Users/me/Documents/Project/marswalk";

  it("treats the assigned worktree and its files as in scope", () => {
    expect(isPathInsideWorkspaceScope(worktree, worktree)).toBe(true);
    expect(isPathInsideWorkspaceScope(`${worktree}/apps/web/src/App.tsx`, worktree)).toBe(true);
    expect(isPathInsideWorkspaceScope("src/App.tsx", worktree)).toBe(true);
  });

  it("treats a sibling clone as out of scope", () => {
    expect(isPathInsideWorkspaceScope(otherClone, worktree)).toBe(false);
    expect(isPathInsideWorkspaceScope(`${otherClone}/package.json`, worktree)).toBe(false);
  });

  it("extracts Cursor working_directory from tool payloads", () => {
    expect(
      findOutOfWorkspaceScopePath({
        workspaceRoot: worktree,
        data: {
          command: "git status",
          rawInput: { working_directory: otherClone },
        },
      }),
    ).toBe(otherClone);
  });

  it("does not warn when the tool stays in the assigned worktree", () => {
    expect(
      findOutOfWorkspaceScopePath({
        workspaceRoot: worktree,
        data: {
          rawInput: { working_directory: worktree, command: "vp test run" },
        },
      }),
    ).toBeUndefined();
  });

  it("ignores file paths unless asked, so config reads stay quiet", () => {
    expect(
      findOutOfWorkspaceScopePath({
        workspaceRoot: worktree,
        data: { path: "/Users/me/.cursor/skills/foo/SKILL.md" },
      }),
    ).toBeUndefined();
    expect(
      findOutOfWorkspaceScopePath({
        workspaceRoot: worktree,
        data: { path: `${otherClone}/src/index.ts` },
        includeFilePaths: true,
      }),
    ).toBe(`${otherClone}/src/index.ts`);
  });

  it("normalizes trailing slashes", () => {
    expect(normalizeWorkspaceScopePath(`${worktree}/`)).toBe(worktree);
    expect(isPathInsideWorkspaceScope(`${worktree}/`, worktree)).toBe(true);
  });
});
