import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { connect } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const sourcePath = join(dirname(fileURLToPath(import.meta.url)), "LocalDomainListener.swift");
const TEST_TIMEOUT_MS = 10_000;

const listen = (server) =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });

const freePort = async () => {
  const server = createServer();
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
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)),
    );
  });

const requestAfterWriteEnd = (port) =>
  new Promise((resolve, reject) => {
    const client = connect({ host: "127.0.0.1", port });
    let response = "";
    client.setEncoding("utf8");
    client.once("error", reject);
    client.on("data", (chunk) => {
      response += chunk;
    });
    client.once("end", () => resolve(response));
    client.end("GET / HTTP/1.1\r\nHost: shop.localhost\r\nConnection: close\r\n\r\n");
  });

test(
  "forwards loopback HTTP and stops on SIGTERM",
  { skip: process.platform !== "darwin", timeout: TEST_TIMEOUT_MS },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "t3-local-domain-listener-"));
    const binaryPath = join(directory, "local-domain-listener");
    const upstream = createServer((_request, response) => response.end("forwarded"));
    const upstreamPort = await listen(upstream);
    const listenerPort = await freePort();
    let listener;

    try {
      await run("xcrun", ["--sdk", "macosx", "swiftc", sourcePath, "-o", binaryPath]);
      listener = spawn(binaryPath, [
        "--listen-port",
        String(listenerPort),
        "--target-port",
        String(upstreamPort),
      ]);
      await waitForReady(listener);

      const response = await fetch(`http://127.0.0.1:${listenerPort}`);
      assert.equal(await response.text(), "forwarded");

      listener.kill("SIGTERM");
      const [code, signal] = await once(listener, "exit");
      assert.equal(code, 0);
      assert.equal(signal, null);
    } finally {
      if (listener?.exitCode === null) {
        listener.kill("SIGTERM");
        await once(listener, "exit");
      }
      await new Promise((resolve) => upstream.close(resolve));
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "keeps the reverse stream open after the client ends its request",
  { skip: process.platform !== "darwin", timeout: TEST_TIMEOUT_MS },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "t3-local-domain-listener-"));
    const binaryPath = join(directory, "local-domain-listener");
    const upstream = createServer((_request, response) =>
      response.end("forwarded after write end"),
    );
    const upstreamPort = await listen(upstream);
    const listenerPort = await freePort();
    let listener;

    try {
      await run("xcrun", ["--sdk", "macosx", "swiftc", sourcePath, "-o", binaryPath]);
      listener = spawn(binaryPath, [
        "--listen-port",
        String(listenerPort),
        "--target-port",
        String(upstreamPort),
      ]);
      await waitForReady(listener);

      const response = await requestAfterWriteEnd(listenerPort);
      assert.match(response, /forwarded after write end/);
    } finally {
      if (listener?.exitCode === null) {
        listener.kill("SIGTERM");
        await once(listener, "exit");
      }
      await new Promise((resolve) => upstream.close(resolve));
      await rm(directory, { recursive: true, force: true });
    }
  },
);
