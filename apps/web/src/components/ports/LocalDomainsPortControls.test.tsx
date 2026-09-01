import { EnvironmentId, type LocalDomainList } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

const environmentId = EnvironmentId.make("local");
const mocks = vi.hoisted(() => ({
  domains: { domains: [], supported: true, proxyError: null } as LocalDomainList,
}));

vi.mock("~/localDomainsState", () => ({
  localDomainsEnvironment: { list: () => null, publish: {}, unpublish: {} },
}));
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

import { LocalDomainsPortControls } from "./LocalDomainsPortControls";

describe("LocalDomainsPortControls", () => {
  it("proposes a name without publishing it", () => {
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
    expect(html).not.toContain("Open local-5173.tandem");
  });

  it("renders a clean URL for a published domain", () => {
    mocks.domains = {
      domains: [{ domain: "shop.tandem", port: 5173 }],
      supported: true,
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
    expect(html).toContain("Open shop.tandem");
    expect(html).toContain("Copy shop.tandem");
    expect(html).toContain("Unpublish");
  });
});
