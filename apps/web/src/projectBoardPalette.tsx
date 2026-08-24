import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { formatProjectBoardDigest } from "@t3tools/shared/projectBoard";
import { ListTodoIcon } from "lucide-react";

import type { CommandPaletteActionItem } from "./components/CommandPalette.logic";
import { ITEM_ICON_CLASS } from "./components/CommandPalette.logic";
import { useComposerDraftStore } from "./composerDraftStore";
import { useRightPanelStore } from "./rightPanelStore";
import type { Project, Thread } from "./types";

/**
 * Project board entries for the command palette.
 *
 * Fork-owned palette items live in fork-owned files; `CommandPalette.tsx` only
 * pushes them. Upstream edits that file constantly, and inlined fork blocks are
 * what turn `git merge upstream/main` into hand re-application.
 */

interface PaletteDraftThread {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly projectId: ProjectId;
}

export function buildProjectBoardCommandItems(input: {
  readonly activeThread: Thread | null;
  readonly activeDraftThread: PaletteDraftThread | null;
  readonly projects: ReadonlyArray<Project>;
}): CommandPaletteActionItem[] {
  const { activeThread, activeDraftThread, projects } = input;
  const boardThreadRef = activeThread
    ? scopeThreadRef(activeThread.environmentId, activeThread.id)
    : activeDraftThread
      ? scopeThreadRef(activeDraftThread.environmentId, activeDraftThread.threadId)
      : null;

  return [
    {
      kind: "action",
      value: "action:toggle-project-board",
      searchTerms: ["board", "project board", "todos", "checklist", "tasks"],
      title: "Toggle project board",
      disabled: boardThreadRef === null,
      icon: <ListTodoIcon className={ITEM_ICON_CLASS} />,
      shortcutCommand: "board.toggle",
      run: async () => {
        if (!boardThreadRef) return;
        useRightPanelStore.getState().toggle(boardThreadRef, "board");
      },
    },
    {
      kind: "action",
      value: "action:insert-project-board-digest",
      searchTerms: ["board", "digest", "summary", "todos", "status", "project board"],
      title: "Insert project board digest",
      disabled: activeThread == null && activeDraftThread == null,
      icon: <ListTodoIcon className={ITEM_ICON_CLASS} />,
      run: async () => {
        const environmentId =
          activeThread?.environmentId ?? activeDraftThread?.environmentId ?? null;
        const projectId = activeThread?.projectId ?? activeDraftThread?.projectId ?? null;
        if (!environmentId || !projectId) return;
        const project = projects.find(
          (entry) => entry.id === projectId && entry.environmentId === environmentId,
        );
        const digest = formatProjectBoardDigest(project?.boardItems ?? []);
        const draftSession = useComposerDraftStore
          .getState()
          .getDraftSessionByProjectRef(scopeProjectRef(environmentId, projectId));
        const composerTarget =
          activeThread != null
            ? scopeThreadRef(activeThread.environmentId, activeThread.id)
            : (draftSession?.draftId ?? null);
        if (!composerTarget) return;
        const existing =
          useComposerDraftStore.getState().getComposerDraft(composerTarget)?.prompt ?? "";
        const nextPrompt = existing.trim().length > 0 ? `${existing.trim()}\n\n${digest}` : digest;
        useComposerDraftStore.getState().setPrompt(composerTarget, nextPrompt);
      },
    },
  ];
}
