import { WORK_MODE_WS_METHODS, type ThreadId, type WorkMode } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as WorkModes from "./WorkModeService.ts";

/** Websocket handlers for the work-mode RPCs. Spread into the server group. */
export const makeWorkModeRpcHandlers = (workModes: WorkModes.WorkModeService["Service"]) => ({
  [WORK_MODE_WS_METHODS.get]: (input: { readonly threadId: ThreadId }) =>
    workModes.get(input.threadId).pipe(Effect.map((mode) => ({ threadId: input.threadId, mode }))),
  [WORK_MODE_WS_METHODS.subscribe]: (input: { readonly threadId: ThreadId }) =>
    workModes.subscribe(input.threadId),
  [WORK_MODE_WS_METHODS.set]: (input: { readonly threadId: ThreadId; readonly mode: WorkMode }) =>
    workModes.set(input.threadId, input.mode),
});
