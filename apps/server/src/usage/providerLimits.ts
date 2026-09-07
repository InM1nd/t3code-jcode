// @effect-diagnostics nodeBuiltinImport:off - a one-shot sync `security` read of the macOS keychain, not a managed subprocess.
import * as NodeChildProcess from "node:child_process";
import * as NodeOS from "node:os";

import type { ProviderLimit, ProviderLimitProvider } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";

import { listTranscriptFiles } from "./usageTranscriptReader.ts";

export type ProviderLimitKind = ProviderLimitProvider;
export type ProviderLimitResponse = ProviderLimit;
type ProviderLimitUnavailableStatus = Exclude<NonNullable<ProviderLimit["status"]>, "ok">;

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
  if (typeof value !== "string") return null;
  const parsed = DateTime.make(value);
  return Option.isSome(parsed) ? DateTime.formatIso(parsed.value) : null;
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

function nowIso(nowMs: number): string {
  return DateTime.formatIso(DateTime.makeUnsafe(nowMs));
}

function unavailable(
  provider: ProviderLimitKind,
  status: ProviderLimitUnavailableStatus,
  message: string,
  lastUpdatedAt: string | null = null,
  previousWindows: ProviderLimitResponse["windows"] = [],
): ProviderLimitResponse {
  return {
    provider,
    status,
    windows: previousWindows,
    lastUpdatedAt,
    message,
  };
}

