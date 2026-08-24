import { describe, expect, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";

import { fetchCursorUsageEvents } from "./cursorDashboardApi.ts";
import type { CursorSession } from "./cursorSession.ts";

const session: CursorSession = {
  cookie: "WorkosCursorSessionToken=user_123::jwt",
  userId: "user_123",
};

const REAL_TIMESTAMP_MS = 1786984123427;

/** Shaped after a real `usageEventsDisplay` entry (token fields nest under `tokenUsage`, `timestamp` is a numeric-epoch string). */
function realEvent(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    timestamp: String(REAL_TIMESTAMP_MS),
    model: "cursor-grok-4.6-xhigh",
    kind: "USAGE_EVENT_KIND_INCLUDED_IN_PRO_PLUS",
    conversationId: "conv_1",
    chargedCents: 5.409200191497803,
    isHeadless: false,
    tokenUsage: {
      inputTokens: 269,
      outputTokens: 373,
      cacheReadTokens: 210816,
    },
    ...overrides,
  };
}

/** `callIndex` is 1-based and tracks pagination without parsing the request body. */
function makeLayer(handler: (callIndex: number) => Response) {
  let callIndex = 0;
  const execute = vi.fn((request: HttpClientRequest.HttpClientRequest) => {
    callIndex += 1;
    return Effect.succeed(HttpClientResponse.fromWeb(request, handler(callIndex)));
  });
  return { execute, layer: HttpClient.make(execute) };
}

describe("fetchCursorUsageEvents", () => {
  it.effect(
    "parses a real-shaped event: numeric-string timestamp, nested tokenUsage, fractional chargedCents",
    () =>
      Effect.gen(function* () {
        const { execute, layer } = makeLayer(() =>
          Response.json({
            usageEventsDisplay: [realEvent()],
            totalUsageEventsCount: 1,
          }),
        );

        const events = yield* fetchCursorUsageEvents(session, 0, 1).pipe(
          Effect.provideService(HttpClient.HttpClient, layer),
        );

        expect(events).toEqual([
          {
            timestampMs: REAL_TIMESTAMP_MS,
            model: "cursor-grok-4.6-xhigh",
            conversationId: "conv_1",
            inputTokens: 269,
            outputTokens: 373,
            cacheReadTokens: 210816,
            cacheWriteTokens: 0,
            // Sub-cent precision must survive: an earlier version truncated
            // this to an integer through the same `int()` helper token counts
            // use, silently discarding fractional cents.
            chargedCents: 5.409200191497803,
          },
        ]);
        expect(execute).toHaveBeenCalledTimes(1);
      }),
  );

  it.effect("falls back to flat token fields when tokenUsage is absent", () =>
    Effect.gen(function* () {
      const { layer } = makeLayer(() =>
        Response.json({
          usageEventsDisplay: [
            realEvent({
              tokenUsage: undefined,
              inputTokens: 200,
              outputTokens: 80,
              cacheReadTokens: 0,
            }),
          ],
          totalUsageEventsCount: 1,
        }),
      );

      const events = yield* fetchCursorUsageEvents(session, 0, 1).pipe(
        Effect.provideService(HttpClient.HttpClient, layer),
      );

      expect(events[0]).toMatchObject({ inputTokens: 200, outputTokens: 80 });
    }),
  );

  it.effect("drops events missing a model or conversationId", () =>
    Effect.gen(function* () {
      const { layer } = makeLayer(() =>
        Response.json({
          usageEventsDisplay: [realEvent({ model: "" }), realEvent({ conversationId: undefined })],
          totalUsageEventsCount: 2,
        }),
      );

      const events = yield* fetchCursorUsageEvents(session, 0, 1).pipe(
        Effect.provideService(HttpClient.HttpClient, layer),
      );

      expect(events).toEqual([]);
    }),
  );

  it.effect("does not collapse events that share a conversationId", () => {
    // Real accounts bill many events under one conversationId; a naive
    // dedupe on that field would drop all but the first.
    return Effect.gen(function* () {
      const { layer } = makeLayer(() =>
        Response.json({
          usageEventsDisplay: [
            realEvent({ conversationId: "conv_shared", chargedCents: 1 }),
            realEvent({ conversationId: "conv_shared", chargedCents: 2 }),
          ],
          totalUsageEventsCount: 2,
        }),
      );

      const events = yield* fetchCursorUsageEvents(session, 0, 1).pipe(
        Effect.provideService(HttpClient.HttpClient, layer),
      );

      expect(events).toHaveLength(2);
    });
  });

  it.effect("paginates until totalUsageEventsCount is satisfied", () =>
    Effect.gen(function* () {
      const { execute, layer } = makeLayer((callIndex) =>
        Response.json({
          usageEventsDisplay: [realEvent({ conversationId: `conv_${callIndex}` })],
          totalUsageEventsCount: 2,
        }),
      );

      const events = yield* fetchCursorUsageEvents(session, 0, 1).pipe(
        Effect.provideService(HttpClient.HttpClient, layer),
      );

      expect(events.map((event) => event.conversationId)).toEqual(["conv_1", "conv_2"]);
      expect(execute).toHaveBeenCalledTimes(2);
    }),
  );

  it.effect("fails with unauthorized on a 401 response", () =>
    Effect.gen(function* () {
      const { layer } = makeLayer(() => new Response("unauthorized", { status: 401 }));

      const error = yield* Effect.flip(
        fetchCursorUsageEvents(session, 0, 1).pipe(
          Effect.provideService(HttpClient.HttpClient, layer),
        ),
      );

      expect(error.reason).toBe("unauthorized");
    }),
  );

  it.effect("fails with requestFailed on a non-2xx, non-auth response", () =>
    Effect.gen(function* () {
      const { layer } = makeLayer(() => new Response("boom", { status: 500 }));

      const error = yield* Effect.flip(
        fetchCursorUsageEvents(session, 0, 1).pipe(
          Effect.provideService(HttpClient.HttpClient, layer),
        ),
      );

      expect(error.reason).toBe("requestFailed");
    }),
  );

  it.effect("fails rather than reporting zero events when usageEventsDisplay is missing", () =>
    Effect.gen(function* () {
      // A 2xx body without a `usageEventsDisplay` array means the response
      // shape changed underneath us, not that the account is quiet. Treating
      // it as `[]` would make the source look healthy at zero events instead
      // of surfacing that something broke.
      const { layer } = makeLayer(() => Response.json({ totalUsageEventsCount: 5 }));

      const error = yield* Effect.flip(
        fetchCursorUsageEvents(session, 0, 1).pipe(
          Effect.provideService(HttpClient.HttpClient, layer),
        ),
      );

      expect(error.reason).toBe("requestFailed");
    }),
  );
});
