import type { TurnId } from "@t3tools/contracts";

import { formatContextWindowTokens } from "../lib/contextWindow";

export type TandemTurnUsage = {
  readonly totalTokens: number;
  readonly inputTokens?: number;
  readonly cachedInputTokens?: number;
  readonly outputTokens?: number;
  readonly reasoningOutputTokens?: number;
};

type ActivityLike = {
  readonly kind: string;
  readonly turnId: TurnId | null;
  readonly payload: unknown;
};

function asCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

export function deriveTurnUsageByTurnId(
  activities: ReadonlyArray<ActivityLike>,
): ReadonlyMap<TurnId, TandemTurnUsage> {
  const byTurnId = new Map<TurnId, TandemTurnUsage>();
  for (const activity of activities) {
    if (activity.kind !== "context-window.updated" || activity.turnId === null) continue;
    const payload = asRecord(activity.payload);
    const totalTokens = asCount(payload?.lastUsedTokens);
    if (totalTokens === undefined || totalTokens === 0) continue;
    const inputTokens = asCount(payload?.lastInputTokens);
    const cachedInputTokens = asCount(payload?.lastCachedInputTokens);
    const outputTokens = asCount(payload?.lastOutputTokens);
    const reasoningOutputTokens = asCount(payload?.lastReasoningOutputTokens);
    byTurnId.set(activity.turnId, {
      totalTokens,
      ...(inputTokens !== undefined ? { inputTokens } : {}),
      ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
      ...(outputTokens !== undefined ? { outputTokens } : {}),
      ...(reasoningOutputTokens !== undefined ? { reasoningOutputTokens } : {}),
    });
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
  if (usage.cachedInputTokens !== undefined)
    parts.push(`Cached: ${usage.cachedInputTokens.toLocaleString()}`);
  if (usage.outputTokens !== undefined)
    parts.push(`Output: ${usage.outputTokens.toLocaleString()}`);
  if (usage.reasoningOutputTokens !== undefined)
    parts.push(`Reasoning: ${usage.reasoningOutputTokens.toLocaleString()}`);
  return parts.join(" · ");
}
