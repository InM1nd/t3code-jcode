# Task Brief + Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Let every Project Board card carry an optional task brief and an append-only latest handoff that another project agent can continue from.

**Architecture:** Board remains the task model. The server creates immutable handoffs and projects only the latest one into each Board card; existing commands, MCP, and client paths transport it. The existing Board panel gets a local detail view and Activity Timeline gets one safe handoff row.

**Tech Stack:** TypeScript, Effect Schema, event-sourced server, existing WebSocket protocol, React/Vite, Vitest.

## Global Constraints

- Reuse current Board, command, event, projection, MCP, and Activity Timeline patterns; do not add a dependency, database table, migration, background job, polling loop, or separate task store.
- Brief and latestHandoff must be optional/null-compatible so existing persisted cards continue to decode.
- The server owns handoff ids and timestamps and rejects a source thread from another project.
- A card holds only its latest handoff; historical handoffs remain in the event stream. There is no history UI in this increment.
- Ship shared web/desktop behavior only. Mobile, global Project Memory, automatic summaries, and codebase-memory-plus integration are outside this feature.
- Preserve unrelated dirty worktree edits and use only focused tests and package typechecks.

---

## File Structure

- packages/contracts/src/baseSchemas.ts — ProjectBoardHandoffId.
- packages/contracts/src/orchestration.ts — brief/handoff data, append command/event, Activity variant.
- packages/contracts/src/orchestration.test.ts — legacy/new Board decoding.
- apps/server/src/orchestration/decider.ts, projector.ts, Layers/ProjectionPipeline.ts, Schemas.ts, ws.ts — create, apply, persist, and broadcast append events.
- apps/server/src/orchestration/decider.projectBoard.test.ts — brief preservation, append, project-scope rejection, projection.
- packages/client-runtime/src/operations/commands.ts and state/projectCommands.ts — append-handoff client command.
- apps/server/src/mcp/toolkits/board/tools.ts, handlers.ts, and their existing tests — scoped read/append tools.
- apps/server/src/orchestration/projectBoardPrompt.ts and test — on-demand agent orientation.
- apps/server/src/orchestration/projectActivity.ts, Layers/ProjectionSnapshotQuery.ts, corresponding tests, and apps/web/src/components/ProjectActivityPanel.tsx — safe Activity mapping.
- apps/web/src/components/ProjectBoardPanel.logic.ts, test, ProjectBoardPanel.tsx, and ChatView.tsx — detail editor, handoff composer, Implement context.
- docs/user/project-board.md and docs/internals/project-board.md — workflow and durable model.

### Task 1: Persist Brief and latest Handoff

**Files:**

- Modify: packages/contracts/src/baseSchemas.ts
- Modify: packages/contracts/src/orchestration.ts
- Modify: packages/contracts/src/orchestration.test.ts
- Modify: apps/server/src/orchestration/decider.ts
- Modify: apps/server/src/orchestration/projector.ts
- Modify: apps/server/src/orchestration/Layers/ProjectionPipeline.ts
- Modify: apps/server/src/orchestration/Schemas.ts
- Modify: apps/server/src/ws.ts
- Test: apps/server/src/orchestration/decider.projectBoard.test.ts

**Interfaces:**

```ts
export const ProjectBoardBrief = Schema.Struct({
  goal: TrimmedNonEmptyString,
  acceptanceCriteria: Schema.Array(TrimmedNonEmptyString),
  importantFiles: Schema.Array(TrimmedNonEmptyString),
  notes: Schema.NullOr(TrimmedNonEmptyString),
});

export const ProjectBoardHandoff = Schema.Struct({
  id: ProjectBoardHandoffId,
  sourceThreadId: ThreadId,
  summary: TrimmedNonEmptyString,
  decisions: Schema.Array(TrimmedNonEmptyString),
  nextStep: TrimmedNonEmptyString,
  createdAt: IsoDateTime,
});

export const ProjectBoardItemHandoffAppendCommand = Schema.Struct({
  type: Schema.Literal("project.board.item.handoff.append"),
  commandId: CommandId,
  projectId: ProjectId,
  itemId: ProjectBoardItemId,
  sourceThreadId: ThreadId,
  summary: TrimmedNonEmptyString,
  decisions: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  nextStep: TrimmedNonEmptyString,
});
```

ProjectBoardItem gains optional nullable brief and latestHandoff. The append event is project.board-item-handoff-appended with payload { projectId, itemId, itemTitle, handoff, updatedAt }.

- [ ] **Step 1: Write failing contract and decider tests**

