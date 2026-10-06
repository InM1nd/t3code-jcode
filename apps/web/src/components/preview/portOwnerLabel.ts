import type { ThreadId } from "@t3tools/contracts";

export function portOwnerLabel(input: {
  readonly terminal: { readonly threadId: ThreadId; readonly terminalId: string } | null;
  readonly currentThreadId: ThreadId;
  readonly ownerTitle: string | null;
}): string | null {
  if (!input.terminal || input.terminal.threadId === input.currentThreadId) return null;
  return input.ownerTitle ?? "another thread";
}
