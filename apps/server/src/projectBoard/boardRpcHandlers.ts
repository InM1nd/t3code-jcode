import { BOARD_WS_METHODS } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { observeRpcEffect, observeRpcStream } from "../observability/RpcInstrumentation.ts";
import * as Board from "./BoardService.ts";

const trace = { "rpc.aggregate": "board" } as const;

/** Websocket handlers for the board RPCs. Spread into the server group. */
export const makeBoardRpcHandlers = (board: Board.BoardService["Service"]) => ({
  [BOARD_WS_METHODS.boardList]: (input: { readonly projectId: Parameters<typeof board.list>[0] }) =>
    observeRpcEffect(BOARD_WS_METHODS.boardList, board.list(input.projectId), trace),
  [BOARD_WS_METHODS.boardSubscribe]: (input: {
    readonly projectId: Parameters<typeof board.list>[0];
  }) => observeRpcStream(BOARD_WS_METHODS.boardSubscribe, board.subscribe(input.projectId), trace),
  [BOARD_WS_METHODS.boardUpsert]: (input: Parameters<typeof board.upsert>[0]) =>
    observeRpcEffect(BOARD_WS_METHODS.boardUpsert, board.upsert(input), trace),
  [BOARD_WS_METHODS.boardHandoff]: (input: Parameters<typeof board.appendHandoff>[0]) =>
    observeRpcEffect(BOARD_WS_METHODS.boardHandoff, board.appendHandoff(input), trace),
  [BOARD_WS_METHODS.boardArchive]: (input: {
    readonly projectId: Parameters<typeof board.archive>[0];
    readonly itemId: Parameters<typeof board.archive>[1];
  }) =>
    observeRpcEffect(
      BOARD_WS_METHODS.boardArchive,
      board.archive(input.projectId, input.itemId),
      trace,
    ),
  [BOARD_WS_METHODS.boardRestore]: (input: {
    readonly projectId: Parameters<typeof board.restore>[0];
    readonly itemId: Parameters<typeof board.restore>[1];
  }) =>
    observeRpcEffect(
      BOARD_WS_METHODS.boardRestore,
      board.restore(input.projectId, input.itemId),
      trace,
    ),
  [BOARD_WS_METHODS.boardDelete]: (input: {
    readonly projectId: Parameters<typeof board.delete>[0];
    readonly itemId: Parameters<typeof board.delete>[1];
  }) =>
    observeRpcEffect(
      BOARD_WS_METHODS.boardDelete,
      board
        .delete(input.projectId, input.itemId)
        .pipe(Effect.map(() => ({ projectId: input.projectId, itemId: input.itemId }))),
      trace,
    ),
});
