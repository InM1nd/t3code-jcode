import {
  EventId,
  ProviderDriverKind,
  ThreadId,
  TurnId,
  type ProviderRuntimeEvent,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { maybeWorkspaceScopeWarningActivity } from "./workspaceScopeWarning.ts";

const worktree = "/Users/me/.t3-jcode/worktrees/marswalk/t3code-dae6736c";
const otherClone = "/Users/me/Documents/Project/marswalk";

const base = {
  provider: ProviderDriverKind.make("cursor"),
  createdAt: "2026-08-31T12:00:00.000Z",
  threadId: ThreadId.make("thread-1"),
  turnId: TurnId.make("turn-1"),
};

function toolEvent(eventId: string, data: Record<string, unknown>): ProviderRuntimeEvent {
  return {
    ...base,
    type: "item.completed",
    eventId: EventId.make(eventId),
    payload: {
      itemType: "command_execution",
      title: "Terminal",
      data,
    },
  } satisfies ProviderRuntimeEvent;
}

describe("workspaceScopeWarning", () => {
  it("warns when a command's working directory is another clone", () => {
    const warnedKeys = new Set<string>();
    const activity = maybeWorkspaceScopeWarningActivity({
      event: toolEvent("event-1", {
        command: "git status",
        rawInput: { working_directory: otherClone },
      }),
      worktreePath: worktree,
      warnedKeys,
    });
    expect(activity?.kind).toBe("runtime.warning");
    expect(activity?.summary).toContain("different checkout");
    const payload = activity?.payload as { detail?: string };
    expect(payload.detail).toContain(otherClone);
    expect(payload.detail).toContain(worktree);
    expect(payload.detail).toContain("Provider: cursor");
  });

  it("warns only once per escaped path on a thread", () => {
    const warnedKeys = new Set<string>();
    const first = maybeWorkspaceScopeWarningActivity({
      event: toolEvent("event-1", { rawInput: { cwd: otherClone } }),
      worktreePath: worktree,
      warnedKeys,
    });
    const second = maybeWorkspaceScopeWarningActivity({
      event: toolEvent("event-2", { rawInput: { cwd: otherClone } }),
      worktreePath: worktree,
      warnedKeys,
    });
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it("stays quiet when the thread has no worktree or the command stays in it", () => {
    expect(
      maybeWorkspaceScopeWarningActivity({
        event: toolEvent("event-1", { rawInput: { working_directory: otherClone } }),
        worktreePath: null,
        warnedKeys: new Set(),
      }),
    ).toBeNull();
    expect(
      maybeWorkspaceScopeWarningActivity({
        event: toolEvent("event-1", { rawInput: { working_directory: worktree } }),
        worktreePath: worktree,
        warnedKeys: new Set(),
      }),
    ).toBeNull();
  });
});
