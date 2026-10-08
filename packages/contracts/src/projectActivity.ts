/**
 * Project activity timeline. A capped list of significant events for one
 * project: threads, turns, checkpoints, errors, and board changes.
 */
import * as Schema from "effect/Schema";

import {
  IsoDateTime,
  NonNegativeInt,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";
import { ModelSelection } from "./modelSelection.ts";
import { ProjectBoardItemId, ProjectBoardItemStatus } from "./projectBoard.ts";

const ProjectActivityBaseFields = {
  id: TrimmedNonEmptyString,
  occurredAt: IsoDateTime,
  threadId: Schema.NullOr(ThreadId),
  threadTitle: Schema.NullOr(TrimmedNonEmptyString),
} as const;

export const ProjectActivityCheckpointFile = Schema.Struct({
  path: TrimmedNonEmptyString,
  additions: NonNegativeInt,
  deletions: NonNegativeInt,
});
export type ProjectActivityCheckpointFile = typeof ProjectActivityCheckpointFile.Type;

export const ProjectActivityItem = Schema.Union([
  Schema.Struct({
    ...ProjectActivityBaseFields,
    kind: Schema.Literals(["thread-created", "turn-started", "turn-interrupted"]),
    modelSelection: Schema.NullOr(ModelSelection),
  }),
  Schema.Struct({
    ...ProjectActivityBaseFields,
    kind: Schema.Literal("checkpoint"),
    status: Schema.Literals(["ready", "missing", "stale"]),
    files: Schema.Array(ProjectActivityCheckpointFile),
    fileCount: NonNegativeInt,
    additions: NonNegativeInt,
    deletions: NonNegativeInt,
  }),
  Schema.Struct({
    ...ProjectActivityBaseFields,
    kind: Schema.Literal("error"),
    summary: TrimmedNonEmptyString,
  }),
  Schema.Struct({
    ...ProjectActivityBaseFields,
    kind: Schema.Literal("board-updated"),
    itemId: ProjectBoardItemId,
    title: TrimmedNonEmptyString,
    status: ProjectBoardItemStatus,
  }),
  Schema.Struct({
    ...ProjectActivityBaseFields,
    kind: Schema.Literal("board-handoff"),
    itemId: ProjectBoardItemId,
    title: TrimmedNonEmptyString,
    nextStep: TrimmedNonEmptyString,
  }),
]);
export type ProjectActivityItem = typeof ProjectActivityItem.Type;

export const ProjectActivitySnapshot = Schema.Struct({
  projectId: ProjectId,
  items: Schema.Array(ProjectActivityItem),
});
export type ProjectActivitySnapshot = typeof ProjectActivitySnapshot.Type;
