import type { DiscoveredLocalServer, ThreadId } from "@t3tools/contracts";

export interface OtherThreadPortOwner {
  readonly port: number;
  readonly processName: string | null;
  readonly threadId: ThreadId;
}

export function selectOtherThreadPortOwners(
  servers: ReadonlyArray<DiscoveredLocalServer>,
  currentThreadId: ThreadId,
): ReadonlyArray<OtherThreadPortOwner> {
  const owners: OtherThreadPortOwner[] = [];
  for (const server of servers) {
    if (!server.terminal || server.terminal.threadId === currentThreadId) continue;
    owners.push({
      port: server.port,
      processName: server.processName,
      threadId: server.terminal.threadId,
    });
  }
  return owners;
}
