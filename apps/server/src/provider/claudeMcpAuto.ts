// @effect-diagnostics nodeBuiltinImport:off globalDate:off - reads the Claude CLI config files synchronously while a query opens, and is called from SDK callbacks outside the Effect runtime.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import type {
  McpServerConfig,
  Options as ClaudeQueryOptions,
} from "@anthropic-ai/claude-agent-sdk";
import type { ProjectId, ThreadId } from "@t3tools/contracts";

/**
 * "Load MCP servers on demand" (Claude setting `autoMcpServers`). A session
 * starts with `strictMcpConfig`, the t3-code server, and the servers this
 * project enabled recently. The agent turns on any other server from the
 * user's Claude config with the t3-code tool `mcp_enable`, which calls the
 * SDK's `setMcpServers` on the live query.
 *
 * Never use the SDK's `toggleMcpServer` here: it writes `disabledMcpServers`
 * into the user's `~/.claude.json`. `setMcpServers` replaces the whole dynamic
 * set, so every call passes t3-code and all active servers again; passing
 * only the new one disconnects t3-code.
 */

type McpServers = Record<string, McpServerConfig>;

export const CLAUDE_MCP_ENABLE_TOOL = "mcp_enable";
const T3_SERVER = "t3-code";
// ponytail: a learned server drops out when it was not enabled for this long; refresh on tool use if that proves too coarse.
const LEARNED_SERVER_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type LearnedServers = Record<string, number>;
type Profile = Record<string, LearnedServers>;

