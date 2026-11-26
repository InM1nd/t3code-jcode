import { EnvironmentId, type LocalDomainList } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

const environmentId = EnvironmentId.make("local");
const mocks = vi.hoisted(() => ({
  domains: { domains: [], supported: true, proxyError: null } as LocalDomainList,
}));

vi.mock("~/localDomainsState", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/localDomainsState")>();
  return {
    ...actual,
    localDomainsEnvironment: { list: () => null, publish: {}, unpublish: {} },
  };
});
vi.mock("~/state/query", () => ({
  useEnvironmentQuery: () => ({
    data: mocks.domains,
    error: null,
    isPending: false,
    refresh: vi.fn(),
  }),
}));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("~/localApi", () => ({ readLocalApi: () => undefined }));

import { formatLocalDomainUrl } from "~/localDomainsState";
import { LocalDomainsPortControls } from "./LocalDomainsPortControls";

describe("LocalDomainsPortControls", () => {
  it("formats port 80 URLs without an explicit port and preserves non-80 ports", () => {
    expect(formatLocalDomainUrl("shop.localhost", 80)).toBe("http://shop.localhost");
    expect(formatLocalDomainUrl("shop.localhost", 7777)).toBe("http://shop.localhost:7777");
    expect(formatLocalDomainUrl("shop.localhost")).toBe("http://shop.localhost:7777");
  });

  it("proposes a name without publishing it", () => {
    mocks.domains = { domains: [], supported: true, proxyError: null };
    const html = renderToStaticMarkup(
      <LocalDomainsPortControls
        environmentId={environmentId}
        server={{
          host: "localhost",
          port: 5173,
          url: "http://localhost:5173",
          processName: "vite",
          pid: 1,
          terminal: null,
        }}
      />,
    );
    expect(html).toContain("local-5173");
    expect(html).toContain("Publish local domain");
    expect(html).not.toContain("Open local-5173.localhost");
  });

  it("renders a clean URL for a published domain", () => {
    mocks.domains = {
      domains: [{ domain: "shop.localhost", port: 5173 }],
      supported: true,
      proxyPort: 7777,
      proxyError: null,
    };
    const html = renderToStaticMarkup(
      <LocalDomainsPortControls
        environmentId={environmentId}
        server={{
          host: "localhost",
          port: 5173,
          url: "http://localhost:5173",
          processName: "vite",
          pid: 1,
          terminal: null,
        }}
      />,
    );
    expect(html).toContain("Open shop.localhost");
    expect(html).toContain("Copy shop.localhost");
    expect(html).toContain("Unpublish");
  });

  it("uses the published domain when the query resolves after the first render", () => {
    mocks.domains = {
      domains: [{ domain: "shop.localhost", port: 5173 }],
      supported: true,
      proxyPort: 7777,
      proxyError: null,
    };
    const html = renderToStaticMarkup(
      <LocalDomainsPortControls
        environmentId={environmentId}
        server={{
          host: "localhost",
          port: 5173,
          url: "http://localhost:5173",
          processName: "vite",
          pid: 1,
          terminal: null,
        }}
      />,
    );
    expect(html).toContain('value="shop.localhost"');
  });
});
