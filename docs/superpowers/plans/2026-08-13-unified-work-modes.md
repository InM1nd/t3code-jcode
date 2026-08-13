# Unified Work Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add durable Build, Plan, Debug, and Swarm Lite modes to every thread, with consistent Jcode and direct-provider behavior.

**Architecture:** Reuse the existing thread interaction-mode event and projection field as the single persisted work-mode field. Keep historical `default` as a compatibility spelling for Build while new threads persist `build`; resolve every work mode at the provider boundary into a supported native mode (`default` or `plan`) plus an optional private workflow instruction. The web composer exposes one four-item selector and sends the existing command path.

**Tech Stack:** TypeScript, Effect Schema, event-sourced orchestration, React, Vitest, existing provider adapters.

## Global Constraints

- Do not add dependencies, database migrations, a global setting, or a second thread-mode field.
- New threads use `build`; historical persisted `default` remains accepted and is shown as Build in the web client.
- Provider adapters must never send `debug` or `swarm` as native provider/ACP mode IDs.
- Jcode keeps its selected inner provider/model; choosing a work mode must not alter routing, reasoning, or speed.
- Swarm Lite is a guided workflow, not a T3-created agent pool or scheduler.
- Preserve current Plan follow-up behavior; `/default` remains an alias for Build.
- Run only focused tests and scoped typechecks. Do not run repo-wide checks.

---

## File map

- `packages/contracts/src/orchestration.ts` — durable work-mode schema, defaults, commands, events, and thread snapshots.
- `packages/contracts/src/orchestration.test.ts` — decoding defaults and legacy serialized values.
- `packages/client-runtime/src/operations/commands.ts` and `packages/client-runtime/src/state/threadCommands.ts` — existing typed command route, updated through the contract type.
- `apps/server/src/orchestration/decider.ts` and `apps/server/src/orchestration/projector.ts` — preserve the new mode in event decisions and read-model projection.
- `apps/server/src/provider/WorkMode.ts` (new) — one pure resolver for native mode and workflow text.
- `apps/server/src/provider/WorkMode.test.ts` (new) — exhaustive resolver behavior.
- `apps/server/src/provider/CodexDeveloperInstructions.ts` — incorporate Debug/Swarm Lite into Codex developer instructions without unsupported collaboration-mode values.
- `apps/server/src/provider/Layers/{Codex,Claude,Cursor,Grok,Jcode,OpenCode}Adapter.ts` — resolve native mode and prepend profile text only where that provider lacks a developer-instruction channel.
- matching `*.test.ts` adapter tests — assert the requested provider configuration and prompt content.
- `apps/web/src/components/{ChatView.tsx,ChatView.logic.ts}` — retain work mode for local drafts, persisted threads, sends, plan follow-up and command confirmation.
- `apps/web/src/components/chat/{ChatComposer.tsx,CompactComposerControlsMenu.tsx}` — replace the legacy two-state toggle with one reusable four-state selector in full and compact controls.
- `apps/web/src/{composer-logic.ts,composer-logic.test.ts,composerDraftStore.ts}` — four aliases and draft validation.
- `apps/web/src/components/settings/{SettingsPanels.tsx,settingsSearch.ts}` and `packages/contracts/src/settings.ts` — remove the obsolete beta gate and its setting/search entry.
- `docs/user/work-modes.md` (new) and `docs/README.md` — user-facing behavior and docs index.

### Task 1: Make work mode durable and backward-compatible

**Files:**

- Modify: `packages/contracts/src/orchestration.ts:128-130, 429-505, 864-912`
- Modify: `packages/contracts/src/orchestration.test.ts`
- Modify: `apps/server/src/orchestration/decider.ts:972-995`
- Modify: `apps/server/src/orchestration/projector.ts`
- Test: `apps/server/src/orchestration/decider.test.ts`, `apps/server/src/orchestration/projector.test.ts`

**Consumes:** Existing `thread.interaction-mode.set` command and projected `Thread.interactionMode` field.

**Produces:** `ProviderInteractionMode` accepts `"default" | "build" | "plan" | "debug" | "swarm"`; `default` is legacy Build compatibility; `DEFAULT_PROVIDER_INTERACTION_MODE === "build"`.

