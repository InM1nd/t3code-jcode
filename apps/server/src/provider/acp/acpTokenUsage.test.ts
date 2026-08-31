import { describe, expect, it } from "vite-plus/test";

import { parseSessionUpdateEvent } from "./AcpRuntimeModel.ts";
import {
  snapshotFromAcpPromptUsage,
  snapshotFromAcpUsageUpdate,
  tokenUsageEventFromAcpPromptResponse,
  tokenUsageEventFromAcpSessionUpdate,
} from "./acpTokenUsage.ts";

describe("acpTokenUsage", () => {
  it("maps usage_update into a context-window snapshot the chat can render", () => {
    expect(snapshotFromAcpUsageUpdate({ used: 12_400, size: 200_000 })).toEqual({
      usedTokens: 12_400,
      lastUsedTokens: 12_400,
      maxTokens: 200_000,
    });
    expect(
      tokenUsageEventFromAcpSessionUpdate({
        sessionId: "session-1",
        update: { sessionUpdate: "usage_update", used: 12_400, size: 200_000 },
      })?._tag,
    ).toBe("TokenUsageUpdated");
    expect(
      parseSessionUpdateEvent({
        sessionId: "session-1",
        update: { sessionUpdate: "usage_update", used: 12_400, size: 200_000 },
      }).events,
    ).toEqual([
      {
        _tag: "TokenUsageUpdated",
        usage: { usedTokens: 12_400, lastUsedTokens: 12_400, maxTokens: 200_000 },
        rawPayload: {
          sessionId: "session-1",
          update: { sessionUpdate: "usage_update", used: 12_400, size: 200_000 },
        },
      },
    ]);
  });

  it("maps prompt usage into last-turn token counts", () => {
    expect(
      snapshotFromAcpPromptUsage({
        inputTokens: 800,
        outputTokens: 200,
        totalTokens: 1_050,
        cachedReadTokens: 50,
        thoughtTokens: 0,
      }),
    ).toEqual({
      usedTokens: 1_050,
      lastUsedTokens: 1_050,
      inputTokens: 800,
      lastInputTokens: 800,
      outputTokens: 200,
      lastOutputTokens: 200,
      cachedInputTokens: 50,
      lastCachedInputTokens: 50,
    });
    expect(
      tokenUsageEventFromAcpPromptResponse({
        stopReason: "end_turn",
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      })?.usage.lastUsedTokens,
    ).toBe(15);
  });

  it("ignores empty usage payloads", () => {
    expect(snapshotFromAcpUsageUpdate({ used: 0, size: 200_000 })).toBeUndefined();
    expect(
      snapshotFromAcpPromptUsage({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
    ).toBeUndefined();
    expect(
      tokenUsageEventFromAcpSessionUpdate({
        sessionId: "session-1",
        update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hi" } },
      }),
    ).toBeUndefined();
  });
});
