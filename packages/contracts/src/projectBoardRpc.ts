/**
 * Project board RPC. Merged into `WsRpcGroup` so the existing client can call it.
 */
import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";

import { EnvironmentAuthorizationError } from "./auth.ts";
import { ProjectId, ThreadId, TrimmedNonEmptyString, TurnId } from "./baseSchemas.ts";
import {
  ProjectBoardBrief,
  ProjectBoardItem,
  ProjectBoardItemId,
  ProjectBoardItemSource,
  ProjectBoardItemStatus,
} from "./projectBoard.ts";

export const BOARD_WS_METHODS = {
  boardList: "board.list",
  boardSubscribe: "board.subscribe",
  boardUpsert: "board.upsert",
  boardHandoff: "board.handoff",
  boardArchive: "board.archive",
  boardRestore: "board.restore",
  boardDelete: "board.delete",
} as const;

export class BoardServiceError extends Schema.TaggedError<BoardServiceError>()(
  "BoardServiceError",
  {
    message: Schema.String,
  },
) {}

export const ProjectBoardListInput = Schema.Struct({
  projectId: ProjectId,
});

export const ProjectBoardSnapshot = Schema.Struct({
  projectId: ProjectId,
  items: Schema.Array(ProjectBoardItem),
});
export type ProjectBoardSnapshot = typeof ProjectBoardSnapshot.Type;

const boardError = Schema.Union([BoardServiceError, EnvironmentAuthorizationError]);

export const BoardListRpc = Rpc.make(BOARD_WS_METHODS.boardList, {
  payload: ProjectBoardListInput,
  success: ProjectBoardSnapshot,
  error: boardError,
});

export const BoardSubscribeRpc = Rpc.make(BOARD_WS_METHODS.boardSubscribe, {
  payload: ProjectBoardListInput,
  success: ProjectBoardSnapshot,
  error: boardError,
  stream: true,
});

export const ProjectBoardUpsertInput = Schema.Struct({
  projectId: ProjectId,
  itemId: ProjectBoardItemId,
  title: TrimmedNonEmptyString,
  status: ProjectBoardItemStatus,
  notes: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  brief: Schema.optional(Schema.NullOr(ProjectBoardBrief)),
  source: Schema.optional(ProjectBoardItemSource),
  sourceThreadId: Schema.optional(Schema.NullOr(ThreadId)),
  linkedTurnIds: Schema.optional(Schema.Array(TurnId)),
  linkTurnId: Schema.optional(Schema.NullOr(TurnId)),
  area: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  externalRefs: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  relatedItemIds: Schema.optional(Schema.Array(ProjectBoardItemId)),
});
export type ProjectBoardUpsertInput = typeof ProjectBoardUpsertInput.Type;

export const BoardUpsertRpc = Rpc.make(BOARD_WS_METHODS.boardUpsert, {
  payload: ProjectBoardUpsertInput,
  success: ProjectBoardItem,
  error: boardError,
});

export const ProjectBoardHandoffInput = Schema.Struct({
  projectId: ProjectId,
  itemId: ProjectBoardItemId,
  sourceThreadId: ThreadId,
  summary: TrimmedNonEmptyString,
  decisions: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  nextStep: TrimmedNonEmptyString,
});
export type ProjectBoardHandoffInput = typeof ProjectBoardHandoffInput.Type;

export const BoardHandoffRpc = Rpc.make(BOARD_WS_METHODS.boardHandoff, {
  payload: ProjectBoardHandoffInput,
  success: ProjectBoardItem,
  error: boardError,
});

export const ProjectBoardItemRef = Schema.Struct({
  projectId: ProjectId,
  itemId: ProjectBoardItemId,
});
export type ProjectBoardItemRef = typeof ProjectBoardItemRef.Type;

export const BoardArchiveRpc = Rpc.make(BOARD_WS_METHODS.boardArchive, {
  payload: ProjectBoardItemRef,
  success: ProjectBoardItem,
  error: boardError,
});

export const BoardRestoreRpc = Rpc.make(BOARD_WS_METHODS.boardRestore, {
  payload: ProjectBoardItemRef,
  success: ProjectBoardItem,
  error: boardError,
});

export const BoardDeleteRpc = Rpc.make(BOARD_WS_METHODS.boardDelete, {
  payload: ProjectBoardItemRef,
  success: ProjectBoardItemRef,
  error: boardError,
});
