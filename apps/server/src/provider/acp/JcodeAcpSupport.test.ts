import { describe, expect, it } from "@effect/vitest";

import {
  applyJcodeAcpModelSelection,
  buildJcodeAcpSpawnInput,
  resolveJcodeAcpProvider,
  resolveJcodeAcpBaseModelId,
} from "./JcodeAcpSupport.ts";

describe("resolveJcodeAcpProvider", () => {
  it("requires an explicit provider selection", () => {
    expect(resolveJcodeAcpProvider(undefined)).toBeUndefined();
    expect(
      resolveJcodeAcpProvider({
        instanceId: "jcode" as never,
        model: "gpt-5.5",
        options: [{ id: "jcodeProvider", value: "cursor" }],
      }),
    ).toBe("cursor");
  });
});

describe("resolveJcodeAcpBaseModelId", () => {
  it("normalizes empty and custom Jcode model ids", () => {
    expect(resolveJcodeAcpBaseModelId(undefined)).toBe("claude-opus-5");
    expect(resolveJcodeAcpBaseModelId("   ")).toBe("claude-opus-5");
    expect(resolveJcodeAcpBaseModelId("  gpt-5.5  ")).toBe("gpt-5.5");
    expect(resolveJcodeAcpBaseModelId("  cursor-grok-4.6-high-fast  ")).toBe(
      "cursor-grok-4.6-high-fast",
    );
  });
});

describe("buildJcodeAcpSpawnInput", () => {
  it("builds the default jcode acp command", () => {
    expect(buildJcodeAcpSpawnInput(undefined, "/tmp/project")).toEqual({
      command: "jcode",
      args: ["acp", "--no-selfdev"],
      cwd: "/tmp/project",
    });
  });

  it("includes binary path, model, provider profile, and jcode provider flags", () => {
    expect(
      buildJcodeAcpSpawnInput(
        {
          binaryPath: "/usr/local/bin/jcode",
          model: "gpt-5.5",
          providerProfile: "my-gateway",
          jcodeProvider: "openai",
          socketPath: "/tmp/jcode-session.sock",
        },
        "/tmp/project",
        { PATH: "/usr/bin" },
      ),
    ).toEqual({
      command: "/usr/local/bin/jcode",
      args: [
        "acp",
        "--no-selfdev",
        "--socket",
        "/tmp/jcode-session.sock",
        "-p",
        "openai",
        "--provider-profile",
        "my-gateway",
        "-m",
        "gpt-5.5",
      ],
      cwd: "/tmp/project",
      env: { PATH: "/usr/bin" },
    });
  });
});

describe("applyJcodeAcpModelSelection", () => {
  it("rejects a reported model that differs from the requested exact slug", () => {
    expect(
      applyJcodeAcpModelSelection({
        currentModelId: "claude-opus-5",
        requestedModelId: "gpt-5.5",
      }),
    ).toBeUndefined();
  });

  it("keeps the current model when nothing is requested", () => {
    expect(
      applyJcodeAcpModelSelection({
        currentModelId: "claude-opus-5",
        requestedModelId: undefined,
      }),
    ).toBe("claude-opus-5");
  });
});
