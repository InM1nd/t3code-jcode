import { describe, expect, it } from "vite-plus/test";
import type {
  EnvironmentId,
  ProjectBoardHandoff,
  ProjectBoardItem,
  ThreadId,
} from "@t3tools/contracts";

import {
  buildBoardImplementPrompt,
  findDraftIdForThread,
  nextProjectBoardItemStatus,
  partitionProjectBoardItems,
  projectBoardStatusLabel,
} from "./ProjectBoardPanel.logic";

function item(
  partial: Pick<ProjectBoardItem, "id" | "title" | "status"> &
    Partial<Omit<ProjectBoardItem, "id" | "title" | "status">>,
): ProjectBoardItem {
  return {
    notes: null,
    source: "user",
    sourceThreadId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("nextProjectBoardItemStatus", () => {
  it("cycles pending → inProgress → completed → pending", () => {
    expect(nextProjectBoardItemStatus("pending")).toBe("inProgress");
    expect(nextProjectBoardItemStatus("inProgress")).toBe("completed");
    expect(nextProjectBoardItemStatus("completed")).toBe("pending");
  });
});

describe("partitionProjectBoardItems", () => {
  it("splits and sorts sections", () => {
    const items = [
      item({
        id: "done-old" as ProjectBoardItem["id"],
        title: "Done old",
        status: "completed",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
      item({
        id: "pending-b" as ProjectBoardItem["id"],
        title: "Pending B",
        status: "pending",
        createdAt: "2026-01-03T00:00:00.000Z",
      }),
      item({
        id: "pending-a" as ProjectBoardItem["id"],
        title: "Pending A",
        status: "pending",
        createdAt: "2026-01-02T00:00:00.000Z",
      }),
      item({
        id: "wip" as ProjectBoardItem["id"],
        title: "WIP",
        status: "inProgress",
        updatedAt: "2026-01-04T00:00:00.000Z",
      }),
      item({
        id: "done-new" as ProjectBoardItem["id"],
        title: "Done new",
        status: "completed",
        updatedAt: "2026-01-05T00:00:00.000Z",
      }),
    ];

    const partitioned = partitionProjectBoardItems(items);
    expect(partitioned.inProgressItems.map((entry) => entry.id)).toEqual(["wip"]);
    expect(partitioned.pendingItems.map((entry) => entry.id)).toEqual(["pending-a", "pending-b"]);
    expect(partitioned.doneItems.map((entry) => entry.id)).toEqual(["done-new", "done-old"]);
  });
});

describe("buildBoardImplementPrompt", () => {
  it("includes title, id, notes, and board tool reminder", () => {
    const prompt = buildBoardImplementPrompt(
      item({
        id: "item-1" as ProjectBoardItem["id"],
        title: "Ship board implement",
        status: "pending",
        notes: "Keep the UI minimal.",
      }),
    );
    expect(prompt).toContain("Ship board implement");
    expect(prompt).toContain("item-1");
    expect(prompt).toContain("Keep the UI minimal.");
    expect(prompt).toContain("board_set_status");
  });

  it("includes structured brief and latest handoff", () => {
    const prompt = buildBoardImplementPrompt(
      item({
        id: "item-handoff" as ProjectBoardItem["id"],
        title: "Handoff UI",
        status: "pending",
        brief: {
          goal: "Continue the task",
          acceptanceCriteria: ["The next agent knows what to do"],
          importantFiles: ["ProjectBoardPanel.tsx"],
          notes: "Keep it compact.",
        },
        latestHandoff: {
          id: "handoff-1" as ProjectBoardHandoff["id"],
          sourceThreadId: "thread-1" as ThreadId,
          summary: "The server work is complete.",
          decisions: ["No separate task model."],
          nextStep: "Build the detail panel.",
          createdAt: "2026-08-12T12:00:00.000Z",
        },
      }),
    );
    expect(prompt).toContain("## Task brief");
    expect(prompt).toContain("## Latest handoff");
    expect(prompt).toContain("board_get_brief");
    expect(prompt).toContain("board_handoff");
  });
});

describe("projectBoardStatusLabel", () => {
  it("labels each status", () => {
    expect(projectBoardStatusLabel("pending")).toBe("Pending");
    expect(projectBoardStatusLabel("inProgress")).toBe("In progress");
    expect(projectBoardStatusLabel("completed")).toBe("Done");
  });
});

describe("findDraftIdForThread", () => {
  it("returns matching draft id", () => {
    const environmentId = "env-1" as EnvironmentId;
    const threadId = "thread-2" as ThreadId;
    expect(
      findDraftIdForThread({
        draftThreadsByThreadKey: {
          "draft-1": { environmentId, threadId: "thread-1" as ThreadId },
          "draft-2": { environmentId, threadId },
        },
        environmentId,
        threadId,
      }),
    ).toBe("draft-2");
  });
});
