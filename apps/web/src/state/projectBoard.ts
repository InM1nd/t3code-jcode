import { BOARD_WS_METHODS } from "@t3tools/contracts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "@t3tools/client-runtime/state/runtime";

import { connectionAtomRuntime } from "../connection/runtime";

export const projectBoardItems = createEnvironmentRpcSubscriptionAtomFamily(connectionAtomRuntime, {
  label: "project-board:subscribe",
  tag: BOARD_WS_METHODS.boardSubscribe,
});

export const upsertBoardItem = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "project-board:upsert",
  tag: BOARD_WS_METHODS.boardUpsert,
});

export const archiveBoardItem = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "project-board:archive",
  tag: BOARD_WS_METHODS.boardArchive,
});

export const restoreBoardItem = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "project-board:restore",
  tag: BOARD_WS_METHODS.boardRestore,
});
