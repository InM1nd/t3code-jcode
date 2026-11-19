import { assert, it } from "@effect/vitest";
import {
  NodeId,
  OrchestratorMcpFailure,
  ProjectBoardItemId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestratorMcpDelegateTaskInput,
  type OrchestratorMcpDelegateTaskResult,
  type ProjectBoardItem,
  type ProjectBoardUpsertInput,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import {
  registerTurnBoardItems,
  turnBoardItems,
} from "../../../orchestration-v2/turnContextPrompt.ts";
import { boardWorkerPrompt, dispatchBoardCard } from "./dispatch.ts";

const projectId = ProjectId.make("project-1");
const target = { providerInstanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" };

const card = (overrides: Partial<ProjectBoardItem> = {}): ProjectBoardItem => ({
  id: ProjectBoardItemId.make("card-1"),
  title: "Add the tab",
  status: "ready",
  source: "user",
  brief: {
    goal: "Show workers in a tab.",
    acceptanceCriteria: ["Lists child threads"],
    importantFiles: ["apps/web/src/components/RightPanelTabs.tsx"],
    notes: null,
  },
  createdAt: "2026-11-19T00:00:00.000Z",
  updatedAt: "2026-11-19T00:00:00.000Z",
  ...overrides,
});

const dispatch = (
  item: ProjectBoardItem,
  options: Partial<Parameters<typeof dispatchBoardCard>[0]> = {},
) => {
  const delegated: Array<OrchestratorMcpDelegateTaskInput> = [];
  const saved: Array<ProjectBoardUpsertInput> = [];
  return dispatchBoardCard({
    projectId,
    item,
    delegate: (task) => {
      delegated.push(task);
      return Effect.succeed({
        taskId: NodeId.make("task-1"),
        childThreadId: ThreadId.make("worker-1"),
        status: "running",
      } as OrchestratorMcpDelegateTaskResult);
    },
    save: (input) => {
      saved.push(input);
      return Effect.succeed(item);
    },
    ...options,
  }).pipe(
    Effect.map((result) => ({ result, delegated, saved })),
    Effect.catch((failure: OrchestratorMcpFailure) =>
      Effect.succeed({ failure, delegated, saved }),
    ),
  );
};

it.effect("starts a worker in its own worktree and records it on the card", () =>
  Effect.gen(function* () {
    const run = yield* dispatch(card({ execution: { role: "review", target } }));
    assert.deepStrictEqual(run.delegated, [
      {
        task: boardWorkerPrompt(card())!,
        title: "Add the tab",
        role: "review",
        isolation: "worktree",
        mode: "async",
        target,
      },
    ]);
    assert.equal(run.saved[0]?.status, "inProgress");
    assert.deepStrictEqual(run.saved[0]?.execution, {
      role: "review",
      target,
      threadId: ThreadId.make("worker-1"),
      taskId: NodeId.make("task-1"),
    });
    assert.equal("result" in run ? run.result.childThreadId : null, ThreadId.make("worker-1"));
  }),
);

it.effect("defaults to an implementation worker on the caller's model", () =>
  Effect.gen(function* () {
    const run = yield* dispatch(card());
    assert.equal(run.delegated[0]?.role, "implementation");
    assert.equal("target" in run.delegated[0]!, false);
  }),
);

it.effect("refuses a card without a brief", () =>
  Effect.gen(function* () {
    const run = yield* dispatch(card({ brief: null }));
    assert.match("failure" in run ? run.failure.message : "", /no brief/);
    assert.deepStrictEqual([run.delegated, run.saved], [[], []]);
  }),
);

it.effect("refuses a second worker unless redispatch is set", () =>
  Effect.gen(function* () {
    const running = card({ execution: { threadId: ThreadId.make("worker-0") } });
    const refused = yield* dispatch(running);
    assert.match("failure" in refused ? refused.failure.message : "", /worker-0/);
    assert.equal(refused.delegated.length, 0);

    const again = yield* dispatch(running, { redispatch: true });
    assert.equal(again.delegated.length, 1);
  }),
);

it("gives the worker the brief and the card to report to", () => {
  const prompt = boardWorkerPrompt(card())!;
  assert.include(prompt, "Goal: Show workers in a tab.");
  assert.include(prompt, "- Lists child threads");
  assert.include(prompt, "board_handoff on card-1");
});

it.effect("sends a delegated child no board digest", () =>
  Effect.gen(function* () {
    registerTurnBoardItems(() => Effect.succeed([card()]));
    const child = yield* turnBoardItems(projectId, { relationshipToParent: "subagent" });
    const fork = yield* turnBoardItems(projectId, { relationshipToParent: "fork" });
    assert.deepStrictEqual([child.length, fork.length], [0, 1]);
  }),
);
