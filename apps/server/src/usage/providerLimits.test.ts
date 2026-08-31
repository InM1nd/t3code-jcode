import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { HttpClient, type HttpClientRequest, HttpClientResponse } from "effect/unstable/http";

import { parseProviderLimitResponse, readProviderLimits } from "./providerLimits.ts";

describe("parseProviderLimitResponse", () => {
  it("normalizes the four provider limit payloads without exposing credentials", () => {
    expect(
      parseProviderLimitResponse("codex", {
        primary: { used_percent: 24, window_minutes: 300, resets_at: 1_789_000_000 },
        secondary: { used_percent: 8, window_minutes: 10_080, resets_at: 1_789_600_000 },
      }),
    ).toEqual({
      provider: "codex",
      windows: [
        { label: "5h", usedPercent: 24, resetsAt: "2026-09-10T00:26:40.000Z" },
        { label: "7d", usedPercent: 8, resetsAt: "2026-09-16T23:06:40.000Z" },
      ],
    });

    expect(
      parseProviderLimitResponse("claude", {
        five_hour: { utilization: 36, resets_at: "2026-08-31T18:00:00.000Z" },
        seven_day: { utilization: 12, resets_at: "2026-09-05T12:00:00.000Z" },
      }),
    ).toEqual({
      provider: "claude",
      windows: [
        { label: "5h", usedPercent: 36, resetsAt: "2026-08-31T18:00:00.000Z" },
        { label: "7d", usedPercent: 12, resetsAt: "2026-09-05T12:00:00.000Z" },
      ],
    });

    expect(
      parseProviderLimitResponse("cursor", {
        billingCycleEnd: "1789000000000",
        autoModelSelectedDisplayMessage: "You've used 18% of your included total usage",
        namedModelSelectedDisplayMessage: "You've used 3.5% of your included total usage",
      }),
    ).toEqual({
      provider: "cursor",
      windows: [
        { label: "Cursor Models", usedPercent: 18, resetsAt: "2026-09-10T00:26:40.000Z" },
        { label: "Other Models", usedPercent: 3.5, resetsAt: "2026-09-10T00:26:40.000Z" },
      ],
    });

    expect(
      parseProviderLimitResponse(
        "opencode",
        {
          rolling_usage: { usage_percent: 40, reset_in_sec: 3_600 },
          weekly_usage: { usage_percent: 20, reset_in_sec: 7_200 },
          monthly_usage: { usage_percent: 10, reset_in_sec: 10_800 },
        },
        1_788_900_000_000,
      ),
    ).toEqual({
      provider: "opencode",
      windows: [
        { label: "5h", usedPercent: 40, resetsAt: "2026-09-08T21:40:00.000Z" },
        { label: "7d", usedPercent: 20, resetsAt: "2026-09-08T22:40:00.000Z" },
        { label: "30d", usedPercent: 10, resetsAt: "2026-09-08T23:40:00.000Z" },
      ],
    });
  });
});

it.layer(NodeServices.layer)("readProviderLimits", (it) => {
  it.effect("sends the Cursor access token as a Bearer credential, not the dashboard cookie", () =>
    Effect.gen(function* () {
      const execute = (request: HttpClientRequest.HttpClientRequest) => {
        expect(request.headers["authorization"]).toBe("Bearer test-access-token");
        expect(request.headers["cookie"]).toBeUndefined();
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            Response.json({
              billingCycleEnd: "1789000000000",
              autoModelSelectedDisplayMessage: "You've used 18% of your included total usage",
              namedModelSelectedDisplayMessage: "You've used 3.5% of your included total usage",
            }),
          ),
        );
      };

      const limits = yield* readProviderLimits({
        claudeCredentialsFile: "/nonexistent/.credentials.json",
        codexSessionsDir: "/nonexistent/codex-sessions",
        cursorAccessToken: "test-access-token",
        environment: {},
        homeDirectory: "/nonexistent",
        platform: "linux",
      }).pipe(Effect.provideService(HttpClient.HttpClient, HttpClient.make(execute)));

      expect(limits).toEqual([
        {
          provider: "cursor",
          windows: [
            { label: "Cursor Models", usedPercent: 18, resetsAt: "2026-09-10T00:26:40.000Z" },
            { label: "Other Models", usedPercent: 3.5, resetsAt: "2026-09-10T00:26:40.000Z" },
          ],
        },
      ]);
    }),
  );
});
