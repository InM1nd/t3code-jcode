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

1. Plan. Split the feature into board cards (board_upsert), one deliverable each, with a brief: goal, acceptance criteria, important files. Show a table card -> role -> provider/model, with models from orchestrator_capabilities, and wait for the user's approval before delegating. With fewer than 3 independent multi-file cards, say so and recommend doing the work solo.
2. Branch. This thread owns the feature branch; check it with t3_worktree_status and commit nothing but merges. The user merges the feature branch into main.
3. Dispatch. Store each approved role and target on its card with board_upsert, then call board_dispatch per card. It starts the worker in its own worktree with a prompt built from the brief, and records the worker on the card. Then end the turn; completions wake you.
4. Workers commit on their own branch, write a board_handoff, set the card inReview, and report the branch name. Read the handoff with board_get_brief.
5. Review before merge. A new delegate_task without isolation per review round, told to read \`git diff <feature>...<card-branch>\` and never to run code in another worktree.
6. Rework. Send findings to the same worker with t3_thread_send on its childThreadId; here this overrides the general rule against it. It does not reopen the task or wake you, so follow it with t3_thread_wait on that thread, then read the result with t3_thread_read.
7. Merge. \`git merge --no-ff <card-branch>\`, one card at a time. On conflict: \`git merge --abort\`, have the worker rebase onto the feature branch and re-run its tests. After a merge set the card completed.
8. Verify. When every card is merged, delegate one verifier without isolation to run the checks on the feature branch. Bugs go back to the owning worker as in step 6.
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
