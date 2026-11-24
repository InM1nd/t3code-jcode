import {
  BoardServiceError,
  OrchestratorMcpFailure,
  ProjectBoardItemId,
  ProjectId,
  type ProjectBoardItem,
} from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import { findProjectBoardItem, formatProjectBoardDigest } from "@t3tools/shared/projectBoard";

import * as BoardService from "../../../projectBoard/BoardService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import * as OrchestratorMcpService from "../../OrchestratorMcpService.ts";
import { dispatchBoardCard } from "./dispatch.ts";
import { readCaller, type Caller } from "../../threadAccess.ts";
import { latestBoardTurnId, resolveCallerBoardProject } from "./projectScope.ts";
import { BoardToolkit } from "./tools.ts";

const failure = (
  message: string,
  code: "invalid_request" | "thread_credential_required" = "invalid_request",
) => new OrchestratorMcpFailure({ code, message });

const boardError = (error: BoardServiceError) => failure(error.message);

const boardProjectId = (context: Caller, requested: ProjectId | undefined) => {
  const resolved = resolveCallerBoardProject({
    callerProjectId: context.caller?.projectId,
    requestedProjectId: requested,
  });
  if (resolved === "missing") {
    return failure("Pass projectId: this MCP client is not running inside a T3 thread.");
  }
  if (resolved === "mismatch") {
    return failure("A thread can only use the board of its own project.");
  }
  return Effect.succeed(resolved);
};

const latestCallerTurnId = (context: Caller) =>
  Effect.gen(function* () {
    if (context.caller === undefined) return undefined;
    const records = yield* context.threads
      .getThreadRecords(context.caller.id, ["providerTurns"])
      .pipe(Effect.mapError(() => failure("Could not read the calling thread's latest turn.")));
    return latestBoardTurnId(records.providerTurns);
  });

export const slimItem = (item: ProjectBoardItem): ProjectBoardItem => ({
  ...item,
  notes: null,
  brief: null,
  latestHandoff: null,
  handoffHistory: [],
});

// Writes echo only the card's identity and status: the caller knows what it
// wrote, and a card's notes and handoffs can run to thousands of tokens.
const writeResult = (projectId: ProjectId, item: ProjectBoardItem) => ({
  projectId,
  item: slimItem(item),
});

