import { describe, expect, it } from "vite-plus/test";
import type { ProjectBoardItem, ThreadId } from "@t3tools/contracts";

import {
  buildHandoffRequestPrompt,
  buildRolloverSeedPrompt,
  selectRolloverCards,
} from "./threadRollover";

const THREAD = "thread-a" as ThreadId;
const OTHER_THREAD = "thread-b" as ThreadId;

function item(
  partial: Pick<ProjectBoardItem, "id" | "title" | "status"> &
    Partial<Omit<ProjectBoardItem, "id" | "title" | "status">>,
): ProjectBoardItem {
  return {
    notes: null,
    source: "agent",
    sourceThreadId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("selectRolloverCards", () => {
  it("prefers open cards this thread created", () => {
    const cards = selectRolloverCards(
      [
        item({
          id: "a" as ProjectBoardItem["id"],
          title: "Mine",
          status: "inProgress",
          sourceThreadId: THREAD,
        }),
        item({
          id: "b" as ProjectBoardItem["id"],
          title: "Theirs",
          status: "inProgress",
          sourceThreadId: OTHER_THREAD,
        }),
      ],
      THREAD,
    );
    expect(cards.map((card) => card.id)).toEqual(["a"]);
  });

  it("skips finished, cancelled and archived cards", () => {
    const cards = selectRolloverCards(
      [
        item({
          id: "a" as ProjectBoardItem["id"],
          title: "Done",
          status: "completed",
          sourceThreadId: THREAD,
        }),
        item({
          id: "b" as ProjectBoardItem["id"],
          title: "Dropped",
          status: "cancelled",
          sourceThreadId: THREAD,
        }),
        item({
          id: "c" as ProjectBoardItem["id"],
          title: "Archived",
          status: "inProgress",
          sourceThreadId: THREAD,
          archivedAt: "2026-01-02T00:00:00.000Z",
        }),
        item({
          id: "d" as ProjectBoardItem["id"],
          title: "Live",
          status: "blocked",
          sourceThreadId: THREAD,
        }),
      ],
      THREAD,
    );
    expect(cards.map((card) => card.id)).toEqual(["d"]);
  });

  it("falls back to in-progress cards when the thread owns none", () => {
    const cards = selectRolloverCards(
      [
        item({ id: "a" as ProjectBoardItem["id"], title: "Someone else's", status: "inProgress" }),
        item({ id: "b" as ProjectBoardItem["id"], title: "Not started", status: "backlog" }),
      ],
      THREAD,
    );
    expect(cards.map((card) => card.id)).toEqual(["a"]);
  });
});

describe("buildHandoffRequestPrompt", () => {
  it("names every card to hand off", () => {
    const prompt = buildHandoffRequestPrompt([
      item({ id: "a" as ProjectBoardItem["id"], title: "Auth refresh", status: "inProgress" }),
    ]);
    expect(prompt).toContain("board_handoff");
    expect(prompt).toContain("- [a] Auth refresh");
    expect(prompt).toContain("do not start new work");
  });

  it("asks for a card first when the board tracks nothing", () => {
    const prompt = buildHandoffRequestPrompt([]);
    expect(prompt).toContain("board_upsert");
    expect(prompt).toContain("board_handoff");
  });
});

describe("buildRolloverSeedPrompt", () => {
  const items = [
    item({ id: "a" as ProjectBoardItem["id"], title: "Auth refresh", status: "inProgress" }),
  ];

  it("inlines the digest but makes the successor read the handoff itself", () => {
    const prompt = buildRolloverSeedPrompt({
      items,
      cards: items,
      previousTitle: "Auth work",
    });
    expect(prompt).toContain('Continuing "Auth work"');
    expect(prompt).toContain("Project board digest");
    expect(prompt).toContain("board_get_brief");
    expect(prompt).toContain("- [a] Auth refresh");
  });

  it("falls back to orientation when no card is in flight", () => {
    const prompt = buildRolloverSeedPrompt({ items, cards: [], previousTitle: "Auth work" });
    expect(prompt).toContain("board_digest");
    expect(prompt).not.toContain("board_get_brief");
  });
});
