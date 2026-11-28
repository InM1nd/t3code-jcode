// @effect-diagnostics nodeBuiltinImport:off
import { ThreadId } from "@t3tools/contracts";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";

import {
  JCODE_MCP_SERVER_NAME,
  JCODE_MCP_STDIO_CLI_FLAG,
  buildJcodeMcpServerEntry,
  clearJcodeMcpAuthFile,
  installJcodeMcpBridgeFiles,
  mergeJcodeMcpConfigJson,
} from "./mcpConfig.ts";

describe("jcodeMcpConfig", () => {
  it("merges the managed t3-code server without clobbering peers in Node mode", () => {
    const server = buildJcodeMcpServerEntry({
      selfInvocation: { command: "/usr/bin/node", entrypoint: "/app/bin.mjs" },
      endpoint: "http://127.0.0.1:3773/mcp",
      authFilePath: "/tmp/auth",
    });

    const merged = mergeJcodeMcpConfigJson(
      JSON.stringify({
        mcpServers: {
          other: { command: "echo", args: ["hi"] },
        },
      }),
      server,
    );

    const parsed = JSON.parse(merged) as {
      mcpServers: Record<string, { command: string; args: string[]; env: Record<string, string> }>;
      servers?: unknown;
    };
    expect(parsed.servers).toBeUndefined();
    expect(parsed.mcpServers.other).toEqual({ command: "echo", args: ["hi"] });
    expect(parsed.mcpServers[JCODE_MCP_SERVER_NAME]).toMatchObject({
      command: "/usr/bin/node",
      args: ["/app/bin.mjs", JCODE_MCP_STDIO_CLI_FLAG],
      env: {
        T3_MCP_ENDPOINT: "http://127.0.0.1:3773/mcp",
        T3_MCP_AUTH_FILE: "/tmp/auth",
      },
      shared: false,
    });
  });

  it("omits a script entrypoint in packaged SEA mode", () => {
    const server = buildJcodeMcpServerEntry({
      selfInvocation: {
        command: "/Applications/T3 Code.app/Contents/MacOS/t3",
        entrypoint: undefined,
      },
      endpoint: "http://127.0.0.1:3773/mcp",
      authFilePath: "/tmp/auth",
    });

    expect(server).toEqual({
      command: "/Applications/T3 Code.app/Contents/MacOS/t3",
      args: [JCODE_MCP_STDIO_CLI_FLAG],
      env: {
        T3_MCP_ENDPOINT: "http://127.0.0.1:3773/mcp",
        T3_MCP_AUTH_FILE: "/tmp/auth",
      },
      shared: false,
    });
  });

  it("reads legacy servers key and rewrites as mcpServers", () => {
    const server = buildJcodeMcpServerEntry({
      selfInvocation: { command: "node", entrypoint: "/app/bin.ts" },
      endpoint: "http://localhost/mcp",
      authFilePath: "/auth",
    });
    const merged = mergeJcodeMcpConfigJson(
      JSON.stringify({ servers: { legacy: { command: "true" } } }),
      server,
    );
    const parsed = JSON.parse(merged) as { mcpServers: Record<string, unknown> };
    expect(parsed.mcpServers.legacy).toEqual({ command: "true" });
    expect(parsed.mcpServers[JCODE_MCP_SERVER_NAME]).toBeDefined();
  });

  it("rejects malformed or invalid config without replacing it", () => {
    const server = buildJcodeMcpServerEntry({
      selfInvocation: { command: "node", entrypoint: "/app/bin.ts" },
      endpoint: "http://localhost/mcp",
      authFilePath: "/auth",
    });

    expect(() => mergeJcodeMcpConfigJson("{broken", server)).toThrow("left unchanged");
    expect(() => mergeJcodeMcpConfigJson(JSON.stringify({ mcpServers: [] }), server)).toThrow(
      "invalid server list",
    );
  });

  it("writes auth + mcp.json under cwd/secrets and cleans up auth file", () => {
    const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "jcode-mcp-config-"));
    const cwd = NodePath.join(root, "project");
    const secretsDir = NodePath.join(root, "secrets");
    NodeFS.mkdirSync(cwd, { recursive: true });

    const threadId = ThreadId.make("thread-board-1");
    const installed = installJcodeMcpBridgeFiles({
      cwd,
      secretsDir,
      threadId,
      endpoint: "http://127.0.0.1:9/mcp",
      authorizationHeader: "Bearer test-token",
      selfInvocation: { command: "/bin/node", entrypoint: "/opt/t3/bin.mjs" },
    });

    expect(NodeFS.readFileSync(installed.authFilePath, "utf8").trim()).toBe("Bearer test-token");
    const config = JSON.parse(NodeFS.readFileSync(installed.configPath, "utf8")) as {
      mcpServers: Record<string, { env: Record<string, string> }>;
    };
    expect(config.mcpServers[JCODE_MCP_SERVER_NAME]?.env.T3_MCP_AUTH_FILE).toBe(
      installed.authFilePath,
    );

    clearJcodeMcpAuthFile(secretsDir, threadId);
    expect(NodeFS.existsSync(installed.authFilePath)).toBe(false);
  });

  it("leaves an invalid existing config byte-for-byte untouched", () => {
    const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "jcode-mcp-config-"));
    const cwd = NodePath.join(root, "project");
    const configPath = NodePath.join(cwd, ".jcode", "mcp.json");
    const original = "{not valid JSON";
    NodeFS.mkdirSync(NodePath.dirname(configPath), { recursive: true });
    NodeFS.writeFileSync(configPath, original);

    expect(() =>
      installJcodeMcpBridgeFiles({
        cwd,
        secretsDir: NodePath.join(root, "secrets"),
        threadId: ThreadId.make("thread-board-2"),
        endpoint: "http://127.0.0.1:9/mcp",
        authorizationHeader: "Bearer test-token",
        selfInvocation: { command: "/bin/node", entrypoint: "/opt/t3/bin.mjs" },
      }),
    ).toThrow("left unchanged");
    expect(NodeFS.readFileSync(configPath, "utf8")).toBe(original);
  });
});
