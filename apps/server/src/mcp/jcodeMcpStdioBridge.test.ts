import { describe, expect, it } from "vite-plus/test";

import { parseHttpMcpResponseBody } from "./jcodeMcpStdioBridge.ts";

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
