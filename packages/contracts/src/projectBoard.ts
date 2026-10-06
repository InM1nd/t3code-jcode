/**
 * Project board cards.
 *
 * Fork-owned. The board is not an orchestration event stream: V2 keeps the
 * cards in `fork_board_items`, and this module is only their shape.
 */
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";

import { IsoDateTime, ThreadId, TrimmedNonEmptyString, TurnId } from "./baseSchemas.ts";

/** Soft cap so one project cannot grow the board without bound. */
export const PROJECT_BOARD_ITEM_LIMIT = 500;

const makeEntityId = <Brand extends string>(brand: Parameters<typeof Schema.brand<Brand>>[0]) =>
  TrimmedNonEmptyString.pipe(Schema.brand<Brand>(brand));

export const ProjectBoardItemId = makeEntityId("ProjectBoardItemId");
export type ProjectBoardItemId = typeof ProjectBoardItemId.Type;

export const ProjectBoardHandoffId = makeEntityId("ProjectBoardHandoffId");
export type ProjectBoardHandoffId = typeof ProjectBoardHandoffId.Type;

const CanonicalProjectBoardItemStatus = Schema.Literals([
  "backlog",
  "ready",
  "inProgress",
  "inReview",
  "blocked",
  "completed",
  "cancelled",
]);

export const ProjectBoardItemStatus = Schema.Literals([
  "pending",
  "backlog",
  "ready",
  "inProgress",
  "inReview",
  "blocked",
  "completed",
  "cancelled",
]).pipe(
  Schema.decodeTo(
    CanonicalProjectBoardItemStatus,
    SchemaTransformation.transformEffect({
      decode: (status) => Effect.succeed(status === "pending" ? "backlog" : status),
      encode: (status) => Effect.succeed(status),
    }),
  ),
);
export type ProjectBoardItemStatus = typeof ProjectBoardItemStatus.Type;

export const ProjectBoardItemSource = Schema.Literals(["user", "agent"]);
export type ProjectBoardItemSource = typeof ProjectBoardItemSource.Type;

export const ProjectBoardBrief = Schema.Struct({
  goal: TrimmedNonEmptyString,
  acceptanceCriteria: Schema.Array(TrimmedNonEmptyString),
  importantFiles: Schema.Array(TrimmedNonEmptyString),
  notes: Schema.NullOr(TrimmedNonEmptyString),
});
export type ProjectBoardBrief = typeof ProjectBoardBrief.Type;

export const ProjectBoardHandoff = Schema.Struct({
  id: ProjectBoardHandoffId,
  sourceThreadId: ThreadId,
  summary: TrimmedNonEmptyString,
  decisions: Schema.Array(TrimmedNonEmptyString),
  nextStep: TrimmedNonEmptyString,
  createdAt: IsoDateTime,
});
export type ProjectBoardHandoff = typeof ProjectBoardHandoff.Type;

export const ProjectBoardItem = Schema.Struct({
  id: ProjectBoardItemId,
  title: TrimmedNonEmptyString,
  status: ProjectBoardItemStatus,
  notes: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  brief: Schema.optional(Schema.NullOr(ProjectBoardBrief)),
  latestHandoff: Schema.optional(Schema.NullOr(ProjectBoardHandoff)),
  handoffHistory: Schema.optional(Schema.Array(ProjectBoardHandoff)),
  source: ProjectBoardItemSource,
  sourceThreadId: Schema.optional(Schema.NullOr(ThreadId)),
  linkedTurnIds: Schema.optional(Schema.Array(TurnId)),
  area: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  externalRefs: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  relatedItemIds: Schema.optional(Schema.Array(ProjectBoardItemId)),
  archivedAt: Schema.optional(Schema.NullOr(IsoDateTime)),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type ProjectBoardItem = typeof ProjectBoardItem.Type;