```ts
it.effect("preserves a brief and projects the latest handoff", () =>
  Effect.gen(function* () {
    const created = yield* decideOrchestrationCommand({
      command: {
        type: "project.board.item.upsert",
        commandId: CommandId.make("cmd-create"),
        projectId,
        itemId,
        title: "Ship handoff",
        status: "inProgress",
        brief: {
          goal: "Ship a clear transfer",
          acceptanceCriteria: ["The next agent can continue"],
          importantFiles: ["apps/server/src/orchestration/decider.ts"],
          notes: null,
        },
      },
      readModel,
    });
    readModel = yield* projectEvent(readModel, onlyEvent(created));

    const appended = yield* decideOrchestrationCommand({
      command: {
        type: "project.board.item.handoff.append",
        commandId: CommandId.make("cmd-handoff"),
        projectId,
        itemId,
        sourceThreadId,
        summary: "Contracts are done.",
        decisions: ["Keep history in events."],
        nextStep: "Build the Board detail view.",
      },
      readModel,
    });
    readModel = yield* projectEvent(readModel, onlyEvent(appended));
    expect(readModel.projects[0]?.boardItems?.[0]?.brief?.goal).toBe("Ship a clear transfer");
    expect(readModel.projects[0]?.boardItems?.[0]?.latestHandoff?.nextStep).toBe(
      "Build the Board detail view.",
    );
  }),
);
```

Also decode an old card with neither field, decode an append-event payload, and append with a thread from another project expecting OrchestrationCommandInvariantError.

- [ ] **Step 2: Run the tests to prove the change is absent**

Run: pnpm exec vitest run packages/contracts/src/orchestration.test.ts apps/server/src/orchestration/decider.projectBoard.test.ts

Expected: FAIL because brief/handoff schemas and append command/event do not exist.

- [ ] **Step 3: Implement the smallest event-sourced change**

Add ProjectBoardHandoffId, schemas, command/event unions, and payload. Upsert preserves existing brief when the command omits it and honors null to clear it. Append requires card and source thread, requires matching project ids, generates its id through injected Crypto.Crypto.randomUUIDv4, and emits one project event. Both projectors replace only the matching card latestHandoff and updatedAt. Include the alias and WebSocket update case.

- [ ] **Step 4: Run focused verification**

Run: pnpm exec vitest run packages/contracts/src/orchestration.test.ts apps/server/src/orchestration/decider.projectBoard.test.ts

Expected: PASS.

- [ ] **Step 5: Commit only the core files**

```bash
git add packages/contracts/src/baseSchemas.ts packages/contracts/src/orchestration.ts packages/contracts/src/orchestration.test.ts apps/server/src/orchestration/decider.ts apps/server/src/orchestration/projector.ts apps/server/src/orchestration/Layers/ProjectionPipeline.ts apps/server/src/orchestration/Schemas.ts apps/server/src/orchestration/decider.projectBoard.test.ts apps/server/src/ws.ts
git commit -m "feat(board): persist task briefs and handoffs"
```

### Task 2: Add client command and safe Activity row

**Files:**

- Modify: packages/client-runtime/src/operations/commands.ts
- Modify: packages/client-runtime/src/state/projectCommands.ts
- Modify: apps/server/src/orchestration/projectActivity.ts
- Modify: apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts
- Modify: apps/server/src/orchestration/projectActivity.test.ts
- Modify: apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.test.ts
- Modify: apps/web/src/components/ProjectActivityPanel.tsx

**Interfaces:**

```ts
export type AppendProjectBoardHandoffInput = CommandInput<"project.board.item.handoff.append">;

export const appendProjectBoardHandoff: (input: AppendProjectBoardHandoffInput) => CommandEffect;

{
  kind: "board-handoff";
  itemId: ProjectBoardItemId;
  title: string;
  nextStep: string;
}
```

- [ ] **Step 1: Write failing activity tests**

```ts
it("maps a handoff without exposing its decisions", () => {
  const items = mapProjectActivityRows([handoffEvent]);
  expect(items[0]).toMatchObject({
    kind: "board-handoff",
    title: "Task Brief + Handoff",
    nextStep: "Verify the Board panel.",
  });
  expect(JSON.stringify(items)).not.toContain("Sensitive implementation detail");
});
```

Create handoffEvent using the new payload with summary and decisions. Add a projection-query test verifying the event uses $.handoff.sourceThreadId.

- [ ] **Step 2: Run the activity tests to prove they fail**

Run: pnpm exec vitest run apps/server/src/orchestration/projectActivity.test.ts apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.test.ts

Expected: FAIL because the event is not selected or mapped.

