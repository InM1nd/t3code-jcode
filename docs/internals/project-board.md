# Project Board (internals)

Project-scoped todos shared across threads. Source of truth is the orchestration event log; the UI reads `boardItems` on the project shell.

## Data model

- Contracts: `ProjectBoardItem`, `ProjectBoardBrief`, `ProjectBoardHandoff`, `ProjectBoardItemId`, `ProjectBoardHandoffId`, `PROJECT_BOARD_ITEM_LIMIT` in `packages/contracts`
- Commands: `project.board.item.upsert`, `project.board.item.handoff.append`, `project.board.item.delete`
- Events: `project.board-item-upserted`, `project.board-item-handoff-appended`, `project.board-item-deleted`
- Aggregate: existing `project` kind (`aggregateId = projectId`)
- Projection: `projection_projects.board_items_json` (migration `041_ProjectionProjectsBoardItems`)
- Shell: `OrchestrationProjectShell.boardItems` (optional on the wire; treat missing as `[]`)

`brief` and `latestHandoff` are optional/null-compatible fields. Upsert owns the brief; an explicit `null` clears it. Handoff append events are immutable and the projector replaces only `latestHandoff` on the card. Earlier handoffs stay in the orchestration event log and are intentionally not rendered as a history list yet. The decider verifies the source thread belongs to the target project before appending.

## Live updates

Board mutations fan out through the existing shell stream as `project-upserted` (`ws.ts` → `toShellStreamEvent`). No dedicated board subscription.

## MCP

Toolkit under `apps/server/src/mcp/toolkits/board/`:

- `board_list`
- `board_digest`
- `board_upsert`
- `board_get_brief`
- `board_set_status`
- `board_link_turn`
- `board_handoff`
- `board_delete`

Each board item may carry `linkedTurnIds` (capped). Agent upsert/status tools append the thread’s latest turn automatically; `board_link_turn` does it explicitly.

Capability `"board"` is issued with every MCP session token. Handlers resolve `projectId` from the invocation `threadId`, then dispatch through `OrchestrationEngineService` so UI and agents share one write path.

### jcode exception

jcode rejects non-empty ACP `mcpServers` and only loads stdio MCP from its config files (HTTP/SSE entries are skipped). On jcode `startSession`, the adapter upserts a managed stdio server named `t3-code` into the project’s `.jcode/mcp.json` that runs `node <t3-entry> __jcode-mcp-stdio` and proxies NDJSON MCP to T3’s HTTP `/mcp` (auth via a 0600 file under `secretsDir/jcode-mcp/`).

That gives jcode the same `board_*` (and other) MCP tools as Claude/Cursor. Turns still get a tiny `<project_board>` hint (`projectBoardPrompt.ts`) so the model knows the tools exist—without dumping the full board into every prompt.

## Clients

- Web/desktop: right-panel surface `"board"` → `ProjectBoardPanel`
- Mobile: deferred (phase 2)
- Client commands: `upsertProjectBoardItem` / `appendProjectBoardHandoff` / `deleteProjectBoardItem` in `packages/client-runtime`

### Board → Thread (web)

`ProjectBoardPanel` Implement action:

1. Creates/reuses a draft via `useNewThreadHandler({ seedPrompt })`
2. Upserts the item to `inProgress` with `sourceThreadId` set to that draft's thread id
3. If `sourceThreadId` already points at a live server thread or local draft, reopens it instead
4. Marks a pending turn-link; `ChatView` attaches the first `latestTurn` via `linkTurnId`

Pure helpers live in `apps/web/src/components/ProjectBoardPanel.logic.ts` and `@t3tools/shared/projectBoard`. The web cockpit shows attention items first, then fixed workflow sections; title prefixes are not grouping data.

### Board digest

- Shared formatter: `formatProjectBoardDigest`
- MCP: `board_digest`
- Web command palette: **Insert project board digest**