- [ ] **Step 1: Add contract tests before changing the schema.**

  Add cases proving a new thread and a turn command default to `build`, while a serialized historical thread/event/command with `interactionMode: "default"` decodes to `build`.

  ```ts
  expect(decodeOrThrow(Thread, { ...thread, interactionMode: "default" }).interactionMode).toBe(
    "build",
  );
  expect(decodeOrThrow(ThreadTurnStartCommand, { ...turn }).interactionMode).toBe("build");
  ```

- [ ] **Step 2: Run the new contract tests and confirm failure.**

  Run: `pnpm exec vitest run packages/contracts/src/orchestration.test.ts`

  Expected: the legacy decode expectation fails and/or `build` is rejected.

- [ ] **Step 3: Implement legacy compatibility.**

  Extend the schema with `build`, `debug`, and `swarm`, retain `default` as a legacy spelling, and set the new default to `build`. Normalize the legacy spelling in the web client; do not change the SQLite column or add a migration.

  ```ts
  export const DEFAULT_PROVIDER_INTERACTION_MODE: ProviderInteractionMode = "build";
  // keep "default" readable; new defaults write "build"
  ```

- [ ] **Step 4: Add event-sourcing tests.**

  Extend the nearest existing interaction-mode cases to decide and project `debug` and `swarm`, and assert the projected thread retains the exact selected mode after replay.

  ```ts
  expect(project(events).threads[threadId]?.interactionMode).toBe("debug");
  ```

- [ ] **Step 5: Run focused contract and orchestration tests.**

  Run: `pnpm exec vitest run packages/contracts/src/orchestration.test.ts apps/server/src/orchestration/decider.test.ts apps/server/src/orchestration/projector.test.ts`

  Expected: PASS.

- [ ] **Step 6: Commit the durable model.**

  ```bash
  git add packages/contracts/src/orchestration.ts packages/contracts/src/orchestration.test.ts apps/server/src/orchestration/decider.ts apps/server/src/orchestration/decider.test.ts apps/server/src/orchestration/projector.ts apps/server/src/orchestration/projector.test.ts
  git commit -m "feat: persist unified thread work modes"
  ```

### Task 2: Resolve each work mode safely at the provider boundary

**Files:**

- Create: `apps/server/src/provider/WorkMode.ts`
- Create: `apps/server/src/provider/WorkMode.test.ts`
- Modify: `apps/server/src/provider/CodexDeveloperInstructions.ts`
- Modify: `apps/server/src/provider/Layers/CodexAdapter.ts`, `CodexSessionRuntime.ts`
- Modify: `apps/server/src/provider/Layers/ClaudeAdapter.ts`, `CursorAdapter.ts`, `GrokAdapter.ts`, `JcodeAdapter.ts`, `OpenCodeAdapter.ts`
- Test: `apps/server/src/provider/Layers/{Codex,Claude,Cursor,Grok,Jcode,OpenCode}Adapter.test.ts`

**Consumes:** Current `ProviderSendTurnInput.interactionMode` from Task 1.

**Produces:** `resolveWorkMode(mode)` returning `{ nativeInteractionMode: "default" | "plan"; instruction?: string }`, with no provider able to receive unsupported native mode values.

- [ ] **Step 1: Write resolver tests.**

  Cover all four modes. Build must resolve to `{ nativeInteractionMode: "default" }`; Plan to `{ nativeInteractionMode: "plan", instruction }`; Debug and Swarm Lite to native `default` plus an instruction. Assert Debug includes reproduction/evidence/root-cause/fix/verification and Swarm includes independent roles/results/synthesis without promising parallel execution.

  ```ts
  expect(resolveWorkMode("swarm")).toMatchObject({ nativeInteractionMode: "default" });
  expect(resolveWorkMode("swarm").instruction).toContain("Do not claim parallel workers");
  ```

- [ ] **Step 2: Run resolver tests and confirm failure.**

  Run: `pnpm exec vitest run apps/server/src/provider/WorkMode.test.ts`

  Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the smallest shared resolver.**

  Create one pure module, not a service or registry. Keep the mode-to-text mapping as a local exhaustive switch. Export a helper that prepends the profile to a provider prompt only when `instruction` exists, clearly delimiting it as T3 workflow context while retaining the user text unchanged after it.

  ```ts
  export function resolveWorkMode(mode: ProviderInteractionMode) {
    switch (mode /* build, plan, debug, swarm */) {
    }
  }
  ```

