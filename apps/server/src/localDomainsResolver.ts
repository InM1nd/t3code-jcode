// @effect-diagnostics nodeBuiltinImport:off - The wildcard resolver is a tiny loopback DNS server.
import * as NodeDgram from "node:dgram";

// Keep clear of mDNS's well-known UDP port while avoiding privileged DNS port 53.
export const TANDEM_RESOLVER_PORT = 53535;
export const TANDEM_RESOLVER_PATH = "/etc/resolver/tandem";

const OWNER_PREFIX = "# T3 Code local domains owner: ";
const TANDEM_LABEL = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)$/;

export function renderTandemResolverConfig(ownerId: string): string {
  return `${OWNER_PREFIX}${ownerId}\nnameserver 127.0.0.1\nport ${TANDEM_RESOLVER_PORT}\n`;
}

export function managedResolverOwner(config: string): string | null {
  return config.match(/^# T3 Code local domains owner: ([A-Za-z0-9_-]+)$/m)?.[1] ?? null;
}

export function resolverConfigBelongsTo(config: string, ownerId: string): boolean {
  return managedResolverOwner(config) === ownerId;
}

export function planResolverSetup(
  current: string | null,
  ownerId: string,
): { action: "write"; contents: string } | { action: "unchanged" } | { action: "conflict" } {
  const expected = renderTandemResolverConfig(ownerId);
  if (current === null) return { action: "write", contents: expected };
  if (!resolverConfigBelongsTo(current, ownerId)) return { action: "conflict" };
  return current === expected ? { action: "unchanged" } : { action: "write", contents: expected };
}

export function planResolverRemoval(
  current: string | null,
  ownerId: string,
): "remove" | "unchanged" | "conflict" {
  if (current === null) return "unchanged";
  return resolverConfigBelongsTo(current, ownerId) ? "remove" : "conflict";
}

function isTandemHostname(hostname: string): boolean {
  const labels = hostname.toLowerCase().replace(/\.$/, "").split(".");
  return (
    labels.length >= 2 &&
    labels.at(-1) === "tandem" &&
    labels.slice(0, -1).every((label) => TANDEM_LABEL.test(label))
  );
}

function readQuestion(
  query: Buffer,
): { end: number; name: string; type: number; classCode: number } | null {
  if (query.length < 12 || query.readUInt16BE(4) !== 1) return null;
  const labels: string[] = [];
  let offset = 12;
  while (offset < query.length) {
    const length = query[offset++];
    if (length === 0) break;
    if (!length || (length & 0xc0) !== 0 || offset + length > query.length) return null;
    labels.push(query.toString("ascii", offset, offset + length));
    offset += length;
  }
  if (offset + 4 > query.length || labels.length === 0) return null;
  return {
    end: offset + 4,
    name: labels.join("."),
    type: query.readUInt16BE(offset),
    classCode: query.readUInt16BE(offset + 2),
  };
}

/** Encodes one-question A responses for *.tandem without a DNS dependency. */
export function encodeTandemDnsResponse(query: Buffer): Buffer {
  const question = readQuestion(query);
  if (!question) return Buffer.alloc(0);
  const tandem = isTandemHostname(question.name);
  const answer = tandem && question.type === 1 && question.classCode === 1;
  const header = Buffer.alloc(12);
  query.copy(header, 0, 0, 2);
  header.writeUInt16BE(tandem ? 0x8180 : 0x8183, 2);
  header.writeUInt16BE(1, 4);
  header.writeUInt16BE(answer ? 1 : 0, 6);
  const questionBytes = query.subarray(12, question.end);
  if (!answer) return Buffer.concat([header, questionBytes]);
  const record = Buffer.alloc(16);
  record.writeUInt16BE(0xc00c, 0);
  record.writeUInt16BE(1, 2);
  record.writeUInt16BE(1, 4);
  record.writeUInt32BE(60, 6);
  record.writeUInt16BE(4, 10);
  record.set([127, 0, 0, 1], 12);
  return Buffer.concat([header, questionBytes, record]);
}

export function createTandemDnsServer(): NodeDgram.Socket {
  const server = NodeDgram.createSocket("udp4");
  server.on("message", (query, remote) => {
    const response = encodeTandemDnsResponse(query);
    if (response.length > 0) void server.send(response, remote.port, remote.address);
  });
  return server;
}
