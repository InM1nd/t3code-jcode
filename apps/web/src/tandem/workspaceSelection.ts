export interface KnownWorktreeInput {
  readonly branch: string | null;
  readonly worktreePath: string | null;
  readonly updatedAt: string;
  readonly archivedAt?: string | null;
}

export interface KnownWorktree {
  readonly branch: string | null;
  readonly worktreePath: string;
}

/** Lists worktrees already known to this project, newest first, once per path. */
export function listKnownWorktrees(
  threads: ReadonlyArray<KnownWorktreeInput>,
): ReadonlyArray<KnownWorktree> {
  const byPath = new Map<string, KnownWorktreeInput>();
  for (const thread of threads) {
    const path = thread.worktreePath?.trim();
    if (!path || thread.archivedAt != null) continue;
    const previous = byPath.get(path);
    if (!previous || Date.parse(thread.updatedAt) > Date.parse(previous.updatedAt)) {
      byPath.set(path, thread);
    }
  }
  return Array.from(byPath.values())
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .map((thread) => ({ branch: thread.branch, worktreePath: thread.worktreePath!.trim() }));
}

export function worktreeLabel(worktree: KnownWorktree): string {
  return worktree.branch ?? worktree.worktreePath.split("/").filter(Boolean).at(-1) ?? "Worktree";
}
