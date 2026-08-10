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
          status: "pending",
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
      expect(event.payload.item.status).toBe("pending");
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
          status: "pending",
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
          status: "pending",
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
            status: "pending",
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
          status: "pending",
        },
        readModel,
      }).pipe(Effect.flip);

      expect(overflow._tag).toBe("OrchestrationCommandInvariantError");
    }),
  );
});
