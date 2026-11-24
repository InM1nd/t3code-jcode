# Jcode

Use [jcode](https://jcode.sh/) as a coding-agent backend inside Tandem (this fork).

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

Pick the model the usual way, then press **Jcode** beside the model picker.
The model stays that provider — Claude, Codex, Cursor, Grok, OpenCode, or
Antigravity — and the turn runs through Jcode. The provider icon stays, with
a Jcode mark, and the button reads which backend is routed. Press it again
to run the same model directly. Optional Jcode settings (**Binary path**,
**Model**, **Jcode provider**, **Provider profile**) are the fallback when
the thread has not picked one.

## Enable in Tandem

1. Open Tandem.
2. Open provider settings and ensure a **Jcode** instance is enabled (or add one).
3. Create/select a thread, pick the model, then press **Jcode** beside the model picker. The provider icon stays, with a Jcode mark. Press it again before the first message to run that model directly.
4. Send a prompt. File edits should show up in Tandem diffs/checkpoints like other providers.

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

- One session per thread
- Threads with the same provider and model share one Tandem-owned daemon, and another Jcode client cannot retarget it. See [Jcode model routing](jcode-model-routing.md)
- jcode’s ACP surface may change across releases

## See also

- Model routing: [jcode-model-routing.md](jcode-model-routing.md)
- Design notes: [internals/jcode-provider.md](../internals/jcode-provider.md)
