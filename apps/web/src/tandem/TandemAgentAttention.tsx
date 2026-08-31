import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import {
  BotIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleHelpIcon,
  LoaderCircleIcon,
  XIcon,
} from "lucide-react";
import { useMemo } from "react";
import { useRouter } from "@tanstack/react-router";

import { resolveSidebarThreadStatus } from "../components/Sidebar.logic";
import { Popover, PopoverPopup, PopoverTrigger } from "../components/ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { useThreadActions } from "../hooks/useThreadActions";
import { useThreadShells } from "../state/entities";
import { buildThreadRouteParams } from "../threadRoutes";
import {
  summarizeAgentAttention,
  type TandemAgentAttentionThread,
  type TandemAgentState,
} from "./agentAttention";
import { TandemDelegationQueue } from "./TandemDelegationQueue";

type AgentEntry = Omit<TandemAgentAttentionThread, "archivedAt" | "updatedAt"> & {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
};

function agentState(
  thread: Pick<
    EnvironmentThreadShell,
    "hasPendingApprovals" | "hasPendingUserInput" | "session" | "backgroundLiveness" | "latestTurn"
  >,
): TandemAgentState {
  const status = resolveSidebarThreadStatus(thread);
  if (status === "approval") return "permission";
  if (status === "input") return "question";
  if (status === "failed") return "error";
  if (status === "working") return "working";
  if (status === "monitoring") return "monitoring";
  return thread.latestTurn?.state === "completed" ? "completed" : "ready";
}

const statePresentation = {
  permission: { label: "Permission", Icon: CircleAlertIcon, className: "text-amber-500" },
  question: { label: "Needs reply", Icon: CircleHelpIcon, className: "text-sky-500" },
  error: { label: "Error", Icon: CircleAlertIcon, className: "text-destructive" },
  working: { label: "Working", Icon: LoaderCircleIcon, className: "text-emerald-500" },
  monitoring: { label: "Watching", Icon: LoaderCircleIcon, className: "text-muted-foreground" },
  completed: { label: "Completed", Icon: CircleCheckIcon, className: "text-muted-foreground" },
  ready: { label: "Ready", Icon: CircleCheckIcon, className: "text-muted-foreground" },
} as const;

export function TandemAgentAttention() {
  const router = useRouter();
  const { archiveThread } = useThreadActions();
  const threads = useThreadShells();
  const entries = useMemo<ReadonlyArray<AgentEntry>>(
    () =>
      threads.map((thread) => ({
        id: `${thread.environmentId}:${thread.id}`,
        environmentId: thread.environmentId,
        threadId: thread.id,
        title: thread.title,
        state: agentState(thread),
      })),
    [threads],
  );
  const summary = useMemo(
    () =>
      summarizeAgentAttention(
        threads.map((thread, index) => ({
          ...entries[index]!,
          archivedAt: thread.archivedAt,
          updatedAt: thread.updatedAt,
        })),
      ),
    [entries, threads],
  );
  const visibleEntries = useMemo(() => {
    const byThreadKey = new Map(
      entries.map((entry) => [`${entry.environmentId}:${entry.threadId}`, entry]),
    );
    return {
      needsAction: summary.needsAction.map((thread) => byThreadKey.get(thread.id)),
      active: summary.active.map((thread) => byThreadKey.get(thread.id)),
      completed: summary.completed.slice(0, 5).map((thread) => byThreadKey.get(thread.id)),
    };
  }, [entries, summary]);
  const attentionCount = summary.needsAction.length + summary.active.length;

  const openThread = (entry: AgentEntry) => {
    const threadRef = scopeThreadRef(entry.environmentId, entry.threadId);
    void router.navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(threadRef),
    });
  };

  // Archiving (not deleting) an errored thread only hides it from this list;
  // the thread and its history stay reachable from the sidebar's archive.
  const dismissThread = (entry: AgentEntry) => {
    void archiveThread(scopeThreadRef(entry.environmentId, entry.threadId));
  };

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={
              attentionCount === 0 ? "Agent control" : `Agent control: ${attentionCount} active`
            }
            className="relative z-10 ml-auto hidden h-7 min-w-7 cursor-pointer items-center justify-center rounded-md px-1.5 text-muted-foreground outline-hidden hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:inline-flex"
          />
        }
      >
        <BotIcon aria-hidden className="size-3.5" />
        {attentionCount > 0 ? (
          <span className="ml-1 text-[10px] tabular-nums">{attentionCount}</span>
        ) : null}
      </PopoverTrigger>
      <PopoverPopup align="end" className="w-80" side="bottom" viewportClassName="py-3">
        <div className="mb-3 flex items-center justify-between px-0.5">
          <div>
            <p className="font-medium text-sm">Agent control</p>
            <p className="text-muted-foreground text-xs">
              {attentionCount === 0
                ? "All agents are clear"
                : `${attentionCount} active or awaiting you`}
            </p>
          </div>
          <BotIcon aria-hidden className="size-4 text-muted-foreground" />
        </div>
        <AgentSection
          entries={visibleEntries.needsAction}
          label="Needs you"
          onDismissThread={dismissThread}
          onOpenThread={openThread}
        />
        <AgentSection
          entries={visibleEntries.active}
          label="In progress"
          onOpenThread={openThread}
        />
        <TandemDelegationQueue />
        <AgentSection
          entries={visibleEntries.completed}
          label="Recently completed"
          onOpenThread={openThread}
        />
      </PopoverPopup>
    </Popover>
  );
}

function AgentSection({
  entries,
  label,
  onOpenThread,
  onDismissThread,
}: {
  entries: ReadonlyArray<AgentEntry | undefined>;
  label: string;
  onOpenThread: (entry: AgentEntry) => void;
  /** Only offered for states the user can't act on further, e.g. "error". */
  onDismissThread?: (entry: AgentEntry) => void;
}) {
  const visible = entries.filter((entry): entry is AgentEntry => entry !== undefined);
  if (visible.length === 0) return null;

  return (
    <section className="border-border/60 border-t pt-2.5 first:border-t-0 first:pt-0">
      <p className="mb-1 px-0.5 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      {visible.map((entry) => {
        const presentation = statePresentation[entry.state];
        return (
          <div
            key={`${entry.environmentId}:${entry.threadId}`}
            className="group flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-accent"
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onOpenThread(entry)}
            >
              <presentation.Icon
                aria-hidden
                className={`size-3.5 shrink-0 ${presentation.className}`}
              />
              <span className="min-w-0 flex-1 truncate text-sm">{entry.title}</span>
            </button>
            <span className="shrink-0 text-[11px] text-muted-foreground">{presentation.label}</span>
            {onDismissThread && entry.state === "error" ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label="Dismiss (archives the thread)"
                      className="shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDismissThread(entry);
                      }}
                    />
                  }
                >
                  <XIcon aria-hidden className="size-3.5" />
                </TooltipTrigger>
                <TooltipPopup side="top">Dismiss (archives the thread)</TooltipPopup>
              </Tooltip>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
