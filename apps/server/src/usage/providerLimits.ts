import type { ProviderLimit, ProviderLimitProvider } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";

import { listTranscriptFiles } from "./usageTranscriptReader.ts";

export type ProviderLimitKind = ProviderLimitProvider;
export type ProviderLimitResponse = ProviderLimit;

const decodeJson = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Unknown as unknown as Schema.Codec<unknown>),
);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function percent(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resetAt(value: unknown, multiplier = 1): string | null {
  const timestamp = typeof value === "string" ? Number(value) : value;
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
    return DateTime.formatIso(DateTime.makeUnsafe(timestamp * multiplier));
  }
  return typeof value === "string" ? value : null;
}

function window(label: string, usedPercent: unknown, resetsAt: unknown, multiplier = 1) {
  const used = percent(usedPercent);
  return used === null
    ? null
    : { label, usedPercent: used, resetsAt: resetAt(resetsAt, multiplier) };
}

function windows(...values: Array<ReturnType<typeof window>>): ProviderLimitResponse["windows"] {
  return values.filter((value): value is NonNullable<typeof value> => value !== null);
}

export function parseProviderLimitResponse(
  provider: ProviderLimitKind,
  payload: unknown,
  nowMs = 0,
): ProviderLimitResponse {
  const value = record(payload) ?? {};
  if (provider === "codex") {
    const primary = record(value["primary"]);
    const secondary = record(value["secondary"]);
    return {
      provider,
      windows: windows(
        window("5h", primary?.["used_percent"], primary?.["resets_at"], 1_000),
        window("7d", secondary?.["used_percent"], secondary?.["resets_at"], 1_000),
      ),
    };
  }
  if (provider === "claude") {
    const fiveHour = record(value["five_hour"]);
    const sevenDay = record(value["seven_day"]);
    return {
      provider,
      windows: windows(
        window("5h", fiveHour?.["utilization"], fiveHour?.["resets_at"]),
        window("7d", sevenDay?.["utilization"], sevenDay?.["resets_at"]),
      ),
    };
  }
  if (provider === "cursor") {
    const messagePercent = (message: unknown) => {
      const match = typeof message === "string" ? /\d+(?:\.\d+)?%/.exec(message) : null;
      return match === null ? null : Number(match[0].slice(0, -1));
    };
    return {
      provider,
      windows: windows(
        window(
          "Cursor Models",
          messagePercent(value["autoModelSelectedDisplayMessage"]),
          value["billingCycleEnd"],
        ),
        window(
          "Other Models",
          messagePercent(value["namedModelSelectedDisplayMessage"]),
          value["billingCycleEnd"],
        ),
      ),
    };
  }
  const relativeWindow = (label: string, raw: unknown) => {
    const value = record(raw);
    const resetInSec = percent(value?.["reset_in_sec"]);
    return window(
      label,
      value?.["usage_percent"],
      resetInSec === null ? null : nowMs + resetInSec * 1_000,
    );
  };
  return {
    provider,
    windows: windows(
      relativeWindow("5h", value["rolling_usage"]),
      relativeWindow("7d", value["weekly_usage"]),
      relativeWindow("30d", value["monthly_usage"]),
    ),
  };
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function claudeAccessToken(credentials: unknown): string | null {
  const root = record(credentials);
  return (
    nonEmptyString(record(root?.["claudeAiOauth"])?.["accessToken"]) ??
    nonEmptyString(root?.["accessToken"])
  );
}

function openCodeKey(credentials: unknown): string | null {
  return nonEmptyString(record(record(credentials)?.["opencode"])?.["key"]);
}

export const readProviderLimits = Effect.fn("readProviderLimits")(function* ({
  claudeCredentialsFile,
  codexSessionsDir,
  cursorCookie,
  environment,
  homeDirectory,
}: {
  readonly claudeCredentialsFile: string;
  readonly codexSessionsDir: string;
  readonly cursorCookie: string | null;
  readonly environment: Record<string, string | undefined>;
  readonly homeDirectory: string;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const httpClient = yield* HttpClient.HttpClient;
  const nowMs = yield* Clock.currentTimeMillis;
  const readJson = (file: string) =>
    fileSystem.readFileString(file).pipe(
      Effect.flatMap(decodeJson),
      Effect.catchCause(() => Effect.succeed(null)),
    );
  const fetchJson = (request: HttpClientRequest.HttpClientRequest) =>
    httpClient.execute(request).pipe(
      Effect.timeout(5_000),
      Effect.flatMap((response) =>
        response.status === 200 ? response.json : Effect.succeed(null),
      ),
      Effect.catchCause(() => Effect.succeed(null)),
    );
  const readCodex = Effect.gen(function* () {
    const files = yield* Effect.promise(() => listTranscriptFiles(codexSessionsDir, 0));
    const file = files
      .filter((entry) => entry.path.includes("/rollout-") && entry.path.endsWith(".jsonl"))
      .toSorted((left, right) => right.mtimeMs - left.mtimeMs)[0];
    if (file === undefined) return null;
    const text = yield* fileSystem
      .readFileString(file.path)
      .pipe(Effect.catchCause(() => Effect.succeed("")));
    for (const line of text.split("\n").toReversed()) {
      if (!line.includes('"rate_limits"')) continue;
      const event = yield* decodeJson(line).pipe(Effect.catchCause(() => Effect.succeed(null)));
      const payload = record(record(event)?.["payload"]);
      const parsed = parseProviderLimitResponse("codex", payload?.["rate_limits"], nowMs);
      if (parsed.windows.length > 0) return parsed;
    }
    return null;
  }).pipe(Effect.catchCause(() => Effect.succeed(null)));
  const readClaude = Effect.gen(function* () {
    const token = claudeAccessToken(yield* readJson(claudeCredentialsFile));
    if (token === null) return null;
    const payload = yield* fetchJson(
      HttpClientRequest.get("https://api.anthropic.com/api/oauth/usage").pipe(
        HttpClientRequest.setHeaders({
          Authorization: `Bearer ${token}`,
          "anthropic-beta": "oauth-2025-04-20",
        }),
      ),
    );
    const parsed = parseProviderLimitResponse("claude", payload, nowMs);
    return parsed.windows.length > 0 ? parsed : null;
  });
  const readCursor = Effect.gen(function* () {
    if (cursorCookie === null) return null;
    const payload = yield* fetchJson(
      HttpClientRequest.post(
        "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage",
      ).pipe(
        HttpClientRequest.setHeaders({
          Cookie: cursorCookie,
          "Connect-Protocol-Version": "1",
          "Content-Type": "application/json",
        }),
        HttpClientRequest.bodyJsonUnsafe({}),
      ),
    );
    const parsed = parseProviderLimitResponse("cursor", payload, nowMs);
    return parsed.windows.length > 0 ? parsed : null;
  });
  const readOpenCode = Effect.gen(function* () {
    const dataHome =
      environment["XDG_DATA_HOME"]?.trim() || path.join(homeDirectory, ".local", "share");
    const candidates = [
      path.join(dataHome, "opencode", "auth.json"),
      environment["LOCALAPPDATA"]
        ? path.join(environment["LOCALAPPDATA"], "opencode", "auth.json")
        : null,
    ].filter((file): file is string => file !== null);
    for (const file of candidates) {
      const key = openCodeKey(yield* readJson(file));
      if (key === null) continue;
      const payload = yield* fetchJson(
        HttpClientRequest.get("https://opencode.ai/zen/go/v1/usage").pipe(
          HttpClientRequest.setHeaders({ Authorization: `Bearer ${key}` }),
        ),
      );
      const parsed = parseProviderLimitResponse("opencode", payload, nowMs);
      return parsed.windows.length > 0 ? parsed : null;
    }
    return null;
  });
  const results = yield* Effect.all([readClaude, readCodex, readCursor, readOpenCode], {
    concurrency: "unbounded",
  });
  return results.filter((limit): limit is ProviderLimit => limit !== null);
});
