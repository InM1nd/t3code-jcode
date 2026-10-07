import { describe, expect, it } from "vite-plus/test";

import { mapProjectActivity, type ProjectActivityEventRow } from "./projectActivity.ts";

const row = (overrides: Partial<ProjectActivityEventRow>): ProjectActivityEventRow => ({
  eventId: "event-1",
  eventType: "thread.created",
  occurredAt: "2026-10-07T10:00:00.000Z",
  threadId: "thread-1",
  threadTitle: "Billing",
  payloadJson: JSON.stringify({
    modelSelection: { instanceId: "claude", model: "opus" },
  }),
  ...overrides,
});

describe("mapProjectActivity", () => {
  it("keeps thread creation, turn start, interruption, and a failed turn", () => {
    const items = mapProjectActivity({
      rows: [
        row({}),
        row({
          eventId: "event-2",
          eventType: "run.created",
          occurredAt: "2026-10-07T11:00:00.000Z",
        }),
        row({
          eventId: "event-3",
          eventType: "run.updated",
          occurredAt: "2026-10-07T12:00:00.000Z",
          payloadJson: JSON.stringify({ status: "running", error: "secret provider text" }),
        }),
        row({
          eventId: "event-4",
          eventType: "run.updated",
          occurredAt: "2026-10-07T13:00:00.000Z",
          payloadJson: JSON.stringify({ status: "interrupted" }),
        }),
        row({
          eventId: "event-5",
          eventType: "run.updated",
          occurredAt: "2026-10-07T14:00:00.000Z",
          payloadJson: JSON.stringify({ status: "failed", message: "raw provider dump" }),
        }),
      ],
      boardItems: [],
    });

    expect(items.map((item) => item.kind)).toEqual([
      "error",
      "turn-interrupted",
      "turn-started",
      "thread-created",
    ]);
    expect(items[0]).toMatchObject({ summary: "The turn failed" });
    expect(JSON.stringify(items)).not.toContain("raw provider");
    expect(JSON.stringify(items)).not.toContain("secret provider");
  });

  it("summarizes a checkpoint and hides a failed capture", () => {
    const items = mapProjectActivity({
      rows: [
        row({
          eventId: "checkpoint-ready",
          eventType: "checkpoint.captured",
          payloadJson: JSON.stringify({
            status: "ready",
            files: [
              { path: "a.ts", additions: 2, deletions: 1 },
              { path: "b.ts", additions: 4, deletions: 0 },
            ],
          }),
        }),
        row({
          eventId: "checkpoint-error",
          eventType: "checkpoint.captured",
          occurredAt: "2026-10-07T09:00:00.000Z",
          payloadJson: JSON.stringify({ status: "error", files: [], detail: "git exploded" }),
        }),
      ],
      boardItems: [],
    });

    expect(items[0]).toMatchObject({
      kind: "checkpoint",
      fileCount: 2,
      additions: 6,
      deletions: 1,
    });
    expect(items[1]).toMatchObject({
      kind: "error",
      summary: "Checkpoint capture failed",
    });
    expect(JSON.stringify(items)).not.toContain("git exploded");
  });

  it("adds board status changes and every handoff, then caps the timeline", () => {
    const items = mapProjectActivity({
      rows: Array.from({ length: 120 }, (_, index) =>
        row({
          eventId: `event-${index}`,
          eventType: "run.created",
          occurredAt: `2026-10-07T10:${String(index).padStart(2, "0")}:00.000Z`,
        }),
      ),
      boardItems: [
        {
          id: "card-1",
          title: "Ship the timeline",
          status: "inProgress",
          updatedAt: "2026-10-07T18:00:00.000Z",
          sourceThreadId: "thread-9",
          handoffHistory: [
            {
              id: "handoff-1",
              sourceThreadId: "thread-9",
              nextStep: "Review the diff",
              createdAt: "2026-10-07T17:00:00.000Z",
            },
          ],
        },
      ],
    });

    expect(items).toHaveLength(100);
    expect(items[0]).toMatchObject({ kind: "board-updated", title: "Ship the timeline" });
    expect(items[1]).toMatchObject({ kind: "board-handoff", nextStep: "Review the diff" });
  });
});