- [ ] **Step 4: Route Codex through the resolver.**

  In `buildCodexCollaborationMode`, pass only `nativeInteractionMode` to the Codex collaboration schema. Extend `buildCodexDeveloperInstructions` with the optional resolved instruction; preserve its existing Plan Mode instructions and keep model/reasoning metadata unchanged. Add a test that Debug/Swarm use collaboration mode `default`, never raw `debug`/`swarm`.

- [ ] **Step 5: Route Claude, Cursor, Grok, OpenCode, and Jcode through the resolver.**

  At each adapter's send-turn boundary:

  - use `nativeInteractionMode` for Claude permission mode, Cursor ACP mode selection, and OpenCode's native `plan` agent;
  - prepend the profile only for modes that need it, before building provider prompt parts;
  - leave the user attachment sequence and selected model/options untouched;
  - in Jcode, resolve the mode only after its current inner model has been selected and pass profile text to the ACP prompt, never changing `ctx.currentModelId`.

  Add one narrow test per adapter asserting `plan` reaches its existing native setting, while `debug` and `swarm` produce the profile under normal transport. In the Jcode test, assert its selected Cursor/Codex/Claude inner-model ID is unchanged.

- [ ] **Step 6: Run focused resolver and adapter tests.**

  Run: `pnpm exec vitest run apps/server/src/provider/WorkMode.test.ts apps/server/src/provider/Layers/CodexAdapter.test.ts apps/server/src/provider/Layers/ClaudeAdapter.test.ts apps/server/src/provider/Layers/CursorAdapter.test.ts apps/server/src/provider/Layers/GrokAdapter.test.ts apps/server/src/provider/Layers/JcodeProvider.test.ts apps/server/src/provider/Layers/OpenCodeAdapter.test.ts`

  Expected: PASS.

- [ ] **Step 7: Commit provider behavior.**

  ```bash
  git add apps/server/src/provider
  git commit -m "feat: apply work modes across providers"
  ```

### Task 3: Expose one four-mode selector and aliases in the web composer

**Files:**

- Modify: `apps/web/src/components/chat/ChatComposer.tsx:303-390, 886-905`
- Modify: `apps/web/src/components/chat/CompactComposerControlsMenu.tsx`
- Modify: `apps/web/src/components/ChatView.tsx:1502-1507, 3221-3242, 4952-4970, 5470-5585`
- Modify: `apps/web/src/components/ChatView.logic.ts`
- Modify: `apps/web/src/composer-logic.ts`, `apps/web/src/composerDraftStore.ts`
- Modify: `apps/web/src/components/settings/SettingsPanels.tsx`, `settingsSearch.ts`, `packages/contracts/src/settings.ts`
- Test: `apps/web/src/composer-logic.test.ts`, `apps/web/src/composerDraftStore.test.ts`, `apps/web/src/components/chat/composerProviderState.test.tsx`, relevant `ChatView` tests

**Consumes:** The four-value `ProviderInteractionMode` and existing `setThreadInteractionMode` command from Task 1.

**Produces:** An always-visible work-mode selector in normal and compact composer layouts; draft selection only becomes durable after the existing send/command confirmation path succeeds.

- [ ] **Step 1: Add failing UI-logic tests.**

  Extend slash-command parsing with `/build`, `/default`, `/plan`, `/debug`, and `/swarm`; assert `/build` and `/default` both return `build`. Extend composer draft tests so all four values are retained and invalid strings clear the draft value.

  ```ts
  expect(parseStandaloneComposerSlashCommand("/swarm")).toBe("swarm");
  expect(parseStandaloneComposerSlashCommand("/default")).toBe("build");
  ```

- [ ] **Step 2: Run the focused web logic tests and confirm failure.**

  Run: `pnpm exec vitest run apps/web/src/composer-logic.test.ts apps/web/src/composerDraftStore.test.ts`

  Expected: FAIL because the new aliases and modes are absent.

- [ ] **Step 3: Replace the legacy toggle with a mode option list.**

  Define one local ordered list containing label, description, and existing Lucide icon for Build, Plan, Debug, and Swarm Lite. Pass `onInteractionModeChange(mode)` rather than a binary toggle into both composer controls. Render a `Select` in the full footer and the same radio list in `CompactComposerControlsMenu`; each item must include its short description. Do not add sidebar badges.

