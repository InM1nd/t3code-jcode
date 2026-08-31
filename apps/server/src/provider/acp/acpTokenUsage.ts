import type { ThreadTokenUsageSnapshot } from "@t3tools/contracts";
import type * as EffectAcpSchema from "effect-acp/schema";

export type AcpTokenUsageSessionEvent = {
  readonly _tag: "TokenUsageUpdated";
  readonly usage: ThreadTokenUsageSnapshot;
  readonly rawPayload: unknown;
};

function asCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : undefined;
}

export function snapshotFromAcpUsageUpdate(update: {
  readonly used: number;
  readonly size: number;
}): ThreadTokenUsageSnapshot | undefined {
  const usedTokens = asCount(update.used);
  if (usedTokens === undefined || usedTokens <= 0) {
    return undefined;
  }
  const maxTokens = asCount(update.size);
  return {
    usedTokens,
    lastUsedTokens: usedTokens,
    ...(maxTokens !== undefined && maxTokens > 0 ? { maxTokens } : {}),
  };
}

export function snapshotFromAcpPromptUsage(
  usage: EffectAcpSchema.Usage | null | undefined,
): ThreadTokenUsageSnapshot | undefined {
  if (!usage) {
    return undefined;
  }
  const inputTokens = asCount(usage.inputTokens);
  const outputTokens = asCount(usage.outputTokens);
  const totalTokens = asCount(usage.totalTokens);
  const lastUsedTokens =
    totalTokens !== undefined && totalTokens > 0
      ? totalTokens
      : (inputTokens ?? 0) + (outputTokens ?? 0);
  if (lastUsedTokens <= 0) {
    return undefined;
  }
  const cachedInputTokens = asCount(usage.cachedReadTokens ?? undefined);
  const reasoningOutputTokens = asCount(usage.thoughtTokens ?? undefined);
  return {
    usedTokens: lastUsedTokens,
    lastUsedTokens,
    ...(inputTokens !== undefined && inputTokens > 0
      ? { inputTokens, lastInputTokens: inputTokens }
      : {}),
    ...(outputTokens !== undefined && outputTokens > 0
      ? { outputTokens, lastOutputTokens: outputTokens }
      : {}),
    ...(cachedInputTokens !== undefined && cachedInputTokens > 0
      ? { cachedInputTokens, lastCachedInputTokens: cachedInputTokens }
      : {}),
    ...(reasoningOutputTokens !== undefined && reasoningOutputTokens > 0
      ? { reasoningOutputTokens, lastReasoningOutputTokens: reasoningOutputTokens }
      : {}),
  };
}

export function tokenUsageEventFromAcpSessionUpdate(
  params: EffectAcpSchema.SessionNotification,
): AcpTokenUsageSessionEvent | undefined {
  const update = params.update;
  if (update.sessionUpdate !== "usage_update") {
    return undefined;
  }
  const usage = snapshotFromAcpUsageUpdate(update);
  if (!usage) {
    return undefined;
  }
  return { _tag: "TokenUsageUpdated", usage, rawPayload: params };
}

export function tokenUsageEventFromAcpPromptResponse(
  result: EffectAcpSchema.PromptResponse,
): AcpTokenUsageSessionEvent | undefined {
  const usage = snapshotFromAcpPromptUsage(result.usage);
  if (!usage) {
    return undefined;
  }
  return { _tag: "TokenUsageUpdated", usage, rawPayload: result };
}
