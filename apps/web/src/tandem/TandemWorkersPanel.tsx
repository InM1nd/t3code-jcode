import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  ThreadId,
  type EnvironmentId,
  type MegathreadThreadUsage,
  type ProjectId,
} from "@t3tools/contracts";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";

import { formatCompactElapsedSeconds } from "../components/chat/AgentElapsed";
import { formatContextWindowTokens } from "../lib/contextWindow";
import { useThreadShells } from "../state/entities";
import { megathreadUsage, projectBoardItems } from "../state/projectBoard";
import { useEnvironmentQuery } from "../state/query";
import { buildThreadRouteParams } from "../threadRoutes";
import {
  selectMegathreadWorkers,
  summarizeMegathreadUsage,
  type MegathreadWorker,
} from "./megathreadWorkers";

const STATUS_LABELS: Record<MegathreadWorker["status"], string> = {
  approval: "Needs approval",
  input: "Needs reply",
  working: "Working",
  waiting: "Idle",
  failed: "Failed",
  limited: "Rate limited",
  ready: "Idle",
};

function UsageLine({ usage }: { usage: MegathreadThreadUsage }) {
  return (
    <div className="text-xs tabular-nums text-muted-foreground">
      in {formatContextWindowTokens(usage.inputTokens)} (cached{" "}
      {formatContextWindowTokens(usage.cachedInputTokens)}) · out{" "}
      {formatContextWindowTokens(usage.outputTokens)} · {usage.turns}{" "}
      {usage.turns === 1 ? "turn" : "turns"}
    </div>
  );
}

/** Ticks once a second by writing the DOM, so a running worker costs no React commits. */
function WorkerElapsed({ worker }: { worker: MegathreadWorker }) {
  const textRef = useRef<HTMLSpanElement>(null);
  const { startedAt, completedAt } = worker;
  useEffect(() => {
    if (!startedAt) return;
    const update = () => {
      const end = completedAt ? Date.parse(completedAt) : Date.now();
      const text = formatCompactElapsedSeconds((end - Date.parse(startedAt)) / 1000);
      if (textRef.current && textRef.current.textContent !== text) {
        textRef.current.textContent = text;
      }
    };
    update();
    if (completedAt) return;
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [startedAt, completedAt]);
  return <span ref={textRef} className="tabular-nums" />;
}

/** Workers tab: subthreads of the open thread with their status, branch, and token cost. */
export function TandemWorkersPanel(props: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly bossThreadId: ThreadId;
}) {
  const router = useRouter();
  const threads = useThreadShells();
  const boardAtom = useMemo(
    () =>
      projectBoardItems({
        environmentId: props.environmentId,
        input: { projectId: props.projectId },
      }),
    [props.environmentId, props.projectId],
  );
  const items = useEnvironmentQuery(boardAtom).data?.items;
  const workers = useMemo(
    () =>
      selectMegathreadWorkers({
        threads: threads.filter((thread) => thread.environmentId === props.environmentId),
        bossThreadId: props.bossThreadId,
        items: items ?? [],
      }),
    [threads, props.environmentId, props.bossThreadId, items],
  );
  const threadIdsKey = [props.bossThreadId, ...workers.map((worker) => worker.threadId)].join(",");
  const usageAtom = useMemo(
    () =>
      megathreadUsage({
        environmentId: props.environmentId,
        input: { threadIds: threadIdsKey.split(",").map((id) => ThreadId.make(id)) },
      }),
    [props.environmentId, threadIdsKey],
  );
  const query = useEnvironmentQuery(usageAtom);
  // Usage only moves when a run starts or settles, so those are the refetch points.
  const boss = threads.find(
    (thread) => thread.environmentId === props.environmentId && thread.id === props.bossThreadId,
  );
  const activityKey = [
    `${boss?.latestRun?.status ?? ""}:${boss?.latestRun?.completedAt ?? ""}`,
    ...workers.map((worker) => `${worker.status}:${worker.completedAt ?? ""}`),
  ].join(",");
  const refresh = query.refresh;
  useEffect(() => {
    refresh();
  }, [activityKey, refresh]);

  const usage = summarizeMegathreadUsage(query.data?.threads ?? [], props.bossThreadId);
  const own = usage.byThread.get(props.bossThreadId);

  return (
    <section className="h-full min-h-0 overflow-auto px-3 py-2 text-sm">
      <div className="mb-2 border-b px-1.5 pb-2">
        <div className="text-sm">This thread</div>
        {own ? <UsageLine usage={own} /> : null}
      </div>
      {workers.length === 0 ? (
        <p className="px-1.5 text-xs opacity-70">
          No workers yet. Subthreads this thread starts, such as Megathread workers, show here.
        </p>
      ) : null}
      <ul className="flex flex-col">
        {workers.map((worker) => {
          const spent = usage.byThread.get(worker.threadId);
          return (
            <li key={worker.threadId}>
              <button
                type="button"
                className="w-full cursor-pointer rounded-md px-1.5 py-1.5 text-left hover:bg-accent/40"
                onClick={() => {
                  void router.navigate({
                    to: "/$environmentId/$threadId",
                    params: buildThreadRouteParams(
                      scopeThreadRef(props.environmentId, worker.threadId),
                    ),
                  });
                }}
              >
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{worker.title}</span>
                  <span className="shrink-0 text-3xs font-medium uppercase tracking-wide text-muted-foreground">
                    {STATUS_LABELS[worker.status]}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    <WorkerElapsed worker={worker} />
                  </span>
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {[worker.role, worker.model, worker.branch].filter(Boolean).join(" · ")}
                </div>
                {spent ? <UsageLine usage={spent} /> : null}
              </button>
            </li>
          );
        })}
      </ul>
      {workers.length > 0 && usage.totalTokens > 0 ? (
        <p className="mt-1 px-1.5 text-xs tabular-nums text-muted-foreground">
          Total {formatContextWindowTokens(usage.totalTokens)} tokens
          {usage.bossShare === null ? "" : ` · boss ${Math.round(usage.bossShare * 100)}%`}
        </p>
      ) : null}
    </section>
  );
}
