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
      item({ id: "i2" as ProjectBoardItem["id"], title: "Next", status: "pending" }),
      item({ id: "i3" as ProjectBoardItem["id"], title: "Done", status: "completed" }),
    ]);
    expect(digest).toContain("1 in progress, 1 pending, 1 done");
    expect(digest).toContain("WIP");
    expect(digest).toContain("1 linked turn");
    expect(digest).not.toContain("secret details");
  });
});

describe("indexProjectBoardItemsByTurnId", () => {
  it("maps turns to items", () => {
    const indexed = indexProjectBoardItemsByTurnId([
      item({
        id: "i1" as ProjectBoardItem["id"],
        title: "A",
        status: "pending",
        linkedTurnIds: ["t1" as TurnId, "t2" as TurnId],
      }),
      item({
        id: "i2" as ProjectBoardItem["id"],
        title: "B",
        status: "pending",
        linkedTurnIds: ["t2" as TurnId],
      }),
    ]);
    expect(indexed.get("t1" as TurnId)?.map((entry) => entry.id)).toEqual(["i1"]);
    expect(indexed.get("t2" as TurnId)?.map((entry) => entry.id)).toEqual(["i1", "i2"]);
  });
});
