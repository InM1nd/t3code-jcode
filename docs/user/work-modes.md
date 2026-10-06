# Work modes

Each chat has its own work mode. Select it in the composer on web and desktop, next to the access control, or send a slash command by itself. The choice stays with the chat and does not change the provider, model, reasoning level, or attachments.

Work mode is separate from the permission mode. A permission mode decides when the agent asks before acting. A work mode decides what kind of task the agent is doing.

## Modes

- **Build** — normal implementation work.
- **Plan** — inspect the task and prepare a plan before changing files. This uses the provider's plan mode.
- **Debug** — reproduce the issue, gather evidence, find the root cause, make the smallest safe fix, and verify it.
- **Swarm Lite** — break independent parts into roles, collect the results, and write one answer.

Swarm Lite is a workflow, not a new pool of workers. A provider uses subagents it already supports. Otherwise it works through the roles one after another in the current chat.

Debug and Swarm Lite run as normal build turns with that extra instruction. Plan keeps the provider's own plan mode.

## Slash commands

- `/build` — select Build
- `/default` — alias for Build
- `/plan` — select Plan
- `/debug` — select Debug
- `/swarm` — select Swarm Lite

A command switches the mode only when it is the whole message, with no attachments or other composer context. Otherwise it is sent to the agent as normal text.

Chats that already used Build or Plan keep that choice. Debug and Swarm Lite are saved with the chat the next time you select them.