function successful(parsed: ProviderLimitResponse, nowMs: number): ProviderLimitResponse {
  return {
    ...parsed,
    status: "ok",
    lastUpdatedAt: nowIso(nowMs),
    message: null,
  };
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

/**
 * Claude Code stores its OAuth credentials in the macOS login keychain, not
 * `~/.claude/.credentials.json` (see the same note in `ClaudeHome.ts`), so
 * the file read above always misses on macOS. Read the same keychain entry
 * the CLI itself uses.
 */
function claudeAccessTokenFromMacKeychain(): string | null {
  try {
    const raw = NodeChildProcess.execFileSync(
      "security",
      [
        "find-generic-password",
        "-a",
        NodeOS.userInfo().username,
        "-s",
        "Claude Code-credentials",
        "-w",
      ],
      { encoding: "utf8", timeout: 5_000 },
    );
    return claudeAccessToken(JSON.parse(raw));
  } catch {
    return null;
  }
}

function openCodeKey(credentials: unknown): string | null {
  return nonEmptyString(record(record(credentials)?.["opencode"])?.["key"]);
}

export const readProviderLimits = Effect.fn("readProviderLimits")(function* ({
  claudeCredentialsFile,
  codexSessionsDir,
  cursorAccessToken,
  environment,
  homeDirectory,
  platform,
  previousLimits,
}: {
  readonly claudeCredentialsFile: string;
  readonly codexSessionsDir: string;
  readonly cursorAccessToken: string | null;
  readonly environment: Record<string, string | undefined>;
  readonly homeDirectory: string;
  readonly platform: NodeJS.Platform;
  readonly previousLimits?: ReadonlyMap<ProviderLimitProvider, ProviderLimit>;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const httpClient = yield* HttpClient.HttpClient;
  const nowMs = yield* Clock.currentTimeMillis;
  type JsonReadResult =
    | { readonly status: "ok"; readonly value: unknown }
    | { readonly status: "missing" | "failed"; readonly value: null };
  const readJson = (file: string): Effect.Effect<JsonReadResult> =>
    Effect.gen(function* () {
      const exists = yield* Effect.result(fileSystem.exists(file));
      if (exists._tag === "Failure") return { status: "failed", value: null };
      if (!exists.success) return { status: "missing", value: null };
      const contents = yield* Effect.result(
        fileSystem.readFileString(file).pipe(Effect.flatMap(decodeJson)),
      );
      return contents._tag === "Failure"
        ? { status: "failed", value: null }
        : { status: "ok", value: contents.success };
    });
  type FetchResult =
    | { readonly status: "ok"; readonly payload: unknown }
    | {
        readonly status: ProviderLimitUnavailableStatus;
        readonly message: string;
      };
  const fetchJson = (request: HttpClientRequest.HttpClientRequest) =>
    httpClient.execute(request).pipe(
      Effect.timeout(5_000),
      Effect.flatMap((response) =>
        response.status === 200
          ? response.json.pipe(Effect.map((payload) => ({ status: "ok", payload }) as const))
          : Effect.succeed<FetchResult>({
              status:
                response.status === 401 || response.status === 403
                  ? "auth-required"
                  : response.status === 404 || response.status === 405
                    ? "unsupported"
                    : "temporary-error",
              message:
                response.status === 401 || response.status === 403
                  ? "Sign in to the provider to view usage limits."
                  : response.status === 404 || response.status === 405
                    ? "This provider does not expose usage limits."
                    : "The provider limit service could not be reached.",
            }),
      ),
      Effect.catchCause(
        (): Effect.Effect<FetchResult> =>
          Effect.succeed({
            status: "temporary-error",
            message: "The provider limit service could not be reached.",
          }),
      ),
    );
  const readCodex = Effect.gen(function* () {
    const filesResult = yield* Effect.result(
      Effect.promise(() => listTranscriptFiles(codexSessionsDir, 0)),
    );
    if (filesResult._tag === "Failure") {
      return unavailable("codex", "temporary-error", "Codex limit history could not be read.");
    }
    const files = filesResult.success;
    const file = files
      .filter((entry) => {
        const name = path.basename(entry.path);
        return name.startsWith("rollout-") && name.endsWith(".jsonl");
      })
      .toSorted((left, right) => right.mtimeMs - left.mtimeMs)[0];
    if (file === undefined) {
      return unavailable("codex", "temporary-error", "No recent Codex limit report was found.");
    }
    const textResult = yield* Effect.result(fileSystem.readFileString(file.path));
    if (textResult._tag === "Failure") {
      return unavailable("codex", "temporary-error", "Codex limit history could not be read.");
    }
    const text = textResult.success;
    for (const line of text.split("\n").toReversed()) {
      if (!line.includes('"rate_limits"')) continue;
      const event = yield* decodeJson(line).pipe(Effect.catchCause(() => Effect.succeed(null)));
      const payload = record(record(event)?.["payload"]);
      const parsed = parseProviderLimitResponse("codex", payload?.["rate_limits"], nowMs);
      if (parsed.windows.length > 0) return successful(parsed, nowMs);
    }
    return unavailable("codex", "temporary-error", "No recent Codex limit report was found.");
  });
  const readClaude = Effect.gen(function* () {
    const credentials = yield* readJson(claudeCredentialsFile);
    const token =
      claudeAccessToken(credentials.value) ??
      (platform === "darwin" ? claudeAccessTokenFromMacKeychain() : null);
    if (token === null) {
      return credentials.status === "failed"
        ? unavailable("claude", "temporary-error", "Claude credentials could not be read.")
        : unavailable("claude", "auth-required", "Sign in to Claude Code to view usage limits.");
    }
    const result = yield* fetchJson(
      HttpClientRequest.get("https://api.anthropic.com/api/oauth/usage").pipe(
        HttpClientRequest.setHeaders({
          Authorization: `Bearer ${token}`,
          "anthropic-beta": "oauth-2025-04-20",
        }),
      ),
    );
    if (result.status !== "ok") {
      return unavailable("claude", result.status, result.message);
    }
    const parsed = parseProviderLimitResponse("claude", result.payload, nowMs);
    return parsed.windows.length > 0
      ? successful(parsed, nowMs)
      : unavailable("claude", "temporary-error", "Claude returned no usage limit data.");
  });
  const readCursor = Effect.gen(function* () {
    if (cursorAccessToken === null) {
      return unavailable("cursor", "auth-required", "Sign in to Cursor to view usage limits.");
    }
    // The dashboard *website* takes the WorkOS session cookie, but this
    // Connect-RPC backend now rejects it (401 unauthenticated) and only
    // accepts the raw OAuth token as a Bearer credential.
    const result = yield* fetchJson(
      HttpClientRequest.post(
        "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage",
      ).pipe(
        HttpClientRequest.setHeaders({
          Authorization: `Bearer ${cursorAccessToken}`,
          "Connect-Protocol-Version": "1",
          "Content-Type": "application/json",
        }),
        HttpClientRequest.bodyJsonUnsafe({}),
      ),
    );
    if (result.status !== "ok") {
      return unavailable("cursor", result.status, result.message);
    }
    const parsed = parseProviderLimitResponse("cursor", result.payload, nowMs);
    return parsed.windows.length > 0
      ? successful(parsed, nowMs)
      : unavailable("cursor", "temporary-error", "Cursor returned no usage limit data.");
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
    let credentialsFailed = false;
    for (const file of candidates) {
      const credentials = yield* readJson(file);
      const key = openCodeKey(credentials.value);
      credentialsFailed ||= credentials.status === "failed";
      if (key === null) continue;
      const result = yield* fetchJson(
        HttpClientRequest.get("https://opencode.ai/zen/go/v1/usage").pipe(
          HttpClientRequest.setHeaders({ Authorization: `Bearer ${key}` }),
        ),
      );
      if (result.status !== "ok") {
        return unavailable("opencode", result.status, result.message);
      }
      const parsed = parseProviderLimitResponse("opencode", result.payload, nowMs);
      return parsed.windows.length > 0
        ? successful(parsed, nowMs)
        : unavailable("opencode", "temporary-error", "OpenCode returned no usage limit data.");
    }
    return credentialsFailed
      ? unavailable("opencode", "temporary-error", "OpenCode usage limits could not be read.")
      : unavailable("opencode", "auth-required", "Sign in to OpenCode to view usage limits.");
  });
  const results = yield* Effect.all([readClaude, readCodex, readCursor, readOpenCode], {
    concurrency: "unbounded",
  });
  return results.map((limit) => {
    if (limit.status === "ok") return limit;
    const previous = previousLimits?.get(limit.provider);
    return previous === undefined || previous.windows.length === 0
      ? limit
      : { ...limit, windows: previous.windows, lastUpdatedAt: previous.lastUpdatedAt ?? null };
  });
});