- [ ] **Step 4: Remove the beta gate without resetting user state.**

  Stop forcing `default`/Build when `settings.planModeEnabled` is false and make slash aliases always active for standalone, context-free input. Remove the obsolete settings field, Settings panel control, and search result. Preserve existing plan follow-up logic, changing its Build check from `default` to `build`.

- [ ] **Step 5: Preserve server-confirmed persistence semantics.**

  Keep selecting a mode as composer draft state until the existing submit path calls `setThreadInteractionMode`. On command failure, retain the last server thread value on the next render and use the existing error report; do not make a new optimistic persistence store. Update local draft-thread initialization and send payloads to `build`.

- [ ] **Step 6: Run focused web tests.**

  Run: `pnpm exec vitest run apps/web/src/composer-logic.test.ts apps/web/src/composerDraftStore.test.ts apps/web/src/components/chat/composerProviderState.test.tsx apps/web/src/components/ChatView.logic.test.ts`

  Expected: PASS.

- [ ] **Step 7: Run scoped web typecheck and commit.**

  Run: `pnpm --filter @t3tools/web typecheck`

  Expected: PASS (the known Node-version warning is acceptable).

  ```bash
  git add apps/web/src packages/contracts/src/settings.ts
  git commit -m "feat(web): add unified work mode selector"
  ```

### Task 4: Document and verify the integrated feature

**Files:**

- Create: `docs/user/work-modes.md`
- Modify: `docs/README.md`
- Test: focused suites from Tasks 1–3

**Consumes:** Finished persisted model, adapters, and composer UI.

**Produces:** Shipped-product documentation and evidence that the UI works with a direct provider and Jcode.

- [ ] **Step 1: Write user documentation.**

  Explain when to use Build, Plan, Debug, and Swarm Lite; state that the choice is saved per chat; list all slash aliases; explain that Swarm Lite can use native provider subagents when available but otherwise coordinates sequentially in the current chat. Explicitly state it does not change the selected provider/model/reasoning/speed.

- [ ] **Step 2: Run the final focused suite.**

  Run: `pnpm exec vitest run packages/contracts/src/orchestration.test.ts apps/server/src/orchestration/decider.test.ts apps/server/src/orchestration/projector.test.ts apps/server/src/provider/WorkMode.test.ts apps/server/src/provider/Layers/CodexAdapter.test.ts apps/server/src/provider/Layers/ClaudeAdapter.test.ts apps/server/src/provider/Layers/CursorAdapter.test.ts apps/server/src/provider/Layers/GrokAdapter.test.ts apps/server/src/provider/Layers/JcodeProvider.test.ts apps/server/src/provider/Layers/OpenCodeAdapter.test.ts apps/web/src/composer-logic.test.ts apps/web/src/composerDraftStore.test.ts apps/web/src/components/chat/composerProviderState.test.tsx apps/web/src/components/ChatView.logic.test.ts`

  Expected: PASS.

- [ ] **Step 3: Perform the requested integrated visual check.**

  Use the existing isolated worktree dev server and seeded copy of application state. In the paired web client, verify the four-mode menu in both normal and compact composer layouts, switch Debug and Swarm Lite for a direct provider and a Jcode model, reload, and confirm the selected mode remains. Do not test against the live `~/.t3/userdata` database.

- [ ] **Step 4: Commit documentation and verification-ready implementation.**

  ```bash
  git add docs/user/work-modes.md docs/README.md
  git commit -m "docs: explain unified work modes"
  ```

## Self-review

- **Spec coverage:** Task 1 covers durable selection and legacy compatibility; Task 2 covers all direct adapters plus Jcode routing; Task 3 covers UI, aliases, beta-gate removal, and failure semantics; Task 4 covers Swarm Lite scope, documentation, and real-client verification.
- **Scope:** The plan deliberately excludes a T3 swarm scheduler, worker graph, sidebar indicators, and provider/model changes.
- **Consistency:** `build`, `plan`, `debug`, and `swarm` are current application modes; `default` remains a readable legacy Build spelling and provider-native resolved mode.
- **Placeholder scan:** The document contains no unfinished implementation markers.
