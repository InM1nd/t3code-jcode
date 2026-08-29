import { describe, expect, it } from "vite-plus/test";

import { summarizeAgentAttention } from "./agentAttention";

describe("summarizeAgentAttention", () => {
  it("shows actionable and active work, excluding archived threads", () => {
    const summary = summarizeAgentAttention([
      {
        id: "approval",
        title: "Need approval",
        archivedAt: null,
        updatedAt: "2026-08-28T11:00:00Z",
        state: "permission",
      },
      {
        id: "working",
        title: "Working",
        archivedAt: null,
        updatedAt: "2026-08-28T12:00:00Z",
        state: "working",
      },
      {
        id: "done",
        title: "Done",
        archivedAt: null,
        updatedAt: "2026-08-28T10:00:00Z",
        state: "completed",
      },
      {
        id: "hidden",
        title: "Hidden",
        archivedAt: "2026-08-28T09:00:00Z",
        updatedAt: "2026-08-28T13:00:00Z",
        state: "error",
      },
    ]);

    expect(summary.needsAction.map((thread) => thread.title)).toEqual(["Need approval"]);
    expect(summary.active.map((thread) => thread.title)).toEqual(["Working"]);
    expect(summary.completed.map((thread) => thread.title)).toEqual(["Done"]);
  });
});
