import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

const currentThreadId = ThreadId.make("thread-current");
const otherThreadId = ThreadId.make("thread-other");
const otherRef = { environmentId: EnvironmentId.make("env-1"), threadId: otherThreadId };

const mocks = vi.hoisted(() => ({
  ownerRef: null as typeof otherRef | null,
  ownerShell: null as { title: string } | null,
}));

vi.mock("~/state/entities", () => ({
  findThreadRef: () => mocks.ownerRef,
  useThreadShell: () => mocks.ownerShell,
}));

import { PreviewLocalServerCard } from "./PreviewLocalServerCard";

const threadRef = { environmentId: EnvironmentId.make("env-1"), threadId: currentThreadId };

function server(terminal: { threadId: ThreadId; terminalId: string } | null) {
  return {
    host: "localhost",
    port: 5173,
    url: "http://localhost:5173",
    requestedUrl: "http://localhost:5173",
    processName: "vite",
    pid: 1234,
    terminal,
    source: "scanner" as const,
  };
}

describe("PreviewLocalServerCard", () => {
  it("renders no owner badge when the port has no terminal owner", () => {
    mocks.ownerRef = null;
    mocks.ownerShell = null;
    const html = renderToStaticMarkup(
      <PreviewLocalServerCard threadRef={threadRef} server={server(null)} onOpen={() => {}} />,
    );
    expect(html).not.toContain("another thread");
  });

  it("renders no owner badge when the port belongs to the current thread", () => {
    mocks.ownerRef = null;
    mocks.ownerShell = null;
    const html = renderToStaticMarkup(
      <PreviewLocalServerCard
        threadRef={threadRef}
        server={server({ threadId: currentThreadId, terminalId: "term-1" })}
        onOpen={() => {}}
      />,
    );
    expect(html).not.toContain("another thread");
  });

  it("renders the owning thread's title as a badge for another thread's port", () => {
    mocks.ownerRef = otherRef;
    mocks.ownerShell = { title: "Landing redesign" };
    const html = renderToStaticMarkup(
      <PreviewLocalServerCard
        threadRef={threadRef}
        server={server({ threadId: otherThreadId, terminalId: "term-1" })}
        onOpen={() => {}}
      />,
    );
    expect(html).toContain("Landing redesign");
  });
});
