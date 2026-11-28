# Fork isolation rules

This repo is a fork of `pingdotgg/t3code`. `main` is the integration branch.
Upstream keeps moving, so every fork line sitting inside an upstream file is a
line you may have to re-apply by hand at the next sync.

The rule is not "don't touch upstream files" — data models and registrations
have to be wired somewhere. The rule is **how much** you touch them, and how.

## The budget

**A feature may add at most ~10 lines to any upstream file, and they must be
additions, not edits of existing lines.**

Git resolves an added block far more often than a changed line. Rewriting an
upstream line — even to add `export` — turns a clean auto-merge into a conflict.

A lifecycle the feature cannot observe from its own module (such as a terminal
spawn, exit, or stop) may add its callbacks in that one function. Those
callbacks are still additions in one place, not a license to edit surrounding
code.

## The three legal shapes of an upstream touch

1. **One import line.**
2. **One registration** appended to a list: `actionItems.push(...)`, a layer in `Layer.mergeAll`, a `.merge(FeatureRpcGroup)`, a union member, or an `export *` in a barrel.
3. **One field** added to an existing schema, when the data genuinely belongs there. Always `Schema.optional` + a decoding default.

Anything else belongs in a fork-owned file.

## Where fork state and registration live

- **Migrations:** Schema changes go in `fork_sql_migrations` via [`ForkMigrations.ts`](../../apps/server/src/persistence/ForkMigrations.ts). Never add a row to `effect_sql_migrations` and never reuse an upstream migration id — upstream compares ids and skips its own migrations when a fork row already holds that number.
- **RPCs:** Give each fork service its own RPC group in a fork-owned contracts file and wire it with a single `.merge(FeatureRpcGroup)` on `WsRpcGroup`. Do not append new member lists directly inside `WsRpcGroup`.
- **Turn context:** `ProviderTurnStartService` checks `TurnContextPrompts` once. When off, the provider receives composer text unchanged (what recorded sessions and tests rely on); production turns it on. Register new prefixes in [`turnContextPrompt.ts`](../../apps/server/src/orchestration-v2/turnContextPrompt.ts) instead of adding a second edit to `ProviderTurnStartService`.
- **Providers:** Fork provider implementations live in their own workspace package (for example `packages/provider-jcode`) with server-side fork glue under `apps/server/src/provider/fork/`, registered in `BUILT_IN_DRIVERS` inside [`apps/server/src/provider/builtInDrivers.ts`](../../apps/server/src/provider/builtInDrivers.ts). Each `ProviderDriver` attaches its own orchestration adapter directly.
- **Claude on-demand MCP invariant:** [`claudeMcpAuto.ts`](../../apps/server/src/provider/claudeMcpAuto.ts) must change servers only through the SDK's `strictMcpConfig`, `mcpServers`, and `setMcpServers`. `toggleMcpServer` looks per-session but mutates `disabledMcpServers` in `~/.claude.json`. `setMcpServers` replaces the whole dynamic set, so passing only the new server disconnects `t3-code`. Over HTTP the CLI applies it only after `mcp_enable` returns (sometimes after the turn), so the handler must not await it.

## Patterns by layer

| Layer               | Fork-owned home                                                 | Upstream touch                                                               |
| ------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Contracts           | `packages/contracts/src/<feature>.ts`                           | `export *` in `index.ts`, plus one `.merge(FeatureRpcGroup)` on `WsRpcGroup` |
| Persistence         | `apps/server/src/persistence/ForkMigrations.ts`                 | none — next id goes in `fork_sql_migrations`                                 |
| Turn start          | `apps/server/src/orchestration-v2/turnContextPrompt.ts`         | one read of `TurnContextPrompts` in `ProviderTurnStartService`               |
| Providers           | `packages/provider-<name>/` + `apps/server/src/provider/fork/`  | one `BUILT_IN_DRIVERS` entry in `apps/server/src/provider/builtInDrivers.ts` |
| Services            | own file next to the feature                                    | one entry in the layer list                                                  |
| MCP tools           | own toolkit dir under `apps/server/src/mcp/toolkits/<feature>/` | one registration line                                                        |
| Web palette / menus | `apps/web/src/<feature>Palette.tsx` exporting a builder         | one `push(build…())`                                                         |
| Web components      | a feature directory (e.g. `apps/web/src/tandem/`)               | one import + one mount point                                                 |
| Tests               | `<feature>.test.ts` next to the fork module                     | none — never append fork tests to an upstream test file                      |

### When extraction is the wrong call

