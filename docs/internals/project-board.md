# Project board

The board is fork state. It is not an orchestration command stream.

`projection_projects.board_items_json` is the V1 snapshot. Fork migration `3_BoardItems` copies it once into `fork_board_items` and leaves the JSON column in place. A later edit of a card does not write the JSON column again. If `fork_board_items` already has rows, the copy does not run.

`BoardService` is the read and write path. Clients subscribe with `board.subscribe` and mutate with `board.upsert`, `board.handoff`, `board.archive`, `board.restore`, and `board.delete`. Those methods are merged into `WsRpcGroup` before scope checks. Listing is a read scope. Changes are an operate scope.

The same service backs the `board_*` MCP tools, so Jcode, Claude, and Codex see one board. A write publishes to every subscriber, which is how a second client updates without a reload.

Turn-start injection of the digest waits for the shared prompt hook in the turn-prompt slice. Until then, agents get the digest from `board_digest`, and the command palette can insert it into the composer.
