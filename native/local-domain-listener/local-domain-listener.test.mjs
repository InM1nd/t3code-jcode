import * as NodeAssert from "node:assert/strict";
import * as NodeChildProcess from "node:child_process";
import * as NodeHttp from "node:http";
import * as NodeNet from "node:net";
import * as NodeFSP from "node:fs/promises";
import * as NodeEvents from "node:events";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import * as NodeTest from "node:test";

const sourcePath = NodePath.join(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "LocalDomainListener.swift",
);
const TEST_TIMEOUT_MS = 10_000;
// oxlint-disable-next-line t3code/no-global-process-runtime -- This sidecar test only compiles on macOS.
const skipUnlessDarwin = process.platform !== "darwin";

const listen = (server) =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });

const freePort = async () => {
  const server = NodeHttp.createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
};

const waitForReady = (child) =>
  new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(
      () => reject(new Error("listener did not become ready")),
      TEST_TIMEOUT_MS,
    );
    const finish = (callback, value) => {
      clearTimeout(timeout);
      callback(value);
    };
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout === "ready\n") finish(resolve);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("exit", (code) => finish(reject, new Error(`listener exited ${code}: ${stderr}`)));
    child.once("error", (error) => finish(reject, error));
  });

const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = NodeChildProcess.spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)),
    );
  });

const requestAfterWriteEnd = (port) =>
  new Promise((resolve, reject) => {
    const client = NodeNet.connect({ host: "127.0.0.1", port });
    let response = "";
    client.setEncoding("utf8");
    client.once("error", reject);
    client.on("data", (chunk) => {
      response += chunk;
    });
    client.once("end", () => resolve(response));
    client.end("GET / HTTP/1.1\r\nHost: shop.localhost\r\nConnection: close\r\n\r\n");
  });

NodeTest.test(
  "forwards loopback HTTP and stops on SIGTERM",
  { skip: skipUnlessDarwin, timeout: TEST_TIMEOUT_MS },
  async () => {
    const directory = await NodeFSP.mkdtemp(
      NodePath.join(NodeOS.tmpdir(), "t3-local-domain-listener-"),
    );
    const binaryPath = NodePath.join(directory, "local-domain-listener");
    const upstream = NodeHttp.createServer((_request, response) => response.end("forwarded"));
    const upstreamPort = await listen(upstream);
    const listenerPort = await freePort();
    let listener;

    try {
      await run("xcrun", ["--sdk", "macosx", "swiftc", sourcePath, "-o", binaryPath]);
      listener = NodeChildProcess.spawn(binaryPath, [
        "--listen-port",
        String(listenerPort),
        "--target-port",
        String(upstreamPort),
      ]);
      await waitForReady(listener);

      const response = await fetch(`http://127.0.0.1:${listenerPort}`);
      NodeAssert.equal(await response.text(), "forwarded");

      listener.kill("SIGTERM");
      const [code, signal] = await NodeEvents.once(listener, "exit");
      NodeAssert.equal(code, 0);
      NodeAssert.equal(signal, null);
    } finally {
      if (listener?.exitCode === null) {
        listener.kill("SIGTERM");
        await NodeEvents.once(listener, "exit");
      }
      await new Promise((resolve) => upstream.close(resolve));
      await NodeFSP.rm(directory, { recursive: true, force: true });
    }
  },
);

NodeTest.test(
  "keeps the reverse stream open after the client ends its request",
  { skip: skipUnlessDarwin, timeout: TEST_TIMEOUT_MS },
  async () => {
    const directory = await NodeFSP.mkdtemp(
      NodePath.join(NodeOS.tmpdir(), "t3-local-domain-listener-"),
    );
    const binaryPath = NodePath.join(directory, "local-domain-listener");
    const upstream = NodeHttp.createServer((_request, response) =>
      response.end("forwarded after write end"),
    );
    const upstreamPort = await listen(upstream);
    const listenerPort = await freePort();
    let listener;

    try {
      await run("xcrun", ["--sdk", "macosx", "swiftc", sourcePath, "-o", binaryPath]);
      listener = NodeChildProcess.spawn(binaryPath, [
        "--listen-port",
        String(listenerPort),
        "--target-port",
        String(upstreamPort),
      ]);
      await waitForReady(listener);

      const response = await requestAfterWriteEnd(listenerPort);
      NodeAssert.match(response, /forwarded after write end/);
    } finally {
      if (listener?.exitCode === null) {
        listener.kill("SIGTERM");
        await NodeEvents.once(listener, "exit");
      }
      await new Promise((resolve) => upstream.close(resolve));
      await NodeFSP.rm(directory, { recursive: true, force: true });
    }
  },
);
