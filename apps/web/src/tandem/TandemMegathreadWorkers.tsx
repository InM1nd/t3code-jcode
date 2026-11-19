import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { ThreadId, type EnvironmentId, type ProjectBoardItem } from "@t3tools/contracts";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";

import { formatCompactElapsedSeconds } from "../components/chat/AgentElapsed";
import { formatContextWindowTokens } from "../lib/contextWindow";
import { useThreadShells } from "../state/entities";
import { megathreadUsage } from "../state/projectBoard";
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

/** Subthreads of the open thread with their status, branch, and token cost. */
export function TandemMegathreadWorkers(props: {
  readonly environmentId: EnvironmentId;
  readonly bossThreadId: ThreadId;
  readonly items: ReadonlyArray<ProjectBoardItem>;
}) {
  const router = useRouter();
  const threads = useThreadShells();
  const workers = useMemo(
    () =>
      selectMegathreadWorkers({
        threads: threads.filter((thread) => thread.environmentId === props.environmentId),
        bossThreadId: props.bossThreadId,
        items: props.items,
      }),
    [threads, props.environmentId, props.bossThreadId, props.items],
  );
  const threadIdsKey = [props.bossThreadId, ...workers.map((worker) => worker.threadId)].join(",");
  const usageAtom = useMemo(
    () =>
      workers.length === 0
        ? null
        : megathreadUsage({
            environmentId: props.environmentId,
            input: { threadIds: threadIdsKey.split(",").map((id) => ThreadId.make(id)) },
          }),
    [props.environmentId, threadIdsKey, workers.length],
  );
  const query = useEnvironmentQuery(usageAtom);
  // Usage only moves when a worker starts or settles a run, so those are the refetch points.
  const activityKey = workers
    .map((worker) => `${worker.status}:${worker.completedAt ?? ""}`)
    .join(",");
  const refresh = query.refresh;
  useEffect(() => {
    if (activityKey.length > 0) refresh();
  }, [activityKey, refresh]);

  if (workers.length === 0) return null;
  const usage = summarizeMegathreadUsage(query.data?.threads ?? [], props.bossThreadId);

  return (
    <section className="mb-3 border-b pb-2">
      <h3 className="mb-1 text-xs font-medium opacity-70">Workers</h3>
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
                {spent ? (
                  <div className="text-xs tabular-nums text-muted-foreground">
                    in {formatContextWindowTokens(spent.inputTokens)} (cached{" "}
                    {formatContextWindowTokens(spent.cachedInputTokens)}) · out{" "}
                    {formatContextWindowTokens(spent.outputTokens)} · {spent.turns}{" "}
                    {spent.turns === 1 ? "turn" : "turns"}
                  </div>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {usage.totalTokens > 0 ? (
        <p className="mt-1 px-1.5 text-xs tabular-nums text-muted-foreground">
          Total {formatContextWindowTokens(usage.totalTokens)} tokens
          {usage.bossShare === null ? "" : ` · boss ${Math.round(usage.bossShare * 100)}%`}
        </p>
      ) : null}
    </section>
  );
}
