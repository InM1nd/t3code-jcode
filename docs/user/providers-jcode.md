# Jcode

Use [jcode](https://jcode.sh/) as a coding-agent backend inside T3 Code (this fork).

## What this integration supports (MVP)

- Provider option **Jcode** in the model/provider picker
- Spawns `jcode acp` with the thread/worktree as cwd
- Streams assistant text, tools, and approvals through the existing ACP → orchestration path
- Optional settings: binary path, model (`-m`), jcode provider (`-p`), provider profile

## Not supported yet

- Session resume across T3 restarts
- Swarm / memory / browser automation UI
- `jcode api-bridge` / TypeScript SDK path
- Storing jcode OAuth/API keys in T3 settings
- Passing T3 MCP servers over ACP (T3 writes a local stdio bridge into `.jcode/mcp.json` instead)
- Mid-session model switching over ACP (pick the model before the session starts, or set it in Jcode settings)

## Requirements

1. Install jcode and put it on `PATH` (or set **Binary path** in provider settings).
2. Authenticate **LLM backends inside jcode itself** (this is separate from T3’s
   Settings → Providers list). Enabling Codex/Claude/Cursor in T3 does **not**
   log jcode in:

```bash
jcode login --provider claude    # Anthropic / Claude subscription
# or: jcode login --provider openai
# or: jcode login --provider cursor   # interactive; must approve Cursor IDE creds
jcode auth status
jcode usage
```

3. Quick CLI check:

```bash
jcode version
jcode acp --help
```

Optional in T3 → Jcode settings: **Jcode provider** (`-p`, e.g. `cursor`) and
**Model** (`-m`). Leave them empty to let jcode auto-pick after login.

## Enable in T3 Code

1. Start T3 as usual (`vp run dev` / desktop / `npx t3`).
2. Open provider settings and ensure a **Jcode** instance is enabled (or add one).
3. Create/select a thread and pick **Jcode** in the provider picker.
4. Send a prompt. File edits should show up in T3 diffs/checkpoints like other providers.

## Diagnostics

| Symptom                                           | Likely cause                                        | What to do                                                                 |
| ------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------- |
| “not installed or not on PATH”                    | binary missing                                      | Install jcode or set Binary path                                           |
| ACP startup failed                                | daemon/auth/socket                                  | Run `jcode auth status`, `jcode login`, retry; check server logs           |
| “No tokens/providers left” / “no usable provider” | jcode has no LLM login                              | `jcode login --provider …`, then `jcode auth status` / `jcode usage`       |
| Cursor creds “available” but still fail           | jcode won’t reuse Cursor IDE state without approval | Run `jcode login --provider cursor` in an interactive terminal             |
| Unexpected self-dev behavior                      | cwd is a jcode checkout                             | T3 always passes `--no-selfdev` for harness control                        |
| “ACP mcpServers are not supported yet”            | older build injected T3 MCP over ACP                | Update / restart T3; board tools use the stdio bridge in `.jcode/mcp.json` |
| “Model switching is not available…”               | older build used ACP set_model                      | Update / restart T3; model is set via `jcode acp -m …` at session start    |

## Limits

- One ACP session per T3 thread (not “one global agent per workspace”)
- Shared jcode daemon is OK; sessions are isolated by `session/new` cwd
- jcode’s ACP surface may change across releases

## See also

- Design notes: [internals/jcode-provider.md](../internals/jcode-provider.md)
