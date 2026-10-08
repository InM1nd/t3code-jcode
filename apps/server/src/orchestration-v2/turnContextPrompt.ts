import type {
  DiscoveredLocalServer,
  ProjectBoardItem,
  ProjectId,
  ThreadId,
} from "@t3tools/contracts";
import { formatProjectBoardDigest } from "@t3tools/shared/projectBoard";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";

import type * as PortScanner from "../preview/PortScanner.ts";

/**
 * Production turns include the worktree, port, and board prefix. The default
 * stays off so recorded provider sessions keep the user's exact text.
 */
export const TurnContextPrompts = Context.Reference<boolean>(
  "t3/orchestration-v2/TurnContextPrompts",
  { defaultValue: () => false },
);

type PortScan = PortScanner.PortDiscovery["Service"]["scan"];

let registeredPortScan: PortScan | null = null;

/** The server registers the shared port scanner. Tests leave this unset. */
export function registerTurnPortScan(scan: PortScan): void {
  registeredPortScan = scan;
}

export function turnPortScan(): PortScan {
  return registeredPortScan ?? (() => Effect.succeed([]));
}

let registeredBoardItems:
  | ((projectId: ProjectId) => Effect.Effect<ReadonlyArray<ProjectBoardItem>>)
  | null = null;

/** BoardService registers this so a turn can read cards without depending on that layer. */
export function registerTurnBoardItems(
  read: (projectId: ProjectId) => Effect.Effect<ReadonlyArray<ProjectBoardItem>>,
): void {
  registeredBoardItems = read;
}

export function turnBoardItems(
  projectId: ProjectId,
): Effect.Effect<ReadonlyArray<ProjectBoardItem>> {
  const read = registeredBoardItems;
  if (!read) return Effect.succeed([]);
  return read(projectId).pipe(
    Effect.timeout(Duration.seconds(2)),
    Effect.catchCause(() => Effect.succeed([])),
  );
}

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

function formatActivePortsPromptBlock(
  entries: ReadonlyArray<{
    readonly port: number;
    readonly processName: string | null;
    readonly threadTitle: string;
  }>,
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

function prependBlock(input: string, block: string | null): string {
  if (!block) return input;
  const trimmed = input.trim();
  if (!trimmed) return block;
  return `${block}\n\n${trimmed}`;
}

/**
 * A leading slash is a provider command (`/compact`, `/goal`, `/compress`, Pi
 * expansions). Prefixing it makes the adapter treat the command as a prompt.
 */
export function isProviderSlashCommand(text: string): boolean {
  return text.trimStart().startsWith("/");
}

/**
 * Prefixes the text a provider receives. A port scan or board read that fails
 * or times out leaves the rest of the turn unchanged. Slash commands pass
 * through unchanged.
 */
export function applyTurnContext(input: {
  readonly text: string;
  readonly threadId: ThreadId;
  readonly worktreePath: string | null;
  readonly branch: string | null;
  readonly boardItems?: ReadonlyArray<ProjectBoardItem>;
  readonly portDiscovery: Pick<PortScanner.PortDiscovery["Service"], "scan">;
  readonly getThreadTitle: (threadId: ThreadId) => Effect.Effect<string | null>;
}): Effect.Effect<string> {
  return Effect.gen(function* () {
    if (isProviderSlashCommand(input.text)) return input.text;
    let text = input.worktreePath
      ? prependBlock(
          input.text,
          formatWorkspaceScopePromptBlock({ cwd: input.worktreePath, branch: input.branch }),
        )
      : input.text;
    const activeBoardItems = (input.boardItems ?? []).filter((item) => !item.archivedAt);
    if (activeBoardItems.length > 0) {
      text = prependBlock(text, formatProjectBoardDigest(input.boardItems ?? []));
    }
    if (!text.trim()) return text;

    const discovered = yield* input.portDiscovery.scan().pipe(
      Effect.timeout(Duration.seconds(2)),
      Effect.catchCause(() => Effect.succeed([])),
    );
    const otherOwners = selectOtherThreadPortOwners(discovered, input.threadId);
    if (otherOwners.length === 0) return text;

    const titles = new Map<ThreadId, string | null>();
    for (const threadId of new Set(otherOwners.map((owner) => owner.threadId))) {
      titles.set(
        threadId,
        yield* input.getThreadTitle(threadId).pipe(Effect.orElseSucceed(() => null)),
      );
    }
    const entries = otherOwners.flatMap((owner) => {
      const threadTitle = titles.get(owner.threadId);
      return threadTitle ? [{ port: owner.port, processName: owner.processName, threadTitle }] : [];
    });
    return prependBlock(text, formatActivePortsPromptBlock(entries));
  }).pipe(Effect.orElseSucceed(() => input.text));
}
