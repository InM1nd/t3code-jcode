import { assert, it } from "@effect/vitest";
import {
  CheckpointRef,
  EventId,
  ProjectBoardItemId,
  ProjectBoardHandoffId,
  ProjectId,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";

import { mapProjectActivityRows, type ProjectActivityEventRow } from "./projectActivity.ts";

const base = {
  occurredAt: "2026-08-11T10:00:00.000Z",
  threadId: ThreadId.make("thread-1"),
  threadTitle: "Build timeline",
} as const;

it("maps only significant project activity and sanitizes errors", () => {
  const rows: ReadonlyArray<ProjectActivityEventRow> = [
    {
      ...base,
      id: EventId.make("event-4"),
      eventType: "thread.activity-appended",
      payload: {
        threadId: ThreadId.make("thread-1"),
        activity: {
          id: EventId.make("activity-1"),
          tone: "error",
          kind: "provider.turn.start.failed",
          summary: "Provider request failed",
          payload: { detail: "secret raw response" },
          turnId: null,
          createdAt: base.occurredAt,
        },
      },
    },
    {
      ...base,
      id: EventId.make("event-3"),
      eventType: "thread.activity-appended",
      payload: {
        threadId: ThreadId.make("thread-1"),
        activity: {
          id: EventId.make("activity-2"),
          tone: "tool",
          kind: "tool.completed",
          summary: "Read file",
          payload: {},
          turnId: null,
          createdAt: base.occurredAt,
        },
      },
    },
    {
      ...base,
      id: EventId.make("event-2"),
      eventType: "thread.turn-diff-completed",
      payload: {
        threadId: ThreadId.make("thread-1"),
        turnId: TurnId.make("turn-1"),
        checkpointTurnCount: 1,
        checkpointRef: CheckpointRef.make("refs/t3/checkpoints/thread-1/1"),
        status: "ready",
        files: [
          { path: "a.ts", kind: "modified", additions: 3, deletions: 1 },
          { path: "b.ts", kind: "created", additions: 5, deletions: 0 },
        ],
        assistantMessageId: null,
        completedAt: base.occurredAt,
      },
    },
  ];

  const items = mapProjectActivityRows(rows);

  assert.deepStrictEqual(
    items.map((item) => item.kind),
    ["error", "checkpoint"],
  );
  assert.strictEqual(
    items[0]?.kind === "error" ? items[0].summary : null,
    "Provider request failed",
  );
  assert.strictEqual(JSON.stringify(items).includes("secret raw response"), false);
  assert.strictEqual(items[1]?.kind === "checkpoint" ? items[1].files.length : 0, 2);
});

it("maps Board updates to their resulting status and source thread", () => {
  const items = mapProjectActivityRows([
    {
      ...base,
      id: EventId.make("event-board"),
      eventType: "project.board-item-upserted",
      payload: {
        projectId: ProjectId.make("project-1"),
        item: {
          id: ProjectBoardItemId.make("board-1"),
          title: "Activity timeline",
          status: "inProgress",
          notes: null,
          source: "agent",
          sourceThreadId: ThreadId.make("thread-1"),
          linkedTurnIds: [],
          createdAt: base.occurredAt,
          updatedAt: base.occurredAt,
        },
        updatedAt: base.occurredAt,
      },
    },
  ]);

  assert.deepStrictEqual(items[0], {
    id: EventId.make("event-board"),
    kind: "board-updated",
    occurredAt: base.occurredAt,
    threadId: ThreadId.make("thread-1"),
    threadTitle: "Build timeline",
    itemId: ProjectBoardItemId.make("board-1"),
    title: "Activity timeline",
    status: "inProgress",
  });
});

it("maps a handoff without exposing its summary or decisions", () => {
  const items = mapProjectActivityRows([
    {
      ...base,
      id: EventId.make("event-handoff"),
      eventType: "project.board-item-handoff-appended",
      payload: {
        projectId: ProjectId.make("project-1"),
        itemId: ProjectBoardItemId.make("board-1"),
        itemTitle: "Activity timeline",
        handoff: {
          id: ProjectBoardHandoffId.make("handoff-1"),
          sourceThreadId: ThreadId.make("thread-1"),
          summary: "Private implementation details",
          decisions: ["Do not show these"],
          nextStep: "Verify the Board panel.",
          createdAt: base.occurredAt,
        },
        updatedAt: base.occurredAt,
      },
    },
  ]);

  assert.deepStrictEqual(items[0], {
    id: EventId.make("event-handoff"),
    kind: "board-handoff",
    occurredAt: base.occurredAt,
    threadId: ThreadId.make("thread-1"),
    threadTitle: "Build timeline",
    itemId: ProjectBoardItemId.make("board-1"),
    title: "Activity timeline",
    nextStep: "Verify the Board panel.",
  });
  assert.strictEqual(JSON.stringify(items).includes("Private implementation details"), false);
});
