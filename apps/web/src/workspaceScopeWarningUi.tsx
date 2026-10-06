import { findOutOfWorkspaceScopePath } from "@t3tools/shared/workspaceScope";

const MUTATING_WORK_ITEMS = new Set(["command_execution", "file_change"]);

export function workspaceScopeMismatchPath(input: {
  readonly worktreePath: string | null | undefined;
  readonly itemType: string | undefined;
  readonly toolData: unknown;
}): string | undefined {
  if (!input.worktreePath || !input.itemType || !MUTATING_WORK_ITEMS.has(input.itemType)) {
    return undefined;
  }
  return findOutOfWorkspaceScopePath({
    workspaceRoot: input.worktreePath,
    data: input.toolData,
    includeFilePaths: true,
  });
}

export function WorkspaceScopeWarningNote(props: { readonly usedPath: string }) {
  return (
    <p className="ms-7 py-1 text-xs leading-5 text-warning" data-testid="workspace-scope-warning">
      Agent used {props.usedPath} instead of this thread's worktree.
    </p>
  );
}
