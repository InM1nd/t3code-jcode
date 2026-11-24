import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";
import { describe, expect, it } from "vite-plus/test";

import { resolveAppModelSelectionForInstance } from "./modelSelection";

const jcode: ServerProvider = {
  instanceId: ProviderInstanceId.make("jcode"),
  driver: ProviderDriverKind.make("jcode"),
  enabled: true,
  installed: true,
  version: null,
  status: "ready",
  auth: { status: "authenticated" },
  checkedAt: "2026-01-01T00:00:00.000Z",
  models: ["claude-fable-5", "claude-opus-5"].map((slug) => ({
    slug,
    name: slug,
    isCustom: false,
    capabilities: {},
  })),
  slashCommands: [],
  skills: [],
};

describe("Jcode model selection", () => {
  const resolve = (model: string | null) =>
    resolveAppModelSelectionForInstance(
      ProviderInstanceId.make("jcode"),
      DEFAULT_UNIFIED_SETTINGS,
      [jcode],
      model,
    );

  it("keeps a backend model that Jcode's catalog does not list yet", () => {
    expect(resolve("claude-opus-5-5")).toBe("claude-opus-5-5");
    expect(resolve("claude-opus-5")).toBe("claude-opus-5");
  });

  it("falls back to Jcode's default only without a model", () => {
    expect(resolve(null)).toBe("claude-fable-5");
  });
});
