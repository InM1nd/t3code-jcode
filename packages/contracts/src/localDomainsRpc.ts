import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";

import { EnvironmentAuthorizationError } from "./auth.ts";
import {
  LOCAL_DOMAINS_WS_METHODS,
  LocalDomainError,
  LocalDomainList,
  PublishLocalDomainInput,
  UnpublishLocalDomainInput,
} from "./localDomains.ts";

const LocalDomainRpcError = Schema.Union([LocalDomainError, EnvironmentAuthorizationError]);

export const LocalDomainsRpcGroup = RpcGroup.make(
  Rpc.make(LOCAL_DOMAINS_WS_METHODS.list, {
    payload: Schema.Struct({}),
    success: LocalDomainList,
    error: LocalDomainRpcError,
  }),
  Rpc.make(LOCAL_DOMAINS_WS_METHODS.publish, {
    payload: PublishLocalDomainInput,
    success: LocalDomainList,
    error: LocalDomainRpcError,
  }),
  Rpc.make(LOCAL_DOMAINS_WS_METHODS.unpublish, {
    payload: UnpublishLocalDomainInput,
    success: LocalDomainList,
    error: LocalDomainRpcError,
  }),
);
