/**
 * Fork schema changes live in `fork_sql_migrations`, never in
 * `effect_sql_migrations`. Upstream compares migration ids only, and this
 * fork already recorded ids 41 and 44 under the name
 * `ProjectionProjectsBoardItems`. Those rows would make a V2 startup skip
 * `041_AuthSessionClientConnection` and `044_ClearAutomaticProjectModelDefaults`.
 *
 * `repairDivergentUpstreamMigrations` runs before `runMigrations`. The upstream
 * runner warns when recorded names disagree, and it will not re-run an id it
 * has already stored, so the repair has to apply those two migrations and
 * rewrite the names first. `runForkMigrations` then records that repair and
 * adds the board column. Migration 3 copies that JSON into `fork_board_items`
 * once and leaves the column in place.
 */

import { ProjectBoardItem } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
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

export const repairDivergentUpstreamMigrations = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const ledger = yield* sql<{ readonly name: string }>`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = 'effect_sql_migrations'
  `;
  if (ledger.length === 0) {
    return;
  }

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

const copyBoardItems = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE IF NOT EXISTS fork_board_items (
      project_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      item_json TEXT NOT NULL,
      PRIMARY KEY (project_id, item_id)
    )
  `;

  const existing = yield* sql<{ readonly item_id: string }>`
    SELECT item_id FROM fork_board_items LIMIT 1
  `;
  if (existing.length > 0) {
    return;
  }

  const columns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_projects)
  `;
  if (!columns.some((column) => column.name === "board_items_json")) {
    return;
  }

  const projects = yield* sql<{
    readonly project_id: string;
    readonly board_items_json: string | null;
  }>`
    SELECT project_id, board_items_json
    FROM projection_projects
    WHERE board_items_json IS NOT NULL AND board_items_json != ''
  `;

  const decodeItems = Schema.decodeUnknownEffect(
    Schema.fromJsonString(Schema.NullOr(Schema.Array(ProjectBoardItem))),
  );
  const encodeItem = Schema.encodeUnknownEffect(Schema.fromJsonString(ProjectBoardItem));
  yield* sql.withTransaction(
    Effect.gen(function* () {
      let expected = 0;
      for (const project of projects) {
        const items = yield* decodeItems(project.board_items_json ?? "null").pipe(Effect.orDie);
        if (items === null) {
          continue;
        }
        const ids = new Set(items.map((item) => item.id));
        if (ids.size !== items.length) {
          return yield* Effect.die(
            new Error(
              `Project '${project.project_id}' has duplicate board item ids; the board was not copied.`,
            ),
          );
        }
        for (const [position, item] of items.entries()) {
          const itemJson = yield* encodeItem(item).pipe(Effect.orDie);
          yield* sql`
            INSERT INTO fork_board_items (
              project_id,
              item_id,
              position,
              updated_at,
              item_json
            )
            VALUES (
              ${project.project_id},
              ${item.id},
              ${position},
              ${item.updatedAt},
              ${itemJson}
            )
          `;
          expected += 1;
        }
      }

      const copied = yield* sql<{ readonly item_id: string }>`
        SELECT item_id FROM fork_board_items
      `;
      if (copied.length !== expected) {
        return yield* Effect.die(
          new Error(`Copied ${copied.length} board items; the snapshot had ${expected}.`),
        );
      }
    }),
  );
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
      "3_BoardItems": copyBoardItems,
    }),
    table: FORK_MIGRATIONS_TABLE,
  });
});
