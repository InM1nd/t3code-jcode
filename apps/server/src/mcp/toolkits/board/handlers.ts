import {
  CommandId,
  ProjectBoardItemId,
  type ProjectBoardItem,
  type ProjectBoardItemStatus,
  type ProjectId,
  type TurnId,
} from "@t3tools/contracts";
import { formatProjectBoardDigest } from "@t3tools/shared/projectBoard";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { OrchestrationEngineService } from "../../../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";
import { BoardToolkit, BoardToolError } from "./tools.ts";

function errorMessage(error: { readonly message?: string } | unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return String(error);
}

const requireBoardScope = Effect.fn("BoardToolkit.requireScope")(function* () {
  const invocation = yield* McpInvocationContext.McpInvocationContext;
  if (!invocation.capabilities.has("board")) {
    return yield* new BoardToolError({
      message: "MCP credential does not grant the board capability.",
    });
  }
  return invocation;
});

const resolveProjectId = Effect.fn("BoardToolkit.resolveProjectId")(function* (
  threadId: McpInvocationContext.McpInvocationScope["threadId"],
) {
  const snapshots = yield* ProjectionSnapshotQuery;
  const thread = yield* snapshots.getThreadShellById(threadId).pipe(
    Effect.mapError(
      (error) =>
        new BoardToolError({
          message: `Failed to resolve thread for board access: ${errorMessage(error)}`,
        }),
    ),
  );
  if (Option.isNone(thread)) {
    return yield* new BoardToolError({
      message: `Thread '${threadId}' was not found.`,
    });
  }
  return thread.value.projectId;
});

const loadBoard = Effect.fn("BoardToolkit.loadBoard")(function* (projectId: ProjectId) {
  const snapshots = yield* ProjectionSnapshotQuery;
  const project = yield* snapshots.getProjectShellById(projectId).pipe(
    Effect.mapError(
      (error) =>
        new BoardToolError({
          message: `Failed to load project board: ${errorMessage(error)}`,
        }),
    ),
  );
  if (Option.isNone(project)) {
    return yield* new BoardToolError({
      message: `Project '${projectId}' was not found.`,
    });
  }
  return project.value;
});

const resolveLatestTurnId = Effect.fn("BoardToolkit.resolveLatestTurnId")(function* (
  threadId: McpInvocationContext.McpInvocationScope["threadId"],
) {
  const snapshots = yield* ProjectionSnapshotQuery;
  const thread = yield* snapshots.getThreadShellById(threadId).pipe(
    Effect.mapError(
      (error) =>
        new BoardToolError({
          message: `Failed to resolve latest turn: ${errorMessage(error)}`,
        }),
    ),
  );
  if (Option.isNone(thread)) {
    return null;
  }
  return thread.value.latestTurn?.turnId ?? null;
});

const nextCommandId = Effect.fn("BoardToolkit.nextCommandId")(function* () {
  const crypto = yield* Crypto.Crypto;
  const uuid = yield* crypto.randomUUIDv4.pipe(Effect.orDie);
  return CommandId.make(`board:${uuid}`);
});

const nextItemId = Effect.fn("BoardToolkit.nextItemId")(function* () {
  const crypto = yield* Crypto.Crypto;
  const uuid = yield* crypto.randomUUIDv4.pipe(Effect.orDie);
  return ProjectBoardItemId.make(uuid);
});

const dispatchUpsert = Effect.fn("BoardToolkit.dispatchUpsert")(function* (input: {
  readonly projectId: ProjectId;
  readonly itemId: ProjectBoardItemId;
  readonly title: string;
  readonly status: ProjectBoardItemStatus;
  readonly notes?: string | null | undefined;
  readonly sourceThreadId: McpInvocationContext.McpInvocationScope["threadId"];
  readonly linkTurnId?: TurnId | null | undefined;
}) {
  const engine = yield* OrchestrationEngineService;
  yield* engine
    .dispatch({
      type: "project.board.item.upsert",
      commandId: yield* nextCommandId(),
      projectId: input.projectId,
      itemId: input.itemId,
      title: input.title,
      status: input.status,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      source: "agent",
      sourceThreadId: input.sourceThreadId,
      ...(input.linkTurnId ? { linkTurnId: input.linkTurnId } : {}),
    })
    .pipe(
      Effect.mapError(
        (error) =>
          new BoardToolError({
            message: errorMessage(error),
          }),
      ),
    );
});

