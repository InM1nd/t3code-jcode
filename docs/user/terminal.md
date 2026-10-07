# Terminal history

Each terminal keeps up to 5,000 lines and 8 MiB of scrollback on its environment
server. T3 Code removes the oldest output when either limit is reached. A long
line can be shortened at the start. New terminal output is not truncated.

These limits apply when you reconnect and when T3 Code restores saved terminal
history. A client can show less scrollback than the server keeps.

If the app stops without a clean shutdown, a command that was still running in
a terminal is stopped the next time that server starts. Start the command again
if you still need it. Another app using the same data is left alone while it is
still running.
