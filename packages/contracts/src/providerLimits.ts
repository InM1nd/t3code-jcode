import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

export const ProviderLimitProvider = Schema.Literals(["claude", "codex", "cursor", "opencode"]);
export type ProviderLimitProvider = typeof ProviderLimitProvider.Type;

export const ProviderLimitWindow = Schema.Struct({
  label: TrimmedNonEmptyString,
  usedPercent: Schema.Number,
  resetsAt: Schema.NullOr(Schema.String),
});
export type ProviderLimitWindow = typeof ProviderLimitWindow.Type;

export const ProviderLimit = Schema.Struct({
  provider: ProviderLimitProvider,
  windows: Schema.Array(ProviderLimitWindow),
});
export type ProviderLimit = typeof ProviderLimit.Type;
