// @effect-diagnostics nodeBuiltinImport:off - HTTP upgrade forwarding and the macOS authorization prompt require Node's low-level server and child-process APIs.
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeHttp from "node:http";

import {
  type LocalDomainBinding,
  LocalDomainError,
  type LocalDomainList,
  PublishLocalDomainInput,
  UnpublishLocalDomainInput,
} from "@t3tools/contracts";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

import { writeFileStringAtomically } from "./atomicWrite.ts";
import * as ServerConfig from "./config.ts";
import {
  TANDEM_RESOLVER_PATH,
  TANDEM_RESOLVER_PORT,
  createTandemDnsServer,
  planResolverRemoval,
  planResolverSetup,
} from "./localDomainsResolver.ts";

const HOSTS_PATH = "/etc/hosts";
const PROXY_PORT = 80;
const HOSTS_BEGIN = "# BEGIN T3 Code local domains";
const HOSTS_END = "# END T3 Code local domains";
const HOSTS_OWNER_PREFIX = "# OWNER T3 Code local domains: ";
const OWNER_CONFLICT_MESSAGE =
  "Unpublish domains in the owning environment. If it no longer exists, remove the T3 Code local-domains block from /etc/hosts, then retry.";
const STATE_FILE = "local-domains.json";
const HOSTS_STAGING_FILE = "local-domains.hosts";
const RESOLVER_STAGING_FILE = "tandem.resolver";

const LocalDomainState = Schema.Struct({
  version: Schema.Literal(1),
  domains: Schema.Array(
    Schema.Struct({
      domain: Schema.String,
      port: Schema.Int,
    }),
  ),
});
const decodeState = Schema.decodeUnknownEffect(Schema.fromJsonString(LocalDomainState));

export function normalizeLocalDomain(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) return null;
  const domain = normalized.endsWith(".tandem") ? normalized : `${normalized}.tandem`;
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.tandem$/.test(domain) ? domain : null;
}

export function suggestedLocalDomain(port: number): string {
  return `local-${port}.tandem`;
}

/** Stable per-environment identity used to make the shared hosts block auditable. */
export function localDomainOwnerId(stateDir: string): string {
  return NodeCrypto.createHash("sha256").update(stateDir, "utf8").digest("hex");
}

