import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("044_ProjectionProjectsBoardItems", (it) => {
  it.effect("adds board items before project projections are queried", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 43 });
      yield* runMigrations({ toMigrationInclusive: 44 });

      const columns = yield* sql<{ readonly name: string; readonly notnull: number }>`
        PRAGMA table_info(projection_projects)
      `;
      const boardItems = columns.find((column) => column.name === "board_items_json");

      assert.equal(boardItems?.name, "board_items_json");
      assert.equal(boardItems?.notnull, 1);
    }),
  );
});
