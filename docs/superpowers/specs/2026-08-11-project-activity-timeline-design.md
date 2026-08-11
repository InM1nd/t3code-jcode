# Project Activity Timeline Design

## Goal

Add a strict, project-scoped activity timeline that answers: what significant work happened, in which thread, and which files or Board item it affected.

## MVP scope

The web and desktop clients gain an **Activity** singleton surface in the existing right panel next to Board. It shows the latest 100 significant events for the active project, newest first, grouped by local calendar day.

Included milestones:

- thread created;
- turn started or interrupted;
- checkpoint captured, including status and changed-file summary;
- provider or checkpoint error;
- Board item updated, including its resulting status.

Each thread-backed row opens that thread. Checkpoint rows show an initially collapsed changed-file list. Board rows use the card's source thread when one exists.

## Visual direction

The panel is intentionally restrained: a vertical rule, compact monochrome icons, one semantic accent for errors, muted metadata, and no continuous animation. Rows show time, event title, thread title, and only the smallest useful detail. Empty, loading, and retry states use existing panel primitives.

## Architecture

The server reads existing orchestration events; it does not write or duplicate activity records. A typed `orchestration.getProjectActivity` RPC queries only the selected project's significant event types, orders by sequence descending, and returns a normalized presentation model. The query is bounded to 100 rows.

The web query includes the shell snapshot sequence as a read boundary. Existing shell updates therefore refresh the panel without polling or a second subscription. Mapping event payloads to timeline items stays on the server so web and future mobile clients do not need event-store knowledge.

## Event mapping

| Stored event                                 | Timeline kind           | Visible detail                                                        |
| -------------------------------------------- | ----------------------- | --------------------------------------------------------------------- |
| `thread.created`                             | `thread-created`        | thread title and initial model selection                              |
| `thread.turn-start-requested`                | `turn-started`          | thread title and selected model when present                          |
| `thread.turn-interrupt-requested`            | `turn-interrupted`      | thread title                                                          |
| `thread.turn-diff-completed`                 | `checkpoint` or `error` | checkpoint status, file count, additions/deletions, collapsible paths |
| `thread.activity-appended` with tone `error` | `error`                 | activity summary only; raw provider payload is not exposed            |
| `project.board-item-upserted`                | `board-updated`         | card title and resulting status                                       |

## Constraints

- No new database table, migration, dependency, polling loop, analytics, filters, search, or fullscreen view.
- No mobile UI in this milestone; the wire contract remains reusable by mobile.
- Do not expose user prompts, assistant text, command output, or raw error payloads.
- Keep the query bounded and indexed through existing event sequence and thread projection data.
- Web and desktop share the same implementation.

## Verification

- Contract decoding covers every timeline item variant.
- Server tests prove project isolation, newest-first ordering, event filtering, error sanitization, and the 100-row cap.
- Web logic tests prove local-day grouping and file-summary formatting.
- Targeted web/server typechecks and touched tests pass.
