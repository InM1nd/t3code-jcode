import { ThreadId, type DiscoveredLocalServer } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { selectOtherThreadPortOwners } from "./activePortOwners.ts";

const currentThreadId = ThreadId.make("thread-current");
const otherThreadId = ThreadId.make("thread-other");

function server(overrides: Partial<DiscoveredLocalServer>): DiscoveredLocalServer {
  return {
    host: "localhost",
    port: 5173,
    url: "http://localhost:5173",
    processName: null,
    pid: null,
    terminal: null,
    ...overrides,
  };
}

describe("selectOtherThreadPortOwners", () => {
  it("excludes ports with no terminal owner", () => {
    expect(selectOtherThreadPortOwners([server({ terminal: null })], currentThreadId)).toEqual([]);
  });

  it("excludes ports owned by the current thread", () => {
    const servers = [server({ terminal: { threadId: currentThreadId, terminalId: "term-1" } })];
    expect(selectOtherThreadPortOwners(servers, currentThreadId)).toEqual([]);
  });

  it("includes ports owned by other threads, one entry per port", () => {
    const servers = [
      server({
        port: 5173,
        processName: "vite",
        terminal: { threadId: otherThreadId, terminalId: "term-1" },
      }),
      server({
        port: 5174,
        processName: "vite",
        terminal: { threadId: otherThreadId, terminalId: "term-2" },
      }),
    ];
    expect(selectOtherThreadPortOwners(servers, currentThreadId)).toEqual([
      { port: 5173, processName: "vite", threadId: otherThreadId },
      { port: 5174, processName: "vite", threadId: otherThreadId },
    ]);
  });
});
