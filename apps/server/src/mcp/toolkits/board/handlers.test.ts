import type { ProjectBoardItem } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  listProjectBoardItems,
  paginateProjectBoardItems,
  toCompactBoardListItem,
} from "./handlers.ts";

const item = (id: string, archivedAt: string | null): ProjectBoardItem => ({
  id: id as ProjectBoardItem["id"],
  title: id,
  status: "backlog",
  source: "agent",
  archivedAt,
  createdAt: "2026-08-13T10:00:00.000Z",
  updatedAt: "2026-08-13T10:00:00.000Z",
});

describe("listProjectBoardItems", () => {
  it("includes archived items only when explicitly requested", () => {
    const items = [item("active", null), item("archived", "2026-08-13T11:00:00.000Z")];

    expect(listProjectBoardItems(items).map((entry) => entry.id)).toEqual(["active"]);
    expect(listProjectBoardItems(items, true)).toEqual(items);
  });

  it("filters and paginates board_list responses", () => {
    const items = [
      { ...item("backlog-1", null), status: "backlog" as const },
      { ...item("ready-1", null), status: "ready" as const },
      { ...item("backlog-2", null), status: "backlog" as const },
      { ...item("backlog-3", null), status: "backlog" as const },
    ];

    expect(paginateProjectBoardItems(items, { status: "backlog", limit: 2 })).toMatchObject({
      totalCount: 3,
      nextOffset: 2,
      items: [
        expect.objectContaining({ id: "backlog-1" }),
        expect.objectContaining({ id: "backlog-2" }),
      ],
    });
    expect(
      paginateProjectBoardItems(items, { status: "backlog", offset: 2, limit: 2 }),
    ).toMatchObject({
      totalCount: 3,
      nextOffset: null,
      items: [expect.objectContaining({ id: "backlog-3" })],
    });
  });
});

describe("toCompactBoardListItem", () => {
  it("drops notes, brief, latestHandoff, and linkedTurnIds", () => {
    const full: ProjectBoardItem = {
      ...item("card", null),
      notes: "long free-form notes",
      brief: {
        goal: "ship it",
        acceptanceCriteria: ["a", "b"],
        importantFiles: ["x.ts"],
        notes: null,
      },
      latestHandoff: {
        id: "handoff-1" as never,
        sourceThreadId: "thread-1" as never,
        summary: "did stuff",
        decisions: ["used X"],
        nextStep: "do Y",
        createdAt: "2026-08-13T10:00:00.000Z",
      },
      linkedTurnIds: ["turn-1" as never, "turn-2" as never],
    };

    const compact = toCompactBoardListItem(full);

    expect(compact).toEqual({
      id: "card",
      title: "card",
      status: "backlog",
      source: "agent",
      createdAt: "2026-08-13T10:00:00.000Z",
      updatedAt: "2026-08-13T10:00:00.000Z",
    });
    expect(compact).not.toHaveProperty("notes");
    expect(compact).not.toHaveProperty("brief");
    expect(compact).not.toHaveProperty("latestHandoff");
    expect(compact).not.toHaveProperty("linkedTurnIds");
  });

  it("keeps sourceThreadId and archivedAt when present, since both are cheap", () => {
    const full: ProjectBoardItem = {
      ...item("card", "2026-08-13T12:00:00.000Z"),
      sourceThreadId: "thread-1" as never,
    };

    expect(toCompactBoardListItem(full)).toEqual({
      id: "card",
      title: "card",
      status: "backlog",
      source: "agent",
      createdAt: "2026-08-13T10:00:00.000Z",
      updatedAt: "2026-08-13T10:00:00.000Z",
      sourceThreadId: "thread-1",
      archivedAt: "2026-08-13T12:00:00.000Z",
    });
  });
});
