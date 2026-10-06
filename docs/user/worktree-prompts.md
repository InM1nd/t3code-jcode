# Worktree and other-thread servers

A thread that has its own Git worktree tells the agent, at the start of each turn, to keep edits, commits, and dev servers in that directory. The agent is asked to stop and confirm before using any other checkout of the same repository.

When another thread already has a local dev server running, the turn also lists that port and the thread that owns it. The agent is asked not to stop, reuse, or rebind that port without checking first. If Tandem cannot read the port list in time, the turn still starts.

If a command or file edit in the web chat uses a path outside the thread's worktree, that row notes the path the agent used.
