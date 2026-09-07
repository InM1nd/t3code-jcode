import { describe, expect, it } from "vite-plus/test";
import type {
  OrchestrationLatestTurn,
  ProjectBoardHandoff,
  ProjectBoardItem,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";

import {
  buildHandoffRequestPrompt,
  buildRolloverSeedPrompt,
  selectRolloverCards,
  waitForRolloverReady,
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

function handoff(id: string, sourceThreadId = THREAD): ProjectBoardHandoff {
  return {
    id: id as ProjectBoardHandoff["id"],
    sourceThreadId,
    summary: "Saved context",
    decisions: [],
    nextStep: "Continue the work",
    createdAt: "2026-01-02T00:00:00.000Z",
  };
}

function terminalTurn(
  state: Extract<OrchestrationLatestTurn["state"], "completed" | "interrupted" | "error">,
): OrchestrationLatestTurn {
  return {
    turnId: "turn-2" as TurnId,
    state,
    requestedAt: "2026-01-02T00:00:00.000Z",
    startedAt: "2026-01-02T00:00:01.000Z",
    completedAt: "2026-01-02T00:00:02.000Z",
    assistantMessageId: null,
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

  it("does not hand off unrelated in-progress cards when the thread owns none", () => {
    const cards = selectRolloverCards(
      [
        item({ id: "a" as ProjectBoardItem["id"], title: "Someone else's", status: "inProgress" }),
        item({ id: "b" as ProjectBoardItem["id"], title: "Not started", status: "backlog" }),
      ],
      THREAD,
    );
    expect(cards).toEqual([]);
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
    expect(prompt).toContain("Project board digest");
    expect(prompt).not.toContain("board_get_brief");
  });
});

describe("waitForRolloverReady", () => {
  it("waits for a new persisted handoff after the outgoing turn completes", async () => {
    const oldCard = item({
      id: "a" as ProjectBoardItem["id"],
      title: "Auth refresh",
      status: "inProgress",
      sourceThreadId: THREAD,
      latestHandoff: handoff("old"),
    });
    let emit:
      | ((observation: {
          readonly latestTurn: OrchestrationLatestTurn | null;
          readonly boardItems: ReadonlyArray<ProjectBoardItem>;
        }) => void)
      | undefined;
    const wait = waitForRolloverReady({
      threadId: THREAD,
      previousTurnId: null,
      cards: [oldCard],
      initialItems: [oldCard],
      observe: (listener) => {
        emit = listener;
        listener({ latestTurn: null, boardItems: [oldCard] });
        return () => {
          emit = undefined;
        };
      },
    });

    let settled = false;
    void wait.then(() => {
      settled = true;
    });
    const freshCard = { ...oldCard, latestHandoff: handoff("new") };
    emit?.({ latestTurn: null, boardItems: [freshCard] });
    await Promise.resolve();
    expect(settled).toBe(false);

    emit?.({ latestTurn: terminalTurn("completed"), boardItems: [oldCard] });
    await Promise.resolve();
    expect(settled).toBe(false);

    emit?.({ latestTurn: terminalTurn("completed"), boardItems: [freshCard] });
    await expect(wait).resolves.toEqual({ status: "completed", boardItems: [freshCard] });
  });

  it.each(["interrupted", "error"] as const)(
    "returns a recoverable result when the outgoing turn is %s",
    async (state) => {
      const wait = waitForRolloverReady({
        threadId: THREAD,
        previousTurnId: null,
        cards: [],
        initialItems: [],
        observe: (listener) => {
          listener({ latestTurn: terminalTurn(state), boardItems: [] });
          return () => undefined;
        },
      });

      await expect(wait).resolves.toEqual({ status: state });
    },
  );

  it("requires a fresh handoff on a card owned by the outgoing thread", async () => {
    const unrelatedCard = item({
      id: "other" as ProjectBoardItem["id"],
      title: "Other work",
      status: "inProgress",
      sourceThreadId: OTHER_THREAD,
    });
    let emit:
      | ((observation: {
          readonly latestTurn: OrchestrationLatestTurn | null;
          readonly boardItems: ReadonlyArray<ProjectBoardItem>;
        }) => void)
      | undefined;
    const wait = waitForRolloverReady({
      threadId: THREAD,
      previousTurnId: null,
      cards: [],
      initialItems: [unrelatedCard],
      observe: (listener) => {
        emit = listener;
        listener({ latestTurn: null, boardItems: [unrelatedCard] });
        return () => {
          emit = undefined;
        };
      },
    });

    let settled = false;
    void wait.then(() => {
      settled = true;
    });
    emit?.({ latestTurn: terminalTurn("completed"), boardItems: [unrelatedCard] });
    await Promise.resolve();
    expect(settled).toBe(false);

    const ownedCard = item({
      id: "owned" as ProjectBoardItem["id"],
      title: "Current work",
      status: "inProgress",
      sourceThreadId: THREAD,
      latestHandoff: handoff("new"),
    });
    emit?.({
      latestTurn: terminalTurn("completed"),
      boardItems: [unrelatedCard, ownedCard],
    });
    await expect(wait).resolves.toEqual({
      status: "completed",
      boardItems: [unrelatedCard, ownedCard],
    });
  });
});
