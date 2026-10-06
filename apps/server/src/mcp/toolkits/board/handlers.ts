import {
  BoardServiceError,
  OrchestratorMcpFailure,
  ProjectBoardItemId,
  ProjectId,
  type ProjectBoardItem,
} from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import { formatProjectBoardDigest } from "@t3tools/shared/projectBoard";

import * as BoardService from "../../../projectBoard/BoardService.ts";
import { readCaller, readMutationCaller, resolveProjectId } from "../../threadAccess.ts";
import { BoardToolkit } from "./tools.ts";

const failure = (
  message: string,
  code: "invalid_request" | "thread_credential_required" = "invalid_request",
) => new OrchestratorMcpFailure({ code, message });

const boardError = (error: BoardServiceError) => failure(error.message);

const slimItem = (item: ProjectBoardItem): ProjectBoardItem => ({
  ...item,
  notes: null,
  brief: null,
  latestHandoff: null,
  handoffHistory: [],
});

const activeCounts = (items: ReadonlyArray<ProjectBoardItem>) => {
  const active = items.filter((item) => !item.archivedAt);
  const count = (status: ProjectBoardItem["status"]) =>
    active.filter((item) => item.status === status).length;
  return {
    backlogCount: count("backlog"),
    readyCount: count("ready"),
    inProgressCount: count("inProgress"),
    inReviewCount: count("inReview"),
    blockedCount: count("blocked"),
    completedCount: count("completed"),
    cancelledCount: count("cancelled"),
    totalCount: active.length,
  };
};

