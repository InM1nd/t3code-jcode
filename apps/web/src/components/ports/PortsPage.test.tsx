import { EnvironmentId, ThreadId, type DiscoveredLocalServer } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

const envId = EnvironmentId.make("env-1");
const otherThreadId = ThreadId.make("thread-other");

const mocks = vi.hoisted(() => ({
  servers: [] as ReadonlyArray<DiscoveredLocalServer>,
  environments: [] as ReadonlyArray<{ environmentId: EnvironmentId; label: string }>,
  threadRefs: [] as ReadonlyArray<{ environmentId: EnvironmentId; threadId: ThreadId }>,
}));

vi.mock("~/state/environments", () => ({
  useEnvironments: () => ({ environments: mocks.environments }),
}));
vi.mock("~/state/entities", () => ({
  useActiveEnvironmentId: () => envId,
  useEnvironmentThreadRefs: () => mocks.threadRefs,
  useThreadShell: () => ({ title: "Landing redesign" }),
}));
vi.mock("~/browser/browserTargetResolver", () => ({
  resolveDiscoveredServerUrl: (_environmentId: EnvironmentId, url: string) => url,
}));
vi.mock("~/localApi", () => ({ readLocalApi: () => undefined }));
vi.mock("~/portDiscoveryState", () => ({
  useDiscoveredPorts: () => mocks.servers,
}));
vi.mock("./LocalDomainsPortControls", () => ({ LocalDomainsPortControls: () => null }));
// PortsPage isn't rendered inside a <RouterProvider> in this unit test, and
// @tanstack/react-router's <Link> throws without one. UsagePage's sibling
// ProviderLimitsPopover.test.tsx hits the same issue and works around it the
// same way: swap Link for a plain anchor.
vi.mock("@tanstack/react-router", () => ({ Link: "a" }));

import { PortsPage } from "./PortsPage";

describe("PortsPage", () => {
  it("shows an empty state when no ports are discovered", () => {
    mocks.servers = [];
    mocks.environments = [{ environmentId: envId, label: "Local" }];
    const html = renderToStaticMarkup(<PortsPage />);
    expect(html).toContain("No local dev servers");
  });

  it("shows an environment selector labeled with the environment name when there are multiple environments", () => {
    mocks.servers = [];
    mocks.environments = [
      { environmentId: envId, label: "Local" },
      { environmentId: EnvironmentId.make("env-2"), label: "Remote box" },
    ];
    const html = renderToStaticMarkup(<PortsPage />);
    // The visible select value must show the environment's label, not its raw
    // id (base-ui's <SelectValue/> only resolves that by itself post-mount,
    // so PortsPage passes the label as children explicitly).
    expect(html).toMatch(/data-slot="select-value"[^>]*>Local</);
  });

  it("lists a discovered port with its owning thread", () => {
    mocks.environments = [{ environmentId: envId, label: "Local" }];
    mocks.threadRefs = [{ environmentId: envId, threadId: otherThreadId }];
    mocks.servers = [
      {
        host: "localhost",
        port: 5173,
        url: "http://localhost:5173",
        processName: "vite",
        pid: 1234,
        terminal: { threadId: otherThreadId, terminalId: "term-1" },
      },
    ];
    const html = renderToStaticMarkup(<PortsPage />);
    expect(html).toContain("localhost:5173");
    expect(html).toContain("vite");
    expect(html).toContain("Landing redesign");
  });

  it("falls back to a generic owner label until the owning thread's ref is known", () => {
    mocks.environments = [{ environmentId: envId, label: "Local" }];
    // Thread refs read reactively, so a row rendered before they arrive shows
    // the fallback and swaps to the title once the atom emits.
    mocks.threadRefs = [];
    mocks.servers = [
      {
        host: "localhost",
        port: 5173,
        url: "http://localhost:5173",
        processName: "vite",
        pid: 1234,
        terminal: { threadId: otherThreadId, terminalId: "term-1" },
      },
    ];
    const html = renderToStaticMarkup(<PortsPage />);
    expect(html).toContain("Another thread");
    expect(html).not.toContain("Landing redesign");
  });

  it("sorts by host before port so same-port rows on different hosts don't look identical", () => {
    mocks.environments = [{ environmentId: envId, label: "Local" }];
    mocks.servers = [
      {
        host: "192.168.1.5",
        port: 3000,
        url: "http://192.168.1.5:3000",
        processName: "next",
        pid: null,
        terminal: null,
      },
      {
        host: "localhost",
        port: 3000,
        url: "http://localhost:3000",
        processName: "vite",
        pid: null,
        terminal: null,
      },
    ];
    const html = renderToStaticMarkup(<PortsPage />);
    // "192.168.1.5" sorts before "localhost" (localeCompare), so it must
    // appear first in the markup despite both rows sharing port 3000 — proof
    // the comparator breaks ties on host, not just port.
    expect(html.indexOf("192.168.1.5:3000")).toBeLessThan(html.indexOf("localhost:3000"));
  });

  it("shows 'Not attributed' for a port with no terminal owner", () => {
    mocks.environments = [{ environmentId: envId, label: "Local" }];
    mocks.servers = [
      {
        host: "localhost",
        port: 8080,
        url: "http://localhost:8080",
        processName: null,
        pid: null,
        terminal: null,
      },
    ];
    const html = renderToStaticMarkup(<PortsPage />);
    expect(html).toContain("Not attributed");
  });
});