const handlers = {
  board_list: (_input: unknown) =>
    Effect.gen(function* () {
      const scope = yield* requireBoardScope();
      const projectId = yield* resolveProjectId(scope.threadId);
      const project = yield* loadBoard(projectId);
      return {
        projectId,
        items: project.boardItems ?? [],
      };
    }),

  board_digest: (_input: unknown) =>
    Effect.gen(function* () {
      const scope = yield* requireBoardScope();
      const projectId = yield* resolveProjectId(scope.threadId);
      const project = yield* loadBoard(projectId);
      const items = project.boardItems ?? [];
      return {
        projectId,
        digest: formatProjectBoardDigest(items),
        inProgressCount: items.filter((item) => item.status === "inProgress").length,
        pendingCount: items.filter((item) => item.status === "pending").length,
        completedCount: items.filter((item) => item.status === "completed").length,
        totalCount: items.length,
      };
    }),

  board_upsert: (input: {
    readonly itemId?: ProjectBoardItemId | undefined;
    readonly title: string;
    readonly status: ProjectBoardItemStatus;
    readonly notes?: string | null | undefined;
  }) =>
    Effect.gen(function* () {
      const scope = yield* requireBoardScope();
      const projectId = yield* resolveProjectId(scope.threadId);
      const itemId = input.itemId ?? (yield* nextItemId());
      const linkTurnId = yield* resolveLatestTurnId(scope.threadId);
      yield* dispatchUpsert({
        projectId,
        itemId,
        title: input.title,
        status: input.status,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        sourceThreadId: scope.threadId,
        linkTurnId,
      });
      const project = yield* loadBoard(projectId);
      const item =
        (project.boardItems ?? []).find((entry: ProjectBoardItem) => entry.id === itemId) ?? null;
      return { projectId, item };
    }),

  board_set_status: (input: {
    readonly itemId: ProjectBoardItemId;
    readonly status: ProjectBoardItemStatus;
  }) =>
    Effect.gen(function* () {
      const scope = yield* requireBoardScope();
      const projectId = yield* resolveProjectId(scope.threadId);
      const project = yield* loadBoard(projectId);
      const existing = (project.boardItems ?? []).find((entry) => entry.id === input.itemId);
      if (!existing) {
        return yield* new BoardToolError({
          message: `Board item '${input.itemId}' was not found.`,
        });
      }
      const linkTurnId = yield* resolveLatestTurnId(scope.threadId);
      yield* dispatchUpsert({
        projectId,
        itemId: existing.id,
        title: existing.title,
        status: input.status,
        notes: existing.notes ?? null,
        sourceThreadId: scope.threadId,
        linkTurnId,
      });
      const next = yield* loadBoard(projectId);
      const item = (next.boardItems ?? []).find((entry) => entry.id === input.itemId) ?? null;
      return { projectId, item };
    }),

  board_link_turn: (input: {
    readonly itemId: ProjectBoardItemId;
    readonly turnId?: TurnId | undefined;
  }) =>
    Effect.gen(function* () {
      const scope = yield* requireBoardScope();
      const projectId = yield* resolveProjectId(scope.threadId);
      const project = yield* loadBoard(projectId);
      const existing = (project.boardItems ?? []).find((entry) => entry.id === input.itemId);
      if (!existing) {
        return yield* new BoardToolError({
          message: `Board item '${input.itemId}' was not found.`,
        });
      }
      const linkTurnId = input.turnId ?? (yield* resolveLatestTurnId(scope.threadId));
      if (!linkTurnId) {
        return yield* new BoardToolError({
          message: "No turnId provided and the current thread has no latest turn to link.",
        });
      }
      yield* dispatchUpsert({
        projectId,
        itemId: existing.id,
        title: existing.title,
        status: existing.status,
        notes: existing.notes ?? null,
        sourceThreadId: scope.threadId,
        linkTurnId,
      });
      const next = yield* loadBoard(projectId);
      const item = (next.boardItems ?? []).find((entry) => entry.id === input.itemId) ?? null;
      return { projectId, item };
    }),

  board_delete: (input: { readonly itemId: ProjectBoardItemId }) =>
    Effect.gen(function* () {
      const scope = yield* requireBoardScope();
      const projectId = yield* resolveProjectId(scope.threadId);
      const engine = yield* OrchestrationEngineService;
      yield* engine
        .dispatch({
          type: "project.board.item.delete",
          commandId: yield* nextCommandId(),
          projectId,
          itemId: input.itemId,
        })
        .pipe(
          Effect.mapError(
            (error) =>
              new BoardToolError({
                message: errorMessage(error),
              }),
          ),
        );
      return { projectId, item: null };
    }),
} satisfies Parameters<typeof BoardToolkit.toLayer>[0];

export const BoardToolkitHandlersLive = BoardToolkit.toLayer(handlers);
