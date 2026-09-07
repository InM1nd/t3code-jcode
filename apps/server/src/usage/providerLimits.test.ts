import * as NodeServices from "@effect/platform-node/NodeServices";
import type { ProviderLimit } from "@t3tools/contracts";
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

  it("normalizes reset offsets to an explicit UTC instant", () => {
    expect(
      parseProviderLimitResponse("claude", {
        five_hour: { utilization: 36, resets_at: "2026-09-01T12:00:00+02:00" },
      }),
    ).toEqual({
      provider: "claude",
      windows: [{ label: "5h", usedPercent: 36, resetsAt: "2026-09-01T10:00:00.000Z" }],
    });
  });
});

it.layer(NodeServices.layer)("readProviderLimits", (it) => {
  it.effect("explains when provider limit credentials are unavailable", () =>
    Effect.gen(function* () {
      const limits = yield* readProviderLimits({
        claudeCredentialsFile: "/nonexistent/.credentials.json",
        codexSessionsDir: "/nonexistent/codex-sessions",
        cursorAccessToken: null,
        environment: {},
        homeDirectory: "/nonexistent",
        platform: "linux",
        previousLimits: new Map<ProviderLimit["provider"], ProviderLimit>([
          [
            "claude",
            {
              provider: "claude",
              status: "ok",
              windows: [{ label: "5h", usedPercent: 17, resetsAt: null }],
              lastUpdatedAt: "2026-09-01T09:00:00.000Z",
              message: null,
            },
          ],
        ]),
      }).pipe(
        Effect.provideService(
          HttpClient.HttpClient,
          HttpClient.make(() => Effect.die("unexpected provider request")),
        ),
      );

      expect(limits).toEqual([
        {
          provider: "claude",
          status: "auth-required",
          windows: [{ label: "5h", usedPercent: 17, resetsAt: null }],
          lastUpdatedAt: "2026-09-01T09:00:00.000Z",
          message: "Sign in to Claude Code to view usage limits.",
        },
        {
          provider: "codex",
          status: "temporary-error",
          windows: [],
          lastUpdatedAt: null,
          message: "No recent Codex limit report was found.",
        },
        {
          provider: "cursor",
          status: "auth-required",
          windows: [],
          lastUpdatedAt: null,
          message: "Sign in to Cursor to view usage limits.",
        },
        {
          provider: "opencode",
          status: "auth-required",
          windows: [],
          lastUpdatedAt: null,
          message: "Sign in to OpenCode to view usage limits.",
        },
      ]);
    }),
  );

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

      expect(limits).toContainEqual(
        expect.objectContaining({
          provider: "cursor",
          status: "ok",
          windows: [
            { label: "Cursor Models", usedPercent: 18, resetsAt: "2026-09-10T00:26:40.000Z" },
            { label: "Other Models", usedPercent: 3.5, resetsAt: "2026-09-10T00:26:40.000Z" },
          ],
          lastUpdatedAt: expect.any(String),
          message: null,
        }),
      );
    }),
  );

  it.effect("only calls an explicitly missing limit endpoint unsupported", () =>
    Effect.gen(function* () {
      let responseStatus = 404;
      const execute = (request: HttpClientRequest.HttpClientRequest) =>
        Effect.succeed(
          HttpClientResponse.fromWeb(request, new Response(null, { status: responseStatus })),
        );
      const read = () =>
        readProviderLimits({
          claudeCredentialsFile: "/nonexistent/.credentials.json",
          codexSessionsDir: "/nonexistent/codex-sessions",
          cursorAccessToken: "test-access-token",
          environment: {},
          homeDirectory: "/nonexistent",
          platform: "linux",
        }).pipe(Effect.provideService(HttpClient.HttpClient, HttpClient.make(execute)));

      const unsupported = yield* read();
      expect(unsupported.find((limit) => limit.provider === "cursor")).toEqual(
        expect.objectContaining({ status: "unsupported", windows: [], lastUpdatedAt: null }),
      );

      responseStatus = 500;
      const temporaryError = yield* read();
      expect(temporaryError.find((limit) => limit.provider === "cursor")).toEqual(
        expect.objectContaining({ status: "temporary-error", windows: [], lastUpdatedAt: null }),
      );
    }),
  );
});
