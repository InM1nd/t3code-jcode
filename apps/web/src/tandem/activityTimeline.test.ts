import { ProviderInstanceId, ThreadId, type ProjectActivityItem } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { formatCheckpointSummary, groupProjectActivityByDay } from "./activityTimeline.ts";

const item = (occurredAt: string, id: string): ProjectActivityItem => ({
  id,
  occurredAt,
  threadId: ThreadId.make("thread-1"),
  threadTitle: "Billing",
  kind: "turn-started",
  modelSelection: { instanceId: ProviderInstanceId.make("claude"), model: "opus" },
});

describe("groupProjectActivityByDay", () => {
  it("labels today and yesterday in the timeline timezone", () => {
    const groups = groupProjectActivityByDay(
      [
        item("2026-10-07T23:30:00.000Z", "late"),
        item("2026-10-06T23:30:00.000Z", "earlier"),
        item("2026-10-05T12:00:00.000Z", "older"),
      ],
      { now: new Date("2026-10-07T18:00:00.000Z"), timeZone: "UTC", locale: "en-US" },
    );

    expect(groups.map((group) => group.label)).toEqual(["Today", "Yesterday", "Oct 5, 2026"]);
    expect(groups[0]?.items.map((entry) => entry.id)).toEqual(["late"]);
  });
});

describe("formatCheckpointSummary", () => {
  it("uses the full file totals", () => {
    expect(
      formatCheckpointSummary({
        id: "checkpoint-1",
        occurredAt: "2026-10-07T12:00:00.000Z",
        threadId: ThreadId.make("thread-1"),
        threadTitle: "Billing",
        kind: "checkpoint",
        status: "ready",
        files: [],
        fileCount: 2,
        additions: 6,
        deletions: 1,
      }),
    ).toBe("2 files · +6 −1");
  });
});
