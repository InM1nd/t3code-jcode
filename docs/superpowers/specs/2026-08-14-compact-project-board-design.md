# Compact Project Board Design

## Goal

Make the existing Board easier for people and agents to scan without adding a second task system or changing the Board MCP contract.

## Chosen design

The Board panel stays in its current right-panel location. Its list view becomes a compact project cockpit:

- A single compact summary strip shows project totals for blocked, review, in-progress, ready, backlog, done, and cancelled work.
- A short **Needs attention** section surfaces blocked and in-review items first.
- Remaining active cards are presented in fixed collapsible workflow sections: **In progress**, **Ready**, **Backlog**, **Done**, and **Cancelled**. Section order comes from the structured status field, not title wording.
- Rows remain compact: a thin status accent, title, one useful context line (latest handoff next step, then notes, then linked-turn count), and the existing actions. Full briefs, notes, history, editing, and archive stay in the existing detail view.
- Archived cards remain collapsed and are never included in attention or active workflow sections.

## Agent workflow

No new MCP tool is introduced. Agents continue to use `board_digest` for orientation, `board_get_brief` for the chosen card, and `board_handoff` when transferring work. The cockpit only makes the same shared state faster for a human to read.

## Boundaries

- Preserve all current status, archive/restore, edit, Implement, linked-thread, and detail interactions.
- Do not infer priority, owner, epic, or workstream from title prefixes.
- Do not infer agent identity beyond existing source/handoff/thread data.
- Keep the normal Board list dense; the detail view is the progressive-disclosure path.

## Verification

- Unit-test workflow-section ordering and attention/summary derivation.
- Run focused logic tests and the web typecheck.
- Perform one user-requested integrated web pass after implementation.
