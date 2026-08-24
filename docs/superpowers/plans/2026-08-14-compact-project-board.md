# Compact Project Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing Board list into a compact, workflow-oriented project cockpit using only persisted Board data and existing MCP tools.

**Architecture:** Add pure view-model helpers beside the existing Board logic. Render those helpers in the Board panel while retaining current row actions and task-details UI. Workflow sections use the existing status field and never parse title prefixes.

**Tech Stack:** React, TypeScript, Tailwind utilities, Vitest.

## Global Constraints

- No contracts, migrations, or dependencies; the existing MCP tool descriptions and turn prompt may carry the board-writing rules.
- Preserve manual editing, archive/restore, Implement, linked thread navigation, and task details.
- Use existing `ProjectBoardItem.status`, `notes`, `latestHandoff`, `linkedTurnIds`, `archivedAt`, and timestamps only.
- Keep rows compact and use progressive disclosure through the existing details panel.

---

### Task 1: Derive compact Board view data

**Files:**

- Modify: `apps/web/src/components/ProjectBoardPanel.logic.ts`
- Test: `apps/web/src/components/ProjectBoardPanel.logic.test.ts`

**Interfaces:**

- Produces `getProjectBoardCockpit(items)` with counts, attention items, and workflow sections for `ProjectBoardPanel`.
- Preserves `groupProjectBoardItems(items)` for existing archive/detail paths.

- [x] **Step 1: Write failing tests**

```ts
expect(getProjectBoardCockpit(items).attention.map((item) => item.id)).toEqual([
  blocked.id,
  review.id,
]);
expect(getProjectBoardCockpit(items).sections.map((section) => section.status)).toEqual([
  "inProgress",
  "ready",
  "backlog",
]);
expect(getProjectBoardCockpit(items).counts.archived).toBe(1);
```

- [x] **Step 2: Run the focused test**

Run: `pnpm exec vp test run apps/web/src/components/ProjectBoardPanel.logic.test.ts`

- [x] **Step 3: Add the pure helper**

```ts
export function getProjectBoardCockpit(items: ReadonlyArray<ProjectBoardItem>) {
  // exclude archived cards; surface blocked/review; group the rest by status
}
```

- [x] **Step 4: Re-run the focused test**

Run: `pnpm exec vp test run apps/web/src/components/ProjectBoardPanel.logic.test.ts`

### Task 2: Render the compact cockpit

**Files:**

- Modify: `apps/web/src/components/ProjectBoardPanel.tsx`
- Modify: `docs/user/project-board.md`

**Interfaces:**

- Consumes `getProjectBoardCockpit(items)`.
- Reuses the existing `BoardItemRow` callbacks unchanged.

- [x] **Step 1: Render summary, attention, and collapsible workflow sections**

```tsx
const cockpit = useMemo(() => getProjectBoardCockpit(boardItems), [boardItems]);
// Summary chips -> Needs attention -> fixed workflow sections -> existing archive
```

- [x] **Step 2: Compact the row’s visible metadata**

```tsx
const context = item.latestHandoff?.nextStep ?? item.notes ?? linkedTurnLabel;
// Show status accent and one context line; retain all actions and open details on row click.
```

- [x] **Step 3: Document the scan order**

Update the user guide to describe the summary, attention cards, workflow sections, and title rules.

- [x] **Step 4: Verify**

Run: `pnpm exec vp test run apps/web/src/components/ProjectBoardPanel.logic.test.ts && pnpm --filter @t3tools/web typecheck`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ProjectBoardPanel.tsx apps/web/src/components/ProjectBoardPanel.logic.ts apps/web/src/components/ProjectBoardPanel.logic.test.ts docs/user/project-board.md docs/superpowers/specs/2026-08-14-compact-project-board-design.md docs/superpowers/plans/2026-08-14-compact-project-board.md
git commit -m "feat(web): compact project board cockpit"
```
