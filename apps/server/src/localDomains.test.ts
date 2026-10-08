// @effect-diagnostics nodeBuiltinImport:off - This integration test verifies Node's HTTP upgrade bridge used by Vite HMR.
import * as NodeHttp from "node:http";

import { LOCAL_DOMAIN_PROXY_PORT } from "@t3tools/contracts";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  createLocalDomainProxy,
  migratePersistedLocalDomain,
  normalizeLocalDomain,
  portListenError,
  resolveLocalDomainPublicPort,
} from "./localDomains.ts";

const servers: NodeHttp.Server[] = [];
const socketsByServer = new Map<NodeHttp.Server, Set<import("node:net").Socket>>();

const listen = (server: NodeHttp.Server) =>
  new Promise<number>((resolve, reject) => {
    const sockets = new Set<import("node:net").Socket>();
    socketsByServer.set(server, sockets);
    // Upgraded sockets stay out of Server.closeAllConnections(), so track them here.
    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.on("close", () => {
        sockets.delete(socket);
      });
    });
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
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          for (const socket of socketsByServer.get(server) ?? []) {
            socket.on("error", () => {});
            socket.destroy();
          }
          socketsByServer.delete(server);
          server.close(() => resolve());
        }),
    ),
  );
});

describe("local domains", () => {
  it("uses the desktop listener port only when it is valid", () => {
    expect(resolveLocalDomainPublicPort({ T3CODE_LOCAL_DOMAIN_PUBLIC_PORT: "80" })).toBe(80);
    expect(resolveLocalDomainPublicPort({ T3CODE_LOCAL_DOMAIN_PUBLIC_PORT: "0" })).toBe(
      LOCAL_DOMAIN_PROXY_PORT,
    );
  });
  it("normalizes one-label names to .localhost and migrates old persisted names", () => {
    expect(normalizeLocalDomain("Shop")).toBe("shop.localhost");
    expect(normalizeLocalDomain("shop.localhost")).toBe("shop.localhost");
    expect(normalizeLocalDomain("shop.example")).toBeNull();
    expect(normalizeLocalDomain("shop.other.localhost")).toBeNull();
    expect(normalizeLocalDomain("shop.tandem")).toBeNull();
    expect(migratePersistedLocalDomain("Shop.tandem")).toBe("shop.localhost");
  });

  it("uses a nonprivileged proxy port and reports occupied ports uniformly", () => {
    expect(LOCAL_DOMAIN_PROXY_PORT).toBe(7777);

    const inUse = portListenError(
      LOCAL_DOMAIN_PROXY_PORT,
      Object.assign(new Error(), { code: "EADDRINUSE" }),
    );
    expect(inUse.reason).toBe("portUnavailable");
    expect(inUse.message).toContain("already in use");

    const denied = portListenError(
      LOCAL_DOMAIN_PROXY_PORT,
      Object.assign(new Error(), { code: "EACCES" }),
    );
    expect(denied.reason).toBe("portUnavailable");
    expect(denied.message).not.toContain("administrator");
  });

  it("routes an explicit localhost Host header to loopback and preserves its forwarding header", async () => {
    const upstream = NodeHttp.createServer((request, response) => {
      response.end(request.headers["x-forwarded-host"]);
    });
    const upstreamPort = await listen(upstream);
    const proxy = createLocalDomainProxy(() => [{ domain: "shop.localhost", port: upstreamPort }]);
    const proxyPort = await listen(proxy);

    const body = await new Promise<string>((resolve, reject) => {
      const request = NodeHttp.request(
        { host: "127.0.0.1", port: proxyPort, headers: { host: "shop.localhost:7777" } },
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
    expect(body).toBe("shop.localhost:7777");
  });

  it("forwards websocket upgrades for Vite HMR", async () => {
    const upstream = NodeHttp.createServer();
    upstream.on("upgrade", (_request, socket) =>
      socket.end(
        "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n",
      ),
    );
    const upstreamPort = await listen(upstream);
    const proxy = createLocalDomainProxy(() => [{ domain: "shop.localhost", port: upstreamPort }]);
    const proxyPort = await listen(proxy);

    const statusCode = await new Promise<number>((resolve, reject) => {
      const request = NodeHttp.request({
        host: "127.0.0.1",
        port: proxyPort,
        path: "/@vite/client",
        headers: { host: "shop.localhost:7777", connection: "Upgrade", upgrade: "websocket" },
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

  it("forwards a non-upgrade response instead of leaving the client waiting", async () => {
    const upstream = NodeHttp.createServer();
    upstream.on("upgrade", (_request, socket) => {
      socket.end("HTTP/1.1 426 Upgrade Required\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
    });
    const upstreamPort = await listen(upstream);
    const proxy = createLocalDomainProxy(() => [{ domain: "shop.localhost", port: upstreamPort }]);
    const proxyPort = await listen(proxy);

    const statusCode = await new Promise<number>((resolve, reject) => {
      const request = NodeHttp.request({
        host: "127.0.0.1",
        port: proxyPort,
        headers: { host: "shop.localhost:7777", connection: "Upgrade", upgrade: "websocket" },
      });
      request.once("response", (response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      });
      request.once("upgrade", () => reject(new Error("expected a normal HTTP response")));
      request.once("error", reject);
      request.end();
    });
    expect(statusCode).toBe(426);
  });

  it("survives a client reset after the websocket upgrade", async () => {
    const crashes: Array<Error> = [];
    const onCrash = (error: Error) => {
      crashes.push(error);
    };
    process.on("uncaughtException", onCrash);
    try {
      const upstream = NodeHttp.createServer();
      upstream.on("upgrade", (_request, socket) => {
        socket.on("error", () => {});
        socket.write(
          "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n",
        );
      });
      const upstreamPort = await listen(upstream);
      const proxy = createLocalDomainProxy(() => [
        { domain: "shop.localhost", port: upstreamPort },
      ]);
      const proxyPort = await listen(proxy);

      await new Promise<void>((resolve, reject) => {
        const request = NodeHttp.request({
          host: "127.0.0.1",
          port: proxyPort,
          headers: { host: "shop.localhost:7777", connection: "Upgrade", upgrade: "websocket" },
        });
        request.once("upgrade", (_response, socket) => {
          socket.on("error", () => {});
          socket.on("close", () => resolve());
          socket.destroy();
        });
        request.once("error", reject);
        request.end();
      });
      await new Promise((resolve) => setImmediate(resolve));
      expect(crashes).toEqual([]);
    } finally {
      process.off("uncaughtException", onCrash);
    }
  });
});
