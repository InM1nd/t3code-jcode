# Task Brief + Handoff Design

## Goal

Extend Project Board so agents can start work with a compact, reliable task context and explicitly hand it to the next agent without overwriting prior work history.

## Scope

This milestone adds structured Task Briefs and append-only Handoffs to existing Board items. It does not add global Project Memory, automatic summaries, codebase-memory-plus integration, a separate task system, or a mobile-specific UI.

Existing Board cards without a brief or handoff remain fully valid.

## Data model

Each `ProjectBoardItem` gains an optional `brief`:

- `goal`: required when a brief exists;
- `acceptanceCriteria`: ordered, non-empty strings;
- `importantFiles`: ordered workspace-relative paths;
- `notes`: short free-form context.

Each handoff is an immutable record attached to one Board item:

- unique handoff id;
- source thread id and creation time;
- `summary`: what changed or was learned;
- `decisions`: decisions the next agent must preserve;
- `nextStep`: the first concrete continuation action.

The Board item retains only its latest handoff for prompt construction and compact list display. Every handoff is also persisted as a dedicated orchestration event, so event history remains append-only and can later power an archive without a migration.

## Commands and events

The current Board upsert command accepts the optional brief. A new command appends a handoff to an existing item. The decider validates that the Board item belongs to the requested project before emitting either event.

New event types:

- `project.board-item-upserted` continues to carry the full Board item, now including the optional brief;
- `project.board-item-handoff-appended` carries the project id, Board item id, and immutable handoff.

The projector keeps the latest handoff on the Board item. The Activity timeline maps handoff events to a `board-handoff` row with the card title and next step; no prompt, agent transcript, or raw provider data is exposed.

## Agent and MCP workflow

The existing Board toolkit gains:

- `board_get_brief`: returns a Board item together with its brief and latest handoff;
- `board_handoff`: appends a handoff for the current agent thread.

`board_upsert` accepts an optional structured brief when an agent creates or refines an item. These tools use the existing agent thread scope and project resolution; they do not accept an arbitrary project id.

## Web and desktop UX

The Board row remains compact. A detail affordance opens an inline detail panel for the selected item:

- brief fields are shown in labelled sections;
- the latest handoff appears below the brief, with its source thread link and time;
- the user can edit or clear the brief;
- a handoff composer has the three explicit fields and appends on submit.

The detail view is local component state inside the existing Board panel. It is not a new route or right-panel surface. Empty brief and handoff sections are omitted rather than replaced with decorative placeholders.

Selecting **Implement** uses the existing new-thread flow. Its seeded prompt includes the task title, brief if present, and latest handoff if present. The prompt remains short and labelled, and it never includes old handoff history.

## Error handling and compatibility

- Missing Board items return the existing not-found command error.
- Brief and handoff fields are trimmed and bounded by the existing contract string schemas; empty optional sections become `null` or an empty list.
- A failed save keeps the detail editor open with its local values intact.
- Old persisted Board items decode because all new fields are optional.

## Constraints

- Reuse the existing Board model, event store, project projection, commands, and MCP authorization scope.
- No database table, migration, dependency, polling, automatic summarizer, full handoff history UI, search, or global Memory surface.
- Web and desktop use the same shared web implementation; no mobile UI in this milestone.
- `codebase-memory-plus` is intentionally out of scope. A later milestone may add optional graph links to `importantFiles` only after this workflow is validated.

## Verification

- Contract tests decode Board items with and without briefs and validate handoffs.
- Decider/projector tests prove a handoff is append-only and updates the card's latest handoff.
- MCP toolkit tests cover read and append behavior under the current thread scope.
- Web logic tests cover seeded implement prompts and detail rendering conditions.
- Activity mapper tests cover the new safe handoff row.
- Targeted contracts/server/web tests, typechecks, and one real-client visual pass cover the user flow.
