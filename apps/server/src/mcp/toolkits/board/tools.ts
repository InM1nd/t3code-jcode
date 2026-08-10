import {
  ProjectBoardItem,
  ProjectBoardItemId,
  ProjectBoardItemStatus,
  ProjectId,
  TrimmedNonEmptyString,
  TurnId,
} from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";

import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { OrchestrationEngineService } from "../../../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";

export class BoardToolError extends Schema.TaggedErrorClass<BoardToolError>()("BoardToolError", {
  message: Schema.String,
}) {}

const dependencies = [
  McpInvocationContext.McpInvocationContext,
  OrchestrationEngineService,
  ProjectionSnapshotQuery,
  Crypto.Crypto,
];

const BoardListResult = Schema.Struct({
  projectId: ProjectId,
  items: Schema.Array(ProjectBoardItem),
});

const BoardDigestResult = Schema.Struct({
  projectId: ProjectId,
  digest: Schema.String,
  inProgressCount: Schema.Number,
  pendingCount: Schema.Number,
  completedCount: Schema.Number,
  totalCount: Schema.Number,
});

const BoardMutateResult = Schema.Struct({
  projectId: ProjectId,
  item: Schema.NullOr(ProjectBoardItem),
});

export const BoardListTool = Tool.make("board_list", {
  description:
    "List the project board todos for the current thread's project. These items are shared across all threads in the project.",
  parameters: Schema.Struct({}),
  success: BoardListResult,
  failure: BoardToolError,
  dependencies,
})
  .annotate(Tool.Title, "List project board")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const BoardDigestTool = Tool.make("board_digest", {
  description:
    "Return a compact project board digest (counts + titles by status). Prefer this over board_list when you only need orientation.",
  parameters: Schema.Struct({}),
  success: BoardDigestResult,
  failure: BoardToolError,
  dependencies,
})
  .annotate(Tool.Title, "Project board digest")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const BoardUpsertTool = Tool.make("board_upsert", {
  description:
    "Create or update a project board todo. Pass itemId to update an existing item; omit it to create a new one. Status is pending | inProgress | completed. Automatically links the project's current thread latest turn when available.",
  parameters: Schema.Struct({
    itemId: Schema.optional(ProjectBoardItemId),
    title: TrimmedNonEmptyString,
    status: ProjectBoardItemStatus,
    notes: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  }),
  success: BoardMutateResult,
  failure: BoardToolError,
  dependencies,
})
  .annotate(Tool.Title, "Upsert project board item")
  .annotate(Tool.Destructive, false);

export const BoardSetStatusTool = Tool.make("board_set_status", {
  description:
    "Set the status of an existing project board todo. Automatically links the current thread's latest turn when available.",
  parameters: Schema.Struct({
    itemId: ProjectBoardItemId,
    status: ProjectBoardItemStatus,
  }),
  success: BoardMutateResult,
  failure: BoardToolError,
  dependencies,
})
  .annotate(Tool.Title, "Set project board item status")
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const BoardLinkTurnTool = Tool.make("board_link_turn", {
  description:
    "Link a turn to a project board item. Omit turnId to link the current thread's latest turn.",
  parameters: Schema.Struct({
    itemId: ProjectBoardItemId,
    turnId: Schema.optional(TurnId),
  }),
  success: BoardMutateResult,
  failure: BoardToolError,
  dependencies,
})
  .annotate(Tool.Title, "Link turn to board item")
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const BoardDeleteTool = Tool.make("board_delete", {
  description: "Delete a project board todo by id.",
  parameters: Schema.Struct({
    itemId: ProjectBoardItemId,
  }),
  success: BoardMutateResult,
  failure: BoardToolError,
  dependencies,
})
  .annotate(Tool.Title, "Delete project board item")
  .annotate(Tool.Destructive, true);

export const BoardToolkit = Toolkit.make(
  BoardListTool,
  BoardDigestTool,
  BoardUpsertTool,
  BoardSetStatusTool,
  BoardLinkTurnTool,
  BoardDeleteTool,
);
