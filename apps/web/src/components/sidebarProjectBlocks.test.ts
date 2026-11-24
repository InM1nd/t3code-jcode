import { describe, expect, it } from "vite-plus/test";

import { buildSidebarProjectBlocks, layoutSidebarProjectBlocks } from "./sidebarProjectBlocks";

interface Row {
  readonly key: string;
  readonly project: string;
}

const row = (key: string, project: string): Row => ({ key, project });

const layout = (input: {
  readonly threads: readonly Row[];
  readonly expanded: Record<string, boolean>;
  readonly working?: readonly string[];
}) => {
  const blocks = buildSidebarProjectBlocks({
    threads: input.threads,
    projects: ["alpha", "beta", "gamma"].map((name) => ({
      projectKey: name,
      memberKeys: [`env:${name}`],
      expanded: input.expanded[name] ?? true,
    })),
    memberKeyOf: (thread) => `env:${thread.project}`,
    workingMemberKeys: new Set((input.working ?? []).map((name) => `env:${name}`)),
  });
  const result = layoutSidebarProjectBlocks(blocks, (thread) => thread.key);
  return {
    blocks,
    rows: result.rows.map((thread) => thread.key),
    headersBefore: Object.fromEntries(
      [...result.headersBefore].map(([key, headers]) => [key, headers.map((h) => h.projectKey)]),
    ),
    trailing: result.trailingHeaders.map((header) => header.projectKey),
  };
};

describe("sidebar project blocks", () => {
  it("groups Active rows in project order, not name or thread order", () => {
    const result = layout({
      threads: [row("g1", "gamma"), row("a1", "alpha"), row("g2", "gamma"), row("b1", "beta")],
      expanded: {},
    });
    expect(result.rows).toEqual(["a1", "b1", "g1", "g2"]);
    expect(result.headersBefore).toEqual({ a1: ["alpha"], b1: ["beta"], g1: ["gamma"] });
    expect(result.trailing).toEqual([]);
  });

  it("keeps a collapsed project's header in its place and hides only its rows", () => {
    const result = layout({
      threads: [row("a1", "alpha"), row("b1", "beta"), row("b2", "beta"), row("g1", "gamma")],
      expanded: { beta: false },
      working: ["beta"],
    });
    expect(result.rows).toEqual(["a1", "g1"]);
    expect(result.headersBefore).toEqual({ a1: ["alpha"], g1: ["beta", "gamma"] });
    const beta = result.blocks.find((block) => block.projectKey === "beta")!;
    expect(beta.threads).toHaveLength(2);
    expect(beta.working).toBe(true);
  });

  it("puts collapsed projects after the last expanded row at the end of Active", () => {
    const result = layout({
      threads: [row("a1", "alpha"), row("g1", "gamma")],
      expanded: { gamma: false },
    });
    expect(result.rows).toEqual(["a1"]);
    expect(result.trailing).toEqual(["gamma"]);
  });

  it("never hides a thread whose project is unknown", () => {
    const result = layout({ threads: [row("x1", "other"), row("a1", "alpha")], expanded: {} });
    expect(result.rows).toEqual(["a1", "x1"]);
    expect(result.headersBefore).toEqual({ a1: ["alpha"], x1: ["env:other"] });
  });
});
