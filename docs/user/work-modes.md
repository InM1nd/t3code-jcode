# Work modes

Each chat has its own work mode. Select it in the composer next to the access control, or use a slash command. The choice stays with the chat after a restart and does not change your provider, model, reasoning level, speed, or attachments.

## Modes

- **Build** — normal implementation work.
- **Plan** — inspect the task and prepare a plan before changing files.
- **Debug** — reproduce the issue, gather evidence, find the root cause, make the smallest safe fix, and verify it.
- **Swarm Lite** — break independent parts into roles, collect the results, and synthesize one answer.

Swarm Lite is a workflow, not a new T3-managed worker pool. A provider can use subagents it already supports; otherwise it works through the roles sequentially in the current chat.

## Slash commands

- `/build` — select Build
- `/default` — alias for Build
- `/plan` — select Plan
- `/debug` — select Debug
- `/swarm` — select Swarm Lite

Commands only switch the mode when sent by themselves, without attachments or other composer context. Otherwise they are sent to the agent as normal text.

Older chats that used the former `default` mode are shown as Build. Their next message saves the current Build mode.
