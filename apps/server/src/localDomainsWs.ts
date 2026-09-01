import {
  LOCAL_DOMAINS_WS_METHODS,
  LocalDomainError,
  LocalDomainsRpcGroup,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { LocalDomains } from "./localDomains.ts";
import * as PortScanner from "./preview/PortScanner.ts";

/** Fork-owned handlers kept out of the large shared websocket implementation. */
export const LocalDomainsWsRpcLayer = LocalDomainsRpcGroup.toLayer(
  Effect.gen(function* () {
    const domains = yield* LocalDomains;
    const portDiscovery = yield* PortScanner.PortDiscovery;
    return LocalDomainsRpcGroup.of({
      [LOCAL_DOMAINS_WS_METHODS.list]: () => domains.list,
      [LOCAL_DOMAINS_WS_METHODS.publish]: (input) =>
        portDiscovery.scan().pipe(
          Effect.flatMap((servers) =>
            servers.some((server) => server.port === input.port)
              ? domains.publish(input)
              : Effect.fail(
                  new LocalDomainError({
                    reason: "portUnavailable",
                    message: `Port ${input.port} is not a detected local development server.`,
                  }),
                ),
          ),
        ),
      [LOCAL_DOMAINS_WS_METHODS.unpublish]: (input) => domains.unpublish(input),
    });
  }),
);
