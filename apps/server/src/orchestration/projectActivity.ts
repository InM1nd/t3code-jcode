import {
  EventId,
  IsoDateTime,
  ProjectBoardItemUpsertedPayload,
  ProjectBoardItemHandoffAppendedPayload,
  ThreadActivityAppendedPayload,
  ThreadCreatedPayload,
  ThreadId,
  ThreadTurnDiffCompletedPayload,
  ThreadTurnInterruptRequestedPayload,
  ThreadTurnStartRequestedPayload,
  TrimmedNonEmptyString,
  type OrchestrationProjectActivityItem,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

const BaseRowFields = {
  id: EventId,
  occurredAt: IsoDateTime,
  threadId: Schema.NullOr(ThreadId),
  threadTitle: Schema.NullOr(TrimmedNonEmptyString),
} as const;

export const ProjectActivityEventRow = Schema.Union([
  Schema.Struct({
    ...BaseRowFields,
    eventType: Schema.Literal("thread.created"),
    payload: Schema.fromJsonString(ThreadCreatedPayload),
  }),
  Schema.Struct({
    ...BaseRowFields,
    eventType: Schema.Literal("thread.turn-start-requested"),
    payload: Schema.fromJsonString(ThreadTurnStartRequestedPayload),
  }),
  Schema.Struct({
    ...BaseRowFields,
    eventType: Schema.Literal("thread.turn-interrupt-requested"),
    payload: Schema.fromJsonString(ThreadTurnInterruptRequestedPayload),
  }),
  Schema.Struct({
    ...BaseRowFields,
    eventType: Schema.Literal("thread.turn-diff-completed"),
    payload: Schema.fromJsonString(ThreadTurnDiffCompletedPayload),
  }),
  Schema.Struct({
    ...BaseRowFields,
    eventType: Schema.Literal("thread.activity-appended"),
    payload: Schema.fromJsonString(ThreadActivityAppendedPayload),
  }),
  Schema.Struct({
    ...BaseRowFields,
    eventType: Schema.Literal("project.board-item-upserted"),
    payload: Schema.fromJsonString(ProjectBoardItemUpsertedPayload),
  }),
  Schema.Struct({
    ...BaseRowFields,
    eventType: Schema.Literal("project.board-item-handoff-appended"),
    payload: Schema.fromJsonString(ProjectBoardItemHandoffAppendedPayload),
  }),
]);
export type ProjectActivityEventRow = typeof ProjectActivityEventRow.Type;

function mapProjectActivityRow(
  row: ProjectActivityEventRow,
): OrchestrationProjectActivityItem | null {
  const base = {
    id: row.id,
    occurredAt: row.occurredAt,
    threadId: row.threadId,
    threadTitle: row.threadTitle,
  } as const;

  switch (row.eventType) {
    case "thread.created":
      return { ...base, kind: "thread-created", modelSelection: row.payload.modelSelection };
    case "thread.turn-start-requested":
      return { ...base, kind: "turn-started", modelSelection: row.payload.modelSelection ?? null };
    case "thread.turn-interrupt-requested":
      return { ...base, kind: "turn-interrupted", modelSelection: null };
    case "thread.turn-diff-completed":
      return row.payload.status === "error"
        ? { ...base, kind: "error", summary: "Checkpoint capture failed" }
        : {
            ...base,
            kind: "checkpoint",
            status: row.payload.status,
            files: row.payload.files,
          };
    case "thread.activity-appended":
      return row.payload.activity.tone === "error"
        ? { ...base, kind: "error", summary: row.payload.activity.summary }
        : null;
    case "project.board-item-upserted":
      return {
        ...base,
        kind: "board-updated",
        itemId: row.payload.item.id,
        title: row.payload.item.title,
        status: row.payload.item.status,
      };
    case "project.board-item-handoff-appended":
      return {
        ...base,
        kind: "board-handoff",
        itemId: row.payload.itemId,
        title: row.payload.itemTitle,
        nextStep: row.payload.handoff.nextStep,
      };
  }
}

export function mapProjectActivityRows(
  rows: ReadonlyArray<ProjectActivityEventRow>,
): ReadonlyArray<OrchestrationProjectActivityItem> {
  return rows.flatMap((row) => {
    const item = mapProjectActivityRow(row);
    return item === null ? [] : [item];
  });
}
