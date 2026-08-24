# Fork isolation rules

This is a fork of `pingdotgg/t3code`. Upstream moves fast (289 commits in the
window that produced 45 fork commits), so every fork line that sits inside an
upstream file is a line you may have to re-apply by hand at merge time.

The rule is not "don't touch upstream files" — data models and registrations
have to be wired somewhere. The rule is **how much** you touch them, and how.

## The budget

**A feature may add at most ~10 lines to any upstream file, and they must be
additions, not edits of existing lines.**

Git resolves an added block far more often than a changed line. Rewriting an
upstream line — even to add `export` — turns a clean auto-merge into a conflict.

## The three legal shapes of an upstream touch

1. **One import line.**
2. **One registration** appended to a list: `actionItems.push(...)`, a layer in `Layer.mergeAll`, a union member, an `export *` in a barrel.
3. **One field** added to an existing schema, when the data genuinely belongs there. Always `Schema.optional` + a decoding default.

Anything else belongs in a fork-owned file.

## Patterns by layer

| Layer               | Fork-owned file                                         | Upstream touch                                                                                               |
| ------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Contracts           | `packages/contracts/src/<feature>.ts`                   | `export * from "./<feature>.ts";` in `index.ts`, plus union members / field references in `orchestration.ts` |
| Decider             | `apps/server/src/orchestration/decider.<feature>.ts`    | one delegating case group in `decider.ts`                                                                    |
| Reactors / services | own file under `Layers/` or `Services/`                 | one entry in the layer list                                                                                  |
| MCP tools           | own toolkit dir under `mcp/toolkits/<feature>/`         | one registration line                                                                                        |
| Web palette / menus | `apps/web/src/<feature>Palette.tsx` exporting a builder | one `push(build…())`                                                                                         |
| Web components      | `<Feature>.logic.ts` for logic, thin JSX                | one import + one mount point                                                                                 |
| Tests               | `<feature>.test.ts` next to the fork module             | none — never append fork tests to an upstream test file                                                      |

### When extraction is the wrong call

Two cases where the inline block wins, both hit while extracting the board:

- **The fork schema needs a module-private upstream symbol.** `ChatFileAttachment` uses `ChatAttachmentId`, which upstream does not export. Moving the schema out would mean adding `export` upstream (a changed line) or duplicating a branded id. Both cost more than the ~24 inline lines they save. Keep the block, keep it contiguous.
- **Upstream references the fork symbol back.** `OrchestrationProjectActivityItem` depends on `ModelSelection` (upstream) and is referenced by the upstream RPC schema list. Splitting it creates an import cycle, and `Schema.Struct` evaluates at module load, so a cycle is a crash, not a warning.

A contiguous added block is the second-best shape after a separate file. What
you must never do is scatter the same feature across ten upstream sites.

### Cheap wins that are not extraction

Removing churn is often worth more than moving code:

- **Never rename an upstream symbol.** The fork renamed `PROVIDER_SEND_TURN_MAX_IMAGE_BYTES` to `…_ATTACHMENT_BYTES` with a deprecated alias; no caller outside contracts ever used the new name. Reverting it removed 10 changed lines and two reflowed structs.
- **Keep upstream's formatting.** Widening an enum from one line to a five-line array turns 1 changed line into 7. `Schema.Literals(["default", "build", "plan", "debug", "swarm"])` conflicts less than the same values stacked vertically.

### Module-private upstream helpers

If fork code needs a helper that upstream keeps module-private (`nowIso`,
`withEventBase` in `decider.ts`), **pass it in as a parameter**. Adding `export`
to the upstream declaration edits an upstream line for no functional gain.

```ts
// decider.projectBoard.ts — helpers arrive as arguments
export const decideProjectBoardCommand = Effect.fn(...)(function* ({
  command, readModel, nowIso, withEventBase,
}) { ... });
```

## Anti-patterns

