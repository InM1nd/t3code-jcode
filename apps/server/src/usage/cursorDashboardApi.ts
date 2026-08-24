/**
 * Client for Cursor's dashboard usage API.
 *
 * This endpoint is not a published, versioned API — it is what
 * `cursor.com/dashboard` itself calls, authenticated with the editor's own
 * session cookie. It can change or disappear without notice; callers treat
 * every failure as "this source is unavailable right now", never as a reason
 * to fail the whole usage scan.
 *
 * @module usage/cursorDashboardApi
 */
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";

import type { CursorSession } from "./cursorSession.ts";

const DASHBOARD_URL = "https://cursor.com/api/dashboard/get-filtered-usage-events";
const PAGE_SIZE = 200;
const REQUEST_TIMEOUT_MS = 15_000;
/**
 * Guards against an API change (or a bug here) hanging the usage page: at
 * `REQUEST_TIMEOUT_MS` per page this bounds one Cursor fetch to a few
 * minutes, worst case. 50 pages is already 10k events, far past what a
 * 90-day window realistically holds.
 */
const MAX_PAGES = 50;

export interface CursorUsageEvent {
  readonly timestampMs: number;
  readonly model: string;
  readonly conversationId: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly chargedCents: number;
}

export class CursorDashboardApiError extends Schema.TaggedErrorClass<CursorDashboardApiError>()(
  "CursorDashboardApiError",
  {
    reason: Schema.Literals(["unauthorized", "requestFailed"]),
  },
) {
  override get message(): string {
    return this.reason === "unauthorized"
      ? "Cursor rejected the stored session."
      : "Cursor's usage API request failed.";
  }
}

function int(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
}

/** `chargedCents` carries sub-cent precision (e.g. `5.4092`); truncating it like a token count loses that. */
function float(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * The API has been observed with usage numbers both flat on the event and
 * nested under a `tokenUsage` object; this reads whichever the response
 * actually carries rather than betting on one shape.
 */
function parseEvent(raw: unknown): CursorUsageEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const nested =
    typeof record["tokenUsage"] === "object" && record["tokenUsage"] !== null
      ? (record["tokenUsage"] as Record<string, unknown>)
      : null;
  const field = (key: string): unknown => record[key] ?? nested?.[key];

  // Observed as a string holding an epoch-millisecond number (e.g.
  // `"1786984123427"`), not an ISO timestamp; `Date.parse` on a bare digit
  // string returns `NaN`, so the numeric string is read directly first.
  const timestamp = record["timestamp"];
  let timestampMs = Number.NaN;
  if (typeof timestamp === "number") {
    timestampMs = timestamp;
  } else if (typeof timestamp === "string") {
    const asEpoch = Number(timestamp);
    timestampMs =
      timestamp.trim().length > 0 && Number.isFinite(asEpoch) ? asEpoch : Date.parse(timestamp);
  }
  if (!Number.isFinite(timestampMs)) return null;

  const model = typeof record["model"] === "string" ? record["model"] : "";
  const conversationId =
    typeof record["conversationId"] === "string" ? record["conversationId"] : "";
  if (model.length === 0 || conversationId.length === 0) return null;

  return {
    timestampMs,
    model,
    conversationId,
    inputTokens: int(field("inputTokens")),
    outputTokens: int(field("outputTokens")),
    cacheReadTokens: int(field("cacheReadTokens")),
    cacheWriteTokens: int(field("cacheWriteTokens")),
    chargedCents: float(record["chargedCents"]),
  };
}

/**
 * Fetches every usage event in `[startDateMs, endDateMs]`, paginating until
 * the API's own `totalUsageEventsCount` is satisfied.
 */
export const fetchCursorUsageEvents = Effect.fn("fetchCursorUsageEvents")(function* (
  session: CursorSession,
  startDateMs: number,
  endDateMs: number,
): Effect.fn.Return<readonly CursorUsageEvent[], CursorDashboardApiError, HttpClient.HttpClient> {
  const httpClient = yield* HttpClient.HttpClient;
  const events: CursorUsageEvent[] = [];
  let page = 1;
  let totalCount = Number.POSITIVE_INFINITY;

  while (events.length < totalCount && page <= MAX_PAGES) {
    const request = HttpClientRequest.post(DASHBOARD_URL).pipe(
      HttpClientRequest.setHeaders({
        Cookie: session.cookie,
        Origin: "https://cursor.com",
      }),
      HttpClientRequest.bodyJsonUnsafe({
        startDate: String(startDateMs),
        endDate: String(endDateMs),
        page,
        pageSize: PAGE_SIZE,
      }),
    );

    const response = yield* httpClient.execute(request).pipe(
      Effect.timeout(REQUEST_TIMEOUT_MS),
      Effect.mapError(() => new CursorDashboardApiError({ reason: "requestFailed" })),
    );

    if (response.status === 401 || response.status === 403) {
      return yield* new CursorDashboardApiError({ reason: "unauthorized" });
    }

    const body = yield* response.pipe(
      HttpClientResponse.filterStatusOk,
      Effect.flatMap((ok) => ok.json),
      Effect.mapError(() => new CursorDashboardApiError({ reason: "requestFailed" })),
    );
    if (typeof body !== "object" || body === null) {
      return yield* new CursorDashboardApiError({ reason: "requestFailed" });
    }
    const payload = body as Record<string, unknown>;
    const rawEventsField = payload["usageEventsDisplay"];
    // A missing or non-array `usageEventsDisplay` means the response shape
    // changed, not that this page happened to be empty: treating it as `[]`
    // would report `status: "ok"` with zero events, indistinguishable from a
    // genuinely quiet account.
    if (!Array.isArray(rawEventsField)) {
      return yield* new CursorDashboardApiError({ reason: "requestFailed" });
    }
    const rawEvents = rawEventsField;
    for (const rawEvent of rawEvents) {
      const parsed = parseEvent(rawEvent);
      if (parsed !== null) events.push(parsed);
    }

    const reportedTotal = payload["totalUsageEventsCount"];
    totalCount = typeof reportedTotal === "number" ? reportedTotal : events.length;

    // An empty page with no total to chase is the end of the data, whatever
    // `totalCount` claims.
    if (rawEvents.length === 0) break;
    page += 1;
  }

  return events;
});
