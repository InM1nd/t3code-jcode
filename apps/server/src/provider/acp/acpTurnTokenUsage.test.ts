import { describe, expect, it } from "vite-plus/test";

import {
  contextUsageForNewTurn,
  mergeAcpPromptUsage,
  providerTurnTokenUsageFromSnapshot,
} from "./acpTurnTokenUsage.ts";

describe("mergeAcpPromptUsage", () => {
  it("keeps the context window and adds the prompt breakdown", () => {
    const merged = mergeAcpPromptUsage(
      { usedTokens: 12000, maxTokens: 200000 },
      {
        inputTokens: 800,
        outputTokens: 200,
        totalTokens: 1000,
        cachedReadTokens: 400,
        thoughtTokens: 50,
      },
    );
    expect(merged).toMatchObject({
      usedTokens: 12000,
      maxTokens: 200000,
      inputTokens: 800,
      outputTokens: 200,
      cachedInputTokens: 400,
      reasoningOutputTokens: 50,
      lastUsedTokens: 1000,
    });
  });

  it("uses the prompt total when no window report arrived", () => {
    expect(
      mergeAcpPromptUsage(null, { inputTokens: 10, outputTokens: 5, totalTokens: 15 }),
    ).toMatchObject({
      usedTokens: 15,
      inputTokens: 10,
      outputTokens: 5,
      lastUsedTokens: 15,
    });
  });

  it("leaves the snapshot alone when the prompt reports nothing", () => {
    const current = { usedTokens: 4, maxTokens: 8 };
    expect(mergeAcpPromptUsage(current, null)).toBe(current);
    expect(mergeAcpPromptUsage(current, { inputTokens: 0, outputTokens: 0 })).toBe(current);
  });
});

describe("contextUsageForNewTurn", () => {
  it("keeps the window and drops the previous turn's breakdown", () => {
    expect(
      contextUsageForNewTurn({
        usedTokens: 12000,
        maxTokens: 200000,
        inputTokens: 800,
        cachedInputTokens: 400,
        outputTokens: 200,
        reasoningOutputTokens: 50,
        lastUsedTokens: 1000,
        lastInputTokens: 800,
        lastOutputTokens: 200,
      }),
    ).toEqual({ usedTokens: 12000, maxTokens: 200000 });
  });

  it("returns null when there is no previous snapshot", () => {
    expect(contextUsageForNewTurn(null)).toBeNull();
    expect(contextUsageForNewTurn(undefined)).toBeNull();
  });
});

describe("providerTurnTokenUsageFromSnapshot", () => {
  it("copies the breakdown the chat label reads", () => {
    expect(
      providerTurnTokenUsageFromSnapshot(
        {
          usedTokens: 12000,
          maxTokens: 200000,
          inputTokens: 800,
          outputTokens: 200,
        },
        "2026-10-07T00:00:00.000Z",
      ),
    ).toEqual({
      usedTokens: 12000,
      maxTokens: 200000,
      inputTokens: 800,
      outputTokens: 200,
      updatedAt: "2026-10-07T00:00:00.000Z",
    });
  });
});
