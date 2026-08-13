# Sidebar project chat groups — design

## Goal

Replace the flat cross-project chat list with collapsible project groups so a
project contains its complete visible work history.

## Chosen approach

Use the sidebar's existing logical project groups. Do not introduce a project
or thread persistence model, server event, contract change, or migration.

Each non-archived thread renders once under its project:

```
v marswalk                         12
    Screenshot site and archive URLs
    Audit SSR, SEO, and Link Issues
    ...
> Cyclop-enhanced                   4
```

The existing row styles and actions remain authoritative. Pinned, active,
snoozed, and settled chats keep their existing indicators and ordering rules,
but no longer live in global `Pinned`, `Snoozed`, or `Settled` shelves.

## Interaction

- Clicking a project header toggles only that project's chat list.
- A header shows the project name, total visible-chat count, and existing
  activity signal when a thread in the group needs attention or is running.
- All project groups start expanded for a user who has no saved preference.
- Collapse state is stored in existing client-side UI state and keyed by the
  logical project key. It is a local display preference, not shared project
  data.
- Opening a thread directly, including from search, expands its parent group
  so the selected row remains visible.
- Sidebar search stays global. It returns the same matching chats, while their
  parent projects are shown expanded for the duration of the search.
- Archived threads stay absent from the sidebar, as today.

## Scope

First release covers the shared web/desktop sidebar represented by
`apps/web/src/components/Sidebar.tsx`. Mobile has distinct navigation and is
not changed in this pass; it can adopt the same presentation later without
changing the thread or project model.

## Why this shape

It directly resolves the list noise in the screenshot while preserving the
current lifecycle semantics. The existing project grouping already supplies
stable project keys, so a local collapsed-key set is sufficient and avoids
new storage or synchronization machinery.

## Verification

- Focused sidebar logic tests cover grouping, lifecycle ordering inside a
  project, collapse persistence, and route/search expansion.
- A targeted web typecheck and a manual desktop/web sidebar pass verify the
  visual behavior.
