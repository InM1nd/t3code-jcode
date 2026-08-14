# Compact Project Board Design

## Goal

Make the existing Board easier for people and agents to scan without adding a second task system or changing the Board MCP contract.

## Chosen design

The Board panel stays in its current right-panel location. Its list view becomes a compact project cockpit:

- A single compact summary strip shows project totals for blocked, review, in-progress, ready, backlog, done, and cancelled work.
- A short **Needs attention** section surfaces blocked and in-review items first.
- Remaining active cards are presented in collapsible workstreams. A workstream is derived from an existing leading title prefix such as `[Product]`; cards without one appear in **Other work**. This is display-only and does not persist a new field.
- Rows remain compact: a thin status accent, title, one useful context line (latest handoff next step, then notes, then linked-turn count), and the existing actions. Full briefs, notes, history, editing, and archive stay in the existing detail view.
- Archived cards remain collapsed and are never included in attention or workstreams.

## Agent workflow

No new MCP tool is introduced. Agents continue to use `board_digest` for orientation, `board_get_brief` for the chosen card, and `board_handoff` when transferring work. The cockpit only makes the same shared state faster for a human to read.

## Boundaries

- Preserve all current status, archive/restore, edit, Implement, linked-thread, and detail interactions.
- Do not persist a project-wide brief, priority, owner, epic, or workstream field.
- Do not infer agent identity beyond existing source/handoff/thread data.
- Keep the normal Board list dense; the detail view is the progressive-disclosure path.

## Verification

- Unit-test workstream parsing and attention/summary derivation.
- Run focused logic tests and the web typecheck.
- Perform one user-requested integrated web pass after implementation.
