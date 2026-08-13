# Board Workflow and Jcode Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Board tasks a complete editable lifecycle and guarantee that each Jcode turn uses its selected inner provider and exact model.

**Architecture:** Board keeps status and archive state separate in the event-sourced project record. The server exposes dedicated archive/restore commands and the existing upsert operation provides edits. Jcode launches an isolated daemon/socket for each provider session and derives reasoning/speed only from actual discovered model-slug siblings.

**Tech Stack:** Effect Schema and event-sourced orchestration, React/Vite, Zustand client state, MCP toolkit handlers, Node child processes, Vitest.

## Global Constraints

- Statuses are exactly `backlog`, `ready`, `inProgress`, `inReview`, `blocked`, `completed`, and `cancelled`.
- `archivedAt` is separate from status and restore preserves the former status.
- Existing `pending` records decode as `backlog`; existing `completed` records are unchanged.
- Cursor exposes every Jcode-discovered Cursor model; do not introduce a model allow-list.
- Preserve exact Jcode model slugs at dispatch, including provider prefixes such as `cursor-grok-4.6-high-fast`.
- Reasoning/speed controls only select existing sibling slugs; no synthetic unsupported Jcode flags.
- Run focused tests and affected package typechecks only. Do not run repo-wide checks.

---

### Task 1: Extend the Board event contract

**Files:**

- Modify: `packages/contracts/src/orchestration.ts`
- Modify: `packages/contracts/src/orchestration.test.ts`
- Modify: `packages/client-runtime/src/operations/commands.ts`
- Modify: `packages/client-runtime/src/state/projectCommands.ts`

**Interfaces:**

- Produces `ProjectBoardItemStatus`, `ProjectBoardItem.archivedAt`, `ArchiveProjectBoardItemInput`, and `RestoreProjectBoardItemInput`.
- Consumes the existing `ProjectBoardItemUpsertCommand` and `ProjectBoardItemUpsertedPayload` shapes.

- [ ] **Step 1: Write failing compatibility tests**

```ts
expect(ProjectBoardItemStatus.decodeUnknownSync("blocked")).toBe("blocked");
expect(ProjectBoardItemStatus.decodeUnknownSync("cancelled")).toBe("cancelled");
expect(ProjectBoardItem.decodeUnknownSync({ ...legacyPendingItem, status: "pending" }).status).toBe(
  "backlog",
);
expect(ProjectBoardItem.decodeUnknownSync({ ...completedItem, archivedAt: now }).archivedAt).toBe(
  now,
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vp test run packages/contracts/src/orchestration.test.ts`

Expected: the new statuses and `archivedAt` are rejected.

- [ ] **Step 3: Add compatible schemas and runtime commands**

```ts
export const ProjectBoardItemStatus = Schema.Literals([
  "backlog",
  "ready",
  "inProgress",
  "inReview",
  "blocked",
  "completed",
  "cancelled",
]);

export const ProjectBoardItem = Schema.Struct({
  // existing fields
  archivedAt: Schema.optional(Schema.NullOr(IsoDateTime)),
});
```

Decode the legacy literal `pending` to `backlog` at the schema boundary. Add archive/restore command schemas containing only `commandId`, `projectId`, and `itemId`, then expose matching client-runtime functions.

- [ ] **Step 4: Run the contract test and client-runtime typecheck**

Run: `pnpm exec vp test run packages/contracts/src/orchestration.test.ts && pnpm --filter @t3tools/client-runtime typecheck`

Expected: targeted tests pass and no type errors are reported.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/orchestration.ts packages/contracts/src/orchestration.test.ts packages/client-runtime/src/operations/commands.ts packages/client-runtime/src/state/projectCommands.ts
git commit -m "feat: add Board lifecycle and archive commands"
```

### Task 2: Project Board projection and MCP operations

**Files:**

- Modify: `apps/server/src/orchestration/decider.ts`
- Modify: `apps/server/src/orchestration/decider.projectBoard.test.ts`
- Modify: `apps/server/src/orchestration/projector.ts`
- Modify: `apps/server/src/orchestration/projector.test.ts`
- Modify: `apps/server/src/mcp/toolkits/board/handlers.ts`
- Modify: `apps/server/src/mcp/toolkits/board/tools.ts`
- Modify: `packages/shared/src/projectBoard.ts`
- Modify: `packages/shared/src/projectBoard.test.ts`

**Interfaces:**

- Consumes Task 1 archive/restore commands and `ProjectBoardItem.archivedAt`.
- Produces projected archive state, `board_archive`, `board_restore`, and archive-aware Board digests.

- [ ] **Step 1: Write failing decider, projector, and MCP cases**

```ts
expect(decide(archiveCommand, current)).toContainEqual(
  expect.objectContaining({ type: "project.board.item.archived", itemId }),
);
expect(project(events).projects[projectId].boardItems[0]).toMatchObject({
  status: "blocked",
  archivedAt: expect.any(String),
});
expect(formatProjectBoardDigest(items)).not.toContain("Archived task");
```

Also assert restore clears only `archivedAt`, upsert preserves an archive marker, and `board_list` returns archived items only with explicit `includeArchived: true`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vp test run apps/server/src/orchestration/decider.projectBoard.test.ts apps/server/src/orchestration/projector.test.ts packages/shared/src/projectBoard.test.ts`

