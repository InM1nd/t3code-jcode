/**
 * Project board contracts.
 *
 * Fork-owned surface, kept in its own module so `orchestration.ts` — a file
 * upstream rewrites constantly — carries references instead of definitions.
 * Everything here re-exports through the package barrel, so consumers keep
 * importing from `@t3tools/contracts` unchanged.
 */
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";
import * as SchemaTransformation from "effect/SchemaTransformation";
import {
  CommandId,
  IsoDateTime,
  ProjectBoardHandoffId,
  ProjectBoardItemId,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
  TurnId,
} from "./baseSchemas.ts";

/** Soft cap so shell snapshots stay small when the board rides on project-upserted. */
export const PROJECT_BOARD_ITEM_LIMIT = 100;

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
    SchemaTransformation.transformOrFail({
      decode: (status) => Effect.succeed(status === "pending" ? "backlog" : status),
      encode: Effect.succeed,
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

/** Soft cap for turn links stored on each board item. */
export const PROJECT_BOARD_LINKED_TURN_LIMIT = 20;

export const ProjectBoardItem = Schema.Struct({
  id: ProjectBoardItemId,
  title: TrimmedNonEmptyString,
  status: ProjectBoardItemStatus,
  notes: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  brief: Schema.optional(Schema.NullOr(ProjectBoardBrief)),
  latestHandoff: Schema.optional(Schema.NullOr(ProjectBoardHandoff)),
  source: ProjectBoardItemSource,
  sourceThreadId: Schema.optional(Schema.NullOr(ThreadId)),
  // Turns that touched this card. Optional for older servers/clients.
  linkedTurnIds: Schema.optional(Schema.Array(TurnId)),
  // Free-text grouping (e.g. "seo", "mobile", "media"). Per-project, not a
  // fixed enum: projects differ too much to share one taxonomy. Optional for
  // older servers/clients.
  area: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  archivedAt: Schema.optional(Schema.NullOr(IsoDateTime)),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type ProjectBoardItem = typeof ProjectBoardItem.Type;

export const ProjectBoardItemUpsertCommand = Schema.Struct({
  type: Schema.Literal("project.board.item.upsert"),
  commandId: CommandId,
  projectId: ProjectId,
  itemId: ProjectBoardItemId,
  title: TrimmedNonEmptyString,
  status: ProjectBoardItemStatus,
  notes: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  brief: Schema.optional(Schema.NullOr(ProjectBoardBrief)),
  source: Schema.optional(ProjectBoardItemSource),
  sourceThreadId: Schema.optional(Schema.NullOr(ThreadId)),
  // Replace the full linked-turn list when provided.
  linkedTurnIds: Schema.optional(Schema.Array(TurnId)),
  // Append a single turn id (deduped, capped) when provided.
  linkTurnId: Schema.optional(Schema.NullOr(TurnId)),
  area: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
});

export const ProjectBoardItemHandoffAppendCommand = Schema.Struct({
  type: Schema.Literal("project.board.item.handoff.append"),
  commandId: CommandId,
  projectId: ProjectId,
  itemId: ProjectBoardItemId,
  sourceThreadId: ThreadId,
  summary: TrimmedNonEmptyString,
  decisions: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  nextStep: TrimmedNonEmptyString,
});

export const ProjectBoardItemDeleteCommand = Schema.Struct({
  type: Schema.Literal("project.board.item.delete"),
  commandId: CommandId,
  projectId: ProjectId,
  itemId: ProjectBoardItemId,
});

export const ProjectBoardItemArchiveCommand = Schema.Struct({
  type: Schema.Literal("project.board.item.archive"),
  commandId: CommandId,
  projectId: ProjectId,
  itemId: ProjectBoardItemId,
});

export const ProjectBoardItemRestoreCommand = Schema.Struct({
  type: Schema.Literal("project.board.item.restore"),
  commandId: CommandId,
  projectId: ProjectId,
  itemId: ProjectBoardItemId,
});

export const ProjectBoardItemUpsertedPayload = Schema.Struct({
  projectId: ProjectId,
  item: ProjectBoardItem,
  updatedAt: IsoDateTime,
});

export const ProjectBoardItemHandoffAppendedPayload = Schema.Struct({
  projectId: ProjectId,
  itemId: ProjectBoardItemId,
  itemTitle: TrimmedNonEmptyString,
  handoff: ProjectBoardHandoff,
  updatedAt: IsoDateTime,
});

export const ProjectBoardItemDeletedPayload = Schema.Struct({
  projectId: ProjectId,
  itemId: ProjectBoardItemId,
  updatedAt: IsoDateTime,
});

export const ProjectBoardItemArchivedPayload = Schema.Struct({
  projectId: ProjectId,
  itemId: ProjectBoardItemId,
  archivedAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

export const ProjectBoardItemRestoredPayload = Schema.Struct({
  projectId: ProjectId,
  itemId: ProjectBoardItemId,
  updatedAt: IsoDateTime,
});
