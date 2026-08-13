import { describe, expect, it } from "vite-plus/test";

import { prependWorkModeInstruction, resolveWorkMode } from "./WorkMode.ts";

describe("resolveWorkMode", () => {
  it("keeps build on the provider default without an instruction", () => {
    expect(resolveWorkMode("build")).toEqual({ nativeInteractionMode: "default" });
  });

  it("maps plan to native plan mode and explains the fallback workflow", () => {
    const resolved = resolveWorkMode("plan")!;

    expect(resolved.nativeInteractionMode).toBe("plan");
    expect(resolved.instruction).toContain("Do not edit");
  });

  it("runs debug under the provider default with an evidence-first workflow", () => {
    const resolved = resolveWorkMode("debug")!;

    expect(resolved.nativeInteractionMode).toBe("default");
    expect(resolved.instruction).toMatch(/reproduce.*evidence.*root cause.*verify/is);
  });

  it("runs swarm as a guided workflow without promising parallel workers", () => {
    const resolved = resolveWorkMode("swarm")!;

    expect(resolved.nativeInteractionMode).toBe("default");
    expect(resolved.instruction).toContain("Do not claim parallel workers");
  });

  it("adds workflow context ahead of the user request only when needed", () => {
    expect(prependWorkModeInstruction("build", "Fix the bug")).toBe("Fix the bug");
    expect(prependWorkModeInstruction("debug", "Fix the bug")).toContain("Fix the bug");
  });
});