- [ ] **Step 3: Implement transport and mapping**

Add appendProjectBoardHandoff with existing serial-per-project concurrency. Add the event to the Activity query; use $.handoff.sourceThreadId for it and retain $.item.sourceThreadId for Board updates. Map only itemTitle and nextStep. Do not place summary or decisions in the Activity contract. Render Handoff plus title and next step using an existing icon.

- [ ] **Step 4: Run focused verification**

Run: pnpm exec vitest run apps/server/src/orchestration/projectActivity.test.ts apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.test.ts && pnpm --filter @t3tools/client-runtime typecheck && pnpm --filter @t3tools/web typecheck

Expected: PASS.

- [ ] **Step 5: Commit only transport/timeline files**

```bash
git add packages/client-runtime/src/operations/commands.ts packages/client-runtime/src/state/projectCommands.ts apps/server/src/orchestration/projectActivity.ts apps/server/src/orchestration/projectActivity.test.ts apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.test.ts apps/web/src/components/ProjectActivityPanel.tsx
git commit -m "feat(board): surface handoffs in project activity"
```

### Task 3: Give agents scoped brief and handoff MCP tools

**Files:**

- Modify: apps/server/src/mcp/toolkits/board/tools.ts
- Modify: apps/server/src/mcp/toolkits/board/handlers.ts
- Modify: existing tests under apps/server/src/mcp/toolkits/board/
- Modify: apps/server/src/orchestration/projectBoardPrompt.ts
- Modify: apps/server/src/orchestration/projectBoardPrompt.test.ts

**Interfaces:**

```ts
board_get_brief({ itemId: ProjectBoardItemId })
  -> { projectId: ProjectId; item: ProjectBoardItem | null }

board_handoff({
  itemId: ProjectBoardItemId,
  summary: TrimmedNonEmptyString,
  decisions?: ReadonlyArray<TrimmedNonEmptyString>,
  nextStep: TrimmedNonEmptyString,
}) -> { projectId: ProjectId; item: ProjectBoardItem | null }
```

board_upsert additionally accepts brief?: ProjectBoardBrief | null.

- [ ] **Step 1: Write failing toolkit and prompt tests**

```ts
it.effect("returns a brief and appends a scoped handoff", () =>
  Effect.gen(function* () {
    const brief = yield* handlers.board_get_brief({ itemId });
    expect(brief.item?.brief?.goal).toBe("Ship a clear transfer");

    const result = yield* handlers.board_handoff({
      itemId,
      summary: "Server state is ready.",
      decisions: ["Use Board events as history."],
      nextStep: "Implement the web detail view.",
    });
    expect(result.item?.latestHandoff?.sourceThreadId).toBe(scope.threadId);
  }),
);
```

Add a no-board-capability case expecting BoardToolError and a prompt assertion for both new tools.

- [ ] **Step 2: Run the focused tests to prove they fail**

Run: pnpm exec vitest run apps/server/src/mcp/toolkits/board apps/server/src/orchestration/projectBoardPrompt.test.ts

Expected: FAIL because the tools are unregistered.

- [ ] **Step 3: Implement scoped reuse of existing helpers**

Register board_get_brief as readonly/idempotent and return the selected card from loadBoard. Register mutating board_handoff with requireBoardScope, resolveProjectId, loadBoard, and nextCommandId; accept neither project id nor thread id from the agent. Dispatch with scope.threadId, reload, and return the card. Forward brief from board_upsert only when supplied. Seed prompt asks agents to call board_get_brief for card context and board_handoff when transferring work.

- [ ] **Step 4: Run focused verification**

Run: pnpm exec vitest run apps/server/src/mcp/toolkits/board apps/server/src/orchestration/projectBoardPrompt.test.ts && pnpm --filter t3 typecheck

Expected: PASS.

- [ ] **Step 5: Commit only MCP and prompt files**

```bash
git add apps/server/src/mcp/toolkits/board/tools.ts apps/server/src/mcp/toolkits/board/handlers.ts apps/server/src/orchestration/projectBoardPrompt.ts apps/server/src/orchestration/projectBoardPrompt.test.ts
git commit -m "feat(board): let agents read and hand off task context"
```

### Task 4: Extend the Board panel and Implement context

**Files:**

- Modify: apps/web/src/components/ProjectBoardPanel.logic.ts
- Modify: apps/web/src/components/ProjectBoardPanel.logic.test.ts
- Modify: apps/web/src/components/ProjectBoardPanel.tsx
- Modify: apps/web/src/components/ChatView.tsx
- Modify: docs/user/project-board.md
- Modify: docs/internals/project-board.md

