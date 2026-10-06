/**
 * Per-thread work mode. Merged into `WsRpcGroup`. Plan stays the upstream
 * interaction mode; this row remembers build, debug, and swarm as well.
 */
import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";

import { EnvironmentAuthorizationError } from "./auth.ts";
import { ThreadId } from "./baseSchemas.ts";

export const WorkMode = Schema.Literals(["build", "plan", "debug", "swarm"]);
export type WorkMode = typeof WorkMode.Type;

export const WORK_MODE_WS_METHODS = {
  get: "workMode.get",
  subscribe: "workMode.subscribe",
  set: "workMode.set",
} as const;

export class WorkModeServiceError extends Schema.TaggedError<WorkModeServiceError>()(
  "WorkModeServiceError",
  { message: Schema.String },
) {}

export const ThreadWorkModeSnapshot = Schema.Struct({
  threadId: ThreadId,
  mode: Schema.NullOr(WorkMode),
});
export type ThreadWorkModeSnapshot = typeof ThreadWorkModeSnapshot.Type;

const workModeError = Schema.Union([WorkModeServiceError, EnvironmentAuthorizationError]);

const threadInput = Schema.Struct({ threadId: ThreadId });

export const WorkModeRpcGroup = RpcGroup.make(
  Rpc.make(WORK_MODE_WS_METHODS.get, {
    payload: threadInput,
    success: ThreadWorkModeSnapshot,
    error: workModeError,
  }),
  Rpc.make(WORK_MODE_WS_METHODS.subscribe, {
    payload: threadInput,
    success: ThreadWorkModeSnapshot,
    error: workModeError,
    stream: true,
  }),
  Rpc.make(WORK_MODE_WS_METHODS.set, {
    payload: Schema.Struct({ threadId: ThreadId, mode: WorkMode }),
    success: ThreadWorkModeSnapshot,
    error: workModeError,
  }),
);
