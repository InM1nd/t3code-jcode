/**
 * Token totals per thread, summed from the provider turns each thread ran.
 * The Megathread workers list reads this on demand; thread shells carry no usage.
 */
import { BOARD_WS_METHODS, BoardServiceError, type ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

interface UsageRow {
  readonly threadId: ThreadId;
  readonly turns: number;
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
}

export const makeMegathreadUsageRpcHandlers = (sql: SqlClient.SqlClient) => ({
  [BOARD_WS_METHODS.megathreadUsage]: (input: { readonly threadIds: ReadonlyArray<ThreadId> }) =>
    input.threadIds.length === 0
      ? Effect.succeed({ threads: [] })
      : sql<UsageRow>`
          SELECT
            thread_id AS "threadId",
            COUNT(*) AS "turns",
            COALESCE(SUM(json_extract(payload_json, '$.turnTokenUsage.inputTokens')), 0) AS "inputTokens",
            COALESCE(SUM(json_extract(payload_json, '$.turnTokenUsage.cachedInputTokens')), 0) AS "cachedInputTokens",
            COALESCE(SUM(json_extract(payload_json, '$.turnTokenUsage.outputTokens')), 0) AS "outputTokens"
          FROM orchestration_v2_projection_provider_turns
          WHERE thread_id IN ${sql.in(input.threadIds)}
          GROUP BY thread_id
        `.pipe(
          Effect.map((threads) => ({ threads })),
          Effect.mapError(() => new BoardServiceError({ message: "Could not read token usage." })),
        ),
});
