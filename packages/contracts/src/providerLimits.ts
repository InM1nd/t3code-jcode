import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

export const ProviderLimitProvider = Schema.Literals(["claude", "codex", "cursor", "opencode"]);
export type ProviderLimitProvider = typeof ProviderLimitProvider.Type;

export const ProviderLimitStatus = Schema.Literals([
  "ok",
  "unsupported",
  "auth-required",
  "temporary-error",
]);
export type ProviderLimitStatus = typeof ProviderLimitStatus.Type;

export const ProviderLimitWindow = Schema.Struct({
  label: TrimmedNonEmptyString,
  usedPercent: Schema.Number,
  resetsAt: Schema.NullOr(Schema.String),
});
export type ProviderLimitWindow = typeof ProviderLimitWindow.Type;

export const ProviderLimit = Schema.Struct({
  provider: ProviderLimitProvider,
  windows: Schema.Array(ProviderLimitWindow),
  /** Optional so clients can still decode summaries from older servers. */
  status: Schema.optional(ProviderLimitStatus),
  /** Time of the most recent successful read, not the failed refresh time. */
  lastUpdatedAt: Schema.optional(Schema.NullOr(Schema.String)),
  /** Bounded, actionable explanation for an unavailable provider. */
  message: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
});
export type ProviderLimit = typeof ProviderLimit.Type;
