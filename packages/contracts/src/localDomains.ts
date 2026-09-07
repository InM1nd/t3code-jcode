import * as Schema from "effect/Schema";

export const LOCAL_DOMAINS_WS_METHODS = {
  list: "localDomains.list",
  publish: "localDomains.publish",
  unpublish: "localDomains.unpublish",
} as const;

// ponytail: portless .localhost needs a proven platform-specific privileged listener; add it only after a separately verified desktop implementation.
export const LOCAL_DOMAIN_PROXY_PORT = 7777;

export const LocalDomainBinding = Schema.Struct({
  domain: Schema.String,
  port: Schema.Int,
});
export type LocalDomainBinding = typeof LocalDomainBinding.Type;

export const LocalDomainList = Schema.Struct({
  domains: Schema.Array(LocalDomainBinding),
  supported: Schema.Boolean,
  /** Optional so clients can still read older local-domain responses. */
  proxyPort: Schema.optional(Schema.Int),
  proxyError: Schema.NullOr(Schema.String),
});
export type LocalDomainList = typeof LocalDomainList.Type;

export const PublishLocalDomainInput = Schema.Struct({
  port: Schema.Int,
  /** An empty value asks the server to use its port-derived suggestion. */
  domain: Schema.optional(Schema.String),
});
export type PublishLocalDomainInput = typeof PublishLocalDomainInput.Type;

export const UnpublishLocalDomainInput = Schema.Struct({
  domain: Schema.String,
});
export type UnpublishLocalDomainInput = typeof UnpublishLocalDomainInput.Type;

export class LocalDomainError extends Schema.TaggedErrorClass<LocalDomainError>()(
  "LocalDomainError",
  {
    reason: Schema.Literals([
      "unsupportedPlatform",
      "invalidDomain",
      "portUnavailable",
      "stateUpdateFailed",
    ]),
    message: Schema.String,
  },
) {}
