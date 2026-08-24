# Megathread orchestration — implementation roadmap

Design: `docs/superpowers/specs/2026-08-21-megathread-orchestration-design.md`.

## Recommendation — build order, and what to build first

The stated pain is **"my context fills up and I create a new thread by hand"**.
The megathread solves a _different_ problem — parallel delegation. Both are
worth having, but conflating them buys a multi-week build for a pain that a
much smaller feature removes.

Build in this order, and stop at any point where the value stops:

1. **Thread rollover, standalone — do this first.** _(shipped: `apps/web/src/threadRollover.ts` + command palette action "Hand off & continue in new thread")_ A thread that is full is continued by a successor seeded from the board digest + the current card's handoff. Days of work, used every day, and a strict subset of the megathread. If it turns out this is all that was needed, that is a good outcome, not a failure.

   Take design §4.4 **minus step 2** — there are no workers to re-point yet. What remains is composition of things that already exist:

   - seed a new thread with a prompt → `useNewThreadHandler({ seedPrompt })`, the same primitive `ProjectBoardPanel`'s Implement action uses
   - seed content → `formatProjectBoardDigest` + `board_get_brief`; the command palette already ships "Insert project board digest"
   - successor keeps working where the predecessor worked → pass the existing `branch`/`worktreePath` to `thread.create`; no `createWorktree`, no git work. Nothing on the server assumes one thread per worktree — `worktreePath` is read as a cwd (`ws.ts:1846`, `terminal/Manager.ts`), exactly as multiple root threads already share `workspaceRoot`.
   - park the predecessor → existing `thread.settle`
   - optional: one `continuedFromThreadId` field for the link

   **This does not require the `ws.ts` / `ThreadSpawnService` extraction** — the one item flagged as a real regression risk. Do not start there.

2. **Auto-handoff on turn end.** Rollover is only as good as what the board remembers. The rollover action already _forces_ a handoff at the moment that matters — it sends the request turn to the outgoing thread before creating the successor. What remains is the thread that goes cold without a rollover, and the cheap fix there is one line in `formatProjectBoardPromptBlock`, not a background turn injector: auto-sending turns into settled threads spends real money without user intent (design §9).
3. **M0 measurement.** Only now ask whether delegation pays, with real numbers from a hand-run A/B.
4. **M1 + M2** — spawning and fan-in, if and only if M0 says yes.
5. **M3–M5** — merges, routing, UI.

**Decision rule for whether the hierarchy is worth it at all:** it earns its
cost when you regularly have **3 or more independent cards ready at the same
time**. If work is usually one card at a time, depth-first, the planner has
nothing to parallelize and rollover is the entire win.

**Where the hierarchy genuinely beats native subagents** (and is therefore worth
building for this fork specifically): filesystem isolation via worktrees, so
parallel writes cannot collide; cross-provider model routing; and workers that
are durable, inspectable threads rather than ephemeral reports. The worktree
infrastructure already exists here — that is the fork's unfair advantage over
vanilla single-runtime subagents.

Five milestones. Each is independently shippable and leaves the product working;
each ends with a concrete verification, not "it compiles". Estimates assume the
existing test conventions (vitest per module, decider/projector tests,
`VcsDriverContractHarness` for git ops).

---

## M0 — Measure first (one afternoon, no code)

The whole roadmap rests on "delegating to cheap workers in worktrees is cheaper
and faster than one long thread". That is testable **today**, by hand: create
three threads manually in worktrees, give each one card, merge by hand.

1. Pick a real feature with 3–4 independent cards.
2. Run A: one thread, one strong model, start to finish.
3. Run B: planner thread by hand + 3 worktree threads on the cheap model + manual merge.
4. Compare with `UsageService.readSummary`: cost per merged card, wall-clock, rework turns, orientation tax per worker (§9 of the design predicts ~17–22k tokens).

**Decision gate:** if run B is not clearly cheaper _or_ clearly faster, the
value is in the automation and the UI, not in the economics — build M1+M2 and
stop before M4's routing/escalation machinery until the numbers say otherwise.

---

## M1 — Spawn primitive (planner can start one worker)

**Goal:** a planner thread can create a worker thread running in its own
worktree, from an MCP tool call, and nothing about the existing client path
changes.

1. **Extract `ThreadSpawnService`** from `dispatchBootstrapTurnStart`
   (`apps/server/src/ws.ts:759`) into
   `apps/server/src/orchestration/Services/ThreadSpawnService.ts`.
   Pure move: create-thread → optional worktree (fetch/origin base resolution
   included) → optional setup script → `thread.turn.start`, with the existing
   rollback-on-failure semantics. `ws.ts` becomes caller #1.
   _Regression risk lives here; do it alone, first, with the existing ws tests green._
