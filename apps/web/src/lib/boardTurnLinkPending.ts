import type { ProjectBoardItemId, ThreadId } from "@t3tools/contracts";

/**
 * In-memory pending links: after Board → Implement, the first turn on that
 * thread should be attached to the card without requiring an MCP call.
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
  if (itemId) {
    pendingByThreadId.delete(threadId);
  }
  return itemId;
}

export function peekBoardItemAwaitingTurnLink(threadId: ThreadId): ProjectBoardItemId | null {
  return pendingByThreadId.get(threadId) ?? null;
}
