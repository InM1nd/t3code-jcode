import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { ProjectBoardItemId, ThreadId, type ProjectBoardItem } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { selectMegathreadWorkers, summarizeMegathreadUsage } from "./megathreadWorkers";

const boss = ThreadId.make("boss");
const worker = ThreadId.make("worker");

const shell = (
  id: ThreadId,
  lineage: { parentThreadId: ThreadId | null; relationshipToParent: "fork" | "subagent" | null },
) =>
  ({
    id,
    title: `Thread ${id}`,
    lineage,
    modelSelection: { instanceId: "codex", model: "gpt-5.4" },
    branch: `t3code/${id}`,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    runtime: null,
    latestRun: { startedAt: "2026-11-19T10:00:00.000Z", completedAt: "2026-11-19T10:05:00.000Z" },
  }) as unknown as EnvironmentThreadShell;

describe("megathread workers", () => {
  it("lists only the open thread's subthreads and names them after their card", () => {
    const card = {
      id: ProjectBoardItemId.make("card-1"),
      title: "Add the tab",
      execution: { role: "implementation", threadId: worker },
    } as ProjectBoardItem;
    const workers = selectMegathreadWorkers({
      bossThreadId: boss,
      items: [card],
      threads: [
        shell(boss, { parentThreadId: null, relationshipToParent: null }),
        shell(worker, { parentThreadId: boss, relationshipToParent: "subagent" }),
        shell(ThreadId.make("fork"), { parentThreadId: boss, relationshipToParent: "fork" }),
        shell(ThreadId.make("stranger"), {
          parentThreadId: ThreadId.make("elsewhere"),
          relationshipToParent: "subagent",
        }),
      ],
    });
    expect(workers).toEqual([
      {
        threadId: worker,
        title: "Add the tab",
        role: "implementation",
        model: "codex · gpt-5.4",
        branch: "t3code/worker",
        status: "ready",
        startedAt: "2026-11-19T10:00:00.000Z",
        completedAt: "2026-11-19T10:05:00.000Z",
      },
    ]);
  });

  it("totals the feature and reports the boss's share", () => {
    const usage = (threadId: ThreadId, inputTokens: number, outputTokens: number) => ({
      threadId,
      turns: 1,
      inputTokens,
      cachedInputTokens: 0,
      outputTokens,
    });
    const summary = summarizeMegathreadUsage([usage(boss, 200, 50), usage(worker, 700, 50)], boss);
    expect(summary.totalTokens).toBe(1000);
    expect(summary.bossShare).toBe(0.25);
    expect(summarizeMegathreadUsage([usage(worker, 10, 0)], boss).bossShare).toBeNull();
  });
});
