// @effect-diagnostics nodeBuiltinImport:off - This integration test verifies Node's HTTP upgrade bridge used by Vite HMR.
import * as NodeHttp from "node:http";

import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  createLocalDomainProxy,
  normalizeLocalDomain,
  portListenError,
  replaceManagedHostsBlock,
} from "./localDomains.ts";

const servers: NodeHttp.Server[] = [];

const listen = (server: NodeHttp.Server) =>
  new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      servers.push(server);
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("Expected TCP address");
      resolve(address.port);
    });
  });

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

describe("local domains", () => {
  it("normalizes only one-label .tandem names", () => {
    expect(normalizeLocalDomain("Shop")).toBe("shop.tandem");
    expect(normalizeLocalDomain("shop.tandem")).toBe("shop.tandem");
    expect(normalizeLocalDomain("shop.example")).toBeNull();
    expect(normalizeLocalDomain("shop.other.tandem")).toBeNull();
  });

  it("tells a port already held by another process apart from a denied privileged bind", () => {
    const inUse = portListenError(80, Object.assign(new Error(), { code: "EADDRINUSE" }));
    expect(inUse.reason).toBe("portUnavailable");
    expect(inUse.message).toContain("already in use");

    const denied = portListenError(80, Object.assign(new Error(), { code: "EACCES" }));
    expect(denied.reason).toBe("authorizationDenied");
    expect(denied.message).toContain("administrator privileges");

    const other = portListenError(80, Object.assign(new Error(), { code: "EMFILE" }));
    expect(other.reason).toBe("portUnavailable");
    expect(other.message).toBe("Port 80 is unavailable. Stop the service using it and try again.");
  });

  it("changes only the fenced hosts block", () => {
    const previous =
      "127.0.0.1 localhost\n# BEGIN T3 Code local domains\n127.0.0.1 old.tandem\n# END T3 Code local domains\n";
    expect(replaceManagedHostsBlock(previous, [{ domain: "shop.tandem", port: 3000 }])).toBe(
      "127.0.0.1 localhost\n\n# BEGIN T3 Code local domains\n127.0.0.1 shop.tandem\n# END T3 Code local domains\n",
    );
  });

  it("routes an explicit Host header to loopback and preserves its forwarding header", async () => {
    const upstream = NodeHttp.createServer((request, response) => {
      response.end(request.headers["x-forwarded-host"]);
    });
    const upstreamPort = await listen(upstream);
    const proxy = createLocalDomainProxy(() => [{ domain: "shop.tandem", port: upstreamPort }]);
    const proxyPort = await listen(proxy);

    const body = await new Promise<string>((resolve, reject) => {
      const request = NodeHttp.request(
        { host: "127.0.0.1", port: proxyPort, headers: { host: "shop.tandem" } },
        (response) => {
          let text = "";
          response.on("data", (chunk: Buffer) => {
            text += chunk.toString();
          });
          response.on("end", () => resolve(text));
        },
      );
      request.once("error", reject);
      request.end();
    });
    expect(body).toBe("shop.tandem");
  });

  it("forwards websocket upgrades for Vite HMR", async () => {
    const upstream = NodeHttp.createServer();
    upstream.on("upgrade", (_request, socket) =>
      socket.end(
        "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n",
      ),
    );
    const upstreamPort = await listen(upstream);
    const proxy = createLocalDomainProxy(() => [{ domain: "shop.tandem", port: upstreamPort }]);
    const proxyPort = await listen(proxy);

    const statusCode = await new Promise<number>((resolve, reject) => {
      const request = NodeHttp.request({
        host: "127.0.0.1",
        port: proxyPort,
        path: "/@vite/client",
        headers: { host: "shop.tandem", connection: "Upgrade", upgrade: "websocket" },
      });
      request.once("upgrade", (response, socket) => {
        socket.destroy();
        resolve(response.statusCode ?? 0);
      });
      request.once("error", reject);
      request.end();
    });
    expect(statusCode).toBe(101);
  });
});
