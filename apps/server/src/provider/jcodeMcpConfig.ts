// @effect-diagnostics nodeBuiltinImport:off
/**
 * Project-local `.jcode/mcp.json` helpers so jcode can load T3's MCP tools over
 * stdio (the only transport jcode supports today). Sync fs is intentional: the
 * file must exist before jcode is spawned in the same turn.
 */
import type { ThreadId } from "@t3tools/contracts";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

export const JCODE_MCP_SERVER_NAME = "t3-code";
export const JCODE_MCP_CONFIG_RELATIVE_PATH = ".jcode/mcp.json";
export const JCODE_MCP_STDIO_CLI_FLAG = "__jcode-mcp-stdio";

export type JcodeMcpServerEntry = {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly env: Readonly<Record<string, string>>;
  readonly shared: false;
};

type McpConfigFile = {
  mcpServers?: Record<string, unknown>;
  servers?: Record<string, unknown>;
};

function isServerMap(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseMcpConfig(existingRaw: string | null | undefined): McpConfigFile {
  if (!existingRaw || existingRaw.trim().length === 0) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(existingRaw);
  } catch {
    throw new Error("Existing .jcode/mcp.json is invalid JSON; it was left unchanged.");
  }
  if (!isServerMap(parsed)) {
    throw new Error("Existing .jcode/mcp.json must contain a JSON object; it was left unchanged.");
  }
  if (
    ("mcpServers" in parsed &&
      parsed.mcpServers !== undefined &&
      !isServerMap(parsed.mcpServers)) ||
    ("servers" in parsed && parsed.servers !== undefined && !isServerMap(parsed.servers))
  ) {
    throw new Error("Existing .jcode/mcp.json has an invalid server list; it was left unchanged.");
  }
  return parsed;
}

export function jcodeMcpAuthFilePath(secretsDir: string, threadId: ThreadId): string {
  return NodePath.join(secretsDir, "jcode-mcp", `${threadId}.authorization`);
}

export function buildJcodeMcpServerEntry(input: {
  readonly nodeExecutable: string;
  readonly serverEntryPath: string;
  readonly endpoint: string;
  readonly authFilePath: string;
}): JcodeMcpServerEntry {
  return {
    command: input.nodeExecutable,
    args: [input.serverEntryPath, JCODE_MCP_STDIO_CLI_FLAG],
    env: {
      T3_MCP_ENDPOINT: input.endpoint,
      T3_MCP_AUTH_FILE: input.authFilePath,
    },
    shared: false,
  };
}

function readServers(parsed: McpConfigFile): Record<string, unknown> {
  const fromCanonical = parsed.mcpServers;
  const fromLegacy = parsed.servers;
  if (fromCanonical) {
    return { ...fromCanonical };
  }
  if (fromLegacy) {
    return { ...fromLegacy };
  }
  return {};
}

/** Merge our managed stdio server into an existing mcp.json document. */
export function mergeJcodeMcpConfigJson(
  existingRaw: string | null | undefined,
  server: JcodeMcpServerEntry,
): string {
  const parsed = parseMcpConfig(existingRaw);

  const servers = readServers(parsed);
  servers[JCODE_MCP_SERVER_NAME] = {
    command: server.command,
    args: [...server.args],
    env: { ...server.env },
    shared: false,
  };

  // Prefer the Claude-compatible key; jcode accepts it via serde alias.
  const next: McpConfigFile = { ...parsed, mcpServers: servers };
  delete next.servers;
  return `${JSON.stringify(next, null, 2)}\n`;
}

export function installJcodeMcpBridgeFiles(input: {
  readonly cwd: string;
  readonly secretsDir: string;
  readonly threadId: ThreadId;
  readonly endpoint: string;
  readonly authorizationHeader: string;
  readonly nodeExecutable?: string;
  readonly serverEntryPath?: string;
}): { readonly configPath: string; readonly authFilePath: string } {
  const nodeExecutable = input.nodeExecutable ?? process.execPath;
  const rawEntry = input.serverEntryPath ?? process.argv[1];
  if (!rawEntry) {
    throw new Error("Cannot resolve T3 server entry path for jcode MCP bridge.");
  }
  // jcode spawns with the project cwd, so the entry must be absolute.
  const serverEntryPath = NodePath.resolve(rawEntry);

  const authFilePath = jcodeMcpAuthFilePath(input.secretsDir, input.threadId);
  NodeFS.mkdirSync(NodePath.dirname(authFilePath), { recursive: true });
  NodeFS.writeFileSync(authFilePath, `${input.authorizationHeader}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });

  const server = buildJcodeMcpServerEntry({
    nodeExecutable,
    serverEntryPath,
    endpoint: input.endpoint,
    authFilePath,
  });

  const configPath = NodePath.join(input.cwd, JCODE_MCP_CONFIG_RELATIVE_PATH);
  NodeFS.mkdirSync(NodePath.dirname(configPath), { recursive: true });
  const existing = NodeFS.existsSync(configPath) ? NodeFS.readFileSync(configPath, "utf8") : null;
  NodeFS.writeFileSync(configPath, mergeJcodeMcpConfigJson(existing, server), "utf8");

  return { configPath, authFilePath };
}

export function clearJcodeMcpAuthFile(secretsDir: string, threadId: ThreadId): void {
  const authFilePath = jcodeMcpAuthFilePath(secretsDir, threadId);
  try {
    NodeFS.unlinkSync(authFilePath);
  } catch {
    // absent is fine
  }
}
