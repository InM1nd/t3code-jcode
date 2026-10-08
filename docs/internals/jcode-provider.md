# Jcode provider (fork)

> Maintainer notes for the `jcode` driverKind added in this fork.

## What jcode is

[jcode](https://jcode.sh/) is an open-source terminal coding agent (Rust). It speaks the
[Agent Client Protocol](https://agentclientprotocol.com/) via:

```bash
jcode acp
```

Confirmed against `jcode v0.75.0`: ACP over stdio uses newline-delimited JSON-RPC.
`initialize` returns `agentInfo.name: "jcode"`. `session/new` accepts a per-session `cwd`.

## Chosen transport

**Primary: `jcode acp`** (same family as Cursor/Grok ACP adapters).

| Option                                     | Why not for MVP                                       |
| ------------------------------------------ | ----------------------------------------------------- |
| `jcode run --json/--ndjson`                | One-shot; poor fit for T3 turn/session lifecycle      |
| `jcode api-bridge` + `@1jehuang/jcode-sdk` | Parallel architecture; revisit if ACP is insufficient |
| TUI stdout parsing                         | Fragile; forbidden for MVP                            |

Session startup uses two owned child processes and a dedicated socket:

```text
<binaryPath|jcode> serve --no-selfdev -p <provider> -m <exact-model-slug> --socket <session-socket>
<binaryPath|jcode> [--quiet] acp [-C <cwd>] [-m <exact-model-slug>] [--provider-profile <name>] [-p <provider>] --socket <session-socket>
```

Process `cwd` and ACP `session/new.cwd` both use the T3 thread/worktree path
(`AcpSessionRuntime` already passes `options.cwd` into `session/new`).

## Isolation (per-session daemon)

jcode ACP is “backed by the Jcode daemon”. Findings from local probes on
`jcode v0.75.0`:

1. `initialize` succeeds without model auth and returns empty `authMethods`.
2. jcode **rejects** ACP `authenticate` (`Unsupported ACP method`). T3’s
   `AcpSessionRuntime` therefore supports `skipAuthenticate: true` for this
   driver only.
3. When a provider is known, T3 starts one scoped `jcode serve` daemon for
   that provider session, bound to a short temporary socket. The ACP subprocess
   connects to that same socket. This prevents an ambient daemon from silently
   supplying a different provider or model. Without a provider, the session
   does not get that socket.
4. T3 removes only its session socket and stops only the child handle it
   spawned. It never searches for or kills Jcode processes by name.
5. Prompting without configured model credentials fails with a clear
   “no usable provider” error until `jcode login`.
   Thread sessions start the private daemon only when a provider is known
   (Claude or Codex on the model selection, or any non-empty Jcode provider
   setting). Short text generation (titles, commit messages, pull-request
   text) does not start that daemon; it uses the ambient jcode daemon.
6. Non-empty ACP `session/new.mcpServers` is rejected (`ACP mcpServers are not
supported yet`). Configure MCP in `~/.jcode/mcp.json` or project-local
   `.jcode/mcp.json` / `.mcp.json` (stdio only; HTTP/SSE entries are skipped).
   T3 does **not** pass HTTP `mcpServers` over ACP. On session start it upserts a
   managed stdio `t3-code` entry into the project `.jcode/mcp.json` that proxies
   to T3 HTTP `/mcp`. Turns also get a short `<project_board>` hint for `board_*`.
7. ACP `session/set_model` is rejected (`Model switching is not available for
this provider`). Provider and model selection are applied only at daemon
   startup. Changing either route component requires a new provider session.
8. ACP v0.75 setup/model state reports the selected model but has no
   `provider` or `resolvedProvider` field. T3 verifies the exact reported model;
   provider verification relies on the isolated daemon argv plus the matching
   socket as the binding invariant. Do not invent an ACP provider field.

MVP guarantee: a provider session with a known provider owns an isolated
daemon created with that provider, the exact model slug, and that thread’s
worktree cwd. Daemon startup always includes `--no-selfdev`. Do not auto-start
swarm. Text generation is outside this guarantee.

## Out of scope (MVP)

- Session resume (`--resume` / ACP resume) — even though jcode advertises it
- Swarm, memory UI, browser automation UI
- api-bridge / TypeScript SDK
- Storing jcode OAuth/API keys inside T3 settings
- Injecting T3 MCP over ACP `mcpServers` (stdio bridge via `.jcode/mcp.json` is used instead)

## Mapping onto T3

```
UI (provider instance "Jcode")
  -> orchestration V2 turn
  -> JcodeAdapterV2 (a flavor of AcpAdapterV2)
  -> jcode serve on a private socket, when a provider is known
  -> jcode acp subprocess on that same socket
```

There is no `apps/server/src/provider/Layers/JcodeAdapter.ts` or
`Layers/JcodeProvider.ts`. Those names were the V1 layout.

- `apps/server/src/provider/Drivers/JcodeDriver.ts` — installs the driver
- `apps/server/src/provider/JcodeProvider.ts` — snapshot, model discovery
- `apps/server/src/orchestration-v2/Adapters/JcodeAdapterV2.ts` — thread runtime
- `apps/server/src/orchestration-v2/Adapters/AcpAdapterV2.ts` — shared ACP session the flavor plugs into
- `apps/server/src/provider/acp/JcodeAcpSupport.ts` — spawn argv and the reported-model check
- `apps/server/src/provider/acp/JcodeSessionDaemon.ts` — per-thread `jcode serve`
- `apps/server/src/provider/jcodeMcpConfig.ts` and `apps/server/src/mcp/jcodeMcpStdioBridge.ts` — project-local stdio bridge
- `apps/server/src/textGeneration/JcodeTextGeneration.ts` — ambient daemon, no session socket
- `packages/contracts/src/settings.ts` — `JcodeSettings`
- Web picker, settings, and icons under `apps/web/src/components/chat/`

## Auth / probe UX

Auth stays in jcode. Probe should:

- detect missing binary (`jcode` / configured `binaryPath`);
- surface ACP/daemon startup failures with actionable text (`jcode login`, PATH);
- not claim “ready” if ACP session setup cannot start.

## Future work

1. Resume across T3 restarts
2. Richer model catalog from jcode session model state / `jcode model`
3. api-bridge path if ACP gaps appear
4. Approvals/permissions polish beyond generic ACP mapping
