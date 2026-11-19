import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { MegathreadThreadUsage, ProjectBoardItem, ThreadId } from "@t3tools/contracts";

import { resolveSidebarThreadStatus, type SidebarThreadStatus } from "../components/Sidebar.logic";

export interface MegathreadWorker {
  readonly threadId: ThreadId;
  readonly title: string;
  readonly role: string | null;
  readonly model: string;
  readonly branch: string | null;
  readonly status: SidebarThreadStatus;
  readonly startedAt: string | null;
  /** Null while the worker is still running. */
  readonly completedAt: string | null;
}

/** The subthreads the open thread started, named after the card each one works on. */
export function selectMegathreadWorkers(input: {
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  readonly bossThreadId: ThreadId;
  readonly items: ReadonlyArray<ProjectBoardItem>;
}): ReadonlyArray<MegathreadWorker> {
  const cards = new Map(
    input.items.flatMap((item) =>
      item.execution?.threadId ? [[item.execution.threadId, item] as const] : [],
    ),
  );
  return input.threads
    .filter(
      (thread) =>
        thread.lineage.relationshipToParent === "subagent" &&
        thread.lineage.parentThreadId === input.bossThreadId,
    )
    .map((thread) => {
      const card = cards.get(thread.id);
      const status = resolveSidebarThreadStatus(thread);
      return {
        threadId: thread.id,
        title: card?.title ?? thread.title,
        role: card?.execution?.role ?? null,
        model: `${thread.modelSelection.instanceId} · ${thread.modelSelection.model}`,
        branch: thread.branch,
        status,
        startedAt: thread.runtime?.activityStartedAt ?? thread.latestRun?.startedAt ?? null,
        completedAt: status === "working" ? null : (thread.latestRun?.completedAt ?? null),
      };
    });
}

const threadTokens = (usage: MegathreadThreadUsage) => usage.inputTokens + usage.outputTokens;

/** Whole-feature tokens and how much of them the boss thread itself spent. */
export function summarizeMegathreadUsage(
  usage: ReadonlyArray<MegathreadThreadUsage>,
  bossThreadId: ThreadId,
): {
  readonly byThread: ReadonlyMap<ThreadId, MegathreadThreadUsage>;
  readonly totalTokens: number;
  readonly bossShare: number | null;
} {
  const byThread = new Map(usage.map((entry) => [entry.threadId, entry]));
  const totalTokens = usage.reduce((sum, entry) => sum + threadTokens(entry), 0);
  const boss = byThread.get(bossThreadId);
  return {
    byThread,
    totalTokens,
    bossShare: boss && totalTokens > 0 ? threadTokens(boss) / totalTokens : null,
  };
}