- Reformatting or re-sorting code around your insertion. Every reflowed line is a conflict you volunteered for.
- Renaming upstream symbols.
- Changing an existing line when an added line would do.
- Spreading one feature across many upstream files instead of one module plus wiring.
- Appending fork tests into upstream test files.

## Checking your own work

Before you consider a feature done:

```bash
MB=$(git merge-base main upstream/main)

# Lines this feature added to upstream files. Over ~10 in one file: extract.
git diff --numstat $MB -- <files you touched>

# Definitive: what would conflict if you merged upstream right now.
git merge-tree --write-tree --name-only main upstream/main
```

`merge-tree` is read-only — it never touches the working tree.

## Files the fork rewrote, and what to do about them

Some fork work is not an addition — it _replaces_ upstream behaviour. Extraction
cannot help there: you cannot express "this upstream block no longer exists" as
a file of your own. Measure before deciding, with both numbers that matter:

```bash
MB=$(git merge-base main upstream/main)
git diff --numstat $MB -- <file>              # how much we changed
git rev-list --count $MB..upstream/main -- <file>   # how hot the file is upstream
```

Current state of this fork:

| File                                               | Fork diff | Upstream commits since base | Nature                                                                     |
| -------------------------------------------------- | --------- | --------------------------- | -------------------------------------------------------------------------- |
| `apps/web/src/components/Sidebar.tsx`              | 301+/242− | 23                          | replaced the global settled tail / snoozed shelf with per-project grouping |
| `apps/web/src/components/ChatView.tsx`             | 142+/37−  | 24                          | ~31 scattered small edits                                                  |
| `apps/web/src/components/chat/ChatComposer.tsx`    | 273+/116− | 12                          | file attachments, composer actions                                         |
| `apps/web/src/components/SidebarStageBackdrop.tsx` | 73+/100−  | 2                           | replaced decorative art                                                    |

Whitespace accounts for under 20 lines in each — this is real divergence, not
formatting churn.

### Two strategies

**Keep in place** when the change is mostly additive or the file is cold
upstream (`SidebarStageBackdrop`: 2 commits). Resolve the occasional conflict by
hand; the cost is minutes per merge.

**Vendor a copy** when the fork fully replaced behaviour _and_ the file is hot
(`Sidebar.tsx`: 242 deletions × 23 upstream commits). Move the fork version to
`ForkSidebar.tsx`, restore the upstream file byte-for-byte, and switch at the
single mount point.

- Upside: the upstream file goes to zero diff and never conflicts again. Upstream's version keeps arriving intact, so you can read what changed instead of resolving it blind at merge time.
- Cost: upstream fixes to that component stop reaching the fork automatically. This is already true in practice — the fork deleted that code — but vendoring makes it visible instead of hiding it inside a conflict.
- Obligation: after each upstream merge, `git log -p $PREV..upstream/main -- <upstream file>` and port deliberately. Put it in the merge checklist or the copy rots.

Do **not** use `.gitattributes merge=ours` for this. It resolves the conflict by
silently discarding upstream's side, including bugfixes, with no record that
anything was dropped.

## Merge cadence

Merge `upstream/main` **weekly**, not when it becomes urgent. Conflict cost
grows superlinearly with distance: the further behind you are, the more likely
upstream has rewritten the exact file you edited. A merge that takes fifteen
minutes weekly takes a day after three months.

## Worked example

The project board and rollover features, after extraction:

| File                                           | Fork lines before | After |
| ---------------------------------------------- | ----------------- | ----- |
| `apps/server/src/orchestration/decider.ts`     | 180               | 9     |
| `packages/contracts/src/orchestration.ts`      | 309               | 170   |
| `packages/contracts/src/orchestration.test.ts` | 170               | 73    |
| `apps/web/src/components/CommandPalette.tsx`   | 79                | 18    |

The moved code did not shrink — it lives in `decider.projectBoard.ts`,
`projectBoard.ts`, `projectBoard.test.ts`, `projectBoardPalette.tsx`,
`composerAttachmentsPalette.tsx`, and `threadRollover.tsx`, which upstream will
never touch.
