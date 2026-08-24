import {
  CommandId,
  EventId,
  PROJECT_BOARD_ITEM_LIMIT,
  ProjectBoardItemId,
  ProjectId,
  TurnId,
} from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";

import { decideOrchestrationCommand } from "./decider.ts";
import { createEmptyReadModel, projectEvent } from "./projector.ts";

const asEventId = (value: string): EventId => EventId.make(value);
const asProjectId = (value: string): ProjectId => ProjectId.make(value);
const asItemId = (value: string): ProjectBoardItemId => ProjectBoardItemId.make(value);

function createProjectEvent(input: {
  readonly sequence: number;
  readonly projectId: ProjectId;
  readonly now: string;
}) {
  return {
    sequence: input.sequence,
    eventId: asEventId(`evt-project-create-${input.sequence}`),
    aggregateKind: "project" as const,
    aggregateId: input.projectId,
    type: "project.created" as const,
    occurredAt: input.now,
    commandId: CommandId.make(`cmd-project-create-${input.sequence}`),
    causationEventId: null,
    correlationId: CommandId.make(`cmd-project-create-${input.sequence}`),
    metadata: {},
    payload: {
      projectId: input.projectId,
      title: "Board",
      workspaceRoot: "/tmp/board",
      defaultModelSelection: null,
      scripts: [],
      createdAt: input.now,
      updatedAt: input.now,
    },
  };
}

