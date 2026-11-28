/**
 * `board_dispatch`: start one worker subthread for one board card.
 *
 * The prompt is built here rather than by the calling agent, so a worker always
 * starts from the card's exact brief and the same contract.
 */
import {
  OrchestratorMcpFailure,
  type OrchestratorMcpDelegateTaskInput,
  type OrchestratorMcpDelegateTaskResult,
  type OrchestratorMcpTarget,
  type OrchestratorMcpTaskRole,
  type ProjectBoardItem,
  type ProjectBoardUpsertInput,
  type ProjectId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

const refusal = (message: string) =>
  new OrchestratorMcpFailure({ code: "invalid_request", message });

const list = (title: string, entries: ReadonlyArray<string>) =>
  entries.length === 0 ? [] : ["", title, ...entries.map((entry) => `- ${entry}`)];

/** The worker's whole task: the card's brief, then what every worker owes the board. */
export function boardWorkerPrompt(item: ProjectBoardItem): string | null {
  const brief = item.brief;
  if (!brief) return null;
  return [
    `You are the worker for board card ${item.id}: ${item.title}`,
    "",
    `Goal: ${brief.goal}`,
    ...list("Acceptance criteria:", brief.acceptanceCriteria),
    ...list("Important files:", brief.importantFiles),
    ...(brief.notes ? ["", "Notes:", brief.notes] : []),
    "",
    "Contract:",
    "- Work only in your own worktree. Do not edit or run code in another checkout.",
    "- Do only this card. Report anything else you find instead of fixing it.",
    "- Run the tests for what you touched, then commit on your branch. Do not push or open a pull request.",
    `- Call board_handoff on ${item.id} with what you did and what is left, then board_set_status to inReview.`,
    "- End with your branch name (`git branch --show-current`) and the commands you ran to verify.",
  ].join("\n");
}

export const dispatchBoardCard = Effect.fn("mcp.board.dispatch")(function* (input: {
  readonly projectId: ProjectId;
  readonly item: ProjectBoardItem;
  readonly role?: OrchestratorMcpTaskRole | undefined;
  readonly target?: OrchestratorMcpTarget | undefined;
  readonly redispatch?: boolean | undefined;
  readonly delegate: (
    task: OrchestratorMcpDelegateTaskInput,
  ) => Effect.Effect<OrchestratorMcpDelegateTaskResult, OrchestratorMcpFailure>;
  readonly save: (
    card: ProjectBoardUpsertInput,
  ) => Effect.Effect<ProjectBoardItem, OrchestratorMcpFailure>;
}) {
  const { item } = input;
  const prompt = boardWorkerPrompt(item);
  if (prompt === null) {
    return yield* refusal(
      `Board item '${item.id}' has no brief. Give it a goal, acceptance criteria, and important files with board_upsert before dispatching.`,
    );
  }
  const running = item.execution?.threadId;
  if (running !== undefined && !input.redispatch) {
    return yield* refusal(
      `Board item '${item.id}' already has a worker in thread ${running}. Send it follow-ups with t3_thread_send, or pass redispatch to start a new worker in a new worktree.`,
    );
  }
  const role = input.role ?? item.execution?.role ?? "implementation";
  const target = input.target ?? item.execution?.target;
  const task = yield* input.delegate({
    task: prompt,
    title: item.title,
    role,
    isolation: "worktree",
    mode: "async",
    ...(target === undefined ? {} : { target }),
  });
  yield* input.save({
    projectId: input.projectId,
    itemId: item.id,
    title: item.title,
    status: "inProgress",
    execution: {
      role,
      ...(target === undefined ? {} : { target }),
      ...(task.childThreadId === null ? {} : { threadId: task.childThreadId }),
      taskId: task.taskId,
    },
  });
  return {
    projectId: input.projectId,
    itemId: item.id,
    taskId: task.taskId,
    childThreadId: task.childThreadId,
    status: task.status,
  };
});