**Interfaces:**

```ts
export function buildBoardImplementPrompt(item: ProjectBoardItem): string;

type ProjectBoardPanelProps = {
  environmentId: EnvironmentId;
  projectId: ProjectId;
  sourceThreadId: ThreadId;
};
```

- [ ] **Step 1: Write failing Implement prompt test**

```ts
it("includes brief and latest handoff in the Implement prompt", () => {
  const prompt = buildBoardImplementPrompt(itemWithBriefAndHandoff);
  expect(prompt).toContain("## Task brief");
  expect(prompt).toContain("## Latest handoff");
  expect(prompt).toContain("board_get_brief");
  expect(prompt).toContain("board_handoff");
});
```

Use one item fixture containing goal, criterion, important file, notes, summary, decision, and next step.

- [ ] **Step 2: Run the logic test to prove it fails**

Run: pnpm exec vitest run apps/web/src/components/ProjectBoardPanel.logic.test.ts

Expected: FAIL because no brief/handoff sections exist.

- [ ] **Step 3: Build one local Board detail surface**

Add a small detail affordance to each row and retain detailItemId in ProjectBoardPanel. The selected card renders controlled fields for goal, newline-separated acceptance criteria, newline-separated important files, notes, handoff summary, decisions, and next step. Trim and omit blank list lines on save. Save a populated brief or explicit null to clear through upsertBoardItem; append via appendBoardHandoff using the active thread id supplied by ChatView. Reset handoff inputs only after successful dispatch so failed saves retain input. Omit empty brief sections, show only the latest handoff plus source-thread action/time, and add short labelled sections to buildBoardImplementPrompt.

- [ ] **Step 4: Update docs**

Add this user paragraph:

```markdown
Open a Board card's details to attach a goal, acceptance criteria, important files, and notes. When handing work to another agent, add a summary, decisions, and a concrete next step. The card shows the latest handoff; agents can read it with board_get_brief and append the next one with board_handoff.
```

Document internally that the card projects only latestHandoff and append events retain historical records.

- [ ] **Step 5: Run focused verification**

Run: pnpm exec vitest run apps/web/src/components/ProjectBoardPanel.logic.test.ts && pnpm --filter @t3tools/web typecheck && git diff --check

Expected: PASS.

- [ ] **Step 6: Commit only Board UI and docs files**

```bash
git add apps/web/src/components/ProjectBoardPanel.logic.ts apps/web/src/components/ProjectBoardPanel.logic.test.ts apps/web/src/components/ProjectBoardPanel.tsx apps/web/src/components/ChatView.tsx docs/user/project-board.md docs/internals/project-board.md
git commit -m "feat(web): add board brief and handoff details"
```

### Task 5: Run the integrated proof

**Files:**

- Test only: existing Board and Project Activity right-panel tabs in the running shared web/desktop client.

- [ ] **Step 1: Create and populate one verification card**

Create Verify Brief + Handoff; save a brief with one goal, criterion, important file, and note. Append a handoff with a summary, one decision, and next step Use Implement and confirm the prompt has the brief.

- [ ] **Step 2: Verify the observed flow**

Confirm refresh preserves the brief/latest handoff, source action opens the correct thread, Implement includes ## Task brief and ## Latest handoff, and Activity Timeline shows title and next step but neither handoff summary nor decisions.

- [ ] **Step 3: Run the final focused suite**

Run: pnpm exec vitest run packages/contracts/src/orchestration.test.ts apps/server/src/orchestration/decider.projectBoard.test.ts apps/server/src/orchestration/projectActivity.test.ts apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.test.ts apps/server/src/mcp/toolkits/board apps/server/src/orchestration/projectBoardPrompt.test.ts apps/web/src/components/ProjectBoardPanel.logic.test.ts apps/web/src/components/ProjectActivityPanel.logic.test.ts

Expected: PASS.

- [ ] **Step 4: Check the final diff**

Run: git diff --check && git status --short

Expected: no whitespace errors and unrelated pre-existing dirty files remain untouched.

## Self-Review

- Coverage: Task 1 is compatible data/event behavior; Task 2 is client/timeline; Task 3 is agent access; Task 4 is Board workflow/docs; Task 5 is the user-visible proof.
- Scope held: no global memory, auto summaries, history browser, mobile client, codebase-memory-plus API, dependency, migration, or separate task system.
- Names match throughout: ProjectBoardBrief, ProjectBoardHandoff, AppendProjectBoardHandoffInput, board_get_brief, board_handoff, and board-handoff.
