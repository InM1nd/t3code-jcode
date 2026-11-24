import { describe, expect, it } from "vite-plus/test";

import {
  inferJcodeInnerProviderId,
  jcodeProviderForDriverKind,
  jcodeProviderIdForSubProvider,
  resolveJcodeInnerProvider,
  readJcodeProviderSetting,
  resolveJcodeInnerProviderIconKind,
  withJcodeProviderOption,
} from "./jcodeInnerProvider.ts";

describe("resolveJcodeInnerProvider", () => {
  it("only accepts the providers exposed by the Jcode picker", () => {
    expect(resolveJcodeInnerProvider("claude")).toMatchObject({ driverKind: "claudeAgent" });
    expect(resolveJcodeInnerProvider("cursor")).toMatchObject({ driverKind: "cursor" });
    expect(resolveJcodeInnerProvider("openai")).toMatchObject({ driverKind: "codex" });
    expect(resolveJcodeInnerProvider("xai")).toMatchObject({ driverKind: "grok" });
    expect(resolveJcodeInnerProvider("opencode")).toMatchObject({ driverKind: "opencode" });
    expect(resolveJcodeInnerProvider("antigravity")).toMatchObject({ driverKind: "antigravity" });
    expect(resolveJcodeInnerProvider("anthropic-api")).toBeNull();
  });
});

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

describe("inferJcodeInnerProviderId", () => {
  it("maps Claude, Cursor, and Codex slugs and leaves other slugs unset", () => {
    expect(inferJcodeInnerProviderId("claude-opus-5")).toBe("claude");
    expect(inferJcodeInnerProviderId("gpt-5.4")).toBe("openai");
    expect(inferJcodeInnerProviderId("o3")).toBe("openai");
    expect(inferJcodeInnerProviderId("cursor-grok")).toBe("cursor");
    expect(inferJcodeInnerProviderId("composer-2")).toBe("cursor");
    expect(inferJcodeInnerProviderId("grok-4")).toBe("xai");
    expect(inferJcodeInnerProviderId("my-router")).toBeUndefined();
  });
});

describe("jcode provider selection option", () => {
  it("maps catalog labels and replaces a stale option", () => {
    expect(jcodeProviderIdForSubProvider("Cursor")).toBe("cursor");
    expect(jcodeProviderIdForSubProvider("Codex")).toBe("openai");
    expect(jcodeProviderIdForSubProvider("Grok")).toBe("xai");
    expect(jcodeProviderForDriverKind("claudeAgent")?.id).toBe("claude");
    expect(jcodeProviderForDriverKind("grok")?.id).toBe("xai");
    expect(jcodeProviderForDriverKind("opencode")?.id).toBe("opencode");
    expect(jcodeProviderForDriverKind("antigravity")?.id).toBe("antigravity");
    expect(jcodeProviderForDriverKind("jcode")).toBeNull();
    expect(jcodeProviderForDriverKind("pi")).toBeNull();
    expect(
      withJcodeProviderOption(
        {
          model: "claude-opus-5",
          options: [{ id: "jcodeProvider", value: "claude" }],
        },
        "cursor",
      ),
    ).toEqual({
      model: "claude-opus-5",
      options: [{ id: "jcodeProvider", value: "cursor" }],
    });
  });
});
