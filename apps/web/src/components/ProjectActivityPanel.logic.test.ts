import { assert, it } from "@effect/vitest";
import { EventId, ThreadId, type OrchestrationProjectActivityItem } from "@t3tools/contracts";

import { formatCheckpointSummary, groupProjectActivityByDay } from "./ProjectActivityPanel.logic";

const item = (id: string, occurredAt: string): OrchestrationProjectActivityItem => ({
  id: EventId.make(id),
  kind: "turn-interrupted",
  occurredAt,
  threadId: ThreadId.make("thread-1"),
  threadTitle: "Timeline thread",
  modelSelection: null,
});

it("groups project activity by local day without changing item order", () => {
  const groups = groupProjectActivityByDay(
    [
      item("today-2", "2026-08-11T18:00:00.000Z"),
      item("today-1", "2026-08-11T08:00:00.000Z"),
      item("yesterday", "2026-08-10T12:00:00.000Z"),
      item("older", "2026-08-09T12:00:00.000Z"),
    ],
    { now: new Date("2026-08-11T20:00:00.000Z"), locale: "en", timeZone: "UTC" },
  );

  assert.deepStrictEqual(
    groups.map((group) => [group.label, group.items.map((entry) => entry.id)]),
    [
      ["Today", [EventId.make("today-2"), EventId.make("today-1")]],
      ["Yesterday", [EventId.make("yesterday")]],
      ["Aug 9, 2026", [EventId.make("older")]],
    ],
  );
});

it("formats compact checkpoint file totals", () => {
  assert.strictEqual(
    formatCheckpointSummary({
      id: EventId.make("checkpoint-1"),
      kind: "checkpoint",
      occurredAt: "2026-08-11T18:00:00.000Z",
      threadId: ThreadId.make("thread-1"),
      threadTitle: "Timeline thread",
      status: "ready",
      files: [
        { path: "a.ts", kind: "modified", additions: 3, deletions: 1 },
        { path: "b.ts", kind: "created", additions: 5, deletions: 0 },
      ],
    }),
    "2 files · +8 −1",
  );
});
