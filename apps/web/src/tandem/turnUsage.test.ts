import { describe, expect, it } from "vite-plus/test";
import { TurnId } from "@t3tools/contracts";

import { deriveTurnUsageByTurnId, formatTurnUsageLabel } from "./turnUsage";

describe("deriveTurnUsageByTurnId", () => {
  it("keeps the latest provider-reported last-turn usage for each turn", () => {
    const usage = deriveTurnUsageByTurnId([
      {
        kind: "context-window.updated",
        turnId: TurnId.make("turn-1"),
        payload: { lastUsedTokens: 120, lastInputTokens: 100, lastOutputTokens: 20 },
      },
      {
        kind: "context-window.updated",
        turnId: TurnId.make("turn-1"),
        payload: { lastUsedTokens: 140, lastInputTokens: 110, lastOutputTokens: 30 },
      },
      {
        kind: "context-window.updated",
        turnId: TurnId.make("turn-2"),
        payload: { usedTokens: 10_000 },
      },
      {
        kind: "tool.completed",
        turnId: TurnId.make("turn-3"),
        payload: { lastUsedTokens: 300 },
      },
    ]);

    expect(usage.get(TurnId.make("turn-1"))).toEqual({
      totalTokens: 140,
      inputTokens: 110,
      outputTokens: 30,
    });
    expect(usage.has(TurnId.make("turn-2"))).toBe(false);
    expect(usage.has(TurnId.make("turn-3"))).toBe(false);
  });

  it("formats a compact token label", () => {
    expect(formatTurnUsageLabel({ totalTokens: 9_800 })).toBe("9.8k tokens");
  });
});
