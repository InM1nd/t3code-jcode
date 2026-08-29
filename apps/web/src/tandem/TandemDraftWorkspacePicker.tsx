import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { FolderGit2Icon, FolderIcon, PlusIcon } from "lucide-react";
import { memo, useMemo, useState } from "react";

import { useComposerDraftStore, type DraftId } from "../composerDraftStore";
import { useThreadShellsForProjectRefs } from "../state/entities";
import { Button } from "../components/ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "../components/ui/menu";
import { listKnownWorktrees, worktreeLabel } from "./workspaceSelection";

/** Explicit worktree target for a fresh draft. Model selection stays in the composer. */
export const TandemDraftWorkspacePicker = memo(function TandemDraftWorkspacePicker({
  draftId,
}: {
  readonly draftId: DraftId;
}) {
  const draft = useComposerDraftStore((store) => store.getDraftSession(draftId));
  const setDraftThreadContext = useComposerDraftStore((store) => store.setDraftThreadContext);
  const projectRef = useMemo(
    () => (draft ? scopeProjectRef(draft.environmentId, draft.projectId) : null),
    [draft],
  );
  const threads = useThreadShellsForProjectRefs(projectRef ? [projectRef] : []);
  const worktrees = useMemo(() => listKnownWorktrees(threads), [threads]);
  const [selectedLocal, setSelectedLocal] = useState(false);

  if (!draft || !projectRef) return null;

  const selectCurrentCheckout = () => {
    setDraftThreadContext(draftId, {
      projectRef,
      branch: null,
      worktreePath: null,
      envMode: "local",
      startFromOrigin: false,
    });
    setSelectedLocal(true);
  };
  const selectExistingWorktree = (worktree: (typeof worktrees)[number]) => {
    setDraftThreadContext(draftId, {
      projectRef,
      branch: worktree.branch,
      worktreePath: worktree.worktreePath,
      envMode: "worktree",
      startFromOrigin: false,
    });
    setSelectedLocal(false);
  };
  const selectNewWorktree = () => {
    setDraftThreadContext(draftId, {
      projectRef,
      worktreePath: null,
      envMode: "worktree",
      startFromOrigin: false,
    });
    setSelectedLocal(false);
  };

  const label =
    draft.worktreePath != null
      ? worktreeLabel({ branch: draft.branch, worktreePath: draft.worktreePath })
      : draft.envMode === "worktree"
        ? "New worktree"
        : selectedLocal
          ? "Current checkout"
          : "Choose worktree";

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="min-w-0 justify-start gap-1.5"
            data-composer-context-control
          >
            <FolderGit2Icon className="size-3 shrink-0" />
            <span className="truncate">{label}</span>
          </Button>
        }
      />
      <MenuPopup align="start" className="w-72">
        <MenuGroup>
          <MenuGroupLabel>Where should this thread work?</MenuGroupLabel>
          <MenuItem onClick={selectCurrentCheckout}>
            <FolderIcon className="size-3" />
            Current checkout
          </MenuItem>
          <MenuItem onClick={selectNewWorktree}>
            <PlusIcon className="size-3" />
            New worktree
          </MenuItem>
        </MenuGroup>
        {worktrees.length > 0 ? (
          <>
            <MenuSeparator />
            <MenuGroup>
              <MenuGroupLabel>Existing worktrees</MenuGroupLabel>
              {worktrees.map((worktree) => (
                <MenuItem
                  key={worktree.worktreePath}
                  onClick={() => selectExistingWorktree(worktree)}
                  className="flex-col items-start gap-0.5"
                >
                  <span className="flex items-center gap-1.5">
                    <FolderGit2Icon className="size-3" />
                    {worktreeLabel(worktree)}
                  </span>
                  <span className="max-w-full truncate pl-[18px] text-[11px] text-muted-foreground">
                    {worktree.worktreePath}
                  </span>
                </MenuItem>
              ))}
            </MenuGroup>
          </>
        ) : null}
      </MenuPopup>
    </Menu>
  );
});
