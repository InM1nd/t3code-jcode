import { describe, expect, it } from "vite-plus/test";

import {
  readJcodeProviderSetting,
  resolveJcodeInnerProviderIconKind,
} from "./jcodeInnerProvider.ts";

describe("resolveJcodeInnerProviderIconKind", () => {
  it("maps explicit jcodeProvider values", () => {
    expect(resolveJcodeInnerProviderIconKind({ jcodeProvider: "cursor" })).toBe("cursor");
    expect(resolveJcodeInnerProviderIconKind({ jcodeProvider: "claude" })).toBe("claudeAgent");
    expect(resolveJcodeInnerProviderIconKind({ jcodeProvider: "openai" })).toBe("codex");
    expect(resolveJcodeInnerProviderIconKind({ jcodeProvider: "auto" })).toBeNull();
  });

  it("falls back to model slug heuristics", () => {
    expect(resolveJcodeInnerProviderIconKind({ model: "claude-opus-5" })).toBe("claudeAgent");
    expect(resolveJcodeInnerProviderIconKind({ model: "gpt-5.5" })).toBe("codex");
    expect(resolveJcodeInnerProviderIconKind({ model: "composer-2" })).toBe("cursor");
    expect(resolveJcodeInnerProviderIconKind({ model: "grok-4" })).toBe("grok");
  });

  it("prefers jcodeProvider over model", () => {
    expect(
      resolveJcodeInnerProviderIconKind({
        jcodeProvider: "cursor",
        model: "claude-opus-5",
      }),
    ).toBe("cursor");
  });
});

describe("readJcodeProviderSetting", () => {
  it("reads instance config then legacy settings", () => {
    expect(
      readJcodeProviderSetting({
        instanceId: "jcode",
        providerInstances: {
          jcode: { config: { jcodeProvider: "cursor" } },
        },
        legacyJcodeProvider: "claude",
      }),
    ).toBe("cursor");

    expect(
      readJcodeProviderSetting({
        instanceId: "jcode",
        providerInstances: {},
        legacyJcodeProvider: "openai",
      }),
    ).toBe("openai");
  });
});
