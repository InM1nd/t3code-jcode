# Project Board

Project Board is a shared todo list for a project. Items persist across threads in that project, so you and your agents can track work without copying checklists between chats.

## Open the board

In a thread for the project:

- Open the right panel and choose **Board**
- Use the command palette: **Toggle project board**
- Shortcut: `Mod+Shift+B` (configurable)

## Use the board

- Add an item with the input at the top of the panel
- The compact summary at the top shows counts by **Backlog**, **Ready**, **In progress**, **In review**, **Blocked**, **Done**, and **Cancelled**; each status also has its own colour
- **Needs attention** appears first and contains blocked and review items
- Other active items are grouped into fixed collapsible workflow sections: **In progress**, **Ready**, **Backlog**, **Done**, and **Cancelled**. The section order is stable and does not depend on title wording
- Keep titles focused on the deliverable. Do not add phase, priority, or ownership prefixes such as `[P1-MOBILE]`; use the card status for workflow and the brief or notes for context
- A row shows its title and one useful context line: the latest handoff's next step, then its note, then linked-turn information. Open task details for the full brief and history
- Check an item to mark it done; uncheck to return it to the backlog
- Click the status chip to advance it through the workflow
- Press the play control on a row to **Implement** it: opens a new thread with a seeded prompt, marks the item in progress, and links that thread on the card
- If an item already has a linked thread, Implement reopens it
- Select an item to edit its title, notes, status, and task brief, or to review its source, timestamps, linked turns, and latest handoff
- Archive an item without changing its status. Archived items appear in the collapsed **Archive** section and can be restored later
- Delete an item from its row or detail view
- Items created by an agent show a small **agent** badge
- In task details, add a **Task Brief**: a goal, acceptance criteria, important files, and notes
- In the same details view, add a **Handoff** with a summary, decisions, and one concrete next step. The card keeps the latest handoff so the next agent can continue immediately.

The board is capped at 100 items per project.

For remote connections, update the client and server together before using the expanded workflow. Current versions safely show older pending items in **Backlog**, while older clients may not understand the expanded statuses produced by a current server.

## Agents

### Preparing an executor

For parallel work, ask a coordinator thread to create a Board card with status **Ready** and fill in its brief and handoff. In **Agent control**, the card appears under **Ready to delegate**. Select **Launch** to open a separate draft configured for a new worktree with only that card's task capsule. Choose or adjust the model and base branch before sending the first message.

The executor prompt avoids `board_digest` by default. It reads `board_get_brief` only when the card needs clarification, keeping its context focused on the assigned task.

When an agent session is connected through T3 Code’s MCP tools (Claude, Cursor, Codex, Grok, OpenCode), it can list and update the same board with `board_digest`, `board_list`, `board_get_brief`, `board_upsert`, `board_set_status`, `board_link_turn`, `board_handoff`, `board_archive`, `board_restore`, and `board_delete`. Changes show up live in the panel for every connected client. Lists and digests hide archived items by default; `board_list` can include them when requested.

Use `board_get_brief` before starting a card and `board_handoff` when you are transferring work. A handoff is always tied to the agent’s current project thread.

Status mutations automatically link the current thread’s latest turn to the card. The chat timeline shows one compact **Board** update at the end of an affected turn; hover it to see the linked card titles. Reading a board digest or list alone does not create a timeline update. Each card still shows how many turns are attached.

Use the command palette action **Insert project board digest** for a compact status summary in the composer without dumping every note into the prompt.

Board items represent deliverables, not separate analysis, implementation, or verification phases. Before creating an item, check the existing board and update a matching item with its `itemId`. Use `board_set_status` for workflow changes and `board_handoff` for a concrete next step when work moves between agents.

**jcode:** T3 installs a small local MCP bridge into the project’s `.jcode/mcp.json` when a jcode session starts, so jcode can use the same `board_*` tools. Each turn also gets a short reminder that those tools exist. Prefer letting the agent update the board via tools; the Board panel still works for manual edits.
