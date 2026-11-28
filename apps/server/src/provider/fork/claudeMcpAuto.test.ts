// @effect-diagnostics nodeBuiltinImport:off - fixtures are real Claude config files in a temp dir.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  applyClaudeMcpAuto,
  attachClaudeMcpAutoQuery,
  enableClaudeMcpServer,
  readClaudeMcpServers,
  selectLearnedServers,
} from "./claudeMcpAuto.ts";

const stdio = (command: string) => ({ type: "stdio" as const, command, args: [] });

function fixture() {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "claude-mcp-auto-"));
  const cwd = NodePath.join(root, "repo");
  NodeFS.mkdirSync(cwd);
  NodeFS.writeFileSync(
    NodePath.join(root, ".claude.json"),
    JSON.stringify({
      mcpServers: { playwright: stdio("pw"), serena: stdio("serena"), "t3-code": stdio("x") },
      projects: {
        [cwd]: {
          mcpServers: { local: stdio("local") },
          enabledMcpjsonServers: ["approved"],
          disabledMcpServers: ["serena"],
        },
      },
    }),
  );
  NodeFS.writeFileSync(
    NodePath.join(cwd, ".mcp.json"),
    JSON.stringify({ mcpServers: { approved: stdio("ok"), unapproved: stdio("repo-script") } }),
  );
  return { root, cwd };
}

describe("claudeMcpAuto", () => {
  it("reads the servers Claude would load, without unapproved or disabled ones", () => {
    const { root, cwd } = fixture();
    expect(Object.keys(readClaudeMcpServers(root, cwd) ?? {}).toSorted()).toEqual([
      "approved",
      "local",
      "playwright",
    ]);
    expect(readClaudeMcpServers(NodePath.join(root, "missing"), cwd)).toBeNull();
  });

  it("starts with servers enabled within the last 30 days", () => {
    const day = 24 * 60 * 60 * 1000;
    const available = { playwright: stdio("pw"), local: stdio("local") };
    expect(
      selectLearnedServers(
        available,
        { playwright: 100 * day, local: 60 * day, gone: 100 * day },
        101 * day,
      ),
    ).toEqual(["playwright"]);
  });

  it("starts strict, then enables a server with the full set and remembers it", () => {
    const { root, cwd } = fixture();
    const threadId = ThreadId.make("thread-auto");
    const t3 = { type: "http" as const, url: "http://t3/mcp" };
    const input = {
      enabled: true,
      threadId,
      projectId: ProjectId.make("project-1"),
      cwd,
      stateDir: root,
    };
    const base = {
      env: { CLAUDE_CONFIG_DIR: root, PATH: "/bin" },
      mcpServers: { "t3-code": t3 },
      systemPrompt: { type: "preset" as const, preset: "claude_code" as const, append: "base" },
    };

    expect(applyClaudeMcpAuto({ ...base, mcpServers: {} }, input)).toEqual({
      ...base,
      mcpServers: {},
    });
    expect(applyClaudeMcpAuto(base, { ...input, enabled: false })).toBe(base);

    const options = applyClaudeMcpAuto(base, input);
    expect(options).toMatchObject({ strictMcpConfig: true });
    expect(options.mcpServers).toEqual({ "t3-code": t3 });
    expect(options.env).toEqual({
      CLAUDE_CONFIG_DIR: root,
      PATH: "/bin",
      ENABLE_CLAUDEAI_MCP_SERVERS: "false",
    });
    expect(options.systemPrompt.append).toContain("approved, local, playwright");

    const calls: unknown[] = [];
    attachClaudeMcpAutoQuery(threadId, async (servers) => calls.push(servers));
    expect(enableClaudeMcpServer(threadId, "nope")).toMatchObject({ ok: false });
    expect(enableClaudeMcpServer(threadId, "playwright")).toEqual({
      ok: true,
      server: "playwright",
      loaded: ["playwright"],
    });
    expect(calls).toEqual([{ playwright: stdio("pw"), "t3-code": t3 }]);

    expect(applyClaudeMcpAuto(base, input).mcpServers).toEqual({
      playwright: stdio("pw"),
      "t3-code": t3,
    });
    expect(enableClaudeMcpServer(ThreadId.make("other"), "playwright")).toMatchObject({
      ok: false,
    });
  });
});
