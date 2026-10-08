# Fork isolation rules

This is a fork of `pingdotgg/t3code`. The integration branch is `tandem-v2`, cut
from upstream `9bd1d8009a`. `main` is the archived V1 line until cutover.
Upstream keeps moving, so every fork line that sits inside an upstream file is
a line you may have to re-apply by hand at the next sync.

The rule is not "don't touch upstream files" — data models and registrations
have to be wired somewhere. The rule is **how much** you touch them, and how.

## The budget

**A feature may add at most ~10 lines to any upstream file, and they must be
additions, not edits of existing lines.**

Git resolves an added block far more often than a changed line. Rewriting an
upstream line — even to add `export` — turns a clean auto-merge into a conflict.

A lifecycle the feature cannot observe from its own module (a terminal spawn,
exit, or stop) may add its callbacks in that one function. Those callbacks are
still additions, in one place. They are not a license to edit the surrounding
function.

## The three legal shapes of an upstream touch

1. **One import line.**
2. **One registration** appended to a list: `actionItems.push(...)`, a layer in `Layer.mergeAll`, a `.merge(FeatureRpcGroup)`, a union member, an `export *` in a barrel.
3. **One field** added to an existing schema, when the data genuinely belongs there. Always `Schema.optional` + a decoding default.

Anything else belongs in a fork-owned file.

## Where fork state lives

**Schema changes go in `fork_sql_migrations` only.** Never add a row to
`effect_sql_migrations`, and never reuse an upstream migration id. Upstream
compares ids and will skip its own migration when a fork row already holds that
number. This fork already had to repair ids 41 and 44, which V1 had recorded
under the name `ProjectionProjectsBoardItems`. New ids continue after
`5_TerminalSessionRegistry` in `apps/server/src/persistence/ForkMigrations.ts`.

**A fork service gets its own RPC group**, in a fork-owned contracts file, then
one `.merge(FeatureRpcGroup)` on `WsRpcGroup`. Local domains and work modes do
this. The project board still lists its RPC members inside `WsRpcGroup`; that
was the older shape. Do not add another list of members there.

**A turn reads fork context in one place.** `ProviderTurnStartService` checks
`TurnContextPrompts` once. When that flag is off, the provider receives the
composer text unchanged, which is what recorded sessions and tests rely on.
Production turns the flag on. A new prefix (worktree, ports, board, work mode)
registers in `apps/server/src/orchestration-v2/turnContextPrompt.ts`. It does
not get a second edit of the start service.

V2 has no `decider.<feature>.ts`. Orchestration decides events inside the V2
runtime. Fork behavior that used to be a decider case is either its own service
(the board) or a prompt prefix at that single turn-start site.

## Patterns by layer

| Layer               | Fork-owned file                                         | Upstream touch                                                               |
| ------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Contracts           | `packages/contracts/src/<feature>.ts`                   | `export *` in `index.ts`, plus one `.merge(FeatureRpcGroup)` on `WsRpcGroup` |
| Persistence         | `apps/server/src/persistence/ForkMigrations.ts`         | none — the next id goes in `fork_sql_migrations`                             |
| Turn start          | `orchestration-v2/turnContextPrompt.ts`                 | one read of `TurnContextPrompts` in `ProviderTurnStartService`               |
| Services            | own file under `Layers/` or next to the feature         | one entry in the layer list                                                  |
| MCP tools           | own toolkit dir under `mcp/toolkits/<feature>/`         | one registration line                                                        |
| Web palette / menus | `apps/web/src/<feature>Palette.tsx` exporting a builder | one `push(build…())`                                                         |
| Web components      | a feature directory, logic beside the JSX               | one import + one mount point                                                 |
| Tests               | `<feature>.test.ts` next to the fork module             | none — never append fork tests to an upstream test file                      |

### When extraction is the wrong call

Two cases where a contiguous added block wins:

- **The fork schema needs a module-private upstream symbol.** Moving the schema out would mean adding `export` upstream (a changed line) or duplicating a branded id. Both cost more than a short inline block. Keep the block, keep it contiguous.
- **Upstream references the fork symbol back.** Splitting it creates an import cycle, and `Schema.Struct` evaluates at module load, so a cycle is a crash, not a warning.

A contiguous added block is the second-best shape after a separate file. What
you must never do is scatter the same feature across ten upstream sites.

### Cheap wins that are not extraction

Removing churn is often worth more than moving code:

- **Never rename an upstream symbol.** A deprecated alias that no caller uses is a changed line with no behavior.
- **Keep upstream's formatting.** Widening an enum from one line to a five-line array turns 1 changed line into 7. `Schema.Literals(["default", "build", "plan", "debug", "swarm"])` conflicts less than the same values stacked vertically.

