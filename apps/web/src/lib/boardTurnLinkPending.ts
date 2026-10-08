import type { ProjectBoardItemId, ThreadId } from "@t3tools/contracts";

/**
 * After Launch, the first provider turn on that thread is attached to the
 * card. The mark lives in memory for this page session.
 */
const pendingByThreadId = new Map<ThreadId, ProjectBoardItemId>();

export function markBoardItemAwaitingTurnLink(
  threadId: ThreadId,
  itemId: ProjectBoardItemId,
): void {
  pendingByThreadId.set(threadId, itemId);
}

export function consumeBoardItemAwaitingTurnLink(threadId: ThreadId): ProjectBoardItemId | null {
  const itemId = pendingByThreadId.get(threadId) ?? null;
  if (itemId) pendingByThreadId.delete(threadId);
  return itemId;
}

export function peekBoardItemAwaitingTurnLink(threadId: ThreadId): ProjectBoardItemId | null {
  return pendingByThreadId.get(threadId) ?? null;
}
