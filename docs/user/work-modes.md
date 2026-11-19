# Work modes

Each chat has its own work mode. Select it in the composer on web and desktop, next to the access control, or send a slash command by itself. The choice stays with the chat and does not change the provider, model, reasoning level, or attachments.

Work mode is separate from the permission mode. A permission mode decides when the agent asks before acting. A work mode decides what kind of task the agent is doing.

## Modes

- **Build** — normal implementation work.
- **Plan** — inspect the task and prepare a plan before changing files. This uses the provider's plan mode.
- **Debug** — reproduce the issue, gather evidence, find the root cause, make the smallest safe fix, and verify it.
- **Megathread** — run one feature through worker subthreads. See below.

Debug and Megathread run as normal build turns with that extra instruction. Plan keeps the provider's own plan mode.

## Megathread

A megathread is the boss of one feature. It splits the feature into [board](project-board.md) cards, hands each card to a worker subthread with its own worktree and model, checks each branch, merges it into the feature branch, and runs the final checks. It does not write the feature code itself.

To start, open a thread on the feature branch, select Megathread, and describe the feature. The megathread proposes the cards, a model for each one, a cost profile, and a rough token estimate against doing it in one thread. It delegates nothing until you approve. You merge the feature branch into main yourself.

The profile sets how much checking you pay for. **Lean** skips reviewer threads, and the megathread runs the final checks itself. **Standard**, the default, reviews only cards that touch shared code, public interfaces, or several files. **Thorough** reviews every card and adds a separate verifier. To pick one, say so when you approve the plan, for example "approve, Lean".

A megathread costs several times a single thread, because every worker starts with a fresh context. It is worth it for three or more independent cards that each touch several files, or when finishing sooner matters. For less, the megathread says so and Build is cheaper.

To follow the workers, open the Workers tab: use the Workers button in the Board panel or "Toggle workers" in the command palette. It shows each worker's card, model, branch, status, and tokens spent, plus the feature total and the megathread's own share. Select a worker to open its thread. The tab also shows this thread's own tokens, so you can compare a megathread with a single-thread run.

Stop on the megathread stops every worker. Progress is kept on the board, so the next message picks up from the cards. Worker worktrees stay until you accept the feature.

## Slash commands

- `/build` — select Build
- `/default` — alias for Build
- `/plan` — select Plan
- `/debug` — select Debug
- `/swarm` — select Megathread

A command switches the mode only when it is the whole message, with no attachments or other composer context. Otherwise it is sent to the agent as normal text.

Chats that already used Build or Plan keep that choice. Debug and Megathread are saved with the chat the next time you select them.
