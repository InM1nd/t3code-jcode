import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";

import { runForkMigrations } from "../persistence/ForkMigrations.ts";
import { runMigrations } from "../persistence/Migrations.ts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import {
  TerminalSessionRegistryRepository,
  layer as TerminalSessionRegistryLive,
} from "../persistence/TerminalSessionRegistry.ts";
import {
  classifyProcessStart,
  orphanTerminateArgs,
  reconcileTerminalSessionsWithControl,
  type TerminalSessionProcessControl,
} from "./TerminalSessionReconciliation.ts";

const TestLayer = TerminalSessionRegistryLive.pipe(
  Layer.provideMerge(NodeSqliteClient.layer({ filename: ":memory:" })),
);

const layer = it.layer(TestLayer);

function makeFakeProcessControl(aliveByPid: Record<number, boolean>) {
  const alive = new Map(Object.entries(aliveByPid).map(([pid, isAlive]) => [Number(pid), isAlive]));
  const terminateCalls: Array<{ pid: number; signal: "SIGTERM" | "SIGKILL" }> = [];
  const control: TerminalSessionProcessControl = {
    currentPid: 999,
    isAlive: (pid) => alive.get(pid) ?? false,
    identify: () => "same",
    terminate: (pid, signal) => Effect.sync(() => terminateCalls.push({ pid, signal })),
  };
  return { control, terminateCalls };
}

const row = {
  threadId: "thread-1",
  terminalId: "default",
  pid: 111,
  shellCommand: "/bin/zsh",
  worktreePath: null,
  serverPid: 222,
  startedAt: "2026-01-01T00:00:00.000Z",
} as const;

layer("reconcileTerminalSessionsWithControl", (it) => {
  it.effect("leaves a row untouched when its owning server is still alive", () =>
    Effect.gen(function* () {
      yield* runMigrations();
      yield* runForkMigrations();
      const repository = yield* TerminalSessionRegistryRepository;
      yield* repository.upsert(row);

      const { control, terminateCalls } = makeFakeProcessControl({
        [row.serverPid]: true,
        [row.pid]: true,
      });

      yield* reconcileTerminalSessionsWithControl(control);

      const rows = yield* repository.list();
      assert.deepStrictEqual(rows, [row]);
      assert.deepStrictEqual(terminateCalls, []);
    }),
  );

  it.effect("drops a row without signaling when the target pid is already dead", () =>
    Effect.gen(function* () {
      yield* runMigrations();
      yield* runForkMigrations();
      const repository = yield* TerminalSessionRegistryRepository;
      yield* repository.upsert(row);

      const { control, terminateCalls } = makeFakeProcessControl({
        [row.serverPid]: false,
        [row.pid]: false,
      });

      yield* reconcileTerminalSessionsWithControl(control);

      const rows = yield* repository.list();
      assert.deepStrictEqual(rows, []);
      assert.deepStrictEqual(terminateCalls, []);
    }),
  );

  it.effect("escalates SIGTERM to SIGKILL and drops the row when the target stays alive", () =>
    Effect.gen(function* () {
      yield* runMigrations();
      yield* runForkMigrations();
      const repository = yield* TerminalSessionRegistryRepository;
      yield* repository.upsert(row);

      const { control, terminateCalls } = makeFakeProcessControl({
        [row.serverPid]: false,
        [row.pid]: true,
      });

      const fiber = yield* reconcileTerminalSessionsWithControl(control).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;
      yield* TestClock.adjust("1 second");
      yield* Fiber.join(fiber);

      const rows = yield* repository.list();
      assert.deepStrictEqual(rows, []);
      assert.deepStrictEqual(terminateCalls, [
        { pid: row.pid, signal: "SIGTERM" },
        { pid: row.pid, signal: "SIGKILL" },
      ]);
    }).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect("reaps a row whose server pid was reused by this boot", () =>
    Effect.gen(function* () {
      yield* runMigrations();
      yield* runForkMigrations();
      const repository = yield* TerminalSessionRegistryRepository;
      const reused = { ...row, serverPid: 999 };
      yield* repository.upsert(reused);

      const { control, terminateCalls } = makeFakeProcessControl({
        [reused.serverPid]: true,
        [reused.pid]: true,
      });

      const fiber = yield* reconcileTerminalSessionsWithControl(control).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;
      yield* TestClock.adjust("1 second");
      yield* Fiber.join(fiber);

      const rows = yield* repository.list();
      assert.deepStrictEqual(rows, []);
      assert.deepStrictEqual(terminateCalls, [
        { pid: reused.pid, signal: "SIGTERM" },
        { pid: reused.pid, signal: "SIGKILL" },
      ]);
    }).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect("drops a reused terminal pid without signaling its new process group", () =>
    Effect.gen(function* () {
      yield* runMigrations();
      yield* runForkMigrations();
      const repository = yield* TerminalSessionRegistryRepository;
      yield* repository.upsert(row);

      const { control, terminateCalls } = makeFakeProcessControl({
        [row.serverPid]: false,
        [row.pid]: true,
      });
      const reusedControl: TerminalSessionProcessControl = {
        ...control,
        identify: () => "reused",
      };

      yield* reconcileTerminalSessionsWithControl(reusedControl);

      const rows = yield* repository.list();
      assert.deepStrictEqual(rows, []);
      assert.deepStrictEqual(terminateCalls, []);
    }),
  );
});

it.effect("classifies a later process start as pid reuse", () =>
  Effect.sync(() => {
    assert.strictEqual(
      classifyProcessStart(Date.parse("2026-01-01T00:02:00.000Z"), "2026-01-01T00:00:00.000Z"),
      "reused",
    );
    assert.strictEqual(
      classifyProcessStart(Date.parse("2026-01-01T00:00:00.000Z"), "2026-01-01T00:00:30.000Z"),
      "same",
    );
    assert.strictEqual(classifyProcessStart(null, "2026-01-01T00:00:00.000Z"), "unknown");
    assert.deepStrictEqual(orphanTerminateArgs("linux", 111, "SIGTERM"), {
      kind: "signal-group",
      pid: -111,
      signal: "SIGTERM",
    });
    assert.deepStrictEqual(orphanTerminateArgs("win32", 111, "SIGKILL"), {
      kind: "taskkill",
      args: ["/PID", "111", "/T", "/F"],
    });
  }),
);
