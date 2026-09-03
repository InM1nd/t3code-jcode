import * as Arr from "effect/Array";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { IsoDateTime } from "@t3tools/contracts";

import {
  PersistenceDecodeError,
  PersistenceSqlError,
  type TerminalSessionRegistryRepositoryError,
} from "./Errors.ts";

/**
 * TerminalSessionRegistryRepository - Repository interface for the live-PTY
 * pid registry.
 *
 * A row is a mirror of `TerminalManager`'s in-memory session state, written
 * so a crashed/killed `apps/server` process can be reconciled on the next
 * boot instead of leaking the OS process it spawned. See
 * `apps/server/src/terminal/TerminalSessionReconciliation.ts` for the reader.
 *
 * @module TerminalSessionRegistryRepository
 */

export const TerminalSessionRegistryRow = Schema.Struct({
  threadId: Schema.String,
  terminalId: Schema.String,
  pid: Schema.Int,
  shellCommand: Schema.String,
  worktreePath: Schema.NullOr(Schema.String),
  serverPid: Schema.Int,
  startedAt: IsoDateTime,
});
export type TerminalSessionRegistryRow = typeof TerminalSessionRegistryRow.Type;

export const RemoveTerminalSessionRegistryRowInput = Schema.Struct({
  threadId: Schema.String,
  terminalId: Schema.String,
});
export type RemoveTerminalSessionRegistryRowInput =
  typeof RemoveTerminalSessionRegistryRowInput.Type;

/**
 * TerminalSessionRegistryRepository - Service tag for terminal pid registry
 * persistence.
 */
export class TerminalSessionRegistryRepository extends Context.Service<
  TerminalSessionRegistryRepository,
  {
    /**
     * Insert or replace a terminal session row, keyed by (threadId, terminalId).
     */
    readonly upsert: (
      row: TerminalSessionRegistryRow,
    ) => Effect.Effect<void, TerminalSessionRegistryRepositoryError>;

    /**
     * List every registry row.
     */
    readonly list: () => Effect.Effect<
      ReadonlyArray<TerminalSessionRegistryRow>,
      TerminalSessionRegistryRepositoryError
    >;

    /**
     * Remove a row by its (threadId, terminalId) key.
     */
    readonly removeByKey: (
      input: RemoveTerminalSessionRegistryRowInput,
    ) => Effect.Effect<void, TerminalSessionRegistryRepositoryError>;
  }
>()("t3/persistence/TerminalSessionRegistry/TerminalSessionRegistryRepository") {}

const TerminalSessionRegistryRawRowSchema = Schema.Struct({
  threadId: Schema.String,
  terminalId: Schema.String,
  pid: Schema.Unknown,
  shellCommand: Schema.String,
  worktreePath: Schema.Unknown,
  serverPid: Schema.Unknown,
  startedAt: Schema.Unknown,
});

const decodeRow = Schema.decodeUnknownEffect(TerminalSessionRegistryRow);

const RemoveRequestSchema = RemoveTerminalSessionRegistryRowInput;

function toPersistenceSqlOrDecodeError(
  sqlOperation: string,
  decodeOperation: string,
  correlation?: { threadId: string },
) {
  return (cause: unknown): TerminalSessionRegistryRepositoryError =>
    Schema.isSchemaError(cause)
      ? PersistenceDecodeError.fromSchemaError(decodeOperation, cause, correlation)
      : new PersistenceSqlError({
          operation: sqlOperation,
          ...(correlation === undefined ? {} : { correlation }),
          cause,
        });
}

export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsertRow = SqlSchema.void({
    Request: TerminalSessionRegistryRow,
    execute: (row) =>
      sql`
        INSERT INTO terminal_session_registry (
          thread_id,
          terminal_id,
          pid,
          shell_command,
          worktree_path,
          server_pid,
          started_at
        )
        VALUES (
          ${row.threadId},
          ${row.terminalId},
          ${row.pid},
          ${row.shellCommand},
          ${row.worktreePath},
          ${row.serverPid},
          ${row.startedAt}
        )
        ON CONFLICT (thread_id, terminal_id)
        DO UPDATE SET
          pid = excluded.pid,
          shell_command = excluded.shell_command,
          worktree_path = excluded.worktree_path,
          server_pid = excluded.server_pid,
          started_at = excluded.started_at
      `,
  });

  const listRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: TerminalSessionRegistryRawRowSchema,
    execute: () =>
      sql`
        SELECT
          thread_id AS "threadId",
          terminal_id AS "terminalId",
          pid,
          shell_command AS "shellCommand",
          worktree_path AS "worktreePath",
          server_pid AS "serverPid",
          started_at AS "startedAt"
        FROM terminal_session_registry
        ORDER BY started_at ASC
      `,
  });

  const removeRowByKey = SqlSchema.void({
    Request: RemoveRequestSchema,
    execute: ({ threadId, terminalId }) =>
      sql`
        DELETE FROM terminal_session_registry
        WHERE thread_id = ${threadId} AND terminal_id = ${terminalId}
      `,
  });

  const upsert: TerminalSessionRegistryRepository["Service"]["upsert"] = (row) =>
    upsertRow(row).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "TerminalSessionRegistryRepository.upsert:query",
          "TerminalSessionRegistryRepository.upsert:encodeRequest",
          { threadId: row.threadId },
        ),
      ),
    );

  const list: TerminalSessionRegistryRepository["Service"]["list"] = () =>
    listRows(undefined).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "TerminalSessionRegistryRepository.list:query",
          "TerminalSessionRegistryRepository.list:decodeRows",
        ),
      ),
      Effect.flatMap((rows) =>
        // Skip rows that no longer decode instead of failing the whole list —
        // one stale row must not block reconciliation for every other session.
        Effect.forEach(rows, (row) =>
          decodeRow(row).pipe(
            Effect.map(Option.some),
            Effect.catch((cause) =>
              Effect.logWarning("terminal.session.registry.row-skipped", {
                threadId: row.threadId,
                terminalId: row.terminalId,
                error: PersistenceDecodeError.fromSchemaError(
                  "TerminalSessionRegistryRepository.list:decodeRows",
                  cause,
                  { threadId: row.threadId },
                ).message,
              }).pipe(Effect.as(Option.none<TerminalSessionRegistryRow>())),
            ),
          ),
        ),
      ),
      Effect.map((decoded) =>
        Arr.filterMap(decoded, (row) =>
          Option.isSome(row) ? Result.succeed(row.value) : Result.failVoid,
        ),
      ),
    );

  const removeByKey: TerminalSessionRegistryRepository["Service"]["removeByKey"] = (input) =>
    removeRowByKey(input).pipe(
      Effect.mapError(
        (cause) =>
          new PersistenceSqlError({
            operation: "TerminalSessionRegistryRepository.removeByKey:query",
            correlation: { threadId: input.threadId },
            cause,
          }),
      ),
    );

  return {
    upsert,
    list,
    removeByKey,
  } satisfies TerminalSessionRegistryRepository["Service"];
});

export const layer = Layer.effect(TerminalSessionRegistryRepository, make);
