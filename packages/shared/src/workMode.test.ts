import { describe, expect, it } from "vite-plus/test";

import {
  displayedWorkMode,
  nativeInteractionMode,
  workModeFromSlashCommand,
  workModeInstruction,
} from "./workMode.ts";

describe("workMode", () => {
  it("keeps plan on the upstream interaction mode and the others on default", () => {
    expect(nativeInteractionMode("plan")).toBe("plan");
    expect(nativeInteractionMode("build")).toBe("default");
    expect(nativeInteractionMode("debug")).toBe("default");
    expect(nativeInteractionMode("swarm")).toBe("default");
  });

  it("adds an instruction only for debug and swarm", () => {
    expect(workModeInstruction("build")).toBeNull();
    expect(workModeInstruction("plan")).toBeNull();
    expect(workModeInstruction(null)).toBeNull();
    expect(workModeInstruction("debug")).toContain("Debug mode");
    expect(workModeInstruction("swarm")).toContain("Swarm Lite");
  });

  it("shows the stored mode, and otherwise the upstream plan or build choice", () => {
    expect(displayedWorkMode({ stored: null, interactionMode: "plan" })).toBe("plan");
    expect(displayedWorkMode({ stored: null, interactionMode: "default" })).toBe("build");
    expect(displayedWorkMode({ stored: "debug", interactionMode: "default" })).toBe("debug");
  });

  it("reads the standalone slash commands", () => {
    expect(workModeFromSlashCommand("default")).toBe("build");
    expect(workModeFromSlashCommand("swarm")).toBe("swarm");
    expect(workModeFromSlashCommand("model")).toBeNull();
  });
});
