import {
  ProjectBoardItem,
  ProjectBoardBrief,
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
  totalCount: Schema.Number,
  nextOffset: Schema.NullOr(Schema.Number),
  items: Schema.Array(ProjectBoardItem),
});

const BoardDigestResult = Schema.Struct({
  projectId: ProjectId,
  digest: Schema.String,
  backlogCount: Schema.Number,
  readyCount: Schema.Number,
  inProgressCount: Schema.Number,
  inReviewCount: Schema.Number,
  blockedCount: Schema.Number,
  completedCount: Schema.Number,
  cancelledCount: Schema.Number,
  totalCount: Schema.Number,
});

const BoardMutateResult = Schema.Struct({
  projectId: ProjectId,
  item: Schema.NullOr(ProjectBoardItem),
});

export const BoardListTool = Tool.make("board_list", {
  description:
    "List project board todos as paginated structured data (shared across all project threads). Returns at most 50 id/title/status items by default. Filter by status or pass offset/limit to browse more. Pass includeDetails: true only when bulk-reading details is necessary; for one card use board_get_brief.",
  parameters: Schema.Struct({
    includeArchived: Schema.optional(Schema.Boolean),
    includeDetails: Schema.optional(Schema.Boolean),
    status: Schema.optional(ProjectBoardItemStatus),
    offset: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10_000 }))),
    limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))),
  }),
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
    "Return a compact project board digest (all status counts plus at most 20 prioritized titles). Use only when board-wide orientation is relevant.",
  // Empty `Schema.Struct({})` encodes to an invalid root `anyOf: [object,
  // array]` JSON Schema in this Effect version instead of `type: "object"`.
  // Claude Code's MCP client silently drops every tool from a server whose
  // list includes a non-object-root inputSchema, so this must stay a Record.
  parameters: Schema.Record(Schema.String, Schema.Never),
  success: BoardDigestResult,
  failure: BoardToolError,
  dependencies,
})
  .annotate(Tool.Title, "Project board digest")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const BoardGetBriefTool = Tool.make("board_get_brief", {
  description:
    "Get the optional task brief and latest handoff for one project board todo in the current thread's project.",
  parameters: Schema.Struct({ itemId: ProjectBoardItemId }),
  success: BoardMutateResult,
  failure: BoardToolError,
  dependencies,
})
  .annotate(Tool.Title, "Get board task brief")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const BoardUpsertTool = Tool.make("board_upsert", {
  description:
    'Create or update a project board todo. One item tracks one deliverable, not a phase or implementation step. Check the board first and pass itemId to update an existing item instead of creating a duplicate. Use status for workflow phases, keep titles free of phase/priority/ownership prefixes, and use board_handoff for transfer context. Always set area unless the project genuinely has no natural groupings — check board_digest first and reuse an existing area verbatim (e.g. "seo", "mobile", "media") rather than inventing a near-duplicate spelling; area is free text, per-project, and is what lets board_digest group each status by area so an untouched one is visible without rereading every card. It is never inferred automatically — an item created or edited without area stays uncategorized. In notes/brief, point at codebase-memory qualified names instead of re-describing code, so the next agent doesn\'t re-explore what\'s already indexed. Automatically links the project\'s current thread latest turn when available.',
  parameters: Schema.Struct({
    itemId: Schema.optional(ProjectBoardItemId),
    title: TrimmedNonEmptyString,
    status: ProjectBoardItemStatus,
    notes: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
    brief: Schema.optional(Schema.NullOr(ProjectBoardBrief)),
    area: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
    // Replaces the full list when provided. External URLs (GitHub issue/PR, doc, etc).
    externalRefs: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
    // Replaces the full list when provided. Other board item ids this card relates to.
    relatedItemIds: Schema.optional(Schema.Array(ProjectBoardItemId)),
  }),
  success: BoardMutateResult,
  failure: BoardToolError,
  dependencies,
})
  .annotate(Tool.Title, "Upsert project board item")
  .annotate(Tool.Destructive, false);

export const BoardHandoffTool = Tool.make("board_handoff", {
  description:
    "Append a handoff for a project board todo. Capture completed work, decisions, and the concrete next step for the next agent.",
  parameters: Schema.Struct({
    itemId: ProjectBoardItemId,
    summary: TrimmedNonEmptyString,
    decisions: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
    nextStep: TrimmedNonEmptyString,
  }),
  success: BoardMutateResult,
  failure: BoardToolError,
  dependencies,
})
  .annotate(Tool.Title, "Append board handoff")
  .annotate(Tool.Destructive, false);

export const BoardSetStatusTool = Tool.make("board_set_status", {
  description:
    "Set the workflow status of an existing project board todo; use this for phase changes instead of creating phase cards. Automatically links the current thread's latest turn when available.",
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

export const BoardArchiveTool = Tool.make("board_archive", {
  description: "Archive a project board todo without changing its status.",
  parameters: Schema.Struct({ itemId: ProjectBoardItemId }),
  success: BoardMutateResult,
  failure: BoardToolError,
  dependencies,
})
  .annotate(Tool.Title, "Archive project board item")
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const BoardRestoreTool = Tool.make("board_restore", {
  description: "Restore an archived project board todo without changing its status.",
  parameters: Schema.Struct({ itemId: ProjectBoardItemId }),
  success: BoardMutateResult,
  failure: BoardToolError,
  dependencies,
})
  .annotate(Tool.Title, "Restore project board item")
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const BoardToolkit = Toolkit.make(
  BoardListTool,
  BoardDigestTool,
  BoardGetBriefTool,
  BoardUpsertTool,
  BoardHandoffTool,
  BoardSetStatusTool,
  BoardLinkTurnTool,
  BoardArchiveTool,
  BoardRestoreTool,
  BoardDeleteTool,
);
