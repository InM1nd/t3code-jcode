# Sidebar Project Chat Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every non-archived thread inside a collapsible logical-project group in the web/desktop sidebar.

**Architecture:** Reuse `SidebarProjectSnapshot` and the existing `projectExpandedById` UI preference. A pure sidebar-logic helper assigns the already lifecycle-sorted thread entries to their logical project; the React sidebar renders those groups and preserves the existing per-row actions. Large settled tails remain paged within their own project so the browser never mounts unbounded history.

**Tech Stack:** React, TypeScript, Zustand UI state, Vitest, existing sidebar DnD components.

## Global Constraints

- Do not add a project/thread model, contract, server event, migration, dependency, or API.
- Keep archived threads absent from the sidebar.
- Reuse `projectExpandedById`, `resolveProjectExpanded`, and `setProjectExpanded`; first-time groups default to expanded.
- Preserve pin/snooze/settle actions, row variants, keyboard navigation, multi-select, and project scope filtering.
- Preserve bounded sidebar rendering: older settled rows are revealed with an inline per-project “Show more”.
- This release changes the web sidebar and therefore desktop; mobile remains unchanged.

---

## File Structure

- Modify `apps/web/src/components/Sidebar.logic.ts`: define a project-grouped thread-entry shape, assign scoped threads to existing logical projects, and make the per-project settled preview use scoped keys.
- Modify `apps/web/src/components/Sidebar.logic.test.ts`: cover cross-environment project assignment, lifecycle order, omissions, and deep selected settled rows.
- Modify `apps/web/src/components/Sidebar.tsx`: replace global lifecycle shelves with expandable project headers and project-local rows/pagination while retaining the existing row renderer and pinned DnD context.
- Modify `docs/user/thread-sidebar.md`: describe project groups, collapse behavior, and project-local pinned history.

### Task 1: Project-grouping logic

**Files:**

- Modify: `apps/web/src/components/Sidebar.logic.ts:718-764,852-888`
- Test: `apps/web/src/components/Sidebar.logic.test.ts`

**Interfaces:**

- Consumes: `SidebarProjectSnapshot.memberProjectRefs`, scoped `environmentId`/`projectId` values, and the four lifecycle-sorted thread arrays produced in `Sidebar.tsx`.
- Produces: `groupSidebarThreadEntriesByProject({ projects, entries })`, where each returned group has `{ project, entries }` and every entry has `{ thread, section }`, with `section` equal to `"pinned" | "active" | "snoozed" | "settled"`.
- Produces: a scoped-key-capable `getVisibleThreadsForProject` so a selected remote thread cannot be confused with an identically named thread from another environment.

- [ ] **Step 1: Write failing grouping tests**

  Add tests that build two logical projects, one with both local and remote member refs, and pass entries in the intended lifecycle order:

  ```ts
  const groups = groupSidebarThreadEntriesByProject({
    projects: [marswalk, cyclop],
    entries: [
      { thread: pinnedMarswalk, section: "pinned" },
      { thread: activeCyclop, section: "active" },
      { thread: snoozedMarswalkRemote, section: "snoozed" },
      { thread: settledMarswalk, section: "settled" },
    ],
  });

  expect(
    groups.map(({ project, entries }) => [
      project.projectKey,
      entries.map(({ section }) => section),
    ]),
  ).toEqual([
    ["marswalk", ["pinned", "snoozed", "settled"]],
    ["cyclop", ["active"]],
  ]);
  ```

  Add an orphan thread with an unknown `(environmentId, projectId)` pair and assert it is absent. Add a preview test where local and remote entries share the same raw `id`; give the remote entry's scoped key as the selected key and assert it is included beyond the preview limit.

- [ ] **Step 2: Run the focused test file to verify failure**

  Run: `pnpm exec vitest run apps/web/src/components/Sidebar.logic.test.ts`

  Expected: FAIL because `groupSidebarThreadEntriesByProject` and the scoped-key preview input do not exist.