export function managedHostsOwner(hosts: string): string | null {
  const block = hosts.match(
    /# BEGIN T3 Code local domains\n([\s\S]*?)# END T3 Code local domains/,
  )?.[1];
  return block?.match(/^# OWNER T3 Code local domains: ([A-Za-z0-9_-]+)$/m)?.[1] ?? null;
}

export function localDomainOwnerConflict(hosts: string, ownerId: string): LocalDomainError | null {
  const existingOwner = managedHostsOwner(hosts);
  if (existingOwner === null || existingOwner === ownerId) return null;
  return new LocalDomainError({
    reason: "ownerConflict",
    message: OWNER_CONFLICT_MESSAGE,
  });
}

/** Replaces only T3 Code's fenced /etc/hosts block. */
export function replaceManagedHostsBlock(
  hosts: string,
  domains: ReadonlyArray<LocalDomainBinding>,
  ownerId?: string,
): string {
  const before = hosts.replace(
    /\n?# BEGIN T3 Code local domains\n[\s\S]*?# END T3 Code local domains\n?/g,
    "",
  );
  if (domains.length === 0) return before;
  const body = domains
    .toSorted((left, right) => left.domain.localeCompare(right.domain))
    .map(({ domain }) => `127.0.0.1 ${domain}`)
    .join("\n");
  const ownerLine = ownerId ? `${HOSTS_OWNER_PREFIX}${ownerId}\n` : "";
  return `${before.replace(/\n*$/, "\n")}\n${HOSTS_BEGIN}\n${ownerLine}${body}\n${HOSTS_END}\n`;
}

function domainFromHost(host: string | undefined): string | null {
  if (!host) return null;
  return normalizeLocalDomain(host.replace(/:\d+$/, ""));
}

function writeProxyError(response: NodeHttp.ServerResponse, error: unknown) {
  if (!response.headersSent) response.writeHead(502, { "content-type": "text/plain" });
  response.end(error instanceof Error ? error.message : "Local development server unavailable");
}

/** A deliberately small proxy: it only routes names in the managed binding list. */
export function createLocalDomainProxy(getDomains: () => ReadonlyArray<LocalDomainBinding>) {
  const findPort = (host: string | undefined) => {
    const domain = domainFromHost(host);
    return domain ? getDomains().find((binding) => binding.domain === domain)?.port : undefined;
  };
  const server = NodeHttp.createServer((request, response) => {
    const port = findPort(request.headers.host);
    if (!port) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("Unknown local development domain");
      return;
    }
    const upstream = NodeHttp.request(
      {
        host: "127.0.0.1",
        port,
        method: request.method,
        path: request.url,
        headers: {
          ...request.headers,
          host: `127.0.0.1:${port}`,
          "x-forwarded-host": request.headers.host,
        },
      },
      (upstreamResponse) => {
        response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
        upstreamResponse.pipe(response);
      },
    );
    upstream.on("error", (error) => writeProxyError(response, error));
    request.pipe(upstream);
  });
  server.on("upgrade", (request, socket, head) => {
    const port = findPort(request.headers.host);
    if (!port) {
      socket.end("HTTP/1.1 404 Not Found\r\n\r\n");
      return;
    }
    const upstream = NodeHttp.request({
      host: "127.0.0.1",
      port,
      method: request.method,
      path: request.url,
      headers: {
        ...request.headers,
        host: `127.0.0.1:${port}`,
        "x-forwarded-host": request.headers.host,
      },
    });
    upstream.on("upgrade", (upstreamResponse, upstreamSocket, upstreamHead) => {
      const status = `HTTP/${upstreamResponse.httpVersion} ${upstreamResponse.statusCode} ${upstreamResponse.statusMessage}\r\n`;
      const headers = Object.entries(upstreamResponse.headers)
        .flatMap(([key, value]) =>
          (Array.isArray(value) ? value : [value]).map((item) => `${key}: ${item}\r\n`),
        )
        .join("");
      socket.write(`${status}${headers}\r\n`);
      if (upstreamHead.length) socket.write(upstreamHead);
      if (head.length) upstreamSocket.write(head);
      upstreamSocket.pipe(socket);
      socket.pipe(upstreamSocket);
    });
    upstream.on("error", () => socket.destroy());
    upstream.end();
  });
  return server;
}

/** Tells "another process (maybe another T3 Code environment) owns this port" apart from "needs a privileged bind". */
export function portListenError(port: number, cause: NodeJS.ErrnoException): LocalDomainError {
  if (cause.code === "EADDRINUSE") {
    return new LocalDomainError({
      reason: "portUnavailable",
      message: `Port ${port} is already in use — another app, or another T3 Code environment on this machine, may already be running the local domain proxy.`,
    });
  }
  if (cause.code === "EACCES") {
    return new LocalDomainError({
      reason: "authorizationDenied",
      message: `Port ${port} requires administrator privileges to bind. Local development domains need T3 Code to run with elevated permissions.`,
    });
  }
  return new LocalDomainError({
    reason: "portUnavailable",
    message: `Port ${port} is unavailable. Stop the service using it and try again.`,
  });
}

