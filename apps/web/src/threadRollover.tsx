import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { AtomCommand, AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import type {
  OrchestrationLatestTurn,
  ProjectBoardItem,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import { formatProjectBoardDigest } from "@t3tools/shared/projectBoard";
import { ListTodoIcon } from "lucide-react";

import type { CommandPaletteActionItem } from "./components/CommandPalette.logic";
import { ITEM_ICON_CLASS } from "./components/CommandPalette.logic";
import { toastManager } from "./components/ui/toast";
import type { useNewThreadHandler } from "./hooks/useHandleNewThread";
import { newMessageId } from "./lib/utils";
import { appAtomRegistry } from "./rpc/atomRegistry";
import { readProject } from "./state/entities";
import { environmentProjects } from "./state/projects";
import { environmentThreadDetails } from "./state/threads";
import type { threadEnvironment } from "./state/threads";
import type { Project, Thread } from "./types";

/**
 * Rollover: continue a thread whose context is full in a fresh one, on the
 * same branch and worktree, seeded from the board instead of from the old
 * transcript.
 *
 * The board is what carries state across the boundary, so rollover asks the
 * outgoing thread for a handoff first — a successor seeded from a stale card
 * is worse than the manual "new thread, go read the board" ritual it replaces.
 */

/**
 * Cards the outgoing thread is accountable for: only open cards it created.
 * Another thread's in-progress card is not context the outgoing thread can
 * safely summarize.
 */
export function selectRolloverCards(
  items: ReadonlyArray<ProjectBoardItem>,
  threadId: ThreadId,
): ProjectBoardItem[] {
  const open = items.filter(
    (item) => !item.archivedAt && item.status !== "completed" && item.status !== "cancelled",
  );
  return open.filter((item) => item.sourceThreadId === threadId);
}

function cardLines(cards: ReadonlyArray<ProjectBoardItem>): string[] {
  return cards.map((card) => `- [${card.id}] ${card.title}`);
}

export type RolloverObservation = {
  readonly latestTurn: OrchestrationLatestTurn | null;
  readonly boardItems: ReadonlyArray<ProjectBoardItem>;
};

type RolloverObserver = (listener: (observation: RolloverObservation) => void) => () => void;

export type RolloverWaitResult =
  | { readonly status: "completed"; readonly boardItems: ReadonlyArray<ProjectBoardItem> }
  | { readonly status: "interrupted" | "error" };

function hasFreshHandoff(
  item: ProjectBoardItem,
  threadId: ThreadId,
  previousHandoffIds: ReadonlyMap<ProjectBoardItem["id"], string | null>,
): boolean {
  const handoff = item.latestHandoff;
  return (
    handoff !== undefined &&
    handoff !== null &&
    handoff.sourceThreadId === threadId &&
    handoff.id !== (previousHandoffIds.get(item.id) ?? null)
  );
}

function hasRelevantFreshHandoffs(input: {
  readonly items: ReadonlyArray<ProjectBoardItem>;
  readonly cards: ReadonlyArray<ProjectBoardItem>;
  readonly threadId: ThreadId;
  readonly previousHandoffIds: ReadonlyMap<ProjectBoardItem["id"], string | null>;
}): boolean {
  if (input.cards.length > 0) {
    return input.cards.every((card) => {
      const current = input.items.find((item) => item.id === card.id);
      return (
        current !== undefined && hasFreshHandoff(current, input.threadId, input.previousHandoffIds)
      );
    });
  }

  return selectRolloverCards(input.items, input.threadId).some((card) =>
    hasFreshHandoff(card, input.threadId, input.previousHandoffIds),
  );
}

export function waitForRolloverReady(input: {
  readonly threadId: ThreadId;
  readonly previousTurnId: TurnId | null;
  readonly cards: ReadonlyArray<ProjectBoardItem>;
  readonly initialItems: ReadonlyArray<ProjectBoardItem>;
  readonly observe: RolloverObserver;
}): Promise<RolloverWaitResult> {
  const previousHandoffIds = new Map(
    input.initialItems.map((item) => [item.id, item.latestHandoff?.id ?? null] as const),
  );

  return new Promise((resolve) => {
    let unsubscribe: (() => void) | null = null;
    let finished = false;
    const finish = (result: RolloverWaitResult) => {
      if (finished) return;
      finished = true;
      unsubscribe?.();
      resolve(result);
    };

    unsubscribe = input.observe((observation) => {
      const turn = observation.latestTurn;
      if (
        turn === null ||
        turn.turnId === input.previousTurnId ||
        turn.state === "running" ||
        turn.completedAt === null
      ) {
        return;
      }
      if (turn.state !== "completed") {
        finish({ status: turn.state });
        return;
      }
      if (
        hasRelevantFreshHandoffs({
          items: observation.boardItems,
          cards: input.cards,
          threadId: input.threadId,
          previousHandoffIds,
        })
      ) {
        finish({ status: "completed", boardItems: observation.boardItems });
      }
    });
    if (finished) unsubscribe();
  });
}

function observeRolloverState(
  input: {
    readonly environmentId: Thread["environmentId"];
    readonly projectId: Project["id"];
    readonly threadId: ThreadId;
  },
  listener: (observation: RolloverObservation) => void,
): () => void {
  const projectRef = scopeProjectRef(input.environmentId, input.projectId);
  const threadRef = scopeThreadRef(input.environmentId, input.threadId);
  const projectAtom = environmentProjects.projectAtom(projectRef);
  const latestTurnAtom = environmentThreadDetails.latestTurnAtom(threadRef);
  const read = (): RolloverObservation => ({
    latestTurn: appAtomRegistry.get(latestTurnAtom),
    boardItems: appAtomRegistry.get(projectAtom)?.boardItems ?? [],
  });
  const notify = () => listener(read());
  const unsubscribeTurn = appAtomRegistry.subscribe(latestTurnAtom, notify);
  const unsubscribeProject = appAtomRegistry.subscribe(projectAtom, notify);
  notify();
  return () => {
    unsubscribeTurn();
    unsubscribeProject();
  };
}

/**
 * Sent to the outgoing thread. It still has the full context, so it is the
 * only agent that can write an accurate handoff — the successor cannot.
 */
export function buildHandoffRequestPrompt(cards: ReadonlyArray<ProjectBoardItem>): string {
  const lines = ["Wrapping this thread up — context is rolling over to a fresh thread.", ""];
  if (cards.length > 0) {
    lines.push("Call board_handoff for:", ...cardLines(cards), "");
  } else {
    lines.push(
      "No board card tracks this work. Create one with board_upsert (status inProgress), then call board_handoff on it.",
      "",
    );
  }
  lines.push(
    "Capture what is done, the decisions worth keeping, and the exact next step.",
    "Point at codebase-memory qualified names instead of re-describing code.",
    "Then stop — do not start new work.",
  );
  return lines.join("\n");
}

/**
 * Seeds the successor. The digest is inlined because it is small and saves the
 * new agent a tool call; the handoff is *not* inlined — it may still be being
 * written by the outgoing thread, so the successor must read it fresh.
 */
export function buildRolloverSeedPrompt(input: {
  readonly items: ReadonlyArray<ProjectBoardItem>;
  readonly cards: ReadonlyArray<ProjectBoardItem>;
  readonly previousTitle: string;
}): string {
  const lines = [
    `Continuing "${input.previousTitle}" in a fresh thread — same branch and worktree, empty context.`,
    "",
    formatProjectBoardDigest(input.items),
    "",
  ];
  if (input.cards.length > 0) {
    lines.push(
      "Before doing anything, call board_get_brief for:",
      ...cardLines(input.cards),
      "",
      "Continue from the next step the latest handoff names. Ask me if the handoff and the digest disagree.",
    );
  } else {
    lines.push("Review the digest above, then ask me what to pick up.");
  }
  return lines.join("\n");
}

type StartTurnValue =
  (typeof threadEnvironment)["startTurn"] extends AtomCommand<infer Value, infer _A, infer _E>
    ? Value
    : never;

/**
 * The whole palette entry lives here, not in `CommandPalette.tsx`: fork
 * features that inline themselves into upstream files are what turn a
 * `git merge upstream/main` into a manual re-application. The call site is two
 * lines — an import and a push — and both sit at the end of a list, which is
 * the cheapest place for a merge to land.
 */
export function buildRolloverCommandItem(input: {
  readonly activeThread: Thread | null;
  readonly projects: ReadonlyArray<Project>;
  readonly handleNewThread: ReturnType<typeof useNewThreadHandler>;
  readonly startThreadTurn: (value: StartTurnValue) => Promise<AtomCommandResult<unknown, unknown>>;
}): CommandPaletteActionItem {
  const { activeThread, projects, handleNewThread, startThreadTurn } = input;
  return {
    kind: "action",
    value: "action:thread-rollover",
    searchTerms: [
      "rollover",
      "continue",
      "hand off",
      "handoff",
      "fresh thread",
      "context",
      "board",
    ],
    title: "Hand off & continue in new thread",
    disabled: activeThread == null,
    icon: <ListTodoIcon className={ITEM_ICON_CLASS} />,
    run: async () => {
      if (!activeThread) return;
      const project = projects.find(
        (entry) =>
          entry.id === activeThread.projectId && entry.environmentId === activeThread.environmentId,
      );
      const boardItems = project?.boardItems ?? [];
      const cards = selectRolloverCards(boardItems, activeThread.id);
      const projectRef = scopeProjectRef(activeThread.environmentId, activeThread.projectId);
      const handoffResult = await startThreadTurn({
        environmentId: activeThread.environmentId,
        input: {
          threadId: activeThread.id,
          message: {
            messageId: newMessageId(),
            role: "user",
            text: buildHandoffRequestPrompt(cards),
            attachments: [],
          },
          runtimeMode: activeThread.runtimeMode,
          interactionMode: activeThread.interactionMode,
          createdAt: new Date().toISOString(),
        },
      });
      if (handoffResult._tag === "Failure") {
        toastManager.add({
          type: "error",
          title: "Could not request a handoff",
          description: "The outgoing thread did not accept the handoff request.",
        });
        return;
      }
      const rolloverResult = await waitForRolloverReady({
        threadId: activeThread.id,
        previousTurnId: activeThread.latestTurn?.turnId ?? null,
        cards,
        initialItems: boardItems,
        observe: (listener) =>
          observeRolloverState(
            {
              environmentId: activeThread.environmentId,
              projectId: activeThread.projectId,
              threadId: activeThread.id,
            },
            listener,
          ),
      });
      if (rolloverResult.status !== "completed") {
        toastManager.add({
          type: "error",
          title:
            rolloverResult.status === "interrupted"
              ? "Handoff cancelled"
              : "Could not complete handoff",
          description: "No successor thread was created; retry rollover from this thread.",
        });
        return;
      }
      const freshItems = readProject(projectRef)?.boardItems ?? rolloverResult.boardItems;
      const freshCards = selectRolloverCards(freshItems, activeThread.id);
      // Same branch and worktree: passing an existing worktreePath is what
      // stops the draft from provisioning a second worktree on send.
      await handleNewThread(projectRef, {
        branch: activeThread.branch,
        worktreePath: activeThread.worktreePath,
        envMode: activeThread.worktreePath ? "worktree" : "local",
        seedPrompt: buildRolloverSeedPrompt({
          items: freshItems,
          cards: freshCards,
          previousTitle: activeThread.title,
        }),
      });
    },
  };
}
