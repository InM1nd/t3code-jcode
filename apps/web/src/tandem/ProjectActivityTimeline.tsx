import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ProjectActivityItem, ProjectId } from "@t3tools/contracts";
import { useRouter } from "@tanstack/react-router";
import {
  CircleAlertIcon,
  CircleStopIcon,
  FileCheck2Icon,
  ListTodoIcon,
  MessageSquarePlusIcon,
  PlayIcon,
  SendIcon,
} from "lucide-react";
import { useMemo } from "react";

import { projectBoardStatusLabel } from "../components/ProjectBoardPanel.logic";
import { projectActivity } from "../state/projectBoard";
import { useEnvironmentQuery } from "../state/query";
import { buildThreadRouteParams } from "../threadRoutes";
import { formatCheckpointSummary, groupProjectActivityByDay } from "./activityTimeline";

export function ProjectActivityTimeline(props: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
}) {
  const router = useRouter();
  const activityAtom = useMemo(
    () =>
      projectActivity({
        environmentId: props.environmentId,
        input: { projectId: props.projectId },
      }),
    [props.environmentId, props.projectId],
  );
  const query = useEnvironmentQuery(activityAtom);
  const items = query.data?.items ?? [];
  const groups = useMemo(() => groupProjectActivityByDay(items), [items]);

  const openThread = (item: ProjectActivityItem) => {
    if (!item.threadId) return;
    void router.navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(props.environmentId, item.threadId)),
    });
  };

  return (
    <section className="mt-4 border-t pt-3">
      <h3 className="mb-2 text-xs font-medium opacity-70">Activity</h3>
      {query.error ? (
        <p className="text-xs opacity-70">Activity is unavailable.</p>
      ) : !query.data ? (
        <p className="text-xs opacity-70">Loading activity…</p>
      ) : items.length === 0 ? (
        <p className="text-xs opacity-70">No activity yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((group) => (
            <div key={group.key}>
              <h4 className="mb-1 text-xs font-medium opacity-70">{group.label}</h4>
              <ul className="flex flex-col gap-2">
                {group.items.map((item) => (
                  <ActivityRow key={item.id} item={item} onOpen={() => openThread(item)} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ActivityRow(props: { readonly item: ProjectActivityItem; readonly onOpen: () => void }) {
  const { item } = props;
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(item.occurredAt));
  const heading = (
    <span className="flex items-baseline justify-between gap-2">
      <span className="truncate text-xs">{activityTitle(item)}</span>
      <span className="shrink-0 text-xs opacity-70">{time}</span>
    </span>
  );

  return (
    <li className="flex gap-2">
      <span className="mt-0.5 text-muted-foreground">
        <ActivityIcon kind={item.kind} />
      </span>
      <span className="min-w-0 flex-1">
        {item.threadId ? (
          <button type="button" className="w-full text-left" onClick={props.onOpen}>
            {heading}
          </button>
        ) : (
          heading
        )}
        {item.threadTitle ? (
          <span className="block truncate text-xs opacity-70">{item.threadTitle}</span>
        ) : null}
        <ActivityDetail item={item} />
      </span>
    </li>
  );
}

function ActivityDetail(props: { readonly item: ProjectActivityItem }) {
  const detail = activityDetail(props.item);
  if (props.item.kind === "checkpoint" && props.item.files.length > 0) {
    const hidden = props.item.fileCount - props.item.files.length;
    return (
      <details className="text-xs opacity-70">
        <summary>{detail}</summary>
        <ul className="mt-1 flex flex-col gap-0.5">
          {props.item.files.map((file) => (
            <li key={file.path} className="truncate">
              {file.path} +{file.additions} −{file.deletions}
            </li>
          ))}
          {hidden > 0 ? <li>and {hidden} more</li> : null}
        </ul>
      </details>
    );
  }
  return detail ? <span className="block truncate text-xs opacity-70">{detail}</span> : null;
}

function ActivityIcon(props: { readonly kind: ProjectActivityItem["kind"] }) {
  const className = "size-3.5";
  switch (props.kind) {
    case "thread-created":
      return <MessageSquarePlusIcon className={className} />;
    case "turn-started":
      return <PlayIcon className={className} />;
    case "turn-interrupted":
      return <CircleStopIcon className={className} />;
    case "checkpoint":
      return <FileCheck2Icon className={className} />;
    case "board-updated":
      return <ListTodoIcon className={className} />;
    case "board-handoff":
      return <SendIcon className={className} />;
    case "error":
      return <CircleAlertIcon className={className} />;
  }
}

function activityTitle(item: ProjectActivityItem): string {
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

function activityDetail(item: ProjectActivityItem): string | null {
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
