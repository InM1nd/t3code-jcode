// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalFetch:off
// Standalone stdio child process: Node builtins + fetch are the intentional boundary.
/**
 * NDJSON stdio MCP bridge for jcode.
 *
 * jcode only loads stdio MCP from its config files (it rejects ACP mcpServers and
 * skips HTTP/SSE entries). This process speaks jcode's newline-delimited JSON-RPC
 * on stdin/stdout and proxies tool RPCs to T3's Streamable HTTP `/mcp` endpoint.
 *
 * Env:
 * - T3_MCP_ENDPOINT: absolute URL to the server's `/mcp` route
 * - T3_MCP_AUTHORIZATION: full Authorization header value (e.g. "Bearer …")
 * - T3_MCP_AUTH_FILE: optional path; when set, authorization is read from this file
 */
import * as NodeFS from "node:fs";
import * as NodeReadline from "node:readline";

const PROTOCOL_VERSION_FOR_JCODE = "2024-11-05";
const PROTOCOL_VERSION_FOR_HTTP = "2025-06-18";

type JsonRpcId = string | number | null;

type JsonRpcMessage = {
  readonly jsonrpc?: string;
  readonly id?: JsonRpcId;
  readonly method?: string;
  readonly params?: unknown;
  readonly result?: unknown;
  readonly error?: unknown;
};

function writeStdout(message: unknown): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function readAuthorization(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.T3_MCP_AUTHORIZATION?.trim();
  if (fromEnv) return fromEnv;
  const authFile = env.T3_MCP_AUTH_FILE?.trim();
  if (!authFile) {
    throw new Error("Missing T3_MCP_AUTHORIZATION or T3_MCP_AUTH_FILE.");
  }
  const value = NodeFS.readFileSync(authFile, "utf8").trim();
  if (!value) {
    throw new Error(`Authorization file is empty: ${authFile}`);
  }
  return value;
}

/** Extract the first JSON-RPC payload from a JSON or SSE HTTP body. */
export function parseHttpMcpResponseBody(body: string, contentType: string | null): unknown {
  const trimmed = body.trim();
  if (!trimmed) {
    throw new Error("Empty MCP HTTP response body.");
  }

  const isEventStream = (contentType ?? "").toLowerCase().includes("text/event-stream");
  if (!isEventStream && (trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return JSON.parse(trimmed) as unknown;
  }

  for (const block of trimmed.split("\n\n")) {
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trimStart());
      }
    }
    if (dataLines.length === 0) continue;
    const data = dataLines.join("\n").trim();
    if (!data || data === "[DONE]") continue;
    return JSON.parse(data) as unknown;
  }

  // Last resort: body might still be bare JSON despite a misleading content-type.
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed) as unknown;
  }

  throw new Error("Could not parse MCP HTTP response as JSON or SSE.");
}

/**
 * Headers for every POST to T3's `/mcp`. The `mcp-protocol-version` header is
 * required on all post-initialize requests; omitting it makes the server reject
 * `notifications/initialized` with a bodyless 400, which used to kill the whole
 * bridge before jcode ever saw a tool.
 */
export function buildMcpHttpHeaders(input: {
  readonly authorization: string;
  readonly sessionId?: string | undefined;
  readonly protocolVersion?: string | undefined;
}): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    authorization: input.authorization,
  };
  if (input.sessionId) {
    headers["mcp-session-id"] = input.sessionId;
  }
  if (input.protocolVersion) {
    headers["mcp-protocol-version"] = input.protocolVersion;
  }
  return headers;
}

class HttpMcpProxy {
  #sessionId: string | undefined;
  #negotiatedProtocolVersion: string | undefined;
  #nextId = 1;
  readonly endpoint: string;
  readonly authorization: string;

  constructor(endpoint: string, authorization: string) {
    this.endpoint = endpoint;
    this.authorization = authorization;
  }

