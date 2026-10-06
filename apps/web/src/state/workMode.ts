import { WORK_MODE_WS_METHODS } from "@t3tools/contracts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "@t3tools/client-runtime/state/runtime";

import { connectionAtomRuntime } from "../connection/runtime";

export const threadWorkMode = createEnvironmentRpcSubscriptionAtomFamily(connectionAtomRuntime, {
  label: "work-mode:subscribe",
  tag: WORK_MODE_WS_METHODS.subscribe,
});

export const setThreadWorkMode = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "work-mode:set",
  tag: WORK_MODE_WS_METHODS.set,
});
