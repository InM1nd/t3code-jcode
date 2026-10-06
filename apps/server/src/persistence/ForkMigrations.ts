/**
 * Fork schema changes live in `fork_sql_migrations`, never in
 * `effect_sql_migrations`. Upstream compares migration ids only, and this
 * fork already recorded ids 41 and 44 under the name
 * `ProjectionProjectsBoardItems`. Those rows would make a V2 startup skip
 * `041_AuthSessionClientConnection` and `044_ClearAutomaticProjectModelDefaults`.
 *
 * Run this once, immediately after `runMigrations`.
 */

import * as Effect from "effect/Effect";
import * as Migrator from "effect/sql/Migrator";
import * as SqlClient from "effect/sql/SqlClient";

import Migration0041 from "./Migrations/041_AuthSessionClientConnection.ts";
import Migration0044 from "./Migrations/044_ClearAutomaticProjectModelDefaults.ts";

const FORK_MIGRATIONS_TABLE = "fork_sql_migrations";
const DIVERGENT_UPSTREAM_NAME = "ProjectionProjectsBoardItems";

const divergentUpstreamRepairs = [
  {
    id: 41,
    name: "AuthSessionClientConnection",
    migration: Migration0041,
  },
  {
    id: 44,
    name: "ClearAutomaticProjectModelDefaults",
    migration: Migration0044,
  },
] as const;

const repairDivergentUpstreamMigrations = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const recorded = yield* sql<{ readonly migration_id: number; readonly name: string }>`
    SELECT migration_id, name
    FROM effect_sql_migrations
    WHERE migration_id IN (41, 44)
  `;

  for (const repair of divergentUpstreamRepairs) {
    const row = recorded.find((entry) => entry.migration_id === repair.id);
    if (row?.name !== DIVERGENT_UPSTREAM_NAME) {
      continue;
    }

    yield* repair.migration;
    yield* sql`
      UPDATE effect_sql_migrations
      SET name = ${repair.name}
      WHERE migration_id = ${repair.id}
        AND name = ${DIVERGENT_UPSTREAM_NAME}
    `;
  }
});

const addProjectBoardItemsColumn = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_projects)
  `;

  if (!columns.some((column) => column.name === "board_items_json")) {
    yield* sql`
      ALTER TABLE projection_projects
      ADD COLUMN board_items_json TEXT
    `;
  }
});

const run = Migrator.make({});

export const runForkMigrations = Effect.fn("runForkMigrations")(function* () {
  return yield* run({
    loader: Migrator.fromRecord({
      "1_RepairDivergentUpstreamMigrations": repairDivergentUpstreamMigrations,
      "2_ProjectionProjectsBoardItemsColumn": addProjectBoardItemsColumn,
    }),
    table: FORK_MIGRATIONS_TABLE,
  });
});
