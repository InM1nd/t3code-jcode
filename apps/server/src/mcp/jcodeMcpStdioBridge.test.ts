import { describe, expect, it } from "vite-plus/test";

import { buildMcpHttpHeaders, parseHttpMcpResponseBody } from "./jcodeMcpStdioBridge.ts";

describe("parseHttpMcpResponseBody", () => {
  it("parses application/json bodies", () => {
    const parsed = parseHttpMcpResponseBody(
      JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }),
      "application/json",
    );
    expect(parsed).toEqual({ jsonrpc: "2.0", id: 1, result: { ok: true } });
  });

  it("parses SSE data frames", () => {
    const body = [
      "event: message",
      'data: {"jsonrpc":"2.0","id":2,"result":{"tools":[]}}',
      "",
      "data: [DONE]",
      "",
    ].join("\n");
    expect(parseHttpMcpResponseBody(body, "text/event-stream")).toEqual({
      jsonrpc: "2.0",
      id: 2,
      result: { tools: [] },
    });
  });
});

describe("buildMcpHttpHeaders", () => {
  it("omits session and protocol headers before initialize completes", () => {
    expect(buildMcpHttpHeaders({ authorization: "Bearer t" })).toEqual({
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      authorization: "Bearer t",
    });
  });

  it("sends mcp-protocol-version once negotiated so notifications are not rejected", () => {
    expect(
      buildMcpHttpHeaders({
        authorization: "Bearer t",
        sessionId: "sess-1",
        protocolVersion: "2025-06-18",
      }),
    ).toMatchObject({
      "mcp-session-id": "sess-1",
      "mcp-protocol-version": "2025-06-18",
    });
  });
});
