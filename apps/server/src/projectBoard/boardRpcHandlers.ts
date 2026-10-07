import { BOARD_WS_METHODS } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as Board from "./BoardService.ts";

/** Websocket handlers for the board RPCs. Spread into the server group. */
export const makeBoardRpcHandlers = (board: Board.BoardService["Service"]) => ({
  [BOARD_WS_METHODS.boardList]: (input: { readonly projectId: Parameters<typeof board.list>[0] }) =>
    board.list(input.projectId),
  [BOARD_WS_METHODS.boardSubscribe]: (input: {
    readonly projectId: Parameters<typeof board.list>[0];
  }) => board.subscribe(input.projectId),
  [BOARD_WS_METHODS.boardUpsert]: (input: Parameters<typeof board.upsert>[0]) =>
    board.upsert(input),
  [BOARD_WS_METHODS.boardHandoff]: (input: Parameters<typeof board.appendHandoff>[0]) =>
    board.appendHandoff(input),
  [BOARD_WS_METHODS.boardArchive]: (input: {
    readonly projectId: Parameters<typeof board.archive>[0];
    readonly itemId: Parameters<typeof board.archive>[1];
  }) => board.archive(input.projectId, input.itemId),
  [BOARD_WS_METHODS.boardRestore]: (input: {
    readonly projectId: Parameters<typeof board.restore>[0];
    readonly itemId: Parameters<typeof board.restore>[1];
  }) => board.restore(input.projectId, input.itemId),
  [BOARD_WS_METHODS.boardDelete]: (input: {
    readonly projectId: Parameters<typeof board.delete>[0];
    readonly itemId: Parameters<typeof board.delete>[1];
  }) =>
    board
      .delete(input.projectId, input.itemId)
      .pipe(Effect.map(() => ({ projectId: input.projectId, itemId: input.itemId }))),
});
