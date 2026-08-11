# Project Activity Timeline Implementation Plan

> **For agentic workers:** Implement this plan task-by-task. Superpowers execution skills are not used in this repository unless explicitly requested by the user.

**Goal:** Add a project-scoped right-panel timeline of significant thread, checkpoint, error, and Board activity.

**Architecture:** Add one bounded read-only RPC backed by the existing orchestration event store and thread projection. Normalize rows on the server, then render them through the existing environment query and right-panel surface patterns.

**Tech Stack:** TypeScript, Effect Schema/RPC/SQL, React, Zustand, Tailwind CSS, Vitest.

## Global Constraints

- No new database table, migration, dependency, polling loop, analytics, filters, search, or fullscreen view.
- Limit results to the newest 100 significant events.
- Do not expose prompts, assistant text, command output, or raw error payloads.
- Web and desktop share the web implementation; mobile UI is out of scope.

---

### Task 1: Activity wire contract

**Files:**

- Modify: `packages/contracts/src/orchestration.ts`
- Modify: `packages/contracts/src/rpc.ts`
- Test: `packages/contracts/src/orchestration.test.ts`

**Interfaces:**

- Produces: `OrchestrationProjectActivityItem`, `OrchestrationGetProjectActivityInput`, `OrchestrationGetProjectActivityResult`, and `ORCHESTRATION_WS_METHODS.getProjectActivity`.

- [ ] Add a failing decode test containing thread, checkpoint, Board, and error items.
- [ ] Run `vp test run packages/contracts/src/orchestration.test.ts` and verify the new test fails.
- [ ] Add the minimal discriminated item schema and RPC registration.
- [ ] Run the same test and verify it passes.

### Task 2: Bounded server query

**Files:**

- Create: `apps/server/src/orchestration/projectActivity.ts`
- Create: `apps/server/src/orchestration/projectActivity.test.ts`
- Modify: `apps/server/src/orchestration/Services/ProjectionSnapshotQuery.ts`
- Modify: `apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts`
- Modify: `apps/server/src/ws.ts`

**Interfaces:**

- Consumes: `OrchestrationGetProjectActivityInput`.
- Produces: `ProjectionSnapshotQuery.getProjectActivity(input)` returning `OrchestrationGetProjectActivityResult`.

- [ ] Write mapper tests for included event kinds, ignored non-error activities, sanitized errors, changed-file totals, and newest-first output.
- [ ] Run `vp test run apps/server/src/orchestration/projectActivity.test.ts` and verify failure.
- [ ] Implement the pure event-to-item mapper.
- [ ] Add one SQL query that joins thread events to their project, filters the six significant event types, respects `throughSequence`, orders descending, and limits to 100.
- [ ] Expose the query through `ProjectionSnapshotQuery` and the new RPC handler.
- [ ] Run the focused server test and `vp run --filter @t3tools/server typecheck`.

### Task 3: Client query and timeline presentation

**Files:**

- Modify: `packages/client-runtime/src/state/orchestration.ts`
- Modify: `apps/web/src/state/queries.ts`
- Create: `apps/web/src/components/ProjectActivityPanel.logic.ts`
- Create: `apps/web/src/components/ProjectActivityPanel.logic.test.ts`
- Create: `apps/web/src/components/ProjectActivityPanel.tsx`

**Interfaces:**

- Produces: `useProjectActivity(environmentId, projectId, throughSequence)`.
- Produces: `groupProjectActivityByDay(items, locale)` and `formatCheckpointSummary(item)`.

- [ ] Write failing tests for day grouping, order preservation, and checkpoint totals.
- [ ] Run `vp test run apps/web/src/components/ProjectActivityPanel.logic.test.ts` and verify failure.
- [ ] Add the environment query atom and web hook.
- [ ] Implement the pure grouping and formatting helpers.
- [ ] Build the compact panel with loading, empty, retry, row navigation, and collapsed changed-file details.
- [ ] Run the focused web test.

### Task 4: Right-panel integration

**Files:**

- Modify: `apps/web/src/rightPanelStore.ts`
- Modify: `apps/web/src/components/RightPanelTabs.tsx`
- Modify: `apps/web/src/components/ChatView.tsx`
- Test: `apps/web/src/rightPanelStore.test.ts`

**Interfaces:**

- Adds singleton surface `{ id: "activity", kind: "activity" }`.

- [ ] Add a failing store migration/open test for the Activity singleton.
- [ ] Run `vp test run apps/web/src/rightPanelStore.test.ts` and verify failure.
- [ ] Add the surface kind, icon, title, add-menu entry, and ChatView content branch.
- [ ] Render `ProjectActivityPanel` with the active environment, project, and current shell sequence.
- [ ] Run the focused store test and `vp run --filter @t3tools/web typecheck`.

### Task 5: User documentation and verification

**Files:**

- Create: `docs/user/project-activity.md`
- Modify: `docs/README.md`

- [ ] Document how to open Activity, which milestones appear, the 100-event boundary, and privacy exclusions.
- [ ] Run all four touched test files together.
- [ ] Run targeted server and web typechecks.
- [ ] Inspect `git diff --check` and confirm unrelated existing Jcode/desktop changes remain untouched.
