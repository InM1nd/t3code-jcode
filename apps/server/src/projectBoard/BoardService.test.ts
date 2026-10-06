import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  EventId,
  ProjectBoardItemId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type ProjectBoardSnapshot,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";

import { runMigrations } from "../persistence/Migrations.ts";
import { runForkMigrations } from "../persistence/ForkMigrations.ts";
import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import * as BoardService from "./BoardService.ts";

const layer = BoardService.layer.pipe(
  Layer.provideMerge(ProjectStore.layer),
  Layer.provideMerge(NodeSqliteClient.layer({ filename: ":memory:" })),
  Layer.provideMerge(NodeServices.layer),
);

const projectId = ProjectId.make("project-1");

it.layer(layer)("BoardService", (it) => {
  it.effect("stores cards, handoffs, and live updates", () =>
    Effect.gen(function* () {
      const projects = yield* ProjectStore.ProjectStoreV2;
      const board = yield* BoardService.BoardService;
      yield* runMigrations();
      yield* runForkMigrations();
      yield* projects.apply({
        sequence: 1,
        eventId: EventId.make("event-project-1"),
        aggregateKind: "project",
        aggregateId: projectId,
        occurredAt: "2026-10-06T00:00:00.000Z",
        commandId: null,
        causationEventId: null,
        correlationId: null,
        metadata: {},
        type: "project.created",
        payload: {
          projectId,
          title: "Project",
          workspaceRoot: "/tmp/project",
          defaultModelSelection: {
            instanceId: ProviderInstanceId.make("codex"),
            model: "gpt-5.4",
          },
          scripts: [],
          createdAt: "2026-10-06T00:00:00.000Z",
          updatedAt: "2026-10-06T00:00:00.000Z",
        },
      });

      const updates = yield* Queue.unbounded<ProjectBoardSnapshot>();
      yield* Effect.forkScoped(
        board
          .subscribe(projectId)
          .pipe(Stream.runForEach((snapshot) => Queue.offer(updates, snapshot))),
      );
      const initial = yield* Queue.take(updates);
      assert.deepStrictEqual(initial.items, []);

      const itemId = ProjectBoardItemId.make("item-1");
      const created = yield* board.upsert({
        projectId,
        itemId,
        title: "Ship the board",
        status: "ready",
        source: "user",
      });
      assert.equal(created.title, "Ship the board");

      const afterCreate = yield* Queue.take(updates);
      assert.equal(afterCreate.items.length, 1);

      const handed = yield* board.appendHandoff({
        projectId,
        itemId,
        sourceThreadId: ThreadId.make("thread-1"),
        summary: "The table exists.",
        nextStep: "Open it from the panel.",
      });
      assert.equal(handed.latestHandoff?.summary, "The table exists.");
      assert.equal(handed.handoffHistory?.length, 1);

      const archived = yield* board.archive(projectId, itemId);
      assert.equal(typeof archived.archivedAt, "string");
      const restored = yield* board.restore(projectId, itemId);
      assert.equal(restored.archivedAt, null);

      yield* board.delete(projectId, itemId);
      const listed = yield* board.list(projectId);
      assert.deepStrictEqual(listed.items, []);
    }),
  );
});