### Module-private upstream helpers

If fork code needs a helper that upstream keeps module-private, **pass it in as
a parameter**. Adding `export` to the upstream declaration edits an upstream
line for no functional gain.

## Anti-patterns

- Reformatting or re-sorting code around your insertion. Every reflowed line is a conflict you volunteered for.
- Renaming upstream symbols.
- Changing an existing line when an added line would do.
- Spreading one feature across many upstream files instead of one module plus wiring.
- Appending fork tests into upstream test files.
- A second prompt injection outside `turnContextPrompt.ts`.
- A migration id shared with `effect_sql_migrations`.

## Checking your own work

Before you consider a feature done, compare the fork branch with upstream.
Until cutover that branch is `tandem-v2`, not `main`.

```bash
# Lines this feature added relative to current upstream. Over ~10 in one file: extract.
git diff --numstat upstream/main...HEAD -- <files you touched>

# Definitive: what would conflict if you merged upstream right now.
git merge-tree --write-tree --name-only tandem-v2 upstream/main
```

`merge-tree` is read-only — it never touches the working tree.

## Files the fork rewrote, and what to do about them

Some fork work is not an addition — it replaces upstream behaviour. Extraction
cannot help there. Measure before deciding, with both numbers that matter.
The fork diff is `upstream/main...tandem-v2` (three dots). A two-dot diff from
the cut pin `9bd1d8009a` now includes upstream's own edits and inflates the
counts. Upstream commit counts are still since that pin. Measured at
`86c0d998a1`:

```bash
git diff --numstat upstream/main...tandem-v2 -- <file>
git rev-list --count 9bd1d8009a..upstream/main -- <file>
```

| File                                                           | Fork diff | Upstream commits since pin | Nature                                                                                     |
| -------------------------------------------------------------- | --------- | -------------------------- | ------------------------------------------------------------------------------------------ |
| `apps/web/index.html`                                          | 214+/4−   | 0                          | one theme block plus the product name. Cold upstream; keep the block contiguous            |
| `apps/web/src/components/ChatView.tsx`                         | 107+/7−   | 10                         | scattered wiring: work mode, rollover, tokens, attach. Stop adding sites here              |
| `scripts/build-desktop-artifact.ts`                            | 94+/4−    | 2                          | Tandem app id and staging for the local-domain listener                                    |
| `packages/contracts/src/settings.ts`                           | 67+/0−    | 2                          | `JcodeSettings`, the companion pet, and the empty-chat animation. Keep new fields together |
| `apps/server/src/terminal/Manager.ts`                          | 55+/0−    | 1                          | spawn, exit, and stop callbacks for the terminal registry                                  |
| `apps/web/src/components/chat/ChatComposer.tsx`                | 52+/58−   | 3                          | the footer mode control moved into a fork component; what remains is wiring                |
| `apps/web/src/components/CommandPalette.tsx`                   | 46+/4−    | 3                          | palette items pushed in                                                                    |
| `apps/web/src/components/RightPanelTabs.tsx`                   | 41+/2−    | 1                          | the project board as a right-panel surface                                                 |
| `apps/web/src/components/chat/MessagesTimeline.tsx`            | 37+/0−    | 1                          | per-answer token labels and the worktree warning                                           |
| `apps/server/src/orchestration-v2/ProviderTurnStartService.ts` | 37+/1−    | 0                          | the one turn-start read of `TurnContextPrompts`                                            |
| `packages/contracts/src/rpc.ts`                                | 22+/1−    | 3                          | board members listed in the group, plus two `.merge()` calls. New services merge a group   |
| `apps/server/src/server.ts`                                    | 21+/1−    | 3                          | board, work modes, local domains, terminal registry, and the turn-context flag             |
| `apps/server/src/observability/RpcInstrumentation.ts`          | 21+/1−    | 2                          | instrumentation names for those RPC groups                                                 |
| `apps/server/src/orchestration-v2/Adapters/AcpAdapterV2.ts`    | 20+/0−    | 1                          | thread id, launch model, and prompt token usage handed into the ACP runtime                |
| `apps/web/src/components/sidebar/SidebarChrome.tsx`            | 16+/5−    | 0                          | Tandem brand, agent attention, and the Ports item                                          |
| `packages/shared/package.json`                                 | 16+/0−    | 1                          | subpath exports for the board, work mode, workspace scope, and Jcode                       |
| `apps/server/src/auth/RpcAuthorization.ts`                     | 16+/0−    | 8                          | scopes for the board, work modes, and local domains. Hot upstream                          |
| `apps/server/src/ws.ts`                                        | 15+/0−    | 5                          | handler spreads for those groups. Hot upstream                                             |
| `apps/desktop/src/backend/DesktopBackendConfiguration.ts`      | 14+/0−    | 2                          | the local-domain public port on the desktop backend                                        |
| `apps/web/src/components/preview/PreviewLocalServerCard.tsx`   | 13+/1−    | 0                          | which thread owns a discovered port                                                        |
| `apps/server/src/bin.ts`                                       | 13+/0−    | 0                          | the Jcode MCP stdio entrypoint                                                             |
| `apps/web/src/components/chat/CompactComposerControlsMenu.tsx` | 12+/8−    | 0                          | work-mode choices in the compact composer menu                                             |
| `apps/web/src/components/settings/settingsSearch.ts`           | 12+/0−    | 3                          | settings search entries for the pet and the empty-chat animation                           |
| `scripts/build-desktop-artifact.test.ts`                       | 11+/7−    | 1                          | follows the desktop artifact script                                                        |

