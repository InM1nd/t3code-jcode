# Board workflow and Jcode routing

## Scope

Extend the project Board so people and agents can manage a complete task lifecycle,
read the full task record, and edit it. Make Jcode sessions use the selected inner
provider and exact model instead of falling back to the shared Claude daemon.

## Board

### Task state

Board items support these statuses:

- `backlog`
- `ready`
- `inProgress`
- `inReview`
- `blocked`
- `completed`
- `cancelled`

Archiving is separate from status. An archived item is hidden from normal Board
sections but retains its status and all history. Restoring it clears the archive
marker and returns it to the same section.

Existing `pending` records migrate/read as `backlog`; existing `completed`
records remain `completed`.

### Data and commands

`ProjectBoardItem` gains optional `archivedAt`. Existing item-upsert commands
continue to edit title, notes, brief, status, links, and source. Dedicated
archive/restore commands change only `archivedAt`, so agents and users cannot
accidentally erase the prior status.

The Board MCP toolkit exposes archive and restore alongside its existing upsert,
status, handoff, link, and delete tools. Digests omit archived tasks by default
and state the archived count when one exists.

### Web interface

The Board groups active items by the seven statuses. A task click opens a detail
view in the existing right-panel Board space rather than navigating away from
the thread. The detail view shows title, notes, brief, latest handoff, linked
turns, source, and timestamps.

`Edit` makes title, notes, brief, and status editable in place. Save sends the
normal upsert command; Cancel discards only unsaved browser state. Archive,
restore, and delete are explicit actions. Archive has an expandable section
with its own count; cancelled items remain visible until manually archived.

## Jcode

### Correct provider and model routing

The selected Jcode inner provider and model are authoritative. Model discovery
uses Jcode's provider-specific `model list` output and preserves each exact slug
(for example `cursor-grok-4.6-high-fast`). Cursor therefore exposes every model
reported by Jcode, not a Grok-only allow-list.

Before a turn starts, T3 validates that the selected exact slug belongs to the
selected inner provider. A mismatch is shown as a validation error and never
silently starts a default model.

Jcode ACP currently attaches to its shared daemon, whose persisted session can
remain Claude even when ACP receives `-p` and `-m`. T3 will run an isolated
Jcode daemon/socket per T3 Jcode session, started with the selected provider and
model, and attach ACP to that socket. The adapter will verify the reported
session provider/model; any mismatch stops the session and reports the actual
and requested values.

### Reasoning and speed

Jcode v0.75 has no independent reasoning or speed flags. Its available model
slugs encode those choices (`high`, `xhigh`, and `fast`). The Jcode picker will
derive reasoning and speed controls from sibling slugs in the selected inner
provider's discovered model list. A control is shown only when the corresponding
variant exists; changing it selects that exact sibling model.

## Error handling and compatibility

- Old Board records decode without `archivedAt` and preserve their existing state.
- If Jcode cannot start or verify its isolated daemon, no turn is sent to the
  shared daemon; the user receives the cause and can retry after fixing Jcode
  authentication.
- Existing provider options, including `jcodeProvider`, remain part of dispatch.

## Verification

- Contract, projector, decider, Board MCP, and web logic tests cover all status
  transitions, archive/restore, and editing.
- Jcode tests cover provider-specific discovery, exact-slug dispatch, invalid
  provider/model pairs, daemon isolation options, and reasoning/speed sibling
  resolution.
- Targeted web and server typechecks pass. A desktop build is made for manual
  verification of Board editing and Cursor/Codex Jcode sessions.