2. **Contracts:** add `ThreadAgentRole` (`solo`/`planner`/`worker`, default
   `solo`) and `ThreadLineage`; add both to `ThreadCreateCommand`,
   `ThreadCreatedPayload`, `OrchestrationThread`, `OrchestrationThreadShell`.
   All optional / decoding-defaulted, so every existing thread decodes as `solo`
   and behaves exactly as today.
3. **Migration:** `projection_threads.agent_role` (default `'solo'`) +
   `projection_threads.lineage_json` (nullable) + shell summary inclusion,
   numbered next in `apps/server/src/persistence/Migrations/`, with the usual
   migration test.
4. **Decider/projector:** carry `agentRole` + `lineage` through `thread.create`;
   invariants — only the three legal role/lineage combinations (§3.1) are
   accepted; `lineage.parentThreadId` must exist, be in the same project, and
   have `agentRole === "planner"`; `lineage.depth <= 1`.
5. **Capability:** add `"orchestrate"` to `McpCapability`; `McpSessionRegistry.issue`
   grants it **only** when `agentRole === "planner"` (`McpSessionRegistry.ts:131`).
   `solo` threads must be untouched — no new tools in an ordinary thread's tool
   list.
6. **Toolkit:** `apps/server/src/mcp/toolkits/orchestrator/{tools,handlers}.ts`
   with `task_spawn` and `task_status` only. Register alongside
   `BoardToolkitRegistrationLive` (`McpHttpServer.ts:216`).
7. **Role routing (minimal):** `role` → `ModelSelection` read from project
   settings / `t3.json` with fallback to the project default. No escalation yet.
8. **`sourceThreadId` becomes set-once** in the `project.board.item.upsert`
   decider (`decider.ts:378-381`): preserve the existing value, take the command
   value only on creation. Without this, worker board writes restamp the card
   onto a thread that M2 archives and reaps, breaking `ProjectBoardPanel`'s
   reopen action. Belongs here because the spawn flow is what triggers it.

9. **Creation entry point (thin):** "New megathread" in the new-thread menu /
   command palette — same draft flow as a normal thread, `agentRole: "planner"`.
   Sidebar nesting comes in M5; for M1 a child may render flat.

**Verify:** in a scratch repo, create a megathread from the menu, ask it to spawn
one worker for a board card; confirm a new thread appears with
`branch`/`worktreePath` set, the worker's session cwd is the worktree,
`task_status` reports it, the worker has `board_*` tools but **no** `task_*`
tools, and a plain `solo` thread still has neither.

**Tests:** spawn-service unit (worktree created, rollback on turn-start failure),
decider lineage invariants, `sourceThreadId` set-once (second upsert from a
different thread does not move it), capability gating (worker token lacks
`orchestrate`), toolkit handler tests in the style of
`toolkits/board/handlers.test.ts`.

---

## M2 — Fan-in and cancellation (a run completes without a human relaying)

1. **`SubthreadReactor`** in `apps/server/src/orchestration/Layers/`, modelled on
   `ThreadDeletionReactor`. Subscribes to `streamDomainEvents`; for worker
   threads reacts to turn completion / error / interrupt.
2. **Board transitions:** worker turn completed → card `inReview`; error →
   `blocked`; both dispatched through `OrchestrationEngineService` so UI and
   agents share one write path.
3. **Wake protocol:** dispatch `thread.turn.start` on the planner only when the
   planner is idle (`latestTurn.state !== "running"`, no open approval /
   user-input request — export `hasOpenBlockingRequest` from `decider.ts:67`
   and reuse it rather than writing a second idle check); otherwise buffer and
   flush on planner turn completion.
   Coalesce per planner with `KeyedCoalescingWorker`. Message is one line per
   finished worker — a pointer, never content.
4. **Tools:** `task_result` (handoff + diff stat), `task_send` (follow-up turn on
   a live worker), `task_cancel` (interrupt → session stop → card `cancelled` →
   archive worker → remove worktree).
5. **Planner rollover** (`ThreadSpawnService.rollover`, design §4.4): successor
   planner thread, re-point live workers' `lineage.parentThreadId`, seed from
   board digest + open-worker table + last handoffs, settle the predecessor.
   Exposed as `task_rollover`, a context-size trigger, and a user action.
   _This is the item that removes the manual "context is full, new thread"
   ritual — ship it in M2, not at the end._
6. **Board fields:** optional `attempts`, `executionThreadId`, `dependsOn` on
   `ProjectBoardItem` + projection migration. `dependsOn` is stored and returned
   now, enforced by the planner's prompt; scheduler enforcement lands in M5.

**Verify:** spawn two workers on independent cards, let both finish, confirm the
planner receives exactly **one** coalesced wake, cards land in `inReview`, and
`task_result` returns each handoff. Then cancel a running worker and confirm the
session stops and the worktree is gone. Then roll the planner over mid-run and
confirm the successor sees every card and live worker, and that a worker
finishing _after_ the rollover wakes the successor, not the dead predecessor.

