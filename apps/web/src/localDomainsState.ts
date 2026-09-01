import { LOCAL_DOMAINS_WS_METHODS } from "@t3tools/contracts";
import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "@t3tools/client-runtime/state/runtime";

import { connectionAtomRuntime } from "./connection/runtime";

const mutationScheduler = createAtomCommandScheduler();

export const localDomainsEnvironment = {
  list: createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
    label: "environment-data:local-domains:list",
    tag: LOCAL_DOMAINS_WS_METHODS.list,
    staleTimeMs: 5_000,
  }),
  publish: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:local-domains:publish",
    tag: LOCAL_DOMAINS_WS_METHODS.publish,
    scheduler: mutationScheduler,
    concurrency: { mode: "serial", key: ({ environmentId }) => environmentId },
  }),
  unpublish: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:local-domains:unpublish",
    tag: LOCAL_DOMAINS_WS_METHODS.unpublish,
    scheduler: mutationScheduler,
    concurrency: { mode: "serial", key: ({ environmentId }) => environmentId },
  }),
};
