import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type * as PortScanner from "../preview/PortScanner.ts";
import { selectOtherThreadPortOwners } from "./activePortOwners.ts";

export interface ActivePortEntry {
  readonly port: number;
  readonly processName: string | null;
  readonly threadTitle: string;
}

export function formatActivePortsPromptBlock(
  entries: ReadonlyArray<ActivePortEntry>,
): string | null {
  if (entries.length === 0) return null;
  const lines = entries
    .toSorted((left, right) => left.port - right.port)
    .map(
      (entry) =>
        `- ${entry.port}${entry.processName ? ` (${entry.processName})` : ""} — thread "${entry.threadTitle}"`,
    );
  return [
    "<t3_active_ports>",
    "Other threads in this environment currently have local dev servers running on these ports. Do not stop, reuse, or rebind them without checking with the user first:",
    ...lines,
    "</t3_active_ports>",
  ].join("\n");
}

export function prependActivePortsToTurnInput(
  input: string | undefined,
  block: string | null,
): string | undefined {
  if (!block) return input;
  const trimmed = input?.trim();
  if (!trimmed) return block;
  return `${block}\n\n${trimmed}`;
}

/**
 * Builds the turn input a provider actually receives, prefixed with the
 * `<t3_active_ports>` block when other threads own listening ports.
 *
 * This sits on the turn-start critical path, so it is defensive by
 * construction: the port scan is bounded and any failure (or a timeout)
 * degrades to "no block" rather than delaying or failing the turn. Threads are
 * deduplicated before title resolution, so a thread running three dev servers
 * costs one lookup and still contributes three lines.
 */
export const buildActivePortsTurnInputPrefix = Effect.fn("buildActivePortsTurnInputPrefix")(
  function* (input: {
    readonly turnInput: string | undefined;
    readonly currentThreadId: ThreadId;
    readonly portDiscovery: Pick<PortScanner.PortDiscovery["Service"], "scan">;
    readonly getThreadTitle: (threadId: ThreadId) => Effect.Effect<string | null>;
  }) {
    if (!input.turnInput) return input.turnInput;

    const discoveredServers = yield* input.portDiscovery.scan().pipe(
      Effect.timeout("2 seconds"),
      Effect.catchCause(() => Effect.succeed([])),
    );
    const otherOwners = selectOtherThreadPortOwners(discoveredServers, input.currentThreadId);
    if (otherOwners.length === 0) return input.turnInput;

    const titles = new Map<ThreadId, string | null>();
    for (const threadId of new Set(otherOwners.map((owner) => owner.threadId))) {
      titles.set(threadId, yield* input.getThreadTitle(threadId));
    }

    const entries = otherOwners.flatMap((owner) => {
      const threadTitle = titles.get(owner.threadId);
      return threadTitle ? [{ port: owner.port, processName: owner.processName, threadTitle }] : [];
    });
    return prependActivePortsToTurnInput(input.turnInput, formatActivePortsPromptBlock(entries));
  },
);
