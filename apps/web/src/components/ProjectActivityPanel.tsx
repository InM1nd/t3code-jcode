import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type {
  EnvironmentId,
  OrchestrationProjectActivityItem,
  ProjectId,
  ThreadId,
} from "@t3tools/contracts";
import { useRouter } from "@tanstack/react-router";
import {
  AlertTriangle,
  CircleStop,
  FileCheck2,
  History,
  ListTodo,
  Send,
  MessageSquarePlus,
  Play,
} from "lucide-react";
import { useCallback, useMemo } from "react";

import { readThreadShell } from "~/state/entities";
import { useProjectActivity } from "~/state/queries";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { cn } from "~/lib/utils";

import { projectBoardStatusLabel } from "./ProjectBoardPanel.logic";
import { formatCheckpointSummary, groupProjectActivityByDay } from "./ProjectActivityPanel.logic";

interface ProjectActivityPanelProps {
  environmentId: EnvironmentId;
  projectId: ProjectId;
}

function ActivityIcon({ kind }: { kind: OrchestrationProjectActivityItem["kind"] }) {
  const className = "size-3.5";
  switch (kind) {
    case "thread-created":
      return <MessageSquarePlus className={className} />;
    case "turn-started":
      return <Play className={className} />;
    case "turn-interrupted":
      return <CircleStop className={className} />;
    case "checkpoint":
      return <FileCheck2 className={className} />;
    case "board-updated":
      return <ListTodo className={className} />;
    case "board-handoff":
      return <Send className={className} />;
    case "error":
      return <AlertTriangle className={className} />;
  }
}

function activityTitle(item: OrchestrationProjectActivityItem): string {
  switch (item.kind) {
    case "thread-created":
      return "Thread created";
    case "turn-started":
      return "Turn started";
    case "turn-interrupted":
      return "Turn interrupted";
    case "checkpoint":
      return item.status === "missing" ? "Checkpoint unavailable" : "Checkpoint created";
    case "board-updated":
      return `Board · ${projectBoardStatusLabel(item.status)}`;
    case "board-handoff":
      return `Handoff · ${item.title}`;
    case "error":
      return "Error";
  }
}

function activityDetail(item: OrchestrationProjectActivityItem): string | null {
  switch (item.kind) {
    case "thread-created":
    case "turn-started":
    case "turn-interrupted":
      return item.modelSelection
        ? `${item.modelSelection.instanceId} · ${item.modelSelection.model}`
        : null;
    case "checkpoint":
      return formatCheckpointSummary(item);
    case "board-updated":
      return item.title;
    case "board-handoff":
      return item.nextStep;
    case "error":
      return item.summary;
  }
}

function ActivityRow({
  item,
  environmentId,
  onOpenThread,
}: {
  item: OrchestrationProjectActivityItem;
  environmentId: EnvironmentId;
  onOpenThread: (threadId: ThreadId) => void;
}) {
  const canOpenThread =
    item.threadId !== null &&
    readThreadShell(scopeThreadRef(environmentId, item.threadId)) !== null;
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(item.occurredAt));
  const detail = activityDetail(item);
  const content = (
    <>
      <span
        className={cn(
          "absolute -left-[1.18rem] top-1.5 flex size-5 items-center justify-center rounded-full border bg-background text-muted-foreground",
          item.kind === "error" && "border-destructive/40 text-destructive",
        )}
      >
        <ActivityIcon kind={item.kind} />
      </span>
      <span className="flex min-w-0 items-baseline justify-between gap-3">
        <span className="truncate text-xs font-medium text-foreground">{activityTitle(item)}</span>
        <time className="shrink-0 text-[.65rem] tabular-nums text-muted-foreground">{time}</time>
      </span>
      {item.threadTitle ? (
        <span className="mt-0.5 block truncate text-[.7rem] text-muted-foreground">
          {item.threadTitle}
        </span>
      ) : null}
      {detail ? (
        <span
          className={cn(
            "mt-1 block text-[.7rem] leading-relaxed text-muted-foreground",
            item.kind === "error" && "text-destructive/80",
          )}
        >
          {detail}
        </span>
      ) : null}
    </>
  );

  return (
    <div className="relative min-w-0 pb-3 pl-1">
      {canOpenThread ? (
        <button
          type="button"
          className="block w-full min-w-0 cursor-pointer rounded-md p-1.5 text-left hover:bg-accent/60"
          onClick={() => onOpenThread(item.threadId!)}
        >
          {content}
        </button>
      ) : (
        <div className="min-w-0 p-1.5">{content}</div>
      )}
      {item.kind === "checkpoint" && item.files.length > 0 ? (
        <details className="ml-1.5 text-[.68rem] text-muted-foreground">
          <summary className="cursor-pointer select-none py-1 hover:text-foreground">Files</summary>
          <ul className="space-y-1 border-l border-border/60 py-1 pl-2">
            {item.files.map((file) => (
              <li key={file.path} className="flex min-w-0 items-center justify-between gap-2">
                <span className="truncate font-mono">{file.path}</span>
                <span className="shrink-0 tabular-nums">
                  <span className="text-emerald-600 dark:text-emerald-400">+{file.additions}</span>{" "}
                  <span className="text-destructive">−{file.deletions}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

export function ProjectActivityPanel({ environmentId, projectId }: ProjectActivityPanelProps) {
  const query = useProjectActivity(environmentId, projectId);
  const router = useRouter();
  const groups = useMemo(
    () => groupProjectActivityByDay(query.data?.items ?? []),
    [query.data?.items],
  );
  const onOpenThread = useCallback(
    (threadId: ThreadId) => {
      if (!readThreadShell(scopeThreadRef(environmentId, threadId))) return;
      void router.navigate({
        to: "/$environmentId/$threadId",
        params: { environmentId, threadId },
      });
    },
    [environmentId, router],
  );

  if (query.isPending && query.data === null) {
    return <div className="p-4 text-xs text-muted-foreground">Loading activity…</div>;
  }
  if (query.error && query.data === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="size-5 text-destructive" />
        <p className="text-sm font-medium">Activity unavailable</p>
        <p className="max-w-64 text-xs text-muted-foreground">{query.error}</p>
        <Button size="xs" variant="outline" onClick={query.refresh}>
          Retry
        </Button>
      </div>
    );
  }
  if (groups.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <History className="size-6 text-muted-foreground/60" />
        <p className="text-sm font-medium">No project activity yet</p>
        <p className="max-w-56 text-xs text-muted-foreground">
          Significant thread, checkpoint, and Board events will appear here.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="p-3">
        {groups.map((group) => (
          <section key={group.key} className="mb-4 last:mb-0">
            <h3 className="mb-2 text-[.65rem] font-medium uppercase tracking-wider text-muted-foreground">
              {group.label}
            </h3>
            <div className="ml-2 border-l border-border/70 pl-3">
              {group.items.map((item) => (
                <ActivityRow
                  key={item.id}
                  item={item}
                  environmentId={environmentId}
                  onOpenThread={onOpenThread}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </ScrollArea>
  );
}
