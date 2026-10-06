import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";

import { repairDivergentUpstreamMigrations, runForkMigrations } from "./ForkMigrations.ts";
import { runMigrations } from "./Migrations.ts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";

const memory = Layer.mergeAll(NodeSqliteClient.layer({ filename: ":memory:" }));

it.layer(memory)("ForkMigrations healthy ledger", (it) => {
  it.effect("leaves a healthy upstream ledger alone and adds the board column", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations();
      yield* sql`
        INSERT INTO projection_projects (
          project_id,
          title,
          workspace_root,
          scripts_json,
          created_at,
          updated_at,
          default_model_selection_json
        )
        VALUES (
          'project-1',
          'Project',
          '/tmp/project',
          '[]',
          '2026-10-06T00:00:00.000Z',
          '2026-10-06T00:00:00.000Z',
          '{"model":"kept"}'
        )
      `;
      yield* sql`
        INSERT INTO orchestration_events (
          event_id,
          aggregate_kind,
          stream_id,
          stream_version,
          event_type,
          occurred_at,
          actor_kind,
          payload_json,
          metadata_json
        )
        VALUES (
          'event-1',
          'project',
          'project-1',
          1,
          'project.created',
          '2026-10-06T00:00:00.000Z',
          'user',
          '{"defaultModelSelection":{"model":"kept"}}',
          '{}'
        )
      `;

      assert.deepStrictEqual(yield* runForkMigrations(), [
        [1, "RepairDivergentUpstreamMigrations"],
        [2, "ProjectionProjectsBoardItemsColumn"],
        [3, "BoardItems"],
      ]);
      assert.deepStrictEqual(yield* runForkMigrations(), []);

      const ledger = yield* sql<{ readonly migration_id: number; readonly name: string }>`
        SELECT migration_id, name
        FROM effect_sql_migrations
        WHERE migration_id IN (41, 44)
        ORDER BY migration_id
      `;
      assert.deepStrictEqual(ledger, [
        { migration_id: 41, name: "AuthSessionClientConnection" },
        { migration_id: 44, name: "ClearAutomaticProjectModelDefaults" },
      ]);

      const [project] = yield* sql<{ readonly default_model_selection_json: string | null }>`
        SELECT default_model_selection_json
        FROM projection_projects
        WHERE project_id = 'project-1'
      `;
      assert.equal(project?.default_model_selection_json, '{"model":"kept"}');

      const columns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_projects)
      `;
      assert.equal(
        columns.some((column) => column.name === "board_items_json"),
        true,
      );
    }),
  );
});

it.layer(memory)("ForkMigrations divergent ledger", (it) => {
  it.effect("replays upstream migrations 41 and 44 when the fork ledger stole their ids", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations();
      yield* sql`ALTER TABLE auth_sessions DROP COLUMN client_surface`;
      yield* sql`ALTER TABLE auth_sessions DROP COLUMN client_app_version`;
      yield* sql`
        UPDATE effect_sql_migrations
        SET name = 'ProjectionProjectsBoardItems'
        WHERE migration_id IN (41, 44)
      `;
      yield* sql`
        INSERT INTO projection_projects (
          project_id,
          title,
          workspace_root,
          scripts_json,
          created_at,
          updated_at,
          default_model_selection_json
        )
        VALUES (
          'project-1',
          'Project',
          '/tmp/project',
          '[]',
          '2026-10-06T00:00:00.000Z',
          '2026-10-06T00:00:00.000Z',
          '{"model":"seeded"}'
        )
      `;
      yield* sql`
        INSERT INTO orchestration_events (
          event_id,
          aggregate_kind,
          stream_id,
          stream_version,
          event_type,
          occurred_at,
          actor_kind,
          payload_json,
          metadata_json
        )
        VALUES (
          'event-1',
          'project',
          'project-1',
          1,
          'project.created',
          '2026-10-06T00:00:00.000Z',
          'user',
          '{"defaultModelSelection":{"model":"seeded"}}',
          '{}'
        )
      `;

      yield* repairDivergentUpstreamMigrations;

      const sessions = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(auth_sessions)
      `;
      assert.equal(
        sessions.some((column) => column.name === "client_surface"),
        true,
      );
      assert.equal(
        sessions.some((column) => column.name === "client_app_version"),
        true,
      );

      const ledger = yield* sql<{ readonly migration_id: number; readonly name: string }>`
        SELECT migration_id, name
        FROM effect_sql_migrations
        WHERE migration_id IN (41, 44)
        ORDER BY migration_id
      `;
      assert.deepStrictEqual(ledger, [
        { migration_id: 41, name: "AuthSessionClientConnection" },
        { migration_id: 44, name: "ClearAutomaticProjectModelDefaults" },
      ]);

      const [project] = yield* sql<{ readonly default_model_selection_json: string | null }>`
        SELECT default_model_selection_json
        FROM projection_projects
        WHERE project_id = 'project-1'
      `;
      assert.equal(project?.default_model_selection_json, null);

      assert.deepStrictEqual(yield* runMigrations(), []);
      assert.deepStrictEqual(yield* runForkMigrations(), [
        [1, "RepairDivergentUpstreamMigrations"],
        [2, "ProjectionProjectsBoardItemsColumn"],
        [3, "BoardItems"],
      ]);

      const projects = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_projects)
      `;
      assert.equal(
        projects.some((column) => column.name === "board_items_json"),
        true,
      );
    }),
  );
});

it.layer(memory)("ForkMigrations board copy", (it) => {
  it.effect("copies board_items_json into fork_board_items and keeps the column", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations();
      yield* sql`
        ALTER TABLE projection_projects
        ADD COLUMN board_items_json TEXT
      `;
      yield* sql`
        INSERT INTO projection_projects (
          project_id,
          title,
          workspace_root,
          scripts_json,
          created_at,
          updated_at,
          default_model_selection_json,
          board_items_json
        )
        VALUES (
          'project-1',
          'Project',
          '/tmp/project',
          '[]',
          '2026-10-06T00:00:00.000Z',
          '2026-10-06T00:00:00.000Z',
          '{"model":"kept"}',
          ${`[{"id":"item-1","title":"Ship the board","status":"pending","source":"user","createdAt":"2026-10-06T00:00:00.000Z","updatedAt":"2026-10-06T00:00:00.000Z"}]`}
        )
      `;

      yield* runForkMigrations();

      const rows = yield* sql<{ readonly item_json: string; readonly position: number }>`
        SELECT item_json, position
        FROM fork_board_items
        WHERE project_id = 'project-1'
        ORDER BY position ASC
      `;
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.position, 0);
      assert.equal(rows[0]?.item_json.includes('"backlog"'), true);

      const [project] = yield* sql<{ readonly board_items_json: string | null }>`
        SELECT board_items_json
        FROM projection_projects
        WHERE project_id = 'project-1'
      `;
      assert.equal(project?.board_items_json?.includes('"pending"'), true);
      assert.deepStrictEqual(yield* runForkMigrations(), []);
    }),
  );
});
