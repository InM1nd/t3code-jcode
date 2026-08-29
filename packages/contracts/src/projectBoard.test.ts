import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import {
  OrchestrationCommand,
  OrchestrationEvent,
  OrchestrationProjectShell,
} from "./orchestration.ts";
import {
  PROJECT_BOARD_ITEM_LIMIT,
  ProjectBoardItem,
  ProjectBoardItemStatus,
} from "./projectBoard.ts";

const decodeOrchestrationCommand = Schema.decodeUnknownEffect(OrchestrationCommand);
const decodeOrchestrationEvent = Schema.decodeUnknownEffect(OrchestrationEvent);
const decodeOrchestrationProjectShell = Schema.decodeUnknownEffect(OrchestrationProjectShell);

it("allows up to 500 board items per project", () => {
  assert.strictEqual(PROJECT_BOARD_ITEM_LIMIT, 500);
});

it("decodes Board lifecycle statuses and legacy pending items", () => {
  const now = "2026-08-13T12:00:00.000Z";
  const base = {
    id: "item-1",
    title: "Board item",
    source: "user",
    createdAt: now,
    updatedAt: now,
  };

  assert.strictEqual(Schema.decodeUnknownSync(ProjectBoardItemStatus)("blocked"), "blocked");
  assert.strictEqual(Schema.decodeUnknownSync(ProjectBoardItemStatus)("cancelled"), "cancelled");
  assert.strictEqual(
    Schema.decodeUnknownSync(ProjectBoardItem)({ ...base, status: "pending" }).status,
    "backlog",
  );
  assert.strictEqual(
    Schema.decodeUnknownSync(ProjectBoardItem)({
      ...base,
      status: "completed",
      archivedAt: now,
    }).archivedAt,
    now,
  );
});

it.effect("decodes a legacy project shell with pending Board items as backlog", () =>
  Effect.gen(function* () {
    const now = "2026-08-13T12:00:00.000Z";
    const shell = yield* decodeOrchestrationProjectShell({
      id: "project-legacy-board",
      title: "Legacy Board",
      workspaceRoot: "/tmp/legacy-board",
      defaultModelSelection: null,
      scripts: [],
      boardItems: [
        {
          id: "item-legacy-pending",
          title: "Persisted pending item",
          status: "pending",
          source: "user",
          createdAt: now,
          updatedAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    });

    assert.strictEqual(shell.boardItems?.[0]?.status, "backlog");
  }),
);

it.effect("decodes legacy Board items and handoff append events", () =>
  Effect.gen(function* () {
    const legacy = yield* decodeOrchestrationCommand({
      type: "project.board.item.upsert",
      commandId: "cmd-board-legacy",
      projectId: "project-1",
      itemId: "item-1",
      title: "Legacy item",
      status: "pending",
    });
    assert.strictEqual(legacy.type, "project.board.item.upsert");

    const handoff = yield* decodeOrchestrationEvent({
      sequence: 1,
      eventId: "event-handoff",
      aggregateKind: "project",
      aggregateId: "project-1",
      type: "project.board-item-handoff-appended",
      occurredAt: "2026-08-12T12:00:00.000Z",
      commandId: "cmd-handoff",
      causationEventId: null,
      correlationId: "cmd-handoff",
      metadata: {},
      payload: {
        projectId: "project-1",
        itemId: "item-1",
        itemTitle: "Handoff",
        handoff: {
          id: "handoff-1",
          sourceThreadId: "thread-1",
          summary: "Done",
          decisions: [],
          nextStep: "Review it",
          createdAt: "2026-08-12T12:00:00.000Z",
        },
        updatedAt: "2026-08-12T12:00:00.000Z",
      },
    });
    assert.strictEqual(handoff.type, "project.board-item-handoff-appended");
  }),
);
