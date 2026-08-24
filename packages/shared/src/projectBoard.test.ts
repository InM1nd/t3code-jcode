import { describe, expect, it } from "vite-plus/test";
import type { ProjectBoardItem, TurnId } from "@t3tools/contracts";

import {
  formatProjectBoardDigest,
  indexProjectBoardItemsByTurnId,
  mergeProjectBoardLinkedTurnIds,
  PROJECT_BOARD_LINKED_TURN_LIMIT,
} from "./projectBoard.ts";

function item(
  partial: Pick<ProjectBoardItem, "id" | "title" | "status"> &
    Partial<Omit<ProjectBoardItem, "id" | "title" | "status">>,
): ProjectBoardItem {
  return {
    notes: null,
    source: "user",
    sourceThreadId: null,
    linkedTurnIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("mergeProjectBoardLinkedTurnIds", () => {
  it("appends linkTurnId uniquely and caps from the end", () => {
    const existing = Array.from(
      { length: PROJECT_BOARD_LINKED_TURN_LIMIT },
      (_, index) => `turn-${index}` as TurnId,
    );
    const merged = mergeProjectBoardLinkedTurnIds({
      existing,
      linkTurnId: "turn-new" as TurnId,
    });
    expect(merged).toHaveLength(PROJECT_BOARD_LINKED_TURN_LIMIT);
    expect(merged.at(-1)).toBe("turn-new");
    expect(merged.includes("turn-0" as TurnId)).toBe(false);
  });

  it("replaces when linkedTurnIds is provided", () => {
    expect(
      mergeProjectBoardLinkedTurnIds({
        existing: ["old" as TurnId],
        linkedTurnIds: ["a" as TurnId, "b" as TurnId],
      }),
    ).toEqual(["a", "b"]);
  });
});

describe("formatProjectBoardDigest", () => {
  it("summarizes sections without dumping notes", () => {
    const digest = formatProjectBoardDigest([
      item({
        id: "i1" as ProjectBoardItem["id"],
        title: "WIP",
        status: "inProgress",
        notes: "secret details",
        linkedTurnIds: ["t1" as TurnId],
      }),
      item({ id: "i2" as ProjectBoardItem["id"], title: "Next", status: "backlog" }),
      item({ id: "i3" as ProjectBoardItem["id"], title: "Done", status: "completed" }),
      item({
        id: "i4" as ProjectBoardItem["id"],
        title: "Archived task",
        status: "cancelled",
        archivedAt: "2026-01-02T00:00:00.000Z",
      }),
    ]);
    expect(digest).toContain("1 in progress");
    expect(digest).toContain("1 backlog");
    expect(digest).toContain("1 done");
    expect(digest).toContain("WIP");
    expect(digest).toContain("1 linked turn");
    expect(digest).not.toContain("secret details");
    expect(digest).not.toContain("Archived task");
    expect(digest).toContain("1 archived");
  });

  it("groups a section by area only when it spans more than one", () => {
    const singleArea = formatProjectBoardDigest([
      item({ id: "i1" as ProjectBoardItem["id"], title: "SEO fix", status: "ready", area: "seo" }),
      item({
        id: "i2" as ProjectBoardItem["id"],
        title: "SEO fix 2",
        status: "ready",
        area: "seo",
      }),
    ]);
    expect(singleArea).not.toContain("seo:");
    expect(singleArea).toContain("- [i1] SEO fix");

    const multiArea = formatProjectBoardDigest([
      item({ id: "i1" as ProjectBoardItem["id"], title: "SEO fix", status: "ready", area: "seo" }),
      item({
        id: "i2" as ProjectBoardItem["id"],
        title: "Mobile fix",
        status: "ready",
        area: "mobile",
      }),
      item({ id: "i3" as ProjectBoardItem["id"], title: "No area yet", status: "ready" }),
    ]);
    expect(multiArea).toContain("mobile:");
    expect(multiArea).toContain("seo:");
    expect(multiArea).toContain("Uncategorized:");
    // Areas sort alphabetically, ahead of the uncategorized bucket.
    expect(multiArea.indexOf("mobile:")).toBeLessThan(multiArea.indexOf("seo:"));
    expect(multiArea.indexOf("seo:")).toBeLessThan(multiArea.indexOf("Uncategorized:"));
  });

  it("distinguishes an archived-only board from an empty board", () => {
    const digest = formatProjectBoardDigest([
      item({
        id: "i1" as ProjectBoardItem["id"],
        title: "Archived task",
        status: "cancelled",
        archivedAt: "2026-01-02T00:00:00.000Z",
      }),
    ]);

    expect(digest).toContain("No active items (1 archived).");
    expect(digest).not.toContain("Archived task");
    expect(formatProjectBoardDigest([])).toContain("Board is empty.");
  });
});

describe("indexProjectBoardItemsByTurnId", () => {
  it("maps turns to items", () => {
    const indexed = indexProjectBoardItemsByTurnId([
      item({
        id: "i1" as ProjectBoardItem["id"],
        title: "A",
        status: "backlog",
        linkedTurnIds: ["t1" as TurnId, "t2" as TurnId],
      }),
      item({
        id: "i2" as ProjectBoardItem["id"],
        title: "B",
        status: "backlog",
        linkedTurnIds: ["t2" as TurnId],
      }),
    ]);
    expect(indexed.get("t1" as TurnId)?.map((entry) => entry.id)).toEqual(["i1"]);
    expect(indexed.get("t2" as TurnId)?.map((entry) => entry.id)).toEqual(["i1", "i2"]);
  });
});
