import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { runMigrations } from "./Migrations.ts";
import * as NodeSqliteClient from "./NodeSqliteClient.ts";
import {
  TerminalSessionRegistryRepository,
  layer as TerminalSessionRegistryLive,
} from "./TerminalSessionRegistry.ts";

const TestLayer = TerminalSessionRegistryLive.pipe(
  Layer.provideMerge(NodeSqliteClient.layerMemory()),
);

const layer = it.layer(TestLayer);

const row = {
  threadId: "thread-1",
  terminalId: "default",
  pid: 4242,
  shellCommand: "/bin/zsh",
  worktreePath: "/tmp/worktree",
  serverPid: 9999,
  startedAt: "2026-01-01T00:00:00.000Z",
} as const;

layer("TerminalSessionRegistryRepository", (it) => {
  it.effect("upsert then list round-trips a row", () =>
    Effect.gen(function* () {
      yield* runMigrations();
      const repository = yield* TerminalSessionRegistryRepository;

      yield* repository.upsert(row);
      const rows = yield* repository.list();

      assert.deepStrictEqual(rows, [row]);
    }),
  );

  it.effect("upsert replaces an existing row for the same key", () =>
    Effect.gen(function* () {
      yield* runMigrations();
      const repository = yield* TerminalSessionRegistryRepository;

      yield* repository.upsert(row);
      yield* repository.upsert({ ...row, pid: 5555 });
      const rows = yield* repository.list();

      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0]?.pid, 5555);
    }),
  );

  it.effect("removeByKey deletes the row", () =>
    Effect.gen(function* () {
      yield* runMigrations();
      const repository = yield* TerminalSessionRegistryRepository;

      yield* repository.upsert(row);
      yield* repository.removeByKey({ threadId: row.threadId, terminalId: row.terminalId });
      const rows = yield* repository.list();

      assert.deepStrictEqual(rows, []);
    }),
  );

  it.effect("removeByKey on a missing row is a no-op", () =>
    Effect.gen(function* () {
      yield* runMigrations();
      const repository = yield* TerminalSessionRegistryRepository;

      yield* repository.removeByKey({ threadId: "missing", terminalId: "default" });
      const rows = yield* repository.list();

      assert.deepStrictEqual(rows, []);
    }),
  );

  it.effect("list is empty when no rows have been written", () =>
    Effect.gen(function* () {
      yield* runMigrations();
      const repository = yield* TerminalSessionRegistryRepository;

      const rows = yield* repository.list();

      assert.deepStrictEqual(rows, []);
      assert.strictEqual(Option.isNone(Option.fromNullishOr(rows[0])), true);
    }),
  );
});