export const layer = BoardToolkit.toLayer({
  board_list: (input) =>
    Effect.gen(function* () {
      const context = yield* readCaller();
      const projectId = yield* resolveProjectId(context, input.projectId);
      const board = yield* BoardService.BoardService;
      const snapshot = yield* board.list(projectId).pipe(Effect.mapError(boardError));
      const filtered = snapshot.items.filter((item) => {
        if (!input.includeArchived && item.archivedAt) return false;
        return input.status === undefined || item.status === input.status;
      });
      const offset = input.offset ?? 0;
      const limit = input.limit ?? 50;
      const page = filtered.slice(offset, offset + limit);
      return {
        projectId,
        totalCount: filtered.length,
        nextOffset: offset + page.length < filtered.length ? offset + page.length : null,
        items: input.includeDetails ? page : page.map(slimItem),
      };
    }),
  board_digest: (input) =>
    Effect.gen(function* () {
      const context = yield* readCaller();
      const projectId = yield* resolveProjectId(context, input.projectId);
      const board = yield* BoardService.BoardService;
      const snapshot = yield* board.list(projectId).pipe(Effect.mapError(boardError));
      return {
        projectId,
        digest: formatProjectBoardDigest(snapshot.items),
        ...activeCounts(snapshot.items),
      };
    }),
  board_get_brief: (input) =>
    Effect.gen(function* () {
      const found = yield* readItem(input.projectId, input.itemId);
      return { projectId: found.projectId, item: found.item };
    }),
  board_upsert: (input) =>
    Effect.gen(function* () {
      const context = yield* readMutationCaller();
      const projectId = yield* resolveProjectId(context, input.projectId);
      const board = yield* BoardService.BoardService;
      const crypto = yield* Crypto.Crypto;
      const existing = input.itemId
        ? (yield* board.list(projectId).pipe(Effect.mapError(boardError))).items.find(
            (item) => item.id === input.itemId,
          )
        : undefined;
      const itemId =
        input.itemId ??
        ProjectBoardItemId.make(
          yield* crypto.randomUUIDv4.pipe(
            Effect.mapError(() => failure("Could not create a board card id.")),
          ),
        );
      const item = yield* board
        .upsert({
          projectId,
          itemId,
          title: input.title,
          status: input.status,
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.brief !== undefined ? { brief: input.brief } : {}),
          ...(input.area !== undefined ? { area: input.area } : {}),
          ...(input.externalRefs !== undefined ? { externalRefs: input.externalRefs } : {}),
          ...(input.relatedItemIds !== undefined ? { relatedItemIds: input.relatedItemIds } : {}),
          ...(existing
            ? {}
            : {
                source: "agent" as const,
                ...(context.caller ? { sourceThreadId: context.caller.id } : {}),
              }),
        })
        .pipe(Effect.mapError(boardError));
      return { projectId, item };
    }),
  board_set_status: (input) =>
    Effect.gen(function* () {
      const found = yield* readItem(input.projectId, input.itemId, true);
      const item = yield* found.board
        .upsert({
          projectId: found.projectId,
          itemId: found.item.id,
          title: found.item.title,
          status: input.status,
        })
        .pipe(Effect.mapError(boardError));
      return { projectId: found.projectId, item };
    }),
  board_handoff: (input) =>
    Effect.gen(function* () {
      const context = yield* readMutationCaller();
      if (context.caller === undefined) {
        return yield* failure(
          "A handoff records the calling thread, so it needs an agent running inside Tandem.",
          "thread_credential_required",
        );
      }
      const projectId = yield* resolveProjectId(context, input.projectId);
      const board = yield* BoardService.BoardService;
      const item = yield* board
        .appendHandoff({
          projectId,
          itemId: input.itemId,
          sourceThreadId: context.caller.id,
          summary: input.summary,
          ...(input.decisions !== undefined ? { decisions: input.decisions } : {}),
          nextStep: input.nextStep,
        })
        .pipe(Effect.mapError(boardError));
      return { projectId, item };
    }),
  board_link_turn: (input) =>
    Effect.gen(function* () {
      const found = yield* readItem(input.projectId, input.itemId, true);
      const item = yield* found.board
        .upsert({
          projectId: found.projectId,
          itemId: found.item.id,
          title: found.item.title,
          status: found.item.status,
          linkTurnId: input.turnId,
        })
        .pipe(Effect.mapError(boardError));
      return { projectId: found.projectId, item };
    }),
  board_archive: (input) =>
    mutate(input, (board, projectId, itemId) => board.archive(projectId, itemId)),
  board_restore: (input) =>
    mutate(input, (board, projectId, itemId) => board.restore(projectId, itemId)),
  board_delete: (input) =>
    Effect.gen(function* () {
      const found = yield* readItem(input.projectId, input.itemId, true);
      yield* found.board.delete(found.projectId, found.item.id).pipe(Effect.mapError(boardError));
      return { projectId: found.projectId, item: null };
    }),
});

const readItem = Effect.fn("mcp.board.readItem")(function* (
  requestedProjectId: ProjectId | undefined,
  itemId: ProjectBoardItem["id"],
  mutate = false,
) {
  const context = yield* mutate ? readMutationCaller() : readCaller();
  const projectId = yield* resolveProjectId(context, requestedProjectId);
  const board = yield* BoardService.BoardService;
  const snapshot = yield* board.list(projectId).pipe(Effect.mapError(boardError));
  const item = snapshot.items.find((entry) => entry.id === itemId);
  if (!item) {
    return yield* failure(`Board item '${itemId}' was not found.`);
  }
  return { context, projectId, board, item };
});

const mutate = (
  input: {
    readonly projectId?: ProjectId | undefined;
    readonly itemId: ProjectBoardItem["id"];
  },
  operation: (
    board: BoardService.BoardService["Service"],
    projectId: ProjectId,
    itemId: ProjectBoardItem["id"],
  ) => Effect.Effect<ProjectBoardItem, BoardServiceError>,
) =>
  Effect.gen(function* () {
    const found = yield* readItem(input.projectId, input.itemId, true);
    const item = yield* operation(found.board, found.projectId, found.item.id).pipe(
      Effect.mapError(boardError),
    );
    return { projectId: found.projectId, item };
  });