  async initialize(): Promise<void> {
    const response = await this.#post({
      jsonrpc: "2.0",
      id: this.#nextId++,
      method: "initialize",
      params: {
        protocolVersion: PROTOCOL_VERSION_FOR_HTTP,
        capabilities: {},
        clientInfo: { name: "t3-jcode-mcp-bridge", version: "1.0.0" },
      },
    });
    if (response.error) {
      throw new Error(`MCP initialize failed: ${JSON.stringify(response.error)}`);
    }
    const result = response.result;
    const negotiated =
      typeof result === "object" && result !== null && "protocolVersion" in result
        ? (result as { readonly protocolVersion?: unknown }).protocolVersion
        : undefined;
    this.#negotiatedProtocolVersion =
      typeof negotiated === "string" && negotiated.length > 0
        ? negotiated
        : PROTOCOL_VERSION_FOR_HTTP;
    await this.#postNotification({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
  }

  async request(method: string, params: unknown): Promise<unknown> {
    const response = await this.#post({
      jsonrpc: "2.0",
      id: this.#nextId++,
      method,
      params: params ?? {},
    });
    if (response.error) {
      throw new Error(`${method} failed: ${JSON.stringify(response.error)}`);
    }
    return response.result;
  }

  async #post(payload: JsonRpcMessage): Promise<JsonRpcMessage> {
    const headers = buildMcpHttpHeaders({
      authorization: this.authorization,
      sessionId: this.#sessionId,
      protocolVersion: this.#negotiatedProtocolVersion,
    });

    const res = await fetch(this.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const sessionId = res.headers.get("mcp-session-id");
    if (sessionId) {
      this.#sessionId = sessionId;
    }

    const body = await res.text();
    if (!res.ok) {
      throw new Error(`MCP HTTP ${res.status}: ${body.slice(0, 400)}`);
    }

    const parsed = parseHttpMcpResponseBody(body, res.headers.get("content-type"));
    if (!parsed || typeof parsed !== "object") {
      throw new Error("MCP HTTP response was not a JSON object.");
    }
    return parsed as JsonRpcMessage;
  }

  async #postNotification(payload: JsonRpcMessage): Promise<void> {
    const headers = buildMcpHttpHeaders({
      authorization: this.authorization,
      sessionId: this.#sessionId,
      protocolVersion: this.#negotiatedProtocolVersion,
    });
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    // Some servers return 202/204 for notifications; ignore body. A rejected
    // notification is never worth killing the bridge over: tool calls still
    // work, so warn on stderr and keep serving jcode.
    if (!res.ok && res.status !== 202 && res.status !== 204) {
      const body = await res.text();
      process.stderr.write(
        `t3 jcode MCP bridge: notification ${payload.method ?? "?"} returned HTTP ${res.status}: ${body.slice(0, 200)}\n`,
      );
    }
  }
}

export async function runJcodeMcpStdioBridge(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const endpoint = env.T3_MCP_ENDPOINT?.trim();
  if (!endpoint) {
    throw new Error("Missing T3_MCP_ENDPOINT.");
  }

  const authorization = readAuthorization(env);
  const proxy = new HttpMcpProxy(endpoint, authorization);
  await proxy.initialize();

  const rl = NodeReadline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let message: JsonRpcMessage;
    try {
      message = JSON.parse(trimmed) as JsonRpcMessage;
    } catch {
      continue;
    }

    const method = message.method;
    if (!method) continue;

    // Notifications (no id): acknowledge initialized; ignore the rest.
    if (message.id === undefined) {
      continue;
    }

    try {
      if (method === "initialize") {
        writeStdout({
          jsonrpc: "2.0",
          id: message.id,
          result: {
            protocolVersion: PROTOCOL_VERSION_FOR_JCODE,
            capabilities: { tools: {} },
            serverInfo: { name: "t3-code", version: "1.0.0" },
          },
        });
        continue;
      }

      if (method === "ping") {
        writeStdout({ jsonrpc: "2.0", id: message.id, result: {} });
        continue;
      }

      if (method === "shutdown") {
        writeStdout({ jsonrpc: "2.0", id: message.id, result: null });
        process.exit(0);
      }

      if (method === "tools/list" || method === "tools/call") {
        const result = await proxy.request(method, message.params ?? {});
        writeStdout({ jsonrpc: "2.0", id: message.id, result });
        continue;
      }

      writeStdout({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32601, message: `Method not found: ${method}` },
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      writeStdout({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32000, message: detail },
      });
    }
  }
}

if (import.meta.main) {
  runJcodeMcpStdioBridge().catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    process.stderr.write(`t3 jcode MCP bridge failed: ${detail}\n`);
    process.exit(1);
  });
}
