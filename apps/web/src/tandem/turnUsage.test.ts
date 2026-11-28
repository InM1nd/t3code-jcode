import { describe, expect, it } from "vite-plus/test";
import type { ProviderTurnId } from "@t3tools/contracts";

import {
  formatTurnUsageDetail,
  formatTurnUsageLabel,
  indexTurnUsageByProviderTurnId,
  messageIdsShowingTurnUsage,
  tandemTurnUsageFromProviderTurn,
} from "./turnUsage";

describe("tandemTurnUsageFromProviderTurn", () => {
  it("sums input and output and keeps the breakdown", () => {
    expect(
      tandemTurnUsageFromProviderTurn({
        usedTokens: 12000,
        inputTokens: 800,
        cachedInputTokens: 400,
        outputTokens: 200,
        reasoningOutputTokens: 50,
        updatedAt: "2026-10-07T00:00:00.000Z",
      }),
    ).toEqual({
      totalTokens: 1000,
      inputTokens: 800,
      cachedInputTokens: 400,
      outputTokens: 200,
      reasoningOutputTokens: 50,
    });
  });

  it("maps TurnTokenUsage reasoningTokens into reasoningOutputTokens", () => {
    expect(
      tandemTurnUsageFromProviderTurn({
        usageScope: "main_agent",
        usageStatus: "complete",
        hasSubagents: false,
        inputTokens: 800,
        cachedInputTokens: 400,
        outputTokens: 200,
        reasoningTokens: 75,
      }),
    ).toEqual({
      totalTokens: 1000,
      inputTokens: 800,
      cachedInputTokens: 400,
      outputTokens: 200,
      reasoningOutputTokens: 75,
    });
  });

  it("hides a context-window report that has no turn breakdown", () => {
    expect(
      tandemTurnUsageFromProviderTurn({
        usedTokens: 12000,
        maxTokens: 200000,
        updatedAt: "2026-10-07T00:00:00.000Z",
      }),
    ).toBeNull();
  });
});

describe("indexTurnUsageByProviderTurnId", () => {
  it("prefers turnTokenUsage over legacy tokenUsage and falls back to tokenUsage", () => {
    const turn1 = "turn-1" as ProviderTurnId;
    const turn2 = "turn-2" as ProviderTurnId;
    const indexed = indexTurnUsageByProviderTurnId([
      {
        id: turn1,
        turnTokenUsage: {
          usageScope: "main_agent",
          usageStatus: "complete",
          hasSubagents: false,
          inputTokens: 40,
          outputTokens: 60,
          reasoningTokens: 10,
        },
        tokenUsage: {
          usedTokens: 10,
          inputTokens: 4,
          outputTokens: 6,
          updatedAt: "2026-10-07T00:00:00.000Z",
        },
      },
      {
        id: turn2,
        tokenUsage: {
          usedTokens: 10,
          inputTokens: 4,
          outputTokens: 6,
          updatedAt: "2026-10-07T00:00:00.000Z",
        },
      },
      {
        id: "turn-3" as ProviderTurnId,
        tokenUsage: { usedTokens: 10, updatedAt: "2026-10-07T00:00:00.000Z" },
      },
    ]);
    expect(indexed.get(turn1)).toEqual({
      totalTokens: 100,
      inputTokens: 40,
      outputTokens: 60,
      reasoningOutputTokens: 10,
    });
    expect(indexed.get(turn2)?.totalTokens).toBe(10);
    expect(indexed.size).toBe(2);
  });
});

describe("messageIdsShowingTurnUsage", () => {
  it("keeps only the last assistant message of each provider turn", () => {
    const ids = messageIdsShowingTurnUsage([
      {
        kind: "message",
        message: { id: "first" },
        projectedItem: { item: { type: "assistant_message", providerTurnId: "turn-1" } },
      },
      {
        kind: "assistant-meta",
        message: { id: "first" },
        projectedItem: { item: { type: "assistant_message", providerTurnId: "turn-1" } },
      },
      {
        kind: "message",
        message: { id: "second" },
        projectedItem: { item: { type: "assistant_message", providerTurnId: "turn-1" } },
      },
      {
        kind: "message",
        message: { id: "other" },
        projectedItem: { item: { type: "assistant_message", providerTurnId: "turn-2" } },
      },
    ]);
    expect([...ids].sort()).toEqual(["other", "second"]);
  });
});

describe("formatTurnUsageLabel", () => {
  it("names the turn total and the parts", () => {
    const usage = {
      totalTokens: 1500,
      inputTokens: 1000,
      outputTokens: 500,
    };
    expect(formatTurnUsageLabel(usage)).toContain("tokens");
    expect(formatTurnUsageDetail(usage)).toContain("Input: 1,000");
    expect(formatTurnUsageDetail(usage)).toContain("Output: 500");
  });
});
