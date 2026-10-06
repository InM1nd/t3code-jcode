// apps/web/src/components/preview/portOwnerLabel.test.ts
import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { portOwnerLabel } from "./portOwnerLabel.ts";

const currentThreadId = ThreadId.make("thread-current");
const otherThreadId = ThreadId.make("thread-other");

describe("portOwnerLabel", () => {
  it("returns null when there is no terminal owner", () => {
    expect(portOwnerLabel({ terminal: null, currentThreadId, ownerTitle: null })).toBeNull();
  });

  it("returns null when the owner is the current thread", () => {
    expect(
      portOwnerLabel({
        terminal: { threadId: currentThreadId, terminalId: "term-1" },
        currentThreadId,
        ownerTitle: "My thread",
      }),
    ).toBeNull();
  });

  it("returns the owner's title when known", () => {
    expect(
      portOwnerLabel({
        terminal: { threadId: otherThreadId, terminalId: "term-1" },
        currentThreadId,
        ownerTitle: "Landing redesign",
      }),
    ).toBe("Landing redesign");
  });

  it("falls back to a generic label while the owner's title has not loaded yet", () => {
    expect(
      portOwnerLabel({
        terminal: { threadId: otherThreadId, terminalId: "term-1" },
        currentThreadId,
        ownerTitle: null,
      }),
    ).toBe("another thread");
  });
});