- [ ] **Step 3: Implement the smallest reusable helpers**

  In `Sidebar.logic.ts`, create the grouping helper by mapping every `memberProjectRef` to its `projectKey`, pushing entries into that group without re-sorting, then returning the supplied project order with empty groups removed:

  ```ts
  export function groupSidebarThreadEntriesByProject<
    TProject extends LogicalSidebarProject,
    TThread extends ScopedSidebarThread,
  >(input: {
    projects: readonly TProject[];
    entries: readonly { readonly thread: TThread; readonly section: SidebarThreadSection }[];
  }) {
    const projectKeyByRef = new Map<string, string>();
    for (const project of input.projects) {
      for (const ref of project.memberProjectRefs) {
        projectKeyByRef.set(`${ref.environmentId}\0${ref.projectId}`, project.projectKey);
      }
    }
    const entriesByProjectKey = new Map<string, SidebarThreadEntry<TThread>[]>();
    for (const entry of input.entries) {
      const key = projectKeyByRef.get(`${entry.thread.environmentId}\0${entry.thread.projectId}`);
      if (key) entriesByProjectKey.set(key, [...(entriesByProjectKey.get(key) ?? []), entry]);
    }
    return input.projects.flatMap((project) => {
      const entries = entriesByProjectKey.get(project.projectKey);
      return entries?.length ? [{ project, entries }] : [];
    });
  }
  ```

  Extend `getVisibleThreadsForProject` with a required `getThreadKey(thread)` and `activeThreadKey` pair; compare scoped keys instead of raw IDs. Keep its existing preview order and visible-selected-row behavior.

- [ ] **Step 4: Run focused logic tests**

  Run: `pnpm exec vitest run apps/web/src/components/Sidebar.logic.test.ts`

  Expected: PASS, including the new grouping and cross-environment selected-row cases.

- [ ] **Step 5: Commit the isolated logic change**

  ```bash
  git add apps/web/src/components/Sidebar.logic.ts apps/web/src/components/Sidebar.logic.test.ts
  git commit -m "feat(web): group sidebar threads by project"
  ```

### Task 2: Collapsible project rendering

**Files:**

- Modify: `apps/web/src/components/Sidebar.tsx:95,1922-2131,3404-3722`
- Test: `apps/web/src/components/Sidebar.logic.test.ts`

**Interfaces:**

- Consumes: `groupSidebarThreadEntriesByProject`, `resolveProjectExpanded(projectExpandedById, preferenceKeys)`, and `setProjectExpanded(preferenceKeys, expanded)`.
- Produces: one project header per visible logical project, with `aria-expanded`, a count, a lifecycle attention indicator, and a contained thread list.
- Produces: `expandedSettledProjectKeys: Set<string>` local React state for incremental “Show more” disclosure only; it is not persisted and does not represent group collapse.

- [ ] **Step 1: Verify the logic contract before changing JSX**

  Run: `pnpm exec vitest run apps/web/src/components/Sidebar.logic.test.ts`

  Expected: PASS. The Task 1 tests must prove that every group exposes entries in the supplied lifecycle order, so the component only consumes a stable input and does not classify or re-sort threads itself.

