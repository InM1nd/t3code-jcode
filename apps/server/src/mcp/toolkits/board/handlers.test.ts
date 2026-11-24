import type { ProjectBoardHandoff, ProjectBoardItem } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { briefItem, slimItem } from "./handlers.ts";

const handoff = (n: number) =>
  ({
    id: `handoff-${n}`,
    sourceThreadId: "thread-1",
    summary: `summary ${n}`,
    decisions: [],
    nextStep: `next ${n}`,
    createdAt: "2026-11-17T00:00:00.000Z",
  }) as unknown as ProjectBoardHandoff;

// Newest first, as BoardService stores it.
const history = [5, 4, 3, 2, 1].map(handoff);
const item = {
  id: "card-1",
  title: "Card",
  status: "inProgress",
  notes: "long notes",
  brief: null,
  latestHandoff: history[0],
  handoffHistory: history,
  source: "agent",
  createdAt: "2026-11-17T00:00:00.000Z",
  updatedAt: "2026-11-17T00:00:00.000Z",
} as unknown as ProjectBoardItem;

describe("board tool results", () => {
  it("gives a brief the latest handoff and the two before it", () => {
    const brief = briefItem(item);
    expect(brief.latestHandoff?.summary).toBe("summary 5");
    expect(brief.handoffHistory?.map((entry) => entry.summary)).toEqual(["summary 4", "summary 3"]);
    expect(brief.notes).toBe("long notes");
  });

  it("echoes a write without notes or handoffs", () => {
    const slim = slimItem(item);
    expect(slim).toMatchObject({ id: "card-1", status: "inProgress", notes: null });
    expect(slim.latestHandoff).toBeNull();
    expect(slim.handoffHistory).toEqual([]);
  });
});
