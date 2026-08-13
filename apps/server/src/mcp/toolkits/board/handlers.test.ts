import type { ProjectBoardItem } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { listProjectBoardItems } from "./handlers.ts";

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
});
