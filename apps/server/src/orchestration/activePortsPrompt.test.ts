// apps/server/src/orchestration/activePortsPrompt.test.ts
import { describe, expect, it } from "vite-plus/test";

import {
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
