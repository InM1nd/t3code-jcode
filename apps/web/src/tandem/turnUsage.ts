import type {
  OrchestrationV2ProviderTurn,
  OrchestrationV2ProviderTurnTokenUsage,
  ProviderTurnId,
} from "@t3tools/contracts";

import { formatContextWindowTokens } from "../lib/contextWindow";

export type TandemTurnUsage = {
  readonly totalTokens: number;
  readonly inputTokens?: number;
  readonly cachedInputTokens?: number;
  readonly outputTokens?: number;
  readonly reasoningOutputTokens?: number;
};

/** A label only when the provider reported this turn's input or output. */
export function tandemTurnUsageFromProviderTurn(
  usage: OrchestrationV2ProviderTurnTokenUsage | undefined,
): TandemTurnUsage | null {
  if (!usage) return null;
  const inputTokens = usage.inputTokens;
  const outputTokens = usage.outputTokens;
  const total = (inputTokens ?? 0) + (outputTokens ?? 0);
  if (total <= 0) return null;
  return {
    totalTokens: total,
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(usage.cachedInputTokens !== undefined
      ? { cachedInputTokens: usage.cachedInputTokens }
      : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(usage.reasoningOutputTokens !== undefined
      ? { reasoningOutputTokens: usage.reasoningOutputTokens }
      : {}),
  };
}

export function indexTurnUsageByProviderTurnId(
  turns: ReadonlyArray<Pick<OrchestrationV2ProviderTurn, "id" | "tokenUsage">> | undefined,
): ReadonlyMap<ProviderTurnId, TandemTurnUsage> {
  const byTurnId = new Map<ProviderTurnId, TandemTurnUsage>();
  for (const turn of turns ?? []) {
    const usage = tandemTurnUsageFromProviderTurn(turn.tokenUsage);
    if (usage) byTurnId.set(turn.id, usage);
  }
  return byTurnId;
}

export function formatTurnUsageLabel(usage: TandemTurnUsage): string {
  return `${formatContextWindowTokens(usage.totalTokens)} tokens`;
}

export function formatTurnUsageDetail(usage: TandemTurnUsage): string {
  const parts = [
    `Provider-reported usage for this turn: ${usage.totalTokens.toLocaleString()} tokens`,
  ];
  if (usage.inputTokens !== undefined) parts.push(`Input: ${usage.inputTokens.toLocaleString()}`);
  if (usage.cachedInputTokens !== undefined) {
    parts.push(`Cached: ${usage.cachedInputTokens.toLocaleString()}`);
  }
  if (usage.outputTokens !== undefined) {
    parts.push(`Output: ${usage.outputTokens.toLocaleString()}`);
  }
  if (usage.reasoningOutputTokens !== undefined) {
    parts.push(`Reasoning: ${usage.reasoningOutputTokens.toLocaleString()}`);
  }
  return parts.join(" · ");
}