- [ ] **Step 2: Replace global shelves with project groups**

  In `Sidebar.tsx`:

  1. Read `projectExpandedById` and `setProjectExpanded` from `useUiStateStore` and use `resolveProjectExpanded` with `[project.projectKey, ...project.memberProjects.map((member) => member.physicalProjectKey)]`.
  2. Build the ordered `entries` once from existing arrays (`orderedPinnedThreads`, `activeThreads`, `snoozedThreads`, `settledThreads`) and pass them to `groupSidebarThreadEntriesByProject({ projects: scopedProjectGroups, entries })`.
  3. Keep the single outer `DndContext`/`SortableContext` for reorderable pinned IDs, but render each pinned row in its own project group. Do not create a second pin order or change `handlePinnedDragEnd`.
  4. Replace `Pinned` divider plus `Snoozed`/`Settled` shelf headers with project headers. Each header is a button like:

     ```tsx
     <button
       type="button"
       aria-expanded={isExpanded}
       onClick={() => setProjectExpanded(preferenceKeys, !isExpanded)}
       data-testid={`sidebar-project-toggle-${project.projectKey}`}
     >
       <ChevronDownIcon className={cn("size-3", !isExpanded && "-rotate-90")} />
       <span className="truncate">{project.displayName}</span>
       <span>{entries.length}</span>
     </button>
     ```

     Derive the small header activity signal from the already-grouped entries using existing thread status data; do not invent a second lifecycle resolver.

  5. For a collapsed group, omit only its child rows. If `routeThreadKey` belongs to the group, treat the group as expanded so direct navigation remains visible.
  6. Page only the group's settled entries using `getVisibleThreadsForProject`; its inline button expands that project’s settled tail. Active, pinned, and snoozed entries always remain in the group. Preserve the selected deep settled row exception.
  7. On `selectThreadSearchResult`, call `setProjectExpanded` for the selected thread's logical project before clearing search/navigating. The existing separate search-results UI stays unchanged.
  8. Delete now-dead global shelf state, callbacks, dividers, and comments. Keep `SidebarDraftBlock` above all project groups.

- [ ] **Step 3: Run focused tests and web typecheck**

  Run: `pnpm exec vitest run apps/web/src/components/Sidebar.logic.test.ts apps/web/src/uiStateStore.test.ts`

  Expected: PASS.

  Run: `pnpm --filter @t3tools/web typecheck`

  Expected: PASS with no TypeScript errors.

- [ ] **Step 4: Manually verify desktop/web behavior**

  In the existing local app, verify:

  1. Two projects show two headers and each header count equals only its visible chats.
  2. Collapse, reload, and reopen: the selected project stays collapsed; a new project starts expanded.
  3. Pin, snooze, settle, and un-settle a chat: the row stays under its project with its existing action/visual treatment.
  4. Search a chat in a collapsed project, select it, and confirm the normal list reopens that project with the selected row visible.
  5. A project with more than one settled preview page exposes “Show more” inside that project, not in a global shelf.

- [ ] **Step 5: Commit the UI change**

  ```bash
  git add apps/web/src/components/Sidebar.tsx apps/web/src/components/Sidebar.logic.ts apps/web/src/components/Sidebar.logic.test.ts
  git commit -m "feat(web): organize sidebar chats by project"
  ```

### Task 3: User documentation

**Files:**

- Modify: `docs/user/thread-sidebar.md`

**Interfaces:**

- Consumes: the completed sidebar behavior from Task 2.
- Produces: shipped-product guidance that describes project groups and does not claim pins are independent of their project.

- [ ] **Step 1: Update the user-facing copy**

  Replace the opening pinned-section wording with:

  ```md
  On web and desktop, the sidebar groups each project's chats together. Select a
  project header to collapse or expand its history; T3 Code remembers that
  choice on this device. Pins, active chats, snoozed chats, and settled chats
  remain in their project and keep their usual actions.

  A project with a long settled history shows recent chats first. Select **Show
  more** inside that project to reveal older settled chats.
  ```

  Retain the existing pin reordering capability statement, but remove the
  sentence that says pinned threads are shown independently of their project.

- [ ] **Step 2: Verify the documentation diff**

  Run: `git diff --check -- docs/user/thread-sidebar.md`

  Expected: no whitespace errors and no developer-only source-path guidance in the user document.

- [ ] **Step 3: Commit documentation**

  ```bash
  git add docs/user/thread-sidebar.md
  git commit -m "docs: explain project-grouped thread sidebar"
  ```

## Final Verification

- [ ] Run `git diff --check`.
- [ ] Run `pnpm exec vitest run apps/web/src/components/Sidebar.logic.test.ts apps/web/src/uiStateStore.test.ts`.
- [ ] Run `pnpm --filter @t3tools/web typecheck`.
- [ ] Re-run the Task 2 manual web/desktop sidebar pass after the final commit.
