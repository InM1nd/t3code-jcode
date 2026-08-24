import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { AtomCommand, AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import type { ProjectBoardItem, ThreadId } from "@t3tools/contracts";
import { formatProjectBoardDigest } from "@t3tools/shared/projectBoard";
import { ListTodoIcon } from "lucide-react";

import type { CommandPaletteActionItem } from "./components/CommandPalette.logic";
import { ITEM_ICON_CLASS } from "./components/CommandPalette.logic";
import { toastManager } from "./components/ui/toast";
import type { useNewThreadHandler } from "./hooks/useHandleNewThread";
import { newMessageId } from "./lib/utils";
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
 * Cards the outgoing thread is accountable for: open cards it created, falling
 * back to whatever the board says is in flight. The fallback matters because a
 * thread that never touched the board still has work worth handing off, and
 * pointing at the in-progress cards beats pointing at nothing.
 */
export function selectRolloverCards(
  items: ReadonlyArray<ProjectBoardItem>,
  threadId: ThreadId,
): ProjectBoardItem[] {
  const open = items.filter(
    (item) => !item.archivedAt && item.status !== "completed" && item.status !== "cancelled",
  );
  const owned = open.filter((item) => item.sourceThreadId === threadId);
  return owned.length > 0 ? owned : open.filter((item) => item.status === "inProgress");
}

function cardLines(cards: ReadonlyArray<ProjectBoardItem>): string[] {
  return cards.map((card) => `- [${card.id}] ${card.title}`);
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
    lines.push("Before doing anything, call board_digest to orient, then ask me what to pick up.");
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
      // The outgoing thread writes the handoff: it is the only agent that
      // still has the context. The successor reads the card fresh rather than
      // carrying an inlined copy, so it cannot race this turn.
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
      // Same branch and worktree: passing an existing worktreePath is what
      // stops the draft from provisioning a second worktree on send.
      await handleNewThread(scopeProjectRef(activeThread.environmentId, activeThread.projectId), {
        branch: activeThread.branch,
        worktreePath: activeThread.worktreePath,
        envMode: activeThread.worktreePath ? "worktree" : "local",
        seedPrompt: buildRolloverSeedPrompt({
          items: boardItems,
          cards,
          previousTitle: activeThread.title,
        }),
      });
    },
  };
}
