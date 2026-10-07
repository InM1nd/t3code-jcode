import type {
  OrchestrationV2ProviderTurnTokenUsage,
  ThreadTokenUsageSnapshot,
} from "@t3tools/contracts";

function asCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : undefined;
}

/** The usage object on an ACP prompt response. */
export type AcpPromptUsage = {
  readonly inputTokens?: number | null;
  readonly outputTokens?: number | null;
  readonly totalTokens?: number | null;
  readonly cachedReadTokens?: number | null;
  readonly thoughtTokens?: number | null;
};

/**
 * Fold a prompt's token report into the turn snapshot. The context-window
 * used/size pair from `usage_update` stays put; the prompt adds the breakdown.
 */
export function mergeAcpPromptUsage(
  current: ThreadTokenUsageSnapshot | null,
  usage: AcpPromptUsage | null | undefined,
): ThreadTokenUsageSnapshot | null {
  if (!usage) return current;
  const inputTokens = asCount(usage.inputTokens);
  const outputTokens = asCount(usage.outputTokens);
  const cachedInputTokens = asCount(usage.cachedReadTokens);
  const reasoningOutputTokens = asCount(usage.thoughtTokens);
  const reportedTotal = asCount(usage.totalTokens);
  const turnTokens =
    reportedTotal !== undefined && reportedTotal > 0
      ? reportedTotal
      : (inputTokens ?? 0) + (outputTokens ?? 0);
  const hasParts =
    (inputTokens ?? 0) > 0 ||
    (outputTokens ?? 0) > 0 ||
    (cachedInputTokens ?? 0) > 0 ||
    (reasoningOutputTokens ?? 0) > 0;
  if (turnTokens <= 0 && !hasParts) return current;

  return {
    usedTokens: current?.usedTokens && current.usedTokens > 0 ? current.usedTokens : turnTokens,
    ...(current?.maxTokens !== undefined ? { maxTokens: current.maxTokens } : {}),
    ...(inputTokens !== undefined && inputTokens > 0 ? { inputTokens } : {}),
    ...(outputTokens !== undefined && outputTokens > 0 ? { outputTokens } : {}),
    ...(cachedInputTokens !== undefined && cachedInputTokens > 0 ? { cachedInputTokens } : {}),
    ...(reasoningOutputTokens !== undefined && reasoningOutputTokens > 0
      ? { reasoningOutputTokens }
      : {}),
    ...(turnTokens > 0 ? { lastUsedTokens: turnTokens } : {}),
  };
}

/** The provider-turn field the chat meter and the per-answer label both read. */
export function providerTurnTokenUsageFromSnapshot(
  snapshot: ThreadTokenUsageSnapshot,
  updatedAt: string,
): OrchestrationV2ProviderTurnTokenUsage {
  return {
    usedTokens: snapshot.usedTokens,
    ...(snapshot.maxTokens !== undefined ? { maxTokens: snapshot.maxTokens } : {}),
    ...(snapshot.inputTokens !== undefined ? { inputTokens: snapshot.inputTokens } : {}),
    ...(snapshot.cachedInputTokens !== undefined
      ? { cachedInputTokens: snapshot.cachedInputTokens }
      : {}),
    ...(snapshot.outputTokens !== undefined ? { outputTokens: snapshot.outputTokens } : {}),
    ...(snapshot.reasoningOutputTokens !== undefined
      ? { reasoningOutputTokens: snapshot.reasoningOutputTokens }
      : {}),
    updatedAt,
  };
}
