import { describe, expect, it } from "vite-plus/test";

import {
  TANDEM_RESOLVER_PORT,
  encodeTandemDnsResponse,
  managedResolverOwner,
  planResolverRemoval,
  planResolverSetup,
  renderTandemResolverConfig,
  resolverConfigBelongsTo,
} from "./localDomainsResolver.ts";

describe("local domain wildcard resolver", () => {
  it("renders a stable macOS resolver config with an auditable owner", () => {
    const config = renderTandemResolverConfig("owner-a");

    expect(config).toBe(
      "# T3 Code local domains owner: owner-a\nnameserver 127.0.0.1\nport 53535\n",
    );
    expect(TANDEM_RESOLVER_PORT).toBe(53535);
    expect(managedResolverOwner(config)).toBe("owner-a");
    expect(resolverConfigBelongsTo(config, "owner-a")).toBe(true);
    expect(resolverConfigBelongsTo(config, "owner-b")).toBe(false);
  });

  it("keeps setup idempotent and refuses to overwrite another resolver", () => {
    const config = renderTandemResolverConfig("owner-a");

    expect(planResolverSetup(null, "owner-a")).toEqual({
      action: "write",
      contents: config,
    });
    expect(planResolverSetup(config, "owner-a")).toEqual({ action: "unchanged" });
    expect(planResolverSetup("nameserver 8.8.8.8\n", "owner-a")).toEqual({
      action: "conflict",
    });
    expect(planResolverSetup(renderTandemResolverConfig("owner-b"), "owner-a")).toEqual({
      action: "conflict",
    });
  });

  it("removes only the resolver owned by this environment", () => {
    const config = renderTandemResolverConfig("owner-a");

    expect(planResolverRemoval(null, "owner-a")).toBe("unchanged");
    expect(planResolverRemoval(config, "owner-a")).toBe("remove");
    expect(planResolverRemoval(renderTandemResolverConfig("owner-b"), "owner-a")).toBe("conflict");
  });

  it("answers arbitrary tandem A queries with the local proxy address", () => {
    const query = Buffer.from([
      0x12, 0x34, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x07, 0x70, 0x72,
      0x65, 0x76, 0x69, 0x65, 0x77, 0x04, 0x73, 0x68, 0x6f, 0x70, 0x06, 0x74, 0x61, 0x6e, 0x64,
      0x65, 0x6d, 0x00, 0x00, 0x01, 0x00, 0x01,
    ]);

    const response = encodeTandemDnsResponse(query);

    expect(response.subarray(0, 2)).toEqual(Buffer.from([0x12, 0x34]));
    expect(response.readUInt16BE(6)).toBe(1);
    expect(response.subarray(-4)).toEqual(Buffer.from([127, 0, 0, 1]));
  });

  it("does not claim unrelated names", () => {
    const query = Buffer.from([
      0xab, 0xcd, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0x77, 0x77,
      0x77, 0x07, 0x65, 0x78, 0x61, 0x6d, 0x70, 0x6c, 0x65, 0x00, 0x00, 0x01, 0x00, 0x01,
    ]);

    const response = encodeTandemDnsResponse(query);

    expect(response.readUInt16BE(6)).toBe(0);
    expect(response.readUInt16BE(2) & 0x000f).toBe(3);
  });
});
