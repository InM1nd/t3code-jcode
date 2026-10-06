import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { ProjectBoardItem } from "@t3tools/contracts";
import { formatProjectBoardDigest } from "@t3tools/shared/projectBoard";
import { ListTodoIcon } from "lucide-react";

import type { CommandPaletteActionItem } from "./components/CommandPalette.logic";
import { ITEM_ICON_CLASS } from "./components/CommandPalette.logic";
import { useComposerDraftStore, type ComposerThreadTarget } from "./composerDraftStore";
import { useRightPanelStore } from "./rightPanelStore";
import type { Thread } from "./types";

export function buildProjectBoardCommandItems(input: {
  readonly activeThread: Thread | null;
  readonly composerTarget: ComposerThreadTarget | null;
  readonly items: ReadonlyArray<ProjectBoardItem>;
}): CommandPaletteActionItem[] {
  const boardThreadRef = input.activeThread
    ? scopeThreadRef(input.activeThread.environmentId, input.activeThread.id)
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
      disabled: input.composerTarget === null,
      icon: <ListTodoIcon className={ITEM_ICON_CLASS} />,
      run: async () => {
        if (!input.composerTarget) return;
        const digest = formatProjectBoardDigest(input.items);
        const existing =
          useComposerDraftStore.getState().getComposerDraft(input.composerTarget)?.prompt ?? "";
        const nextPrompt = existing.trim().length > 0 ? `${existing.trim()}\n\n${digest}` : digest;
        useComposerDraftStore.getState().setPrompt(input.composerTarget, nextPrompt);
      },
    },
  ];
}
