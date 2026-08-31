export function formatWorkspaceScopePromptBlock(input: {
  readonly cwd: string;
  readonly branch: string | null;
}): string {
  const branchLine = input.branch ? `Branch: ${input.branch}` : "Branch: (unknown)";
  return [
    "<t3_workspace_scope>",
    "This thread is attached to a Git worktree. All file edits, commits, git commands, and dev servers must use this directory as the working directory. Do not switch to another clone of the same repository.",
    `Path: ${input.cwd}`,
    branchLine,
    "If you need a different path, stop and ask the user to confirm that exact path first.",
    "</t3_workspace_scope>",
  ].join("\n");
}

export function prependWorkspaceScopeToTurnInput(
  input: string | undefined,
  block: string | null,
): string | undefined {
  if (!block) return input;
  const trimmed = input?.trim();
  if (!trimmed) return block;
  return `${block}\n\n${trimmed}`;
}
