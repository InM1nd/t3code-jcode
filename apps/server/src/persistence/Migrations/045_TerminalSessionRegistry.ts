import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS terminal_session_registry (
      thread_id TEXT NOT NULL,
      terminal_id TEXT NOT NULL,
      pid INTEGER NOT NULL,
      shell_command TEXT NOT NULL,
      worktree_path TEXT,
      server_pid INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      PRIMARY KEY (thread_id, terminal_id)
    )
  `;
});