const listen = (server: NodeHttp.Server, port: number) =>
  Effect.callback<NodeHttp.Server, LocalDomainError>((resume) => {
    const onError = (cause: NodeJS.ErrnoException) => {
      server.off("listening", onListening);
      resume(Effect.fail(portListenError(port, cause)));
    };
    const onListening = () => {
      server.off("error", onError);
      resume(Effect.succeed(server));
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
    return Effect.sync(() => {
      server.close();
    });
  });

const close = (server: NodeHttp.Server) =>
  Effect.callback<void>((resume) => {
    server.close(() => resume(Effect.void));
  });

const listenResolver = (server: ReturnType<typeof createTandemDnsServer>) =>
  Effect.callback<ReturnType<typeof createTandemDnsServer>, LocalDomainError>((resume) => {
    const onError = (cause: NodeJS.ErrnoException) => {
      server.off("listening", onListening);
      resume(Effect.fail(portListenError(TANDEM_RESOLVER_PORT, cause)));
    };
    const onListening = () => {
      server.off("error", onError);
      resume(Effect.succeed(server));
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.bind(TANDEM_RESOLVER_PORT, "127.0.0.1");
    return Effect.sync(() => {
      server.close();
    });
  });

const closeResolver = (server: ReturnType<typeof createTandemDnsServer>) =>
  Effect.callback<void>((resume) => {
    server.close(() => resume(Effect.void));
  });

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\\"'\\\"'")}'`;
}

