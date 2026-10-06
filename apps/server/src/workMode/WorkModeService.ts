/**
 * One work mode per thread, outside the orchestration event log.
 * A missing row means the client should keep the upstream plan/build choice.
 */
import {
  ThreadId,
  WorkMode,
  WorkModeServiceError,
  type WorkMode as WorkModeValue,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";

const decodeMode = Schema.decodeUnknownEffect(WorkMode);
const readFailure = new WorkModeServiceError({ message: "Could not read the work mode." });

let registeredWorkMode: ((threadId: ThreadId) => Effect.Effect<WorkModeValue | null>) | null = null;

/** The service registers the shared reader when it starts. Tests leave this unset. */
function registerTurnWorkMode(
  read: (threadId: ThreadId) => Effect.Effect<WorkModeValue | null>,
): void {
  registeredWorkMode = read;
}

export function turnWorkMode(threadId: ThreadId): Effect.Effect<WorkModeValue | null> {
  const read = registeredWorkMode;
  if (!read) return Effect.succeed(null);
  return read(threadId).pipe(
    Effect.timeout(Duration.seconds(2)),
    Effect.catchCause(() => Effect.succeed(null)),
  );
}

export class WorkModeService extends Context.Service<
  WorkModeService,
  {
    readonly get: (threadId: ThreadId) => Effect.Effect<WorkModeValue | null, WorkModeServiceError>;
    readonly subscribe: (
      threadId: ThreadId,
    ) => Stream.Stream<
      { readonly threadId: ThreadId; readonly mode: WorkModeValue | null },
      WorkModeServiceError
    >;
    readonly set: (
      threadId: ThreadId,
      mode: WorkModeValue,
    ) => Effect.Effect<
      { readonly threadId: ThreadId; readonly mode: WorkModeValue },
      WorkModeServiceError
    >;
  }
>()("t3/workMode/WorkModeService") {}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const changes = yield* PubSub.unbounded<ThreadId>();

  const read = (threadId: ThreadId) =>
    sql<{ readonly mode: string }>`
      SELECT mode
      FROM fork_thread_work_modes
      WHERE thread_id = ${threadId}
    `.pipe(
      Effect.mapError(() => readFailure),
      Effect.flatMap((rows) => {
        const mode = rows[0]?.mode;
        if (mode === undefined) return Effect.succeed(null);
        return decodeMode(mode).pipe(
          Effect.mapError(() => readFailure),
          Effect.orElseSucceed(() => null),
        );
      }),
    );

  const snapshot = (threadId: ThreadId) =>
    read(threadId).pipe(Effect.map((mode) => ({ threadId, mode })));

  const publish = (threadId: ThreadId) => PubSub.publish(changes, threadId).pipe(Effect.asVoid);

  const subscribe: WorkModeService["Service"]["subscribe"] = (threadId) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const subscription = yield* PubSub.subscribe(changes);
        return Stream.concat(
          Stream.fromEffect(snapshot(threadId)),
          Stream.fromSubscription(subscription).pipe(
            Stream.filter((id) => id === threadId),
            Stream.mapEffect(() => snapshot(threadId)),
          ),
        );
      }),
    );

  const set: WorkModeService["Service"]["set"] = (threadId, mode) =>
    sql`
      INSERT INTO fork_thread_work_modes (thread_id, mode)
      VALUES (${threadId}, ${mode})
      ON CONFLICT (thread_id) DO UPDATE SET mode = ${mode}
    `.pipe(
      Effect.mapError(() => new WorkModeServiceError({ message: "Could not save the work mode." })),
      Effect.andThen(publish(threadId)),
      Effect.as({ threadId, mode }),
    );

  registerTurnWorkMode((threadId) => read(threadId).pipe(Effect.orElseSucceed(() => null)));

  return { get: read, subscribe, set };
});

export const layer = Layer.effect(WorkModeService, make);