The V1 sidebar replacement is not on this branch. Phase 4.6 was skipped: V2
already filters the settled shelf by project. Do not vendor a `ForkSidebar`.

Whitespace is not the source of these diffs. The deletions in `ChatComposer.tsx`
are the extracted mode footer, which is the shape you want. The file to protect
on the next sync is `ChatView.tsx`: many small insertions, and upstream has
already committed to it ten times since the pin. `RpcAuthorization.ts` (8
upstream commits) and `ws.ts` (5) are the hot registration files; new fork RPCs
merge a group instead of growing those lists. `apps/web/src/routeTree.gen.ts`
is generated (21+/0−, 1 upstream commit). Do not edit it.

Workflow diffs (`.github/workflows/ci.yml` 12+/12−, `release.yml` 20+/22−) are
the runner-label swap in [CI runners](#ci-runners), not product code.

### Two strategies

**Keep in place** when the change is mostly additive or the file is cold
upstream (`index.html`: 0 commits since the pin). Resolve the occasional
conflict by hand.

**Vendor a copy** when the fork fully replaced behaviour and the file is hot.
Move the fork version to its own component, restore the upstream file, and
switch at the single mount point.

- Upside: the upstream file goes to zero diff and never conflicts again. Upstream's version keeps arriving intact, so you can read what changed instead of resolving it blind at merge time.
- Cost: upstream fixes to that component stop reaching the fork automatically. Vendoring makes that visible.
- Obligation: after each upstream merge, `git log -p $PREV..upstream/main -- <upstream file>` and port deliberately. The copy rots if you skip this.

Do **not** use `.gitattributes merge=ours` for this. It resolves the conflict by
silently discarding upstream's side, including bugfixes, with no record that
anything was dropped.

## Merge cadence

Merge `upstream/main` into `tandem-v2` **weekly**, not when it becomes urgent.
Conflict cost grows superlinearly with distance. A merge that takes fifteen
minutes weekly takes a day after three months.

## Worked example

Features that followed these rules on `tandem-v2`:

| Feature      | Fork-owned home                                        | Upstream touch                                     |
| ------------ | ------------------------------------------------------ | -------------------------------------------------- |
| Board        | `BoardService`, `projectBoardRpc`, `ProjectBoardPanel` | RPC members inside `WsRpcGroup` (do not copy this) |
| Work mode    | `workModeRpc`, table `fork_thread_work_modes`          | `.merge(WorkModeRpcGroup)`                         |
| Turn context | `turnContextPrompt.ts`                                 | one flag read in `ProviderTurnStartService`        |
| Migrations   | `ForkMigrations.ts`, ids 1–5                           | none in `effect_sql_migrations`                    |

## CI runners

Upstream's workflows in `.github/workflows/` run on Blacksmith (`blacksmith-*` runner labels), a
paid fleet tied to upstream's own account. That subscription does not carry over to a fork, so
those jobs queue forever with no runner ever picked up — this is not a broken build, it's a runner
label with no fleet behind it on this fork.

This fork runs the same jobs on free GitHub-hosted runners instead (`ubuntu-latest`,
`macos-latest`, `windows-latest`), with the original label kept as a trailing comment
(`runs-on: ubuntu-latest  # blacksmith-8vcpu-ubuntu-2404`) so a future upstream sync shows exactly
what changed and why, rather than a silent runner swap. Pulling in an upstream workflow change
needs the same substitution re-applied to whatever new `blacksmith-*` lines it adds.
