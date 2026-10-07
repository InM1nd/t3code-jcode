import { describe, expect, it } from "vite-plus/test";
import type { ProviderTurnId } from "@t3tools/contracts";

import {
  formatTurnUsageDetail,
  formatTurnUsageLabel,
  indexTurnUsageByProviderTurnId,
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
  it("indexes only turns that reported a breakdown", () => {
    const turnId = "turn-1" as ProviderTurnId;
    const indexed = indexTurnUsageByProviderTurnId([
      {
        id: turnId,
        tokenUsage: {
          usedTokens: 10,
          inputTokens: 4,
          outputTokens: 6,
          updatedAt: "2026-10-07T00:00:00.000Z",
        },
      },
      {
        id: "turn-2" as ProviderTurnId,
        tokenUsage: { usedTokens: 10, updatedAt: "2026-10-07T00:00:00.000Z" },
      },
    ]);
    expect(indexed.get(turnId)?.totalTokens).toBe(10);
    expect(indexed.size).toBe(1);
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
