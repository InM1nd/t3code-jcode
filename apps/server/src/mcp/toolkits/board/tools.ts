import {
  NodeId,
  OrchestratorMcpDelegatedTaskStatus,
  OrchestratorMcpFailure,
  OrchestratorMcpTarget,
  OrchestratorMcpTaskRole,
  ThreadId,
  ProjectBoardBrief,
  ProjectBoardItem,
  ProjectBoardItemId,
  ProjectBoardItemStatus,
  ProjectId,
  TrimmedNonEmptyString,
  TurnId,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";
import * as SecureRandom from "effect/crypto/SecureRandom";

import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as BoardService from "../../../projectBoard/BoardService.ts";
import * as OrchestratorMcpService from "../../OrchestratorMcpService.ts";

const dependencies = [
  McpInvocationContext.McpInvocationContext,
  ThreadManagementService.ThreadManagementService,
  BoardService.BoardService,
  SecureRandom.SecureRandom,
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

const shared = {
  failure: OrchestratorMcpFailure,
  failureMode: "return" as const,
  dependencies,
};

const projectId = Schema.optional(ProjectId);

export const BoardToolkit = Toolkit.make(
  Tool.make("board_list", {
    ...shared,
    description:
      "List project board cards for the current thread's project. Pages are at most 50 cards. Filter by status or pass offset and limit. Pass includeDetails only when notes and handoffs are needed; otherwise use board_get_brief for one card.",
    parameters: Schema.Struct({
      projectId,
      includeArchived: Schema.optional(Schema.Boolean),
      includeDetails: Schema.optional(Schema.Boolean),
      status: Schema.optional(ProjectBoardItemStatus),
      offset: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10_000 }))),
      limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))),
    }),
    success: BoardListResult,
  })
    .annotate(Tool.Readonly, true)
    .annotate(Tool.Destructive, false),
  Tool.make("board_digest", {
    ...shared,
    description:
      "Return a compact project board digest: status counts and a short list of titles. Use it when the whole board matters, not for one card.",
    parameters: Schema.Struct({ projectId }),
    success: BoardDigestResult,
  })
    .annotate(Tool.Readonly, true)
    .annotate(Tool.Destructive, false),
  Tool.make("board_get_brief", {
    ...shared,
    description:
      "Read one project board card, including its brief, latest handoff, and the two handoffs before it.",
    parameters: Schema.Struct({ projectId, itemId: ProjectBoardItemId }),
    success: BoardMutateResult,
  })
    .annotate(Tool.Readonly, true)
    .annotate(Tool.Destructive, false),
  Tool.make("board_upsert", {
    ...shared,
    description:
      "Create or update one project board card. Pass itemId to update an existing card. Set area to an existing project area when the work belongs with other cards. One card is one deliverable.",
    parameters: Schema.Struct({
      projectId,
      itemId: Schema.optional(ProjectBoardItemId),
      title: TrimmedNonEmptyString,
      status: ProjectBoardItemStatus,
      notes: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
      brief: Schema.optional(Schema.NullOr(ProjectBoardBrief)),
      area: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
      externalRefs: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
      relatedItemIds: Schema.optional(Schema.Array(ProjectBoardItemId)),
      role: Schema.optional(OrchestratorMcpTaskRole),
      target: Schema.optional(OrchestratorMcpTarget),
    }),
    success: BoardMutateResult,
  }).annotate(Tool.Destructive, false),
  Tool.make("board_handoff", {
    ...shared,
    description:
      "Append a handoff to a project board card: what finished, what was decided, and the next step.",
    parameters: Schema.Struct({
      projectId,
      itemId: ProjectBoardItemId,
      summary: TrimmedNonEmptyString,
      decisions: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
      nextStep: TrimmedNonEmptyString,
    }),
    success: BoardMutateResult,
  }).annotate(Tool.Destructive, false),
  Tool.make("board_set_status", {
    ...shared,
    description: "Change the status of an existing project board card.",
    parameters: Schema.Struct({
      projectId,
      itemId: ProjectBoardItemId,
      status: ProjectBoardItemStatus,
    }),
    success: BoardMutateResult,
  })
    .annotate(Tool.Destructive, false)
    .annotate(Tool.Idempotent, true),
  Tool.make("board_link_turn", {
    ...shared,
    description:
      "Link a turn to a project board card. Omit turnId to link the calling thread's latest turn.",
    parameters: Schema.Struct({
      projectId,
      itemId: ProjectBoardItemId,
      turnId: Schema.optional(TurnId),
    }),
    success: BoardMutateResult,
  })
    .annotate(Tool.Destructive, false)
    .annotate(Tool.Idempotent, true),
  Tool.make("board_archive", {
    ...shared,
    description: "Archive a project board card without changing its status.",
    parameters: Schema.Struct({ projectId, itemId: ProjectBoardItemId }),
    success: BoardMutateResult,
  })
    .annotate(Tool.Destructive, false)
    .annotate(Tool.Idempotent, true),
  Tool.make("board_restore", {
    ...shared,
    description: "Restore an archived project board card.",
    parameters: Schema.Struct({ projectId, itemId: ProjectBoardItemId }),
    success: BoardMutateResult,
  })
    .annotate(Tool.Destructive, false)
    .annotate(Tool.Idempotent, true),
  Tool.make("board_delete", {
    ...shared,
    description: "Delete a project board card.",
    parameters: Schema.Struct({ projectId, itemId: ProjectBoardItemId }),
    success: BoardMutateResult,
  }).annotate(Tool.Destructive, true),
  Tool.make("board_dispatch", {
    ...shared,
    dependencies: [...dependencies, OrchestratorMcpService.OrchestratorMcpService],
    description:
      "Needs an agent running inside a T3 thread. Start a worker subthread of THIS thread for one board card. The worker gets its own worktree from this thread's current local commit and a prompt built from the card's brief; uncommitted edits are not copied. The card moves to inProgress and records the worker. role and target default to the ones stored on the card with board_upsert; without a target the worker inherits this thread's provider and model. A card without a brief is refused. Returns at once: the worker's completion wakes this thread, so end the turn instead of polling. Manage the worker with task_status and task_cancel.",
    parameters: Schema.Struct({
      itemId: ProjectBoardItemId,
      role: Schema.optional(OrchestratorMcpTaskRole),
      target: Schema.optional(OrchestratorMcpTarget),
      redispatch: Schema.optional(Schema.Boolean),
    }),
    success: Schema.Struct({
      projectId: ProjectId,
      itemId: ProjectBoardItemId,
      taskId: NodeId,
      childThreadId: Schema.NullOr(ThreadId),
      status: OrchestratorMcpDelegatedTaskStatus,
    }),
  })
    .annotate(Tool.Destructive, true)
    .annotate(Tool.OpenWorld, true),
);