function runAuthorizedCommand(
  command: string,
  spawnFailureReason: "hostsUpdateFailed" | "resolverUpdateFailed",
  spawnFailureMessage: string,
  deniedMessage: string,
): Effect.Effect<void, LocalDomainError> {
  const script = `do shell script "${command.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}" with administrator privileges`;
  return Effect.callback((resume) => {
    const child = NodeChildProcess.spawn("/usr/bin/osascript", ["-e", script], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once("error", () =>
      resume(
        Effect.fail(
          new LocalDomainError({
            reason: spawnFailureReason,
            message: spawnFailureMessage,
          }),
        ),
      ),
    );
    child.once("exit", (code) =>
      resume(
        code === 0
          ? Effect.void
          : Effect.fail(
              new LocalDomainError({
                reason: "authorizationDenied",
                message: stderr.trim() || deniedMessage,
              }),
            ),
      ),
    );
    return Effect.sync(() => child.kill());
  });
}

function runAuthorizedHostsCopy(stagedHostsPath: string): Effect.Effect<void, LocalDomainError> {
  return runAuthorizedCommand(
    `/bin/cp ${shellQuote(stagedHostsPath)} ${HOSTS_PATH}`,
    "hostsUpdateFailed",
    "Unable to request permission to update /etc/hosts.",
    "Permission to update /etc/hosts was denied.",
  );
}

function runAuthorizedResolverCopy(
  stagedResolverPath: string,
): Effect.Effect<void, LocalDomainError> {
  return runAuthorizedCommand(
    `/bin/mkdir -p /etc/resolver && /bin/cp ${shellQuote(stagedResolverPath)} ${TANDEM_RESOLVER_PATH}`,
    "resolverUpdateFailed",
    "Unable to request permission to update the macOS tandem resolver.",
    "Permission to update the macOS tandem resolver was denied.",
  );
}

function runAuthorizedResolverRemove(): Effect.Effect<void, LocalDomainError> {
  return runAuthorizedCommand(
    `/bin/rm -f ${TANDEM_RESOLVER_PATH}`,
    "resolverUpdateFailed",
    "Unable to request permission to remove the macOS tandem resolver.",
    "Permission to remove the macOS tandem resolver was denied.",
  );
}

export class LocalDomains extends Context.Service<
  LocalDomains,
  {
    readonly list: Effect.Effect<LocalDomainList>;
    readonly publish: (
      input: PublishLocalDomainInput,
    ) => Effect.Effect<LocalDomainList, LocalDomainError>;
    readonly unpublish: (
      input: UnpublishLocalDomainInput,
    ) => Effect.Effect<LocalDomainList, LocalDomainError>;
  }
>()("t3/localDomains") {
  static readonly layer = Layer.effect(
    LocalDomains,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const config = yield* ServerConfig.ServerConfig;
      const platform = yield* HostProcessPlatform;
      const statePath = path.join(config.stateDir, STATE_FILE);
      const stagingPath = path.join(config.stateDir, HOSTS_STAGING_FILE);
      const resolverStagingPath = path.join(config.stateDir, RESOLVER_STAGING_FILE);
      const ownerId = localDomainOwnerId(config.stateDir);
      const readHosts = () =>
        fileSystem.readFileString(HOSTS_PATH).pipe(
          Effect.mapError(
            () =>
              new LocalDomainError({
                reason: "hostsUpdateFailed",
                message: "Could not read /etc/hosts.",
              }),
          ),
        );
      const loaded = yield* fileSystem.readFileString(statePath).pipe(
        Effect.flatMap(decodeState),
        Effect.catchCause(() => Effect.succeed({ version: 1 as const, domains: [] })),
      );
      let domains = loaded.domains.map(({ domain, port }) => ({ domain, port }));
      let proxy: NodeHttp.Server | null = null;
      let resolver: ReturnType<typeof createTandemDnsServer> | null = null;
      let proxyError: string | null = null;
      const mutex = yield* Semaphore.make(1);
      yield* Effect.addFinalizer(() =>
        Effect.gen(function* () {
          if (proxy !== null) yield* close(proxy);
          if (resolver !== null) yield* closeResolver(resolver);
        }),
      );
      const snapshot = (): LocalDomainList => ({
        domains,
        supported: platform === "darwin",
        proxyError,
      });
      const ensureSupported = () =>
        platform === "darwin"
          ? Effect.void
          : Effect.fail(
              new LocalDomainError({
                reason: "unsupportedPlatform",
                message: "Local development domains are available on macOS only.",
              }),
            );
      const readResolver = () =>
        fileSystem.readFileString(TANDEM_RESOLVER_PATH).pipe(
          Effect.catchTag("PlatformError", (error) =>
            error.reason._tag === "NotFound" ? Effect.succeed(null) : Effect.fail(error),
          ),
          Effect.mapError(
            () =>
              new LocalDomainError({
                reason: "resolverUpdateFailed",
                message: "Could not read the macOS tandem resolver.",
              }),
          ),
        );
      const ensureResolver = Effect.fn("LocalDomains.ensureResolver")(function* () {
        if (resolver !== null) return;
        const current = yield* readResolver();
        const plan = planResolverSetup(current, ownerId);
        if (plan.action === "conflict")
          return yield* new LocalDomainError({
            reason: "ownerConflict",
            message:
              "Another T3 Code environment owns /etc/resolver/tandem. Remove its local domains before retrying.",
          });
        if (plan.action === "write") {
          yield* writeFileStringAtomically({
            filePath: resolverStagingPath,
            contents: plan.contents,
          }).pipe(
            Effect.provideService(FileSystem.FileSystem, fileSystem),
            Effect.provideService(Path.Path, path),
            Effect.mapError(
              () =>
                new LocalDomainError({
                  reason: "resolverUpdateFailed",
                  message: "Could not prepare the macOS tandem resolver.",
                }),
            ),
          );
          yield* runAuthorizedResolverCopy(resolverStagingPath);
        }
        const candidate = createTandemDnsServer();
        resolver = yield* listenResolver(candidate).pipe(
          Effect.tapError((error) =>
            Effect.sync(() => {
              proxyError = error.message;
            }),
          ),
        );
      });
      const removeResolver = Effect.fn("LocalDomains.removeResolver")(function* () {
        const current = yield* readResolver();
        const plan = planResolverRemoval(current, ownerId);
        if (plan === "conflict")
          return yield* new LocalDomainError({
            reason: "ownerConflict",
            message:
              "Another T3 Code environment owns /etc/resolver/tandem. Remove its local domains before retrying.",
          });
        if (plan === "remove") yield* runAuthorizedResolverRemove();
        if (resolver !== null) {
          const currentResolver = resolver;
          yield* closeResolver(currentResolver);
          resolver = null;
        }
      });
      const ensureProxy = Effect.fn("LocalDomains.ensureProxy")(function* () {
        if (proxy !== null) return;
        const hosts = yield* readHosts();
        const ownerConflict = localDomainOwnerConflict(hosts, ownerId);
        if (ownerConflict) return yield* ownerConflict;
        const candidate = createLocalDomainProxy(() => domains);
        proxy = yield* listen(candidate, PROXY_PORT).pipe(
          Effect.tapError((error) =>
            Effect.sync(() => {
              proxyError = error.message;
            }),
          ),
        );
        proxyError = null;
      });
      if (platform === "darwin" && domains.length > 0) {
        yield* Effect.gen(function* () {
          yield* ensureResolver();
          yield* ensureProxy();
        }).pipe(
          Effect.catch((error) =>
            Effect.sync(() => {
              proxyError = error.message;
            }),
          ),
        );
      }
      const persist = (next: ReadonlyArray<LocalDomainBinding>) =>
        writeFileStringAtomically({
          filePath: statePath,
          contents: `${JSON.stringify({ version: 1, domains: next }, null, 2)}\n`,
        }).pipe(
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.provideService(Path.Path, path),
          Effect.mapError(
            () =>
              new LocalDomainError({
                reason: "hostsUpdateFailed",
                message: "Could not save local domains.",
              }),
          ),
        );
      const updateHosts = (next: ReadonlyArray<LocalDomainBinding>) =>
        Effect.gen(function* () {
          const hosts = yield* readHosts();
          const ownerConflict = localDomainOwnerConflict(hosts, ownerId);
          if (ownerConflict) return yield* ownerConflict;
          yield* writeFileStringAtomically({
            filePath: stagingPath,
            contents: replaceManagedHostsBlock(hosts, next, ownerId),
          }).pipe(
            Effect.provideService(FileSystem.FileSystem, fileSystem),
            Effect.provideService(Path.Path, path),
            Effect.mapError(
              () =>
                new LocalDomainError({
                  reason: "hostsUpdateFailed",
                  message: "Could not prepare /etc/hosts update.",
                }),
            ),
          );
          yield* runAuthorizedHostsCopy(stagingPath);
        });
      const publish = (input: PublishLocalDomainInput) =>
        Semaphore.withPermits(
          mutex,
          1,
        )(
          Effect.gen(function* () {
            yield* ensureSupported();
            if (
              !Number.isInteger(input.port) ||
              input.port < 1 ||
              input.port > 65_535 ||
              input.port === 80
            ) {
              return yield* new LocalDomainError({
                reason: "invalidDomain",
                message: "Choose a local port other than 80.",
              });
            }
            const domain = normalizeLocalDomain(input.domain ?? suggestedLocalDomain(input.port));
            if (!domain) {
              return yield* new LocalDomainError({
                reason: "invalidDomain",
                message: "Use a name such as shop or shop.tandem.",
              });
            }
            const previous = domains;
            const next = [
              ...previous.filter((binding) => binding.domain !== domain),
              { domain, port: input.port },
            ];
            yield* ensureResolver();
            yield* ensureProxy();
            yield* persist(next);
            yield* updateHosts(next).pipe(
              Effect.tapError(() => persist(previous).pipe(Effect.ignore)),
            );
            domains = next;
            return snapshot();
          }),
        );
      const unpublish = (input: UnpublishLocalDomainInput) =>
        Semaphore.withPermits(
          mutex,
          1,
        )(
          Effect.gen(function* () {
            yield* ensureSupported();
            const domain = normalizeLocalDomain(input.domain);
            if (!domain)
              return yield* new LocalDomainError({
                reason: "invalidDomain",
                message: "Invalid local domain.",
              });
            if (!domains.some((binding) => binding.domain === domain)) return snapshot();
            yield* ensureProxy();
            const previous = domains;
            const next = previous.filter((binding) => binding.domain !== domain);
            yield* persist(next);
            yield* updateHosts(next).pipe(
              Effect.tapError(() => persist(previous).pipe(Effect.ignore)),
            );
            if (next.length === 0) {
              yield* removeResolver().pipe(
                Effect.tapError(() => persist(previous).pipe(Effect.ignore)),
              );
            }
            domains = next;
            if (next.length === 0 && proxy !== null) {
              const currentProxy = proxy;
              yield* close(currentProxy);
              proxy = null;
            }
            return snapshot();
          }),
        );
      return LocalDomains.of({ list: Effect.sync(snapshot), publish, unpublish });
    }),
  );
}
