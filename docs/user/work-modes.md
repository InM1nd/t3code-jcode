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

A megathread is the boss of one feature. It splits the feature into [board](project-board.md) cards, hands each card to a worker subthread with its own worktree and model, has each branch reviewed, merges it into the feature branch, and runs one final verification. It does not write the feature code itself.

To start, open a thread on the feature branch, select Megathread, and describe the feature. The megathread proposes the cards and a model for each one, and delegates nothing until you approve. You merge the feature branch into main yourself.

To follow the workers, open the Board panel in the megathread. Its Workers list shows each worker's card, model, branch, status, and tokens spent, plus the feature total and the megathread's own share. Select a worker to open its thread. A card with a worker has a Worker link too.

It is worth it for a feature with three or more independent cards that each touch several files. For less, the megathread says so and Build is cheaper.

Stop on the megathread stops every worker. Progress is kept on the board, so the next message picks up from the cards. Worker worktrees stay until you accept the feature.

## Slash commands

- `/build` — select Build
- `/default` — alias for Build
- `/plan` — select Plan
- `/debug` — select Debug
- `/swarm` — select Megathread

A command switches the mode only when it is the whole message, with no attachments or other composer context. Otherwise it is sent to the agent as normal text.

Chats that already used Build or Plan keep that choice. Debug and Megathread are saved with the chat the next time you select them.