Expected: archive/restore commands and digest behavior are unavailable.

- [ ] **Step 3: Implement events, projection, and agent tools**

Add archive/restore event payloads in the decider and set/clear `archivedAt` in the projector. Add `board_archive` and `board_restore` schemas/handlers. Keep `board_set_status` status-only; digest/list exclude archived tasks by default.

- [ ] **Step 4: Run focused server/shared tests**

Run: `pnpm exec vp test run apps/server/src/orchestration/decider.projectBoard.test.ts apps/server/src/orchestration/projector.test.ts apps/server/src/mcp/toolkits/board/handlers.test.ts packages/shared/src/projectBoard.test.ts`

Expected: archive state projects correctly and MCP calls preserve task content/status.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/orchestration apps/server/src/mcp/toolkits/board packages/shared/src/projectBoard.ts packages/shared/src/projectBoard.test.ts
git commit -m "feat(server): archive and restore Board tasks"
```

### Task 3: Board detail and editing interface

**Files:**

- Modify: `apps/web/src/components/ProjectBoardPanel.logic.ts`
- Modify: `apps/web/src/components/ProjectBoardPanel.logic.test.ts`
- Modify: `apps/web/src/components/ProjectBoardPanel.tsx`
- Modify: `apps/web/src/components/RightPanelTabs.tsx`
- Modify: `apps/web/src/rightPanelStore.ts`
- Modify: `apps/web/src/rightPanelStore.test.ts`
- Modify: `apps/web/src/state/queries.ts`

**Interfaces:**

- Consumes Task 1 runtime commands and Task 2 projected `archivedAt`.
- Produces active status sections, an archive section, and a right-panel task detail/edit state.

- [ ] **Step 1: Write failing Board logic tests**

```ts
expect(groupProjectBoardItems(items).active.blocked).toEqual([blockedItem]);
expect(groupProjectBoardItems(items).archived).toEqual([archivedCancelledItem]);
expect(nextProjectBoardItemStatus("inReview")).toBe("completed");
expect(createBoardItemDraft(item)).toMatchObject({ title: item.title, status: item.status });
```

- [ ] **Step 2: Run the Board logic test to verify it fails**

Run: `pnpm exec vp test run apps/web/src/components/ProjectBoardPanel.logic.test.ts`

Expected: the old three-state grouping and cycle reject new states.

- [ ] **Step 3: Implement detail state and editing**

Add a selected Board item id to right-panel state. Render active status sections and a collapsed Archive section. Clicking a row selects it. Detail renders full notes, brief, handoff, linked turns, source, and timestamps. Edit holds a local draft; Save calls upsert with title/notes/brief/status; Cancel clears unsaved draft. Archive, restore, and delete call dedicated commands and clear an invalid selection.

- [ ] **Step 4: Run focused web tests and typecheck**

Run: `pnpm exec vp test run apps/web/src/components/ProjectBoardPanel.logic.test.ts apps/web/src/rightPanelStore.test.ts && pnpm --filter @t3tools/web typecheck`

Expected: Board sections, draft behavior, archive visibility, and selection pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ProjectBoardPanel.tsx apps/web/src/components/ProjectBoardPanel.logic.ts apps/web/src/components/ProjectBoardPanel.logic.test.ts apps/web/src/components/RightPanelTabs.tsx apps/web/src/rightPanelStore.ts apps/web/src/rightPanelStore.test.ts apps/web/src/state/queries.ts
git commit -m "feat(web): edit and archive Board tasks"
```

### Task 4: Exact Jcode provider/model session runtime

**Files:**