const readJson = (file: string): unknown => {
  try {
    return JSON.parse(NodeFS.readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asNames = (value: unknown): ReadonlyArray<string> =>
  Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];

/**
 * The servers Claude Code itself would load for `cwd` from user, project
 * (`.mcp.json`, only approved entries), and local scope. Plugin servers and
 * claude.ai connectors are not included. `null` when `.claude.json` cannot be
 * read, so the caller leaves the session alone.
 */
export function readClaudeMcpServers(configDir: string, cwd: string): McpServers | null {
  const config = readJson(NodePath.join(configDir, ".claude.json"));
  if (config === undefined) return null;
  const root = asRecord(config);
  const project = asRecord(asRecord(root.projects)[cwd]);
  const approved = new Set(asNames(project.enabledMcpjsonServers));
  const rejected = new Set(asNames(project.disabledMcpjsonServers));
  const projectServers = Object.fromEntries(
    Object.entries(asRecord(asRecord(readJson(NodePath.join(cwd, ".mcp.json"))).mcpServers)).filter(
      ([name]) =>
        !rejected.has(name) && (project.enableAllProjectMcpServers === true || approved.has(name)),
    ),
  );
  const disabled = new Set([...asNames(project.disabledMcpServers), T3_SERVER]);
  const merged = {
    ...asRecord(root.mcpServers),
    ...projectServers,
    ...asRecord(project.mcpServers),
  };
  return Object.fromEntries(
    Object.entries(merged).filter(
      ([name, value]) => !disabled.has(name) && asRecord(value) === value,
    ),
  ) as McpServers;
}

export function selectLearnedServers(
  available: McpServers,
  learned: LearnedServers,
  now: number,
): ReadonlyArray<string> {
  return Object.entries(learned)
    .filter(([name, usedAt]) => name in available && now - usedAt < LEARNED_SERVER_TTL_MS)
    .map(([name]) => name)
    .toSorted();
}

interface AutoSession {
  readonly projectId: ProjectId;
  readonly profilePath: string;
  readonly available: McpServers;
  readonly base: McpServers;
  readonly active: Set<string>;
  setMcpServers?: (servers: McpServers) => Promise<unknown>;
}

const sessions = new Map<ThreadId, AutoSession>();

const pick = (servers: McpServers, names: Iterable<string>): McpServers =>
  Object.fromEntries([...names].flatMap((name) => (servers[name] ? [[name, servers[name]]] : [])));

const readProfile = (file: string): Profile => asRecord(readJson(file)) as Profile;

/**
 * Rewrites the options of a query about to open. Off, without a t3-code
 * server (no way to enable anything), or without a readable Claude config,
 * the options pass through and Claude loads every server as usual.
 */
export function applyClaudeMcpAuto<Options extends ClaudeQueryOptions>(
  options: Options,
  input: {
    readonly enabled: boolean;
    readonly threadId: ThreadId;
    readonly projectId: ProjectId;
    readonly cwd: string | null;
    readonly stateDir: string;
  },
): Options {
  sessions.delete(input.threadId);
  const base = options.mcpServers;
  if (!input.enabled || input.cwd === null || base?.[T3_SERVER] === undefined) return options;
  const configDir = options.env?.CLAUDE_CONFIG_DIR || NodeOS.homedir();
  const available = readClaudeMcpServers(configDir, input.cwd);
  if (available === null) return options;
  const profilePath = NodePath.join(input.stateDir, "claude-mcp-auto.json");
  const start = selectLearnedServers(
    available,
    readProfile(profilePath)[input.projectId] ?? {},
    Date.now(),
  );
  sessions.set(input.threadId, {
    projectId: input.projectId,
    profilePath,
    available,
    base,
    active: new Set(start),
  });
  const offered = Object.keys(available)
    .filter((name) => !start.includes(name))
    .toSorted();
  const hint =
    offered.length === 0
      ? ""
      : `\n\nThese MCP servers are not loaded in this session: ${offered.join(", ")}. When a task needs one, call the t3-code tool \`${CLAUDE_MCP_ENABLE_TOOL}\` with its name; its tools appear within a few seconds.`;
  const systemPrompt =
    typeof options.systemPrompt === "object" &&
    !Array.isArray(options.systemPrompt) &&
    options.systemPrompt.type === "preset"
      ? { ...options.systemPrompt, append: `${options.systemPrompt.append ?? ""}${hint}` }
      : options.systemPrompt;
  return {
    ...options,
    strictMcpConfig: true,
    mcpServers: { ...pick(available, start), ...base },
    // `env` replaces the child's environment, so start from the full one.
    env: { ...(options.env ?? process.env), ENABLE_CLAUDEAI_MCP_SERVERS: "false" },
    systemPrompt,
  };
}

/** The adapter hands over the opened query so `mcp_enable` can reach it. */
export function attachClaudeMcpAutoQuery(
  threadId: ThreadId,
  setMcpServers: ((servers: McpServers) => Promise<unknown>) | undefined,
): void {
  const session = sessions.get(threadId);
  if (session !== undefined && setMcpServers !== undefined) session.setMcpServers = setMcpServers;
}

export type EnableClaudeMcpServerResult =
  | { readonly ok: true; readonly server: string; readonly loaded: ReadonlyArray<string> }
  | { readonly ok: false; readonly message: string };

export function enableClaudeMcpServer(
  threadId: ThreadId,
  name: string,
): EnableClaudeMcpServerResult {
  const session = sessions.get(threadId);
  if (session?.setMcpServers === undefined) {
    return {
      ok: false,
      message:
        "On-demand MCP servers only work in Claude threads with 'Load MCP servers on demand' turned on. Every configured server is already loaded here.",
    };
  }
  if (!(name in session.available)) {
    return {
      ok: false,
      message: `Unknown MCP server "${name}". Available: ${Object.keys(session.available).join(", ") || "none"}.`,
    };
  }
  session.active.add(name);
  // Not awaited: over HTTP the CLI applies the change only after this tool
  // call returns (sometimes only after the turn), so awaiting it here
  // deadlocks until the call times out.
  void session
    .setMcpServers({ ...pick(session.available, session.active), ...session.base })
    .catch(() => undefined);
  const profile = readProfile(session.profilePath);
  profile[session.projectId] = { ...profile[session.projectId], [name]: Date.now() };
  try {
    NodeFS.mkdirSync(NodePath.dirname(session.profilePath), { recursive: true });
    NodeFS.writeFileSync(session.profilePath, JSON.stringify(profile, null, 2));
  } catch {
    // Learning is best effort; the server is enabled for this session either way.
  }
  return { ok: true, server: name, loaded: [...session.active].toSorted() };
}