// `latestHandoff` is the head of `handoffHistory`; a brief adds the two before it.
export const briefItem = (item: ProjectBoardItem): ProjectBoardItem => ({
  ...item,
  handoffHistory: item.handoffHistory?.slice(1, 3) ?? [],
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

export const layer = McpToolAccess.toLayer(BoardToolkit, {
  board_list: McpToolAccess.reads((input) =>
    Effect.gen(function* () {
      const context = yield* readCaller();
      const projectId = yield* boardProjectId(context, input.projectId);
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
  ),
  board_digest: McpToolAccess.reads((input) =>
    Effect.gen(function* () {
      const context = yield* readCaller();
      const projectId = yield* boardProjectId(context, input.projectId);
      const board = yield* BoardService.BoardService;
      const snapshot = yield* board.list(projectId).pipe(Effect.mapError(boardError));
      return {
        projectId,
        digest: formatProjectBoardDigest(snapshot.items),
        ...activeCounts(snapshot.items),
      };
    }),
  ),
  board_get_brief: McpToolAccess.reads((input) =>
    Effect.gen(function* () {
      const found = yield* readItem(input.projectId, input.itemId);
      return { projectId: found.projectId, item: briefItem(found.item) };
    }),
  ),
  board_upsert: McpToolAccess.writes((input) =>
    Effect.gen(function* () {
      const context = yield* readCaller();
      const projectId = yield* boardProjectId(context, input.projectId);
      const board = yield* BoardService.BoardService;
      const crypto = yield* Crypto.Crypto;
      const items = (yield* board.list(projectId).pipe(Effect.mapError(boardError))).items;
      const existing = input.itemId ? findProjectBoardItem(items, input.itemId) : undefined;
      const itemId =
        existing?.id ??
        input.itemId ??
        ProjectBoardItemId.make(
          yield* crypto.randomUUIDv4.pipe(
            Effect.mapError(() => failure("Could not create a board card id.")),
          ),
        );
      const linkTurnId = yield* latestCallerTurnId(context);
      const item = yield* board
        .upsert({
          projectId,
          itemId,
          title: input.title,
          status: input.status,
          ...(input.role !== undefined || input.target !== undefined
            ? {
                execution: {
                  ...existing?.execution,
                  ...(input.role !== undefined ? { role: input.role } : {}),
                  ...(input.target !== undefined ? { target: input.target } : {}),
                },
              }
            : {}),
          ...(linkTurnId !== undefined ? { linkTurnId } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.brief !== undefined ? { brief: input.brief } : {}),
          ...(input.area !== undefined ? { area: input.area } : {}),
          ...(input.externalRefs !== undefined ? { externalRefs: input.externalRefs } : {}),
          ...(input.relatedItemIds !== undefined
            ? {
                relatedItemIds: input.relatedItemIds.map(
                  (id) => findProjectBoardItem(items, id)?.id ?? id,
                ),
              }
            : {}),
          ...(existing
            ? {}
            : {
                source: "agent" as const,
                ...(context.caller ? { sourceThreadId: context.caller.id } : {}),
              }),
        })
        .pipe(Effect.mapError(boardError));
      return writeResult(projectId, item);
    }),
  ),
  board_set_status: McpToolAccess.writes((input) =>
    Effect.gen(function* () {
      const found = yield* readItem(input.projectId, input.itemId);
      const linkTurnId = yield* latestCallerTurnId(found.context);
      const item = yield* found.board
        .upsert({
          projectId: found.projectId,
          itemId: found.item.id,
          title: found.item.title,
          status: input.status,
          ...(linkTurnId !== undefined ? { linkTurnId } : {}),
        })
        .pipe(Effect.mapError(boardError));
      return writeResult(found.projectId, item);
    }),
  ),
  board_handoff: McpToolAccess.writes((input) =>
    Effect.gen(function* () {
      const context = yield* readCaller();
      if (context.caller === undefined) {
        return yield* failure(
          "A handoff records the calling thread, so it needs an agent running inside Tandem.",
          "thread_credential_required",
        );
      }
      const found = yield* readItem(input.projectId, input.itemId);
      const item = yield* found.board
        .appendHandoff({
          projectId: found.projectId,
          itemId: found.item.id,
          sourceThreadId: context.caller.id,
          summary: input.summary,
          ...(input.decisions !== undefined ? { decisions: input.decisions } : {}),
          nextStep: input.nextStep,
        })
        .pipe(Effect.mapError(boardError));
      return writeResult(found.projectId, item);
    }),
  ),
  board_link_turn: McpToolAccess.writes((input) =>
    Effect.gen(function* () {
      const found = yield* readItem(input.projectId, input.itemId);
      const linkTurnId = input.turnId ?? (yield* latestCallerTurnId(found.context));
      if (linkTurnId === undefined) {
        return yield* failure(
          "No turnId provided and the current thread has no latest turn to link.",
        );
      }
      const item = yield* found.board
        .upsert({
          projectId: found.projectId,
          itemId: found.item.id,
          title: found.item.title,
          status: found.item.status,
          linkTurnId,
        })
        .pipe(Effect.mapError(boardError));
      return writeResult(found.projectId, item);
    }),
  ),
  board_archive: McpToolAccess.writes((input) =>
    mutate(input, (board, projectId, itemId) => board.archive(projectId, itemId)),
  ),
  board_restore: McpToolAccess.writes((input) =>
    mutate(input, (board, projectId, itemId) => board.restore(projectId, itemId)),
  ),
  board_delete: McpToolAccess.writes((input) =>
    Effect.gen(function* () {
      const found = yield* readItem(input.projectId, input.itemId);
      yield* found.board.delete(found.projectId, found.item.id).pipe(Effect.mapError(boardError));
      return { projectId: found.projectId, item: null };
    }),
  ),
  board_dispatch: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const found = yield* readItem(undefined, input.itemId);
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const orchestrator = yield* OrchestratorMcpService.OrchestratorMcpService;
      return yield* dispatchBoardCard({
        ...input,
        projectId: found.projectId,
        item: found.item,
        delegate: (task) => orchestrator.delegateTask(scope, task),
        save: (card) => found.board.upsert(card).pipe(Effect.mapError(boardError)),
      });
    }),
  ),
});

const readItem = Effect.fn("mcp.board.readItem")(function* (
  requestedProjectId: ProjectId | undefined,
  itemId: ProjectBoardItem["id"],
) {
  const context = yield* readCaller();
  const projectId = yield* boardProjectId(context, requestedProjectId);
  const board = yield* BoardService.BoardService;
  const snapshot = yield* board.list(projectId).pipe(Effect.mapError(boardError));
  const item = findProjectBoardItem(snapshot.items, itemId);
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
    const found = yield* readItem(input.projectId, input.itemId);
    const item = yield* operation(found.board, found.projectId, found.item.id).pipe(
      Effect.mapError(boardError),
    );
    return writeResult(found.projectId, item);
  });
