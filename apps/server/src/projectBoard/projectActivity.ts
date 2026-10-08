/**
 * Project activity is read from the thread event log plus the board.
 * Events are stored per thread, so the query stays on the threads touched
 * most recently and then keeps the newest significant rows.
 */
import {
  BOARD_WS_METHODS,
  BoardServiceError,
  ProjectBoardItemId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type ModelSelection,
  type ProjectActivityItem,
  type ProjectBoardItem,
  type ProjectBoardItemStatus,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import * as Board from "./BoardService.ts";

const ACTIVITY_LIMIT = 100;
const EVENT_SCAN_LIMIT = 400;
const THREAD_SCAN_LIMIT = 50;
const CHECKPOINT_FILE_LIMIT = 30;

const BOARD_STATUSES = new Set<ProjectBoardItemStatus>([
  "backlog",
  "ready",
  "inProgress",
  "inReview",
  "blocked",
  "completed",
  "cancelled",
]);

export interface ProjectActivityEventRow {
  readonly eventId: string;
  readonly eventType: string;
  readonly occurredAt: string;
  readonly threadId: string;
  readonly threadTitle: string | null;
  readonly payloadJson: string;
}

interface ActivityBoardHandoff {
  readonly id: string;
  readonly sourceThreadId: string;
  readonly nextStep: string;
  readonly createdAt: string;
}

export interface ActivityBoardSource {
  readonly id: string;
  readonly title: string;
  readonly status: ProjectBoardItemStatus;
  readonly sourceThreadId?: string | null | undefined;
  readonly updatedAt: string;
  readonly handoffHistory?: ReadonlyArray<ActivityBoardHandoff> | undefined;
  readonly latestHandoff?: ActivityBoardHandoff | null | undefined;
}

interface ActivityEventSqlRow {
  readonly event_id: string;
  readonly event_type: string;
  readonly occurred_at: string;
  readonly stream_id: string;
  readonly payload_json: string;
  readonly title: string | null;
}

const readFailure = new BoardServiceError({
  message: "Could not read project activity.",
});

const listProjectActivity = (
  sql: SqlClient.SqlClient,
  projectId: ProjectId,
  boardItems: ReadonlyArray<ProjectBoardItem>,
) =>
  sql<ActivityEventSqlRow>`
    SELECT
      e.event_id,
      e.event_type,
      e.occurred_at,
      e.stream_id,
      e.payload_json,
      t.title
    FROM orchestration_events e
    JOIN orchestration_v2_projection_threads t ON t.thread_id = e.stream_id
    WHERE e.aggregate_kind = 'thread'
      AND e.application_event_version = 2
      AND t.project_id = ${projectId}
      AND e.stream_id IN (
        SELECT thread_id
        FROM orchestration_v2_projection_threads
        WHERE project_id = ${projectId}
        ORDER BY updated_at DESC
        LIMIT ${THREAD_SCAN_LIMIT}
      )
      AND e.event_type IN (
        'thread.created',
        'run.created',
        'run.updated',
        'checkpoint.captured'
      )
    ORDER BY e.sequence DESC
    LIMIT ${EVENT_SCAN_LIMIT}
  `.pipe(
    Effect.mapError(() => readFailure),
    Effect.map((rows) =>
      mapProjectActivity({
        rows: rows.map((row) => ({
          eventId: row.event_id,
          eventType: row.event_type,
          occurredAt: row.occurred_at,
          threadId: row.stream_id,
          threadTitle: row.title,
          payloadJson: row.payload_json,
        })),
        boardItems,
      }),
    ),
  );

export const makeProjectActivityRpcHandlers = (
  sql: SqlClient.SqlClient,
  board: Board.BoardService["Service"],
) => ({
  [BOARD_WS_METHODS.activityList]: (input: { readonly projectId: ProjectId }) =>
    Effect.gen(function* () {
      const snapshot = yield* board.list(input.projectId);
      const items = yield* listProjectActivity(sql, input.projectId, snapshot.items);
      return { projectId: input.projectId, items };
    }),
});

export function mapProjectActivity(input: {
  readonly rows: ReadonlyArray<ProjectActivityEventRow>;
  readonly boardItems: ReadonlyArray<ActivityBoardSource>;
}): ReadonlyArray<ProjectActivityItem> {
  const items: ProjectActivityItem[] = [];
  for (const row of input.rows) {
    const mapped = mapEventRow(row);
    if (mapped) items.push(mapped);
  }
  for (const item of input.boardItems) {
    items.push(...mapBoardItem(item));
  }
  items.sort((left, right) => {
    const byTime = right.occurredAt.localeCompare(left.occurredAt);
    return byTime === 0 ? right.id.localeCompare(left.id) : byTime;
  });
  return items.slice(0, ACTIVITY_LIMIT);
}

function mapEventRow(row: ProjectActivityEventRow): ProjectActivityItem | null {
  if (row.eventId.trim().length === 0 || row.occurredAt.trim().length === 0) return null;
  if (row.threadId.trim().length === 0) return null;
  const payload = parsePayload(row.payloadJson);
  if (!payload) return null;
  const base = {
    id: row.eventId,
    occurredAt: row.occurredAt,
    threadId: ThreadId.make(row.threadId),
    threadTitle: nonEmpty(row.threadTitle),
  };
  switch (row.eventType) {
    case "thread.created":
      return { ...base, kind: "thread-created", modelSelection: readModelSelection(payload) };
    case "run.created":
      return { ...base, kind: "turn-started", modelSelection: readModelSelection(payload) };
    case "run.updated": {
      if (payload.status === "interrupted") {
        return { ...base, kind: "turn-interrupted", modelSelection: null };
      }
      if (payload.status === "failed") {
        return { ...base, kind: "error", summary: "The turn failed" };
      }
      return null;
    }
    case "checkpoint.captured":
      return mapCheckpoint(base, payload);
    default:
      return null;
  }
}

function mapCheckpoint(
  base: {
    readonly id: string;
    readonly occurredAt: string;
    readonly threadId: ReturnType<typeof ThreadId.make>;
    readonly threadTitle: string | null;
  },
  payload: Record<string, unknown>,
): ProjectActivityItem | null {
  if (payload.status === "error") {
    return { ...base, kind: "error", summary: "Checkpoint capture failed" };
  }
  if (payload.status !== "ready" && payload.status !== "missing" && payload.status !== "stale") {
    return null;
  }
  const files = readCheckpointFiles(payload.files);
  const additions = files.reduce((total, file) => total + file.additions, 0);
  const deletions = files.reduce((total, file) => total + file.deletions, 0);
  return {
    ...base,
    kind: "checkpoint",
    status: payload.status,
    files: files.slice(0, CHECKPOINT_FILE_LIMIT),
    fileCount: files.length,
    additions,
    deletions,
  };
}

function mapBoardItem(item: ActivityBoardSource): ProjectActivityItem[] {
  if (!BOARD_STATUSES.has(item.status) || item.title.trim().length === 0) return [];
  const events: ProjectActivityItem[] = [];
  if (item.updatedAt.trim().length > 0) {
    events.push({
      id: `board:${item.id}:${item.updatedAt}`,
      occurredAt: item.updatedAt,
      threadId: item.sourceThreadId ? ThreadId.make(item.sourceThreadId) : null,
      threadTitle: null,
      kind: "board-updated",
      itemId: ProjectBoardItemId.make(item.id),
      title: item.title,
      status: item.status,
    });
  }
  const handoffs =
    item.handoffHistory && item.handoffHistory.length > 0
      ? item.handoffHistory
      : item.latestHandoff
        ? [item.latestHandoff]
        : [];
  for (const handoff of handoffs) {
    if (
      handoff.id.trim().length === 0 ||
      handoff.nextStep.trim().length === 0 ||
      handoff.createdAt.trim().length === 0 ||
      handoff.sourceThreadId.trim().length === 0
    ) {
      continue;
    }
    events.push({
      id: `handoff:${handoff.id}`,
      occurredAt: handoff.createdAt,
      threadId: ThreadId.make(handoff.sourceThreadId),
      threadTitle: null,
      kind: "board-handoff",
      itemId: ProjectBoardItemId.make(item.id),
      title: item.title,
      nextStep: handoff.nextStep,
    });
  }
  return events;
}

function parsePayload(payloadJson: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(payloadJson);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function readModelSelection(payload: Record<string, unknown>): ModelSelection | null {
  const selection =
    typeof payload.modelSelection === "object" && payload.modelSelection !== null
      ? (payload.modelSelection as Record<string, unknown>)
      : null;
  if (!selection) return null;
  if (typeof selection.instanceId !== "string" || selection.instanceId.trim().length === 0) {
    return null;
  }
  if (typeof selection.model !== "string" || selection.model.trim().length === 0) return null;
  return {
    instanceId: ProviderInstanceId.make(selection.instanceId),
    model: selection.model.trim(),
  };
}

function readCheckpointFiles(
  value: unknown,
): Array<{ readonly path: string; readonly additions: number; readonly deletions: number }> {
  if (!Array.isArray(value)) return [];
  const files = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.path !== "string" || record.path.trim().length === 0) continue;
    if (!isNonNegative(record.additions) || !isNonNegative(record.deletions)) continue;
    files.push({
      path: record.path,
      additions: record.additions,
      deletions: record.deletions,
    });
  }
  return files;
}

function isNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function nonEmpty(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}
