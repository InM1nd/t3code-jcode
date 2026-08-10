# Project Board (internals)

Project-scoped todos shared across threads. Source of truth is the orchestration event log; the UI reads `boardItems` on the project shell.

## Data model

- Contracts: `ProjectBoardItem`, `ProjectBoardItemId`, `PROJECT_BOARD_ITEM_LIMIT` in `packages/contracts`
- Commands: `project.board.item.upsert`, `project.board.item.delete`
- Events: `project.board-item-upserted`, `project.board-item-deleted`
- Aggregate: existing `project` kind (`aggregateId = projectId`)
- Projection: `projection_projects.board_items_json` (migration `041_ProjectionProjectsBoardItems`)
- Shell: `OrchestrationProjectShell.boardItems` (optional on the wire; treat missing as `[]`)

## Live updates

Board mutations fan out through the existing shell stream as `project-upserted` (`ws.ts` → `toShellStreamEvent`). No dedicated board subscription.

## MCP

Toolkit under `apps/server/src/mcp/toolkits/board/`:

- `board_list`
- `board_upsert`
- `board_set_status`
- `board_delete`

Capability `"board"` is issued with every MCP session token. Handlers resolve `projectId` from the invocation `threadId`, then dispatch through `OrchestrationEngineService` so UI and agents share one write path.

### jcode exception

jcode rejects non-empty ACP `mcpServers` and only loads stdio MCP from its config files (HTTP/SSE entries are skipped). On jcode `startSession`, the adapter upserts a managed stdio server named `t3-code` into the project’s `.jcode/mcp.json` that runs `node <t3-entry> __jcode-mcp-stdio` and proxies NDJSON MCP to T3’s HTTP `/mcp` (auth via a 0600 file under `secretsDir/jcode-mcp/`).

That gives jcode the same `board_*` (and other) MCP tools as Claude/Cursor. Turns still get a tiny `<project_board>` hint (`projectBoardPrompt.ts`) so the model knows the tools exist—without dumping the full board into every prompt.

## Clients

- Web/desktop: right-panel surface `"board"` → `ProjectBoardPanel`
- Mobile: deferred (phase 2)
- Client commands: `upsertProjectBoardItem` / `deleteProjectBoardItem` in `packages/client-runtime`