**Tests:** reactor tests with a fake event stream — busy planner buffers, idle
planner wakes, N completions coalesce to 1, error path sets `blocked`; cancel
path integration test.

---

## M3 — Merge pipeline (work lands on the planner branch)

1. **`mergeRef`** on `GitVcsDriver` / `GitVcsDriverCore` (§5 of the design):
   `git merge --no-ff --no-edit`, conflicts via
   `git diff --name-only --diff-filter=U`, always `git merge --abort` on
   failure. Expose through `GitWorkflowService`. Cover in
   `VcsDriverContractHarness`.
2. **`task_diff`** over `getReviewDiffPreview` vs `lineage.baseRef` — file list
   first, patch on request, hard truncation.
3. **`task_merge`:** rebase-check → optional test gate in the worker worktree →
   `mergeRef` into the planner worktree → card `completed` → reap worktree.
   Conflicts: card `blocked` + handoff listing conflicting paths.
4. **Per-project merge lock:** single-flight semaphore; parallel merges into one
   branch are forbidden by construction.
5. **Worktree reaper:** startup sweep over `git worktree list` removing
   `t3/task-*` worktrees with no live thread; reap on merge/cancel/archive/delete.
   Server-side — `apps/web/src/worktreeCleanup.ts` stops being the only owner.

**Verify:** two workers edit different files, planner merges both sequentially,
`git log` on the planner branch shows two merge commits, both worktrees are
gone. Then force a conflict (two workers, same lines): merge reports conflicts,
the planner worktree is clean (`git status` not mid-merge), card is `blocked`.

**Tests:** driver harness for merge success/conflict/abort, merge-lock
concurrency test, reaper sweep test with a fabricated orphan worktree.

---

## M4 — Routing, escalation, budgets (cheap models become safe)

1. **Role routing config** in `t3.json` + project settings: `planner`, `roles`,
   `escalation`, `maxConcurrentWorkers`, `maxAttemptsPerCard`. Resolution order
   mirrors `resolveDefaultThreadEnvMode`.
2. **Escalation:** failed run (turn error, unresolvable rebase, test-gate
   failure) → re-spawn one rung up the ladder, `attempts` incremented. Past
   `maxAttemptsPerCard` → card `blocked` with a handoff naming what was tried.
3. **Caps enforced by the reactor, not the model:** per-worker turn cap and
   wall-clock cap → interrupt → escalate.
4. **Concurrency cap:** `task_spawn` refuses over `maxConcurrentWorkers` and
   returns the queue position; planner is told to wait rather than fan out.
5. **Budget:** pre-spawn check against `UsageService` for the run; over budget →
   refuse and block the card. Per-run cost surfaced in `task_status`.

**Verify:** configure a deliberately weak model for `testing`, give it a task it
fails, confirm one escalation to the next rung and a `blocked` card with a
readable handoff after the cap. Confirm the 4th concurrent spawn is refused.

**Tests:** routing resolution table, escalation state machine, cap enforcement,
budget refusal.

---

## M5 — Dependency scheduling and cockpit UI

1. **`dependsOn` enforcement:** `task_spawn` refuses a card with unmet
   dependencies; `task_status` exposes a ready-set so the planner dispatches the
   frontier rather than everything.
2. **Sidebar nesting:** a megathread renders as a root row that expands into its
   subthreads; children are filtered out of the flat top-level list
   (`Sidebar.logic.ts` + shell shape, both already carry the data after M1).
   Collapsed by default so a 6-worker run cannot bury the sidebar.
3. **Run panel inside the megathread view:** one row per subthread — live turn
   state, card, branch, attempts, merge state, cancel. Same payload
   `task_status` returns. Reuses the existing shell stream; no new subscription
   (board mutations already fan out as `project-upserted`). Mirror the worker
   tree under each card in `ProjectBoardPanel`.
4. **Recovery UX:** blocked cards get a one-click "resolve conflicts here"
   action that opens the planner thread with the conflict context.
5. **Mobile:** read-only worker status in the board panel.
6. **Docs:** `docs/internals/megathread-orchestration.md` + user-facing page,
   in the style of the existing project-board pair.

**Verify:** run a 5-card feature with dependencies end to end from a single
planner prompt; watch the board drive itself, and confirm the whole run is
reconstructable from the event log after a server restart.

---

## Sequencing notes

- M1 is the only milestone with meaningful regression risk (touching `ws.ts`).
  Ship it separately from everything else.
- M2 is usable without M3: a human merges. M3 is usable without M4: one model
  for everything. Every stopping point is a working product.
- Anything requiring a persisted field is a contract change **plus** a numbered
  migration **plus** a decoding default — never one without the others.
- Providers differ in MCP delivery. jcode needs the `.jcode/mcp.json` stdio
  bridge, written per session cwd (`jcodeMcpConfig.ts`), so worktree workers get
  it automatically — but verify per driver in M1 that a spawned worker actually
  sees `board_*` before building M2 on the assumption.