- Modify: `apps/server/src/provider/Layers/JcodeProvider.ts`
- Modify: `apps/server/src/provider/Layers/JcodeProvider.test.ts`
- Modify: `apps/server/src/provider/acp/JcodeAcpSupport.ts`
- Modify: `apps/server/src/provider/acp/JcodeAcpSupport.test.ts`
- Modify: `apps/server/src/provider/Layers/JcodeAdapter.ts`
- Create: `apps/server/src/provider/acp/JcodeSessionDaemon.ts`
- Create: `apps/server/src/provider/acp/JcodeSessionDaemon.test.ts`

**Interfaces:**

- Consumes selected `ModelSelection` with `jcodeProvider` and an exact discovered slug.
- Produces an isolated daemon socket and ACP spawn input bound to it.

- [ ] **Step 1: Write failing exact-slug and isolation tests**

```ts
expect(jcodeModelsFromModelList("cursor", "cursor-grok-4.6-high-fast\ncomposer-2\n")).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ slug: "cursor-grok-4.6-high-fast", subProvider: "Cursor" }),
    expect.objectContaining({ slug: "composer-2", subProvider: "Cursor" }),
  ]),
);
expect(
  buildJcodeSessionDaemonInput({
    threadId,
    provider: "cursor",
    model: "cursor-grok-4.6-high-fast",
  }),
).toMatchObject({
  args: expect.arrayContaining([
    "serve",
    "-p",
    "cursor",
    "-m",
    "cursor-grok-4.6-high-fast",
    "--socket",
  ]),
});
expect(
  buildJcodeAcpSpawnInput(
    { socketPath, jcodeProvider: "cursor", model: "cursor-grok-4.6-high-fast" },
    cwd,
  ).args,
).toEqual(expect.arrayContaining(["acp", "--socket", socketPath]));
```

- [ ] **Step 2: Run Jcode tests to verify they fail**

Run: `pnpm exec vp test run apps/server/src/provider/Layers/JcodeProvider.test.ts apps/server/src/provider/acp/JcodeAcpSupport.test.ts apps/server/src/provider/acp/JcodeSessionDaemon.test.ts`

Expected: no per-session daemon input exists and ACP has no session socket.

- [ ] **Step 3: Implement isolated Jcode session ownership**

`JcodeSessionDaemon.ts` owns a socket under T3 runtime state, starts `jcode serve` with `--no-selfdev`, exact `-p`, exact `-m`, and `--socket`, then stops only the process it created during adapter cleanup. `JcodeAdapter.startSession` validates the exact selected slug against discovered models for the selected inner provider before it starts the daemon. Pass its socket to `jcode acp`; do not run Jcode IDs through generic T3 aliases.

After ACP setup compare reported model/provider with the requested values. On mismatch, close ACP and daemon and raise `ProviderAdapterValidationError` with requested/reported values.

- [ ] **Step 4: Run adapter tests and server typecheck**

Run: `pnpm exec vp test run apps/server/src/provider/Layers/JcodeProvider.test.ts apps/server/src/provider/acp/JcodeAcpSupport.test.ts apps/server/src/provider/acp/JcodeSessionDaemon.test.ts && pnpm --filter t3 typecheck`

