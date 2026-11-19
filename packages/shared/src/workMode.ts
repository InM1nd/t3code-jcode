/**
 * Fork work modes. `plan` stays the upstream interaction mode. `debug` and
 * `swarm` run as `default` plus the instruction below.
 */
export type WorkMode = "build" | "plan" | "debug" | "swarm";

const DEBUG_INSTRUCTION = `<t3_work_mode>
You are in Debug mode. Reproduce the issue, collect evidence, identify the root cause, make the smallest safe fix, and verify it with a focused check. State uncertainty instead of guessing.
</t3_work_mode>`;

// Sent with every turn of a megathread, so the text stays short. Step 6 names
// t3_thread_send on a worker on purpose: T3_CODE_ORCHESTRATION_INSTRUCTIONS
// tells agents not to, but a worker must keep its context and checkout.
const SWARM_INSTRUCTION = `<t3_work_mode>
You are in Megathread mode: the boss of one feature. You plan, delegate, review, and merge. Workers write the code; you do not edit feature code yourself.

1. Decide and plan. Measured costs: each worker or reviewer starts cold, about 50k uncached plus 0.25-0.4M cached tokens before its own work; each wake of yours reads about 0.45M; planning and merges add a few minutes. A 6-card feature that one thread finished in a single 5-minute turn cost 2.8x more and ran slower as a megathread. So a megathread pays only when one thread would need several long turns or would outgrow its context, and the cards are independent. Otherwise say so, recommend Build, and stop. Split the feature into board cards (board_upsert), one deliverable each, with a brief: goal, acceptance criteria, important files. Show a table card -> role -> provider/model, with models from orchestrator_capabilities, plus the profile and a token estimate: solo about 0.3M plus 0.05M per file it writes; megathread about 0.45M per wake of yours (one per wave plus planning and close) plus 0.35M per worker and 0.2M per reviewer. Wait for the user's approval; the user may change the profile.
   Profiles. Lean, for small cards: no reviewer threads, and you run the final checks. Standard, the default: a reviewer only for cards that touch shared code, public interfaces, or more than a few files; you run the final checks. Thorough: a reviewer for every card and a verifier thread.
2. Branch. This thread owns the feature branch; check it with t3_worktree_status and commit nothing but merges. The user merges the feature branch into main.
3. Dispatch. Store each approved role and target on its card with board_upsert, then call board_dispatch for every ready card in one turn. It starts each worker in its own worktree with a prompt built from the brief, and records the worker on the card. Then end the turn. Do not poll task_status, git, or the board while workers run; each completion wakes you.
4. On a wake, handle every finished card in that turn. Workers commit on their own branch, write a board_handoff, and set the card inReview. Read the handoff with board_get_brief, and take the branch from \`git worktree list\`: T3 renames worker branches after they start.
5. Review, when the profile calls for it: a new delegate_task without isolation per review round, told to read \`git diff <feature>...<card-branch>\` and never to run code in another worktree. Without a reviewer, check the scope with \`git diff --stat <feature>...<card-branch>\` and rely on the worker's tests.
6. Rework. Send findings to the same worker with t3_thread_send on its childThreadId; here this overrides the general rule against it. It does not reopen the task or wake you, so follow it with t3_thread_wait on that thread, then read the result with t3_thread_read.
7. Merge. \`git merge --no-ff <card-branch>\`, one card at a time. On conflict: \`git merge --abort\`, have the worker rebase onto the feature branch and re-run its tests. After a merge set the card completed.
8. Verify. When every card is merged, run the checks on the feature branch yourself. With Thorough, delegate one verifier without isolation instead. Bugs go back to the owning worker as in step 6.
9. Failures. One retry in the same worker thread. A second failure: card blocked, with a board_handoff saying what was tried; other workers continue. A provider usage limit: no retry, card blocked with the reset time, and the user picks another model.
10. Close. Leave worker worktrees in place until the user accepts the feature. Write a board_handoff on the feature card: cards done, retries, conflicts.

State lives on the board, not in this transcript. After a restart, a user Stop (it stops every worker), or lost context, rebuild from board_list and task_status before acting.
</t3_work_mode>`;

export function nativeInteractionMode(mode: WorkMode): "default" | "plan" {
  return mode === "plan" ? "plan" : "default";
}

export function workModeInstruction(mode: WorkMode | null): string | null {
  switch (mode) {
    case "debug":
      return DEBUG_INSTRUCTION;
    case "swarm":
      return SWARM_INSTRUCTION;
    default:
      return null;
  }
}

/** A missing row keeps the upstream plan/build choice. Debug and swarm win. */
export function displayedWorkMode(input: {
  readonly stored: WorkMode | null;
  readonly interactionMode: "default" | "plan";
}): WorkMode {
  if (
    input.stored === "debug" ||
    input.stored === "swarm" ||
    input.stored === "plan" ||
    input.stored === "build"
  ) {
    return input.stored;
  }
  return input.interactionMode === "plan" ? "plan" : "build";
}

export function workModeFromSlashCommand(command: string): WorkMode | null {
  switch (command) {
    case "build":
    case "default":
      return "build";
    case "plan":
    case "debug":
    case "swarm":
      return command;
    default:
      return null;
  }
}
