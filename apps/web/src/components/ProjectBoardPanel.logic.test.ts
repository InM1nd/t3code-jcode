import { describe, expect, it } from "vite-plus/test";
import type {
  EnvironmentId,
  ProjectBoardHandoff,
  ProjectBoardItem,
  ThreadId,
} from "@t3tools/contracts";

import {
  buildBoardImplementPrompt,
  createBoardItemDraft,
  findDraftIdForThread,
  getProjectBoardCockpit,
  groupProjectBoardItems,
  nextProjectBoardItemStatus,
  projectBoardItemDisplayTitle,
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
  it("cycles the active workflow", () => {
    expect(nextProjectBoardItemStatus("backlog")).toBe("ready");
    expect(nextProjectBoardItemStatus("ready")).toBe("inProgress");
    expect(nextProjectBoardItemStatus("inProgress")).toBe("inReview");
    expect(nextProjectBoardItemStatus("inReview")).toBe("completed");
    expect(nextProjectBoardItemStatus("completed")).toBe("backlog");
  });
});

describe("groupProjectBoardItems", () => {
  it("groups active statuses separately from archived items", () => {
    const items = [
      item({
        id: "done-old" as ProjectBoardItem["id"],
        title: "Done old",
        status: "completed",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
      item({
        id: "backlog" as ProjectBoardItem["id"],
        title: "Backlog",
        status: "backlog",
        createdAt: "2026-01-03T00:00:00.000Z",
      }),
      item({
        id: "blocked" as ProjectBoardItem["id"],
        title: "Blocked",
        status: "blocked",
      }),
      item({
        id: "wip" as ProjectBoardItem["id"],
        title: "WIP",
        status: "inProgress",
        updatedAt: "2026-01-04T00:00:00.000Z",
      }),
      item({
        id: "archived" as ProjectBoardItem["id"],
        title: "Archived",
        status: "cancelled",
        archivedAt: "2026-01-06T00:00:00.000Z",
        updatedAt: "2026-01-05T00:00:00.000Z",
      }),
    ];

    const grouped = groupProjectBoardItems(items);
    expect(grouped.active.inProgress.map((entry) => entry.id)).toEqual(["wip"]);
    expect(grouped.active.blocked.map((entry) => entry.id)).toEqual(["blocked"]);
    expect(grouped.active.backlog.map((entry) => entry.id)).toEqual(["backlog"]);
    expect(grouped.archived.map((entry) => entry.id)).toEqual(["archived"]);
  });
});

describe("getProjectBoardCockpit", () => {
  it("surfaces attention items and groups the remaining active cards by title prefix", () => {
    const blocked = item({
      id: "blocked" as ProjectBoardItem["id"],
      title: "[SEO] Fix canonical URLs",
      status: "blocked",
    });
    const review = item({
      id: "review" as ProjectBoardItem["id"],
      title: "[SEO] Review sitemap",
      status: "inReview",
    });
    const product = item({
      id: "product" as ProjectBoardItem["id"],
      title: "[Product] Improve project search",
      status: "inProgress",
    });
    const ungrouped = item({
      id: "other" as ProjectBoardItem["id"],
      title: "Refresh screenshots",
      status: "backlog",
    });
    const archived = item({
      id: "archived" as ProjectBoardItem["id"],
      title: "[Product] Old task",
      status: "completed",
      archivedAt: "2026-01-02T00:00:00.000Z",
    });

    const cockpit = getProjectBoardCockpit([blocked, review, product, ungrouped, archived]);

    expect(cockpit.attention.map((entry) => entry.id)).toEqual([blocked.id, review.id]);
    expect(cockpit.workstreams.map((group) => group.title)).toEqual(["Product", "Other work"]);
    expect(cockpit.workstreams[0]?.items.map((entry) => entry.id)).toEqual([product.id]);
    expect(cockpit.counts.archived).toBe(1);
    expect(cockpit.counts.inProgress).toBe(1);
  });
});

describe("projectBoardItemDisplayTitle", () => {
  it("removes a leading workstream prefix without changing ungrouped titles", () => {
    expect(projectBoardItemDisplayTitle("[Product] Improve project search")).toBe(
      "Improve project search",
    );
    expect(projectBoardItemDisplayTitle("Refresh screenshots")).toBe("Refresh screenshots");
  });
});

describe("createBoardItemDraft", () => {
  it("copies editable task fields", () => {
    const boardItem = item({
      id: "draft" as ProjectBoardItem["id"],
      title: "Draft me",
      status: "inReview",
      notes: "Notes",
    });

    expect(createBoardItemDraft(boardItem)).toMatchObject({
      title: boardItem.title,
      notes: "Notes",
      status: boardItem.status,
    });
  });
});

describe("buildBoardImplementPrompt", () => {
  it("includes title, id, notes, and board tool reminder", () => {
    const prompt = buildBoardImplementPrompt(
      item({
        id: "item-1" as ProjectBoardItem["id"],
        title: "Ship board implement",
        status: "backlog",
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
        status: "backlog",
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
    expect(projectBoardStatusLabel("backlog")).toBe("Backlog");
    expect(projectBoardStatusLabel("blocked")).toBe("Blocked");
    expect(projectBoardStatusLabel("inReview")).toBe("In review");
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