Expected: Cursor retains all discovered models, sessions own their provider/model/socket, and mismatch fails before prompt submission.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/provider/Layers/JcodeProvider.ts apps/server/src/provider/Layers/JcodeProvider.test.ts apps/server/src/provider/Layers/JcodeAdapter.ts apps/server/src/provider/acp/JcodeAcpSupport.ts apps/server/src/provider/acp/JcodeAcpSupport.test.ts apps/server/src/provider/acp/JcodeSessionDaemon.ts apps/server/src/provider/acp/JcodeSessionDaemon.test.ts
git commit -m "fix(server): isolate Jcode provider sessions"
```

### Task 5: Jcode reasoning/speed selection and documentation

**Files:**

- Create: `apps/web/src/components/chat/jcodeModelVariants.ts`
- Create: `apps/web/src/components/chat/jcodeModelVariants.test.ts`
- Modify: `apps/web/src/components/chat/ModelPickerContent.tsx`
- Modify: `apps/web/src/components/chat/ProviderModelPicker.tsx`
- Modify: `apps/web/src/components/chat/ChatComposer.tsx`
- Modify: `apps/web/src/components/ChatView.tsx`
- Modify: `docs/user/project-board.md`
- Create: `docs/user/jcode-model-routing.md`

**Interfaces:**

- Consumes exact provider-specific model slugs from Task 4.
- Produces `resolveJcodeModelVariants(models, currentSlug)` returning only real reasoning/speed alternatives and an exact selected slug.

- [ ] **Step 1: Write failing pure variant tests**

```ts
expect(resolveJcodeModelVariants(cursorModels, "cursor-grok-4.6-high")).toMatchObject({
  reasoning: ["high"],
  speed: ["standard", "fast"],
  selectedReasoning: "high",
  selectedSpeed: "standard",
});
expect(resolveJcodeModelVariants(codexModels, "gpt-5.6-luna-high").slugFor("xhigh", "fast")).toBe(
  "gpt-5.6-luna-xhigh-fast",
);
expect(resolveJcodeModelVariants(singleModel, "composer-2")).toBeNull();
```

- [ ] **Step 2: Run the variant test to verify it fails**

Run: `pnpm exec vp test run apps/web/src/components/chat/jcodeModelVariants.test.ts`

Expected: no Jcode variant resolver exists.

- [ ] **Step 3: Implement real-variant controls**

Parse only suffixes present in the selected inner provider's discovered models. Render reasoning and speed controls in the Jcode picker only when more than one real value exists. Each change resolves an exact sibling slug and uses the existing `onInstanceModelChange` path with the same Jcode inner provider. Never render a control that would manufacture a missing slug.

- [ ] **Step 4: Document Board and Jcode behavior**

Document lifecycle/Archive in `docs/user/project-board.md`. In `docs/user/jcode-model-routing.md`, explain exact selected routing, full Cursor catalog, and capability-dependent reasoning/speed controls.

- [ ] **Step 5: Run focused web tests and typecheck**

Run: `pnpm exec vp test run apps/web/src/components/chat/jcodeModelVariants.test.ts apps/web/src/components/chat/composerProviderState.test.tsx && pnpm --filter @t3tools/web typecheck`

Expected: only available variants are selectable, inner provider is retained, and types pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/chat/jcodeModelVariants.ts apps/web/src/components/chat/jcodeModelVariants.test.ts apps/web/src/components/chat/ModelPickerContent.tsx apps/web/src/components/chat/ProviderModelPicker.tsx apps/web/src/components/chat/ChatComposer.tsx apps/web/src/components/ChatView.tsx docs/user/project-board.md docs/user/jcode-model-routing.md
git commit -m "feat(web): select Jcode reasoning and speed variants"
```

### Task 6: Integrated validation and release artifact

**Files:**

- Modify: `docs/user/jcode-model-routing.md`
- Test: focused tests from Tasks 1–5

**Interfaces:**

- Consumes all Board and Jcode behavior.
- Produces a verified ARM64 macOS installation artifact.

- [ ] **Step 1: Run the combined targeted test set**

Run: `pnpm exec vp test run packages/contracts/src/orchestration.test.ts apps/server/src/orchestration/decider.projectBoard.test.ts apps/server/src/orchestration/projector.test.ts apps/server/src/mcp/toolkits/board/handlers.test.ts packages/shared/src/projectBoard.test.ts apps/server/src/provider/Layers/JcodeProvider.test.ts apps/server/src/provider/acp/JcodeAcpSupport.test.ts apps/server/src/provider/acp/JcodeSessionDaemon.test.ts apps/web/src/components/ProjectBoardPanel.logic.test.ts apps/web/src/components/chat/jcodeModelVariants.test.ts`

Expected: all targeted contract, server, and web tests pass.

- [ ] **Step 2: Run package typechecks**

Run: `pnpm --filter t3 typecheck && pnpm --filter @t3tools/web typecheck`

Expected: no type errors.

- [ ] **Step 3: Perform the manual desktop pass**

Verify in fresh Jcode threads that `Cursor → cursor-grok-4.6-high-fast`, `Cursor → composer-2`, and `Codex → gpt-5.6-luna` report their selected provider/model in Jcode metadata. Verify an archived `Cancelled` Board task restores as `Cancelled` and edits persist.

- [ ] **Step 4: Build and validate the ARM64 DMG**

Run: `pnpm exec node scripts/build-desktop-artifact.ts --platform mac --target dmg --arch arm64 --output-dir release/board-jcode-routing && hdiutil verify release/board-jcode-routing/T3-Code-0.0.33-arm64.dmg`

Expected: a valid, fresh macOS ARM64 DMG exists under `release/board-jcode-routing/`.

## Self-review

- **Spec coverage:** Tasks 1–3 cover Board lifecycle, archive/restore, detail, editing, and MCP compatibility. Tasks 4–5 cover exact routing, all Cursor models, mismatch rejection, and real reasoning/speed variants. Task 6 covers validation and the requested DMG.
- **Placeholder scan:** no unfinished markers or generic test instructions remain.
- **Type consistency:** archive commands originate in Task 1 and flow through Tasks 2–3; Jcode model slugs remain discovery-provided strings across Tasks 4–5.
