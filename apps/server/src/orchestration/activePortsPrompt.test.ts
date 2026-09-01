// apps/server/src/orchestration/activePortsPrompt.test.ts
import type { DiscoveredLocalServer } from "@t3tools/contracts";
import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
  buildActivePortsTurnInputPrefix,
  formatActivePortsPromptBlock,
  prependActivePortsToTurnInput,
} from "./activePortsPrompt.ts";

describe("activePortsPrompt", () => {
  it("returns null when no other thread owns a port", () => {
    expect(formatActivePortsPromptBlock([])).toBeNull();
  });

  it("lists ports sorted ascending with process name and owning thread", () => {
    const block = formatActivePortsPromptBlock([
      { port: 5173, processName: "vite", threadTitle: "Landing redesign" },
      { port: 3000, processName: null, threadTitle: "Fix auth bug" },
    ]);
    expect(block).toContain("<t3_active_ports>");
    expect(block).toContain("</t3_active_ports>");
    const lines = block!.split("\n");
    const port3000Index = lines.findIndex((line) => line.includes("3000"));
    const port5173Index = lines.findIndex((line) => line.includes("5173"));
    expect(port3000Index).toBeGreaterThan(-1);
    expect(port5173Index).toBeGreaterThan(port3000Index);
    expect(block).toContain('3000 — thread "Fix auth bug"');
    expect(block).toContain('5173 (vite) — thread "Landing redesign"');
  });

  it("prepends the block so the constraint is visible before the user prompt", () => {
    expect(
      prependActivePortsToTurnInput("fix the bug", "<t3_active_ports>\nports\n</t3_active_ports>"),
    ).toBe("<t3_active_ports>\nports\n</t3_active_ports>\n\nfix the bug");
  });

  it("passes through turn input unchanged when the block is null", () => {
    expect(prependActivePortsToTurnInput("fix the bug", null)).toBe("fix the bug");
  });
});

const otherThreadId = ThreadId.make("thread-other");
const currentThreadId = ThreadId.make("thread-current");

function server(port: number, threadId: ThreadId | null): DiscoveredLocalServer {
  return {
    host: "localhost",
    port,
    url: `http://localhost:${port}`,
    processName: "vite",
    pid: null,
    terminal: threadId ? { threadId, terminalId: "term-1" } : null,
  };
}

function run(input: {
  readonly servers: ReadonlyArray<DiscoveredLocalServer> | "die";
  readonly title: string | null;
  readonly onTitleLookup?: () => void;
}) {
  return buildActivePortsTurnInputPrefix({
    turnInput: "fix the bug",
    currentThreadId,
    portDiscovery: {
      scan: () =>
        input.servers === "die"
          ? Effect.die(new Error("lsof exploded"))
          : Effect.succeed(input.servers),
    },
    getThreadTitle: () => {
      input.onTitleLookup?.();
      return Effect.succeed(input.title);
    },
  });
}

describe("buildActivePortsTurnInputPrefix", () => {
  it.effect("prefixes the turn input with ports owned by another thread", () =>
    Effect.gen(function* () {
      const result = yield* run({
        servers: [server(5173, otherThreadId)],
        title: "Landing redesign",
      });
      expect(result).toContain("<t3_active_ports>");
      expect(result).toContain('5173 (vite) — thread "Landing redesign"');
      expect(result).toContain("fix the bug");
    }),
  );

  it.effect("resolves each owning thread's title once no matter how many ports it owns", () =>
    Effect.gen(function* () {
      let lookups = 0;
      const result = yield* run({
        servers: [server(5173, otherThreadId), server(3000, otherThreadId)],
        title: "Landing redesign",
        onTitleLookup: () => {
          lookups += 1;
        },
      });
      expect(lookups).toBe(1);
      expect(result).toContain("3000");
      expect(result).toContain("5173");
    }),
  );

  it.effect("drops entries whose owning thread cannot be resolved", () =>
    Effect.gen(function* () {
      expect(yield* run({ servers: [server(5173, otherThreadId)], title: null })).toBe(
        "fix the bug",
      );
    }),
  );

  it.effect("ignores ports owned by the current thread or by no thread", () =>
    Effect.gen(function* () {
      const result = yield* run({
        servers: [server(5173, currentThreadId), server(3000, null)],
        title: "Landing redesign",
      });
      expect(result).toBe("fix the bug");
    }),
  );

  it.effect("leaves the turn input untouched when the port scan blows up", () =>
    Effect.gen(function* () {
      expect(yield* run({ servers: "die", title: "Landing redesign" })).toBe("fix the bug");
    }),
  );

  it.effect("skips the scan entirely for a turn with no text input", () =>
    Effect.gen(function* () {
      let scanned = false;
      const result = yield* buildActivePortsTurnInputPrefix({
        turnInput: undefined,
        currentThreadId,
        portDiscovery: {
          scan: () => {
            scanned = true;
            return Effect.succeed([]);
          },
        },
        getThreadTitle: () => Effect.succeed(null),
      });
      expect(result).toBeUndefined();
      expect(scanned).toBe(false);
    }),
  );
});
