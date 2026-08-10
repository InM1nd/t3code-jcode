# Project Board

Project Board is a shared todo list for a project. Items persist across threads in that project, so you and your agents can track work without copying checklists between chats.

## Open the board

In a thread for the project:

- Open the right panel and choose **Board**
- Use the command palette: **Toggle project board**
- Shortcut: `Mod+Shift+B` (configurable)

## Use the board

- Add an item with the input at the top of the panel
- Check an item to mark it done; uncheck to reopen it
- Delete an item with the × control on the row
- Items created by an agent show a small **agent** badge

Done items live in a collapsible **Done** section. The board is capped at 100 items per project.

## Agents

When an agent session is connected through T3 Code’s MCP tools (Claude, Cursor, Codex, Grok, OpenCode), it can list and update the same board with `board_list`, `board_upsert`, `board_set_status`, and `board_delete`. Changes show up live in the panel for every connected client.

**jcode:** T3 installs a small local MCP bridge into the project’s `.jcode/mcp.json` when a jcode session starts, so jcode can use the same `board_*` tools. Each turn also gets a short reminder that those tools exist. Prefer letting the agent update the board via tools; the Board panel still works for manual edits.
