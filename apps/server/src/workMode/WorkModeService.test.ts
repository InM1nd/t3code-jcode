import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";

import { runForkMigrations } from "../persistence/ForkMigrations.ts";
import { runMigrations } from "../persistence/Migrations.ts";
import * as WorkModeService from "./WorkModeService.ts";

const layer = WorkModeService.layer.pipe(
  Layer.provideMerge(NodeSqliteClient.layer({ filename: ":memory:" })),
  Layer.provideMerge(NodeServices.layer),
);

const threadId = ThreadId.make("thread-1");

it.effect("stores a mode for the thread and leaves unknown threads empty", () =>
  Effect.gen(function* () {
    const workModes = yield* WorkModeService.WorkModeService;
    yield* runMigrations();
    yield* runForkMigrations();

    assert.strictEqual(yield* workModes.get(threadId), null);
    assert.strictEqual(yield* WorkModeService.turnWorkMode(threadId), null);

    yield* workModes.set(threadId, "debug");
    assert.strictEqual(yield* workModes.get(threadId), "debug");
    assert.strictEqual(yield* WorkModeService.turnWorkMode(threadId), "debug");

    yield* workModes.set(threadId, "build");
    assert.strictEqual(yield* workModes.get(threadId), "build");
  }).pipe(Effect.provide(layer)),
);