it.layer(NodeServices.layer)("decider project board", (it) => {
  it.effect("upserts a new board item", () =>
    Effect.gen(function* () {
      const now = "2026-01-01T00:00:00.000Z";
      const projectId = asProjectId("project-board");
      const readModel = yield* projectEvent(
        createEmptyReadModel(now),
        createProjectEvent({ sequence: 1, projectId, now }),
      );

      const result = yield* decideOrchestrationCommand({
        command: {
          type: "project.board.item.upsert",
          commandId: CommandId.make("cmd-board-upsert"),
          projectId,
          itemId: asItemId("item-1"),
          title: "Ship board",
          status: "backlog",
          source: "user",
        },
        readModel,
      });

      const event = Array.isArray(result) ? result[0] : result;
      expect(event?.type).toBe("project.board-item-upserted");
      if (event?.type !== "project.board-item-upserted") {
        throw new Error("expected board upsert event");
      }
      expect(event.payload.item.title).toBe("Ship board");
      expect(event.payload.item.status).toBe("backlog");
      expect(event.payload.item.source).toBe("user");

      const next = yield* projectEvent(readModel, event);
      expect(next.projects[0]?.boardItems).toEqual([event.payload.item]);
    }),
  );

  it.effect("updates an existing board item in place", () =>
    Effect.gen(function* () {
      const now = "2026-01-01T00:00:00.000Z";
      const projectId = asProjectId("project-board-update");
      let readModel = yield* projectEvent(
        createEmptyReadModel(now),
        createProjectEvent({ sequence: 1, projectId, now }),
      );

      const created = yield* decideOrchestrationCommand({
        command: {
          type: "project.board.item.upsert",
          commandId: CommandId.make("cmd-board-create"),
          projectId,
          itemId: asItemId("item-1"),
          title: "Draft",
          status: "backlog",
        },
        readModel,
      });
      const createdEvent = Array.isArray(created) ? created[0] : created;
      if (!createdEvent || createdEvent.type !== "project.board-item-upserted") {
        throw new Error("expected create event");
      }
      readModel = yield* projectEvent(readModel, createdEvent);

      const updated = yield* decideOrchestrationCommand({
        command: {
          type: "project.board.item.upsert",
          commandId: CommandId.make("cmd-board-complete"),
          projectId,
          itemId: asItemId("item-1"),
          title: "Draft",
          status: "completed",
        },
        readModel,
      });
      const updatedEvent = Array.isArray(updated) ? updated[0] : updated;
      if (!updatedEvent || updatedEvent.type !== "project.board-item-upserted") {
        throw new Error("expected update event");
      }
      readModel = yield* projectEvent(readModel, updatedEvent);

      expect(readModel.projects[0]?.boardItems).toHaveLength(1);
      expect(readModel.projects[0]?.boardItems?.[0]?.status).toBe("completed");
      expect(readModel.projects[0]?.boardItems?.[0]?.createdAt).toBe(
        createdEvent.payload.item.createdAt,
      );
    }),
  );

  it.effect("preserves area across an update that omits it, and clears it when set to null", () =>
    Effect.gen(function* () {
      const now = "2026-01-01T00:00:00.000Z";
      const projectId = asProjectId("project-board-area");
      let readModel = yield* projectEvent(
        createEmptyReadModel(now),
        createProjectEvent({ sequence: 1, projectId, now }),
      );

      const created = yield* decideOrchestrationCommand({
        command: {
          type: "project.board.item.upsert",
          commandId: CommandId.make("cmd-board-area-create"),
          projectId,
          itemId: asItemId("item-1"),
          title: "SEO card",
          status: "backlog",
          area: "seo",
        },
        readModel,
      });
      const createdEvent = Array.isArray(created) ? created[0] : created;
      if (!createdEvent || createdEvent.type !== "project.board-item-upserted") {
        throw new Error("expected create event");
      }
      expect(createdEvent.payload.item.area).toBe("seo");
      readModel = yield* projectEvent(readModel, createdEvent);

      const statusOnly = yield* decideOrchestrationCommand({
        command: {
          type: "project.board.item.upsert",
          commandId: CommandId.make("cmd-board-area-status"),
          projectId,
          itemId: asItemId("item-1"),
          title: "SEO card",
          status: "ready",
        },
        readModel,
      });
      const statusOnlyEvent = Array.isArray(statusOnly) ? statusOnly[0] : statusOnly;
      if (!statusOnlyEvent || statusOnlyEvent.type !== "project.board-item-upserted") {
        throw new Error("expected status-only update event");
      }
      // area was omitted, not nulled, so it must carry forward unchanged.
      expect(statusOnlyEvent.payload.item.area).toBe("seo");
      readModel = yield* projectEvent(readModel, statusOnlyEvent);

      const cleared = yield* decideOrchestrationCommand({
        command: {
          type: "project.board.item.upsert",
          commandId: CommandId.make("cmd-board-area-clear"),
          projectId,
          itemId: asItemId("item-1"),
          title: "SEO card",
          status: "ready",
          area: null,
        },
        readModel,
      });
      const clearedEvent = Array.isArray(cleared) ? cleared[0] : cleared;
      if (!clearedEvent || clearedEvent.type !== "project.board-item-upserted") {
        throw new Error("expected clear event");
      }
      expect(clearedEvent.payload.item.area).toBeNull();
    }),
  );

  it.effect("archives and restores a board item without changing its status", () =>
    Effect.gen(function* () {
      const now = "2026-01-01T00:00:00.000Z";
      const projectId = asProjectId("project-board-archive");
      const itemId = asItemId("item-archive");
      let readModel = yield* projectEvent(
        createEmptyReadModel(now),
        createProjectEvent({ sequence: 1, projectId, now }),
      );
      const created = yield* decideOrchestrationCommand({
        command: {
          type: "project.board.item.upsert",
          commandId: CommandId.make("cmd-board-create-archive"),
          projectId,
          itemId,
          title: "Needs review",
          status: "blocked",
        },
        readModel,
      });
      const createdEvent = Array.isArray(created) ? created[0] : created;
      if (!createdEvent) throw new Error("missing create");
      readModel = yield* projectEvent(readModel, createdEvent);

      const archived = yield* decideOrchestrationCommand({
        command: {
          type: "project.board.item.archive",
          commandId: CommandId.make("cmd-board-archive"),
          projectId,
          itemId,
        },
        readModel,
      });
      const archivedEvent = Array.isArray(archived) ? archived[0] : archived;
      expect(archivedEvent?.type).toBe("project.board.item.archived");
      if (!archivedEvent) throw new Error("missing archive");
      readModel = yield* projectEvent(readModel, archivedEvent);
      expect(readModel.projects[0]?.boardItems?.[0]).toMatchObject({
        status: "blocked",
        archivedAt: expect.any(String),
      });

      const updated = yield* decideOrchestrationCommand({
        command: {
          type: "project.board.item.upsert",
          commandId: CommandId.make("cmd-board-update-archived"),
          projectId,
          itemId,
          title: "Ready for review",
          status: "inReview",
        },
        readModel,
      });
      const updatedEvent = Array.isArray(updated) ? updated[0] : updated;
      if (!updatedEvent) throw new Error("missing update");
      readModel = yield* projectEvent(readModel, updatedEvent);
      expect(readModel.projects[0]?.boardItems?.[0]?.archivedAt).toBe(
        archivedEvent.payload.archivedAt,
      );

      const restored = yield* decideOrchestrationCommand({
        command: {
          type: "project.board.item.restore",
          commandId: CommandId.make("cmd-board-restore"),
          projectId,
          itemId,
        },
        readModel,
      });
      const restoredEvent = Array.isArray(restored) ? restored[0] : restored;
      expect(restoredEvent?.type).toBe("project.board.item.restored");
      if (!restoredEvent) throw new Error("missing restore");
      readModel = yield* projectEvent(readModel, restoredEvent);
      expect(readModel.projects[0]?.boardItems?.[0]).toMatchObject({
        status: "inReview",
        archivedAt: null,
      });
    }),
  );

  it.effect("deletes a board item", () =>
    Effect.gen(function* () {
      const now = "2026-01-01T00:00:00.000Z";
      const projectId = asProjectId("project-board-delete");
      let readModel = yield* projectEvent(
        createEmptyReadModel(now),
        createProjectEvent({ sequence: 1, projectId, now }),
      );

      const created = yield* decideOrchestrationCommand({
        command: {
          type: "project.board.item.upsert",
          commandId: CommandId.make("cmd-board-create-delete"),
          projectId,
          itemId: asItemId("item-1"),
          title: "Temporary",
          status: "backlog",
        },
        readModel,
      });
      const createdEvent = Array.isArray(created) ? created[0] : created;
      if (!createdEvent) throw new Error("missing create");
      readModel = yield* projectEvent(readModel, createdEvent);

      const deleted = yield* decideOrchestrationCommand({
        command: {
          type: "project.board.item.delete",
          commandId: CommandId.make("cmd-board-delete"),
          projectId,
          itemId: asItemId("item-1"),
        },
        readModel,
      });
      const deletedEvent = Array.isArray(deleted) ? deleted[0] : deleted;
      expect(deletedEvent?.type).toBe("project.board-item-deleted");
      if (!deletedEvent) throw new Error("missing delete");
      readModel = yield* projectEvent(readModel, deletedEvent);
      expect(readModel.projects[0]?.boardItems).toEqual([]);
    }),
  );

  it.effect("rejects delete of a missing board item", () =>
    Effect.gen(function* () {
      const now = "2026-01-01T00:00:00.000Z";
      const projectId = asProjectId("project-board-missing");
      const readModel = yield* projectEvent(
        createEmptyReadModel(now),
        createProjectEvent({ sequence: 1, projectId, now }),
      );

      const error = yield* decideOrchestrationCommand({
        command: {
          type: "project.board.item.delete",
          commandId: CommandId.make("cmd-board-delete-missing"),
          projectId,
          itemId: asItemId("missing"),
        },
        readModel,
      }).pipe(Effect.flip);

      expect(error._tag).toBe("OrchestrationCommandInvariantError");
    }),
  );

  it.effect("appends linkTurnId onto a board item", () =>
    Effect.gen(function* () {
      const now = "2026-01-01T00:00:00.000Z";
      const projectId = asProjectId("project-board-link-turn");
      let readModel = yield* projectEvent(
        createEmptyReadModel(now),
        createProjectEvent({ sequence: 1, projectId, now }),
      );

      const created = yield* decideOrchestrationCommand({
        command: {
          type: "project.board.item.upsert",
          commandId: CommandId.make("cmd-board-create-link"),
          projectId,
          itemId: asItemId("item-1"),
          title: "Linked work",
          status: "inProgress",
        },
        readModel,
      });
      const createdEvent = Array.isArray(created) ? created[0] : created;
      if (!createdEvent || createdEvent.type !== "project.board-item-upserted") {
        throw new Error("expected create event");
      }
      readModel = yield* projectEvent(readModel, createdEvent);

      const linked = yield* decideOrchestrationCommand({
        command: {
          type: "project.board.item.upsert",
          commandId: CommandId.make("cmd-board-link"),
          projectId,
          itemId: asItemId("item-1"),
          title: "Linked work",
          status: "inProgress",
          linkTurnId: TurnId.make("turn-1"),
        },
        readModel,
      });
      const linkedEvent = Array.isArray(linked) ? linked[0] : linked;
      if (!linkedEvent || linkedEvent.type !== "project.board-item-upserted") {
        throw new Error("expected link event");
      }
      expect(linkedEvent.payload.item.linkedTurnIds).toEqual([TurnId.make("turn-1")]);
    }),
  );

  it.effect("enforces the board item limit on create", () =>
    Effect.gen(function* () {
      const now = "2026-01-01T00:00:00.000Z";
      const projectId = asProjectId("project-board-limit");
      let readModel = yield* projectEvent(
        createEmptyReadModel(now),
        createProjectEvent({ sequence: 1, projectId, now }),
      );

      for (let index = 0; index < PROJECT_BOARD_ITEM_LIMIT; index += 1) {
        const created = yield* decideOrchestrationCommand({
          command: {
            type: "project.board.item.upsert",
            commandId: CommandId.make(`cmd-board-fill-${index}`),
            projectId,
            itemId: asItemId(`item-${index}`),
            title: `Item ${index}`,
            status: "backlog",
          },
          readModel,
        });
        const event = Array.isArray(created) ? created[0] : created;
        if (!event) throw new Error("missing fill event");
        readModel = yield* projectEvent(readModel, event);
      }

      const overflow = yield* decideOrchestrationCommand({
        command: {
          type: "project.board.item.upsert",
          commandId: CommandId.make("cmd-board-overflow"),
          projectId,
          itemId: asItemId("item-overflow"),
          title: "Too many",
          status: "backlog",
        },
        readModel,
      }).pipe(Effect.flip);

      expect(overflow._tag).toBe("OrchestrationCommandInvariantError");
    }),
  );
});
