import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { BOARD_WS_METHODS, ThreadId } from "@t3tools/contracts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";

import { runMigrations } from "../persistence/Migrations.ts";
import { makeMegathreadUsageRpcHandlers } from "./megathreadUsage.ts";

const layer = NodeSqliteClient.layer({ filename: ":memory:" }).pipe(
  Layer.provideMerge(NodeServices.layer),
);

it.layer(layer)("megathread usage", (it) => {
  it.effect("sums each thread's turns and counts turns without usage", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations();
      const turn = (id: string, threadId: string, ordinal: number, usage: object | null) => sql`
        INSERT INTO orchestration_v2_projection_provider_turns (
          provider_turn_id, thread_id, provider_thread_id, node_id, ordinal, status, payload_json
        ) VALUES (
          ${id}, ${threadId}, ${`provider-${threadId}`}, ${`node-${id}`}, ${ordinal}, 'completed',
          ${JSON.stringify(usage === null ? {} : { turnTokenUsage: usage })}
        )
      `;
      yield* turn("a1", "boss", 1, { inputTokens: 100, cachedInputTokens: 80, outputTokens: 10 });
      yield* turn("a2", "boss", 2, { inputTokens: 50, outputTokens: 5 });
      yield* turn("b1", "worker", 1, null);
      yield* turn("c1", "other", 1, { inputTokens: 999, outputTokens: 999 });

      const usage = makeMegathreadUsageRpcHandlers(sql)[BOARD_WS_METHODS.megathreadUsage];
      const result = yield* usage({ threadIds: [ThreadId.make("boss"), ThreadId.make("worker")] });
      assert.deepStrictEqual(
        result.threads.toSorted((left, right) => left.threadId.localeCompare(right.threadId)),
        [
          { threadId: "boss", turns: 2, inputTokens: 150, cachedInputTokens: 80, outputTokens: 15 },
          { threadId: "worker", turns: 1, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
        ],
      );
      assert.deepStrictEqual(yield* usage({ threadIds: [] }), { threads: [] });
    }),
  );
});
