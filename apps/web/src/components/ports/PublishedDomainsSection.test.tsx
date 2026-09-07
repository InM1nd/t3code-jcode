import { EnvironmentId, type LocalDomainList } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

const environmentId = EnvironmentId.make("local");
const mocks = vi.hoisted(() => ({
  domains: {
    domains: [{ domain: "shop.localhost", port: 5173 }],
    supported: true,
    proxyPort: 7777,
    proxyError: null,
  } as LocalDomainList,
}));

vi.mock("~/localDomainsState", () => ({
  localDomainsEnvironment: { list: () => null, unpublish: {} },
}));
vi.mock("~/state/query", () => ({
  useEnvironmentQuery: () => ({ data: mocks.domains, error: null, refresh: vi.fn() }),
}));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));

import { PublishedDomainsSection } from "./PublishedDomainsSection";

describe("PublishedDomainsSection", () => {
  it("shows stopped published domains with cleanup actions", () => {
    const html = renderToStaticMarkup(
      <PublishedDomainsSection environmentId={environmentId} activePorts={[]} />,
    );
    expect(html).toContain("Published domains");
    expect(html).toContain("shop.localhost");
    expect(html).toContain("Copy URL");
    expect(html).toContain("Unpublish");
  });

  it("hides domains whose ports are still active", () => {
    const html = renderToStaticMarkup(
      <PublishedDomainsSection environmentId={environmentId} activePorts={[5173]} />,
    );
    expect(html).toBe("");
  });
});
