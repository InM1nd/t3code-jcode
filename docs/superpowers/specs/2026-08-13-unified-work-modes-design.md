# Unified work modes: design

## Goal

Give every thread a durable work mode that changes how an agent approaches the
next turns, regardless of whether the chosen runtime is a direct provider or
Jcode. The first release exposes four modes:

- **Build** — the normal implementation workflow.
- **Plan** — investigate and propose a plan before making changes.
- **Debug** — reproduce, gather evidence, identify the root cause, make the
  smallest safe fix, and verify it.
- **Swarm Lite** — divide independent parts of a task, coordinate their
  results, then produce one answer. This is an instruction-led workflow, not
  a new app-level agent scheduler.

The mode belongs to the thread, so the user sees the same intent after a
restart and each future turn starts with the same operating context.

## User experience

The composer gets one compact **Work mode** control next to the existing model
controls. It shows the active mode and opens a four-item menu with a one-line
description for each item. Selecting an item updates the current thread
immediately and persists it.

Build is the default for new threads. Existing threads remain Build. The mode
is visible in the thread only; the sidebar stays free of mode badges in this
release.

Existing `/plan` and `/default` commands continue to work as aliases for Plan
and Build. Add `/debug` and `/swarm` as matching aliases. The old Settings →
Beta → Legacy features gate must no longer hide the mode choice: Plan becomes
a normal first-class option in the unified control.

## Provider resolution

The orchestration contract stores one provider-neutral work-mode value. Before
a provider session receives it, its adapter resolves it into two inputs:

1. the provider's native interaction mode, when one exists;
2. a concise server-side workflow instruction for the selected mode.

| Selected mode | Native interaction                            | Workflow instruction                                                   |
| ------------- | --------------------------------------------- | ---------------------------------------------------------------------- |
| Build         | provider default                              | none                                                                   |
| Plan          | native plan where supported                   | do not edit until the user approves a plan                             |
| Debug         | provider default                              | evidence, reproduction, root cause, minimal fix, targeted verification |
| Swarm Lite    | provider default, optionally native subagents | split independent work, track roles/results, synthesize one answer     |

Adapters must never receive unsupported mode values as native CLI arguments.
For example, Codex/Claude/Cursor/OpenCode receive their existing default or
plan transport value; Debug and Swarm Lite are expressed through the shared
workflow instruction. This keeps provider-specific compatibility at the
adapter boundary.

Jcode uses the same resolver after its selected inner provider is known. It
therefore keeps the chosen model/provider routing intact and never silently
defaults to Anthropic merely because a work mode was selected.

## Swarm Lite boundary

This release does not create a T3-owned scheduler, child-thread graph, or
cross-provider worker pool. Where a provider already exposes native
subagents, its adapter may let that provider use them. Everywhere else,
Swarm Lite is still available as a guided, sequential workflow within the
current turn.

The UI describes Swarm Lite as a workflow, not a promise of parallel agents.
If the current provider reports native subagent activity, the existing agent
panel remains the place to observe it. A real orchestrated swarm can be added
later only when it needs visible worker lifecycle, cancellation, and shared
board assignment.

## Data and compatibility

Extend the existing durable thread interaction-mode event/schema rather than
adding a second competing setting. Its current values are `build`, `plan`,
`debug`, and `swarm`; the old `default` value remains a compatibility spelling
for Build. New threads and new mode changes persist `build`, while the web UI
shows legacy `default` threads as Build. The projector, client runtime, and
web UI all derive their state from this one field.

Provider adapters receive only a resolved native mode (`default` or `plan`, as
they support it) plus an optional instruction profile. The resolver is a small
shared pure function with exhaustive mapping tests. No database migration or
new dependency is needed.

## Failure behavior

Changing the mode uses the existing thread command/event path. If that command
is rejected or the connection drops, the UI retains the last confirmed mode
and shows the usual command error; it must not pretend the new mode was saved.

If a provider cannot implement a native Plan mode, it still receives the Plan
instruction profile under its normal transport mode. Debug and Swarm Lite are
available on every provider through their profiles. No mode selection changes
the selected provider, model, reasoning level, or speed.

## Testing and documentation

Add focused contract/projector tests for persistence and legacy `default`
normalization; resolver tests for every direct provider and Jcode inner
provider; and focused web tests for the menu, aliases, and retained mode.
Perform one visual web pass after integration, including Jcode and a direct
provider selection. Update user documentation to explain the four modes and
the Swarm Lite boundary.

## Non-goals

- Automatically spawn, schedule, or bill multiple agent sessions.
- Add a new global mode preference or per-project default.
- Alter provider/model selection, reasoning, speed, attachments, or Board.
- Add sidebar indicators or a mode history timeline.
