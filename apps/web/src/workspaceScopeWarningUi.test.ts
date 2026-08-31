import { ProviderDriverKind } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { parseWorkspaceScopeWarning } from "./workspaceScopeWarningUi";

describe("parseWorkspaceScopeWarning", () => {
  it("reads aligned thread and agent paths from the warning detail", () => {
    expect(
      parseWorkspaceScopeWarning({
        sourceActivityKind: "runtime.warning",
        detail:
          "Thread worktree: /Users/me/.t3-jcode/worktrees/marswalk/t3code-dae6736c\nUsed path: /Users/me/Documents/Project/marswalk\nProvider: cursor",
      }),
    ).toEqual({
      threadWorktree: "/Users/me/.t3-jcode/worktrees/marswalk/t3code-dae6736c",
      usedPath: "/Users/me/Documents/Project/marswalk",
      provider: ProviderDriverKind.make("cursor"),
    });
  });

  it("ignores other runtime warnings", () => {
    expect(
      parseWorkspaceScopeWarning({
        sourceActivityKind: "runtime.warning",
        detail: "Model rerouted to a fallback",
      }),
    ).toBeNull();
  });

  it("keeps older warnings that have no provider line", () => {
    expect(
      parseWorkspaceScopeWarning({
        sourceActivityKind: "runtime.warning",
        detail:
          "Thread worktree: /Users/me/.t3-jcode/worktrees/marswalk/t3code-dae6736c\nUsed path: /Users/me/Documents/Project/marswalk",
      }),
    ).toEqual({
      threadWorktree: "/Users/me/.t3-jcode/worktrees/marswalk/t3code-dae6736c",
      usedPath: "/Users/me/Documents/Project/marswalk",
      provider: null,
    });
  });
});
