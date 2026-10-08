import { assert, it } from "@effect/vitest";
import {
  ProjectBoardItemId,
  ThreadId,
  type DiscoveredLocalServer,
  type ProjectBoardItem,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { describe, expect } from "vite-plus/test";

import {
  applyTurnContext,
  formatWorkspaceScopePromptBlock,
  isProviderSlashCommand,
  selectOtherThreadPortOwners,
} from "./turnContextPrompt.ts";

const thread = (id: string) => ThreadId.make(id);

const server = (
  port: number,
  owner: string | null,
  processName: string | null = "node",
): DiscoveredLocalServer => ({
  host: "127.0.0.1",
  port,
  url: `http://127.0.0.1:${port}`,
  processName,
  pid: 1,
  terminal: owner === null ? null : { threadId: thread(owner), terminalId: "term" },
});

describe("turnContextPrompt", () => {
  it("keeps another thread's listener and skips this thread", () => {
    expect(
      selectOtherThreadPortOwners(
        [server(5173, "other"), server(3000, "current"), server(8080, null)],
        thread("current"),
      ),
    ).toEqual([{ port: 5173, processName: "node", threadId: thread("other") }]);
  });

  it("names the worktree path and branch", () => {
    expect(
      formatWorkspaceScopePromptBlock({ cwd: "/repo/.t3/worktrees/feature", branch: "feature" }),
    ).toContain("Path: /repo/.t3/worktrees/feature");
  });

  it.effect("prefixes other listeners and still sends the user text when the scan fails", () =>
    Effect.gen(function* () {
      const prefixed = yield* applyTurnContext({
        text: "ship it",
        threadId: thread("current"),
        worktreePath: "/repo/.t3/worktrees/feature",
        branch: "feature",
        boardItems: [
          {
            id: ProjectBoardItemId.make("card-1"),
            title: "Ship the prompt",
            status: "inProgress",
            source: "user",
            createdAt: "2026-10-06T00:00:00.000Z",
            updatedAt: "2026-10-06T00:00:00.000Z",
          } as ProjectBoardItem,
        ],
        portDiscovery: { scan: () => Effect.succeed([server(5173, "other")]) },
        getThreadTitle: () => Effect.succeed("Shop"),
      });
      assert.isTrue(prefixed.startsWith("<t3_active_ports>"));
      assert.include(prefixed, "Ship the prompt");
      assert.include(prefixed, 'thread "Shop"');
      assert.isTrue(prefixed.endsWith("ship it"));

      const unchanged = yield* applyTurnContext({
        text: "ship it",
        threadId: thread("current"),
        worktreePath: null,
        branch: null,
        portDiscovery: { scan: () => Effect.die("scanner down") },
        getThreadTitle: () => Effect.die("no title"),
      });
      assert.strictEqual(unchanged, "ship it");
    }),
  );

  it("recognizes a leading slash as a provider command", () => {
    expect(isProviderSlashCommand("/compact")).toBe(true);
    expect(isProviderSlashCommand("  /goal clear")).toBe(true);
    expect(isProviderSlashCommand("/compress")).toBe(true);
    expect(isProviderSlashCommand("ship /compact")).toBe(false);
  });

  it.effect("leaves slash commands unprefixed", () =>
    Effect.gen(function* () {
      const text = yield* applyTurnContext({
        text: " /compact",
        threadId: thread("current"),
        worktreePath: "/repo/.t3/worktrees/feature",
        branch: "feature",
        boardItems: [
          {
            id: ProjectBoardItemId.make("card-1"),
            title: "Ship the prompt",
            status: "inProgress",
            source: "user",
            createdAt: "2026-10-06T00:00:00.000Z",
            updatedAt: "2026-10-06T00:00:00.000Z",
          } as ProjectBoardItem,
        ],
        portDiscovery: { scan: () => Effect.die("scanner should not run") },
        getThreadTitle: () => Effect.die("title should not be read"),
      });
      assert.strictEqual(text, " /compact");
    }),
  );
});
