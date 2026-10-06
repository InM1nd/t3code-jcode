import { WORK_MODE_WS_METHODS, type ThreadId, type WorkMode } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { observeRpcEffect, observeRpcStream } from "../observability/RpcInstrumentation.ts";
import * as WorkModes from "./WorkModeService.ts";

const trace = { "rpc.aggregate": "workMode" } as const;

/** Websocket handlers for the work-mode RPCs. Spread into the server group. */
export const makeWorkModeRpcHandlers = (workModes: WorkModes.WorkModeService["Service"]) => ({
  [WORK_MODE_WS_METHODS.get]: (input: { readonly threadId: ThreadId }) =>
    observeRpcEffect(
      WORK_MODE_WS_METHODS.get,
      workModes
        .get(input.threadId)
        .pipe(Effect.map((mode) => ({ threadId: input.threadId, mode }))),
      trace,
    ),
  [WORK_MODE_WS_METHODS.subscribe]: (input: { readonly threadId: ThreadId }) =>
    observeRpcStream(WORK_MODE_WS_METHODS.subscribe, workModes.subscribe(input.threadId), trace),
  [WORK_MODE_WS_METHODS.set]: (input: { readonly threadId: ThreadId; readonly mode: WorkMode }) =>
    observeRpcEffect(WORK_MODE_WS_METHODS.set, workModes.set(input.threadId, input.mode), trace),
});