- **The fork schema needs a module-private upstream symbol.** Adding `export` upstream edits an upstream line; duplicating a branded id invites drift. Keep a short, contiguous added block instead.
- **Upstream references the fork symbol back.** Splitting creates an import cycle, and `Schema.Struct` evaluates at module load, crashing at startup.

### Cheap wins and helpers

- **Never rename an upstream symbol** or reformat/re-sort code around an insertion.
- **Pass module-private upstream helpers as parameters** into fork functions rather than exporting them from the upstream file.

## Anti-patterns

- Editing or reflowing existing upstream lines when an added line would do.
- Spreading one feature across many upstream sites instead of one fork module plus wiring.
- Appending fork tests into upstream test files.
- Adding a second prompt injection outside `turnContextPrompt.ts`.
- Sharing migration ids with `effect_sql_migrations`.
- Using `.gitattributes merge=ours` to silence conflicts (it silently drops upstream bugfixes).

## Two strategies for hot upstream files

- **Keep in place** when the fork change is small and additive or the file is cold upstream. Resolve occasional conflicts by hand.
- **Vendor a copy** when the fork replaces behavior in a hot upstream file: move the fork implementation to its own file, restore the upstream file, and switch at one mount point. After each upstream merge, inspect `git log -p $PREV..upstream/main -- <upstream file>` and port fixes deliberately.

## Checking your own work

Before considering a feature done, measure the upstream diff:

```bash
# Lines added relative to upstream/main. Over ~10 in one upstream file: extract.
git diff --numstat upstream/main...HEAD -- <files you touched>
```

## Fork glossary

| Term         | Meaning                                                                                                                                                                                                                           |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Board        | Cards a project keeps outside the thread timeline, in `fork_board_items`. A turn can read them through the turn-start prompt.                                                                                                     |
| Work mode    | How the next turn is framed: build, plan, debug, or swarm. Plan uses the provider's plan interaction mode. The other three use the default interaction mode. Debug and swarm add a fixed prefix when turn-context prompts are on. |
| Local domain | A `.localhost` name for a dev server this environment started, so a preview keeps a stable address.                                                                                                                               |

## Upstream sync procedure

Merge `upstream/main` into `main` **weekly** so conflict cost stays small.

1. **Create an isolated worktree** on a `sync-upstream` branch off `main` (`git worktree add -b sync-upstream ../<repo>-sync-upstream main`) and run `git merge --no-commit --no-ff upstream/main`.
2. **Resolve conflicts by rule:**
   - **Take upstream** for any fork backport of code now present in `upstream/main`.
   - **Re-apply thin wiring** on registration, branding, path, doc, and CI workflow files.
   - **Port fork logic deliberately** on heavily refactored upstream files by starting from `upstream/main` and re-porting fork hooks rather than line-by-line 3-way merging.
3. **Regenerate generated files** instead of hand-merging them:
   - `pnpm-lock.yaml`: run `vp i`
   - `apps/web/src/routeTree.gen.ts`: run the web build (`vp run --filter @t3tools/web build`)
   - Mobile context-chip icons (if touched): `node apps/mobile/scripts/sync-context-chip-icons.mjs`
4. **Verify before merging:**
   - Run targeted package typechecks (`vp run typecheck`) and per-feature test suites for every fork feature.
   - Open a PR against `InM1nd/t3code-jcode` (`gh pr create --repo InM1nd/t3code-jcode`) and wait for CI to go green.
   - Build and smoke-test a local Tandem RC (`scripts/fork/release-desktop.sh`).

## CI runners

Upstream's workflows in `.github/workflows/` target Blacksmith (`blacksmith-*` runner labels), a
paid fleet tied to upstream's account. That subscription does not carry over to a fork, so
unswapped jobs queue forever.

Swap every `blacksmith-*` runner label to a GitHub-hosted runner (`ubuntu-latest`, `macos-latest`,
`windows-latest`, or `ubuntu-24.04-arm`) with the original label kept as a trailing comment
(`runs-on: ubuntu-latest # blacksmith-8vcpu-ubuntu-2404`) so future syncs show what changed.

- **Playwright pin:** Keep Playwright jobs (`test_server` shards, `test_web`, and `build` in `.github/workflows/ci.yml`; `test_web` and `test_server` in `.github/workflows/release.yml`) pinned to `ubuntu-24.04` because Playwright does not ship an `ubuntu-26.04` (`ubuntu-latest`) build.
- **Release schedule:** Keep the scheduled nightly `cron` trigger commented out in `.github/workflows/release.yml` so the fork does not publish upstream nightlies.
