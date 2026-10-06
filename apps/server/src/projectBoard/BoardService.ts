/**
 * Project board storage.
 *
 * Cards live in `fork_board_items`. The legacy `board_items_json` column stays
 * as the restore source and is not written again.
 */
import {
  BoardServiceError,
  PROJECT_BOARD_ITEM_LIMIT,
  ProjectBoardHandoffId,
  ProjectBoardItem,
  ProjectId,
  type ProjectBoardHandoffInput,
  type ProjectBoardItem as ProjectBoardItemShape,
  type ProjectBoardSnapshot,
  type ProjectBoardUpsertInput,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PubSub from "effect/PubSub";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";
import {
  mergeProjectBoardExternalRefs,
  mergeProjectBoardLinkedTurnIds,
  mergeProjectBoardRelatedItemIds,
  pushProjectBoardHandoffHistory,
} from "@t3tools/shared/projectBoard";

import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";

const itemJson = Schema.fromJsonString(ProjectBoardItem);
const decodeItem = Schema.decodeUnknownEffect(itemJson);
const encodeItem = Schema.encodeUnknownEffect(itemJson);
const readFailure = new BoardServiceError({ message: "Could not read the project board." });

export class BoardService extends Context.Service<
  BoardService,
  {
    readonly list: (projectId: ProjectId) => Effect.Effect<ProjectBoardSnapshot, BoardServiceError>;
    readonly subscribe: (
      projectId: ProjectId,
    ) => Stream.Stream<ProjectBoardSnapshot, BoardServiceError>;
    readonly upsert: (
      input: ProjectBoardUpsertInput,
    ) => Effect.Effect<ProjectBoardItemShape, BoardServiceError>;
    readonly appendHandoff: (
      input: ProjectBoardHandoffInput,
    ) => Effect.Effect<ProjectBoardItemShape, BoardServiceError>;
    readonly archive: (
      projectId: ProjectId,
      itemId: ProjectBoardItemShape["id"],
    ) => Effect.Effect<ProjectBoardItemShape, BoardServiceError>;
    readonly restore: (
      projectId: ProjectId,
      itemId: ProjectBoardItemShape["id"],
    ) => Effect.Effect<ProjectBoardItemShape, BoardServiceError>;
    readonly delete: (
      projectId: ProjectId,
      itemId: ProjectBoardItemShape["id"],
    ) => Effect.Effect<void, BoardServiceError>;
  }
>()("t3/projectBoard/BoardService") {}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const projects = yield* ProjectStore.ProjectStoreV2;
  const crypto = yield* Crypto.Crypto;
  const changes = yield* PubSub.unbounded<ProjectId>();

  const nowIso = Effect.map(DateTime.now, DateTime.formatIso);

  const requireProject = (projectId: ProjectId) =>
    projects.get(projectId).pipe(
      Effect.mapError(() => new BoardServiceError({ message: "Could not read the project." })),
      Effect.flatMap((project) =>
        Option.match(project, {
          onNone: () =>
            Effect.fail(
              new BoardServiceError({ message: `Project '${projectId}' was not found.` }),
            ),
          onSome: (row) => Effect.succeed(row),
        }),
      ),
    );

  const readItems = (projectId: ProjectId) =>
    sql<{ readonly item_json: string }>`
      SELECT item_json
      FROM fork_board_items
      WHERE project_id = ${projectId}
      ORDER BY position ASC, item_id ASC
    `.pipe(
      Effect.mapError(() => readFailure),
      Effect.flatMap((rows) =>
        Effect.forEach(rows, (row) =>
          decodeItem(row.item_json).pipe(Effect.mapError(() => readFailure)),
        ),
      ),
    );

  const snapshot = (projectId: ProjectId) =>
    readItems(projectId).pipe(Effect.map((items) => ({ projectId, items })));

  const publish = (projectId: ProjectId) => PubSub.publish(changes, projectId).pipe(Effect.asVoid);

  const nextPosition = (projectId: ProjectId) =>
    sql<{ readonly next_position: number | null }>`
      SELECT COALESCE(MAX(position), -1) + 1 AS next_position
      FROM fork_board_items
      WHERE project_id = ${projectId}
    `.pipe(
      Effect.mapError(() => readFailure),
      Effect.map((rows) => Number(rows[0]?.next_position ?? 0)),
    );

  const writeItem = (projectId: ProjectId, item: ProjectBoardItemShape, position: number | null) =>
    Effect.gen(function* () {
      const json = yield* encodeItem(item).pipe(
        Effect.mapError(
          () => new BoardServiceError({ message: "Could not save the project board card." }),
        ),
      );
      const statement =
        position === null
          ? sql`
            UPDATE fork_board_items
            SET item_json = ${json}, updated_at = ${item.updatedAt}
            WHERE project_id = ${projectId} AND item_id = ${item.id}
          `
          : sql`
            INSERT INTO fork_board_items (
              project_id,
              item_id,
              position,
              updated_at,
              item_json
            )
            VALUES (
              ${projectId},
              ${item.id},
              ${position},
              ${item.updatedAt},
              ${json}
            )
          `;
      yield* statement.pipe(
        Effect.mapError(
          () => new BoardServiceError({ message: "Could not save the project board card." }),
        ),
      );
    });

  const requireItem = (projectId: ProjectId, itemId: ProjectBoardItemShape["id"]) =>
    readItems(projectId).pipe(
      Effect.flatMap((items) => {
        const item = items.find((entry) => entry.id === itemId);
        return item === undefined
          ? Effect.fail(
              new BoardServiceError({
                message: `Board item '${itemId}' was not found on project '${projectId}'.`,
              }),
            )
          : Effect.succeed(item);
      }),
    );

  const list: BoardService["Service"]["list"] = (projectId) =>
    requireProject(projectId).pipe(Effect.andThen(snapshot(projectId)));

  const subscribe: BoardService["Service"]["subscribe"] = (projectId) =>
    Stream.unwrap(
      Effect.gen(function* () {
        // Subscribe before the snapshot so a write between the two is buffered.
        const subscription = yield* PubSub.subscribe(changes);
        return Stream.concat(
          Stream.fromEffect(list(projectId)),
          Stream.fromSubscription(subscription).pipe(
            Stream.filter((id) => id === projectId),
            Stream.mapEffect(() => list(projectId)),
          ),
        );
      }),
    );

  const upsert: BoardService["Service"]["upsert"] = (input) =>
    Effect.gen(function* () {
      yield* requireProject(input.projectId);
      const items = yield* readItems(input.projectId);
      const existing = items.find((entry) => entry.id === input.itemId);
      if (!existing && items.length >= PROJECT_BOARD_ITEM_LIMIT) {
        return yield* new BoardServiceError({
          message: `Project board is limited to ${PROJECT_BOARD_ITEM_LIMIT} items.`,
        });
      }
      const occurredAt = yield* nowIso;
      const item: ProjectBoardItemShape = {
        id: input.itemId,
        title: input.title,
        status: input.status,
        notes: input.notes === undefined ? (existing?.notes ?? null) : input.notes,
        brief: input.brief === undefined ? (existing?.brief ?? null) : input.brief,
        latestHandoff: existing?.latestHandoff ?? null,
        handoffHistory: existing?.handoffHistory ?? [],
        source: input.source ?? existing?.source ?? "user",
        sourceThreadId:
          input.sourceThreadId === undefined
            ? (existing?.sourceThreadId ?? null)
            : input.sourceThreadId,
        linkedTurnIds: mergeProjectBoardLinkedTurnIds({
          existing: existing?.linkedTurnIds,
          ...(input.linkedTurnIds !== undefined ? { linkedTurnIds: input.linkedTurnIds } : {}),
          ...(input.linkTurnId !== undefined ? { linkTurnId: input.linkTurnId } : {}),
        }),
        area: input.area === undefined ? (existing?.area ?? null) : input.area,
        externalRefs: mergeProjectBoardExternalRefs({
          existing: existing?.externalRefs,
          ...(input.externalRefs !== undefined ? { externalRefs: input.externalRefs } : {}),
        }),
        relatedItemIds: mergeProjectBoardRelatedItemIds({
          existing: existing?.relatedItemIds,
          ...(input.relatedItemIds !== undefined ? { relatedItemIds: input.relatedItemIds } : {}),
          selfId: input.itemId,
        }),
        archivedAt: existing?.archivedAt ?? null,
        createdAt: existing?.createdAt ?? occurredAt,
        updatedAt: occurredAt,
      };
      const position = existing ? null : yield* nextPosition(input.projectId);
      yield* writeItem(input.projectId, item, position);
      yield* publish(input.projectId);
      return item;
    });

  const appendHandoff: BoardService["Service"]["appendHandoff"] = (input) =>
    Effect.gen(function* () {
      yield* requireProject(input.projectId);
      const existing = yield* requireItem(input.projectId, input.itemId);
      const occurredAt = yield* nowIso;
      const handoffId = ProjectBoardHandoffId.make(
        yield* crypto.randomUUIDv4.pipe(
          Effect.mapError(
            () => new BoardServiceError({ message: "Could not save the board handoff." }),
          ),
        ),
      );
      const handoff = {
        id: handoffId,
        sourceThreadId: input.sourceThreadId,
        summary: input.summary,
        decisions: input.decisions ?? [],
        nextStep: input.nextStep,
        createdAt: occurredAt,
      };
      const item: ProjectBoardItemShape = {
        ...existing,
        latestHandoff: handoff,
        handoffHistory: pushProjectBoardHandoffHistory({
          existing: existing.handoffHistory,
          handoff,
        }),
        updatedAt: occurredAt,
      };
      yield* writeItem(input.projectId, item, null);
      yield* publish(input.projectId);
      return item;
    });

  const setArchived = (
    projectId: ProjectId,
    itemId: ProjectBoardItemShape["id"],
    archived: boolean,
  ) =>
    Effect.gen(function* () {
      yield* requireProject(projectId);
      const existing = yield* requireItem(projectId, itemId);
      const occurredAt = yield* nowIso;
      const item: ProjectBoardItemShape = {
        ...existing,
        archivedAt: archived ? occurredAt : null,
        updatedAt: occurredAt,
      };
      yield* writeItem(projectId, item, null);
      yield* publish(projectId);
      return item;
    });

  const remove: BoardService["Service"]["delete"] = (projectId, itemId) =>
    Effect.gen(function* () {
      yield* requireProject(projectId);
      yield* requireItem(projectId, itemId);
      yield* sql`
        DELETE FROM fork_board_items
        WHERE project_id = ${projectId} AND item_id = ${itemId}
      `.pipe(
        Effect.mapError(
          () => new BoardServiceError({ message: "Could not delete the project board card." }),
        ),
      );
      yield* publish(projectId);
    });

  return {
    list,
    subscribe,
    upsert,
    appendHandoff,
    archive: (projectId, itemId) => setArchived(projectId, itemId, true),
    restore: (projectId, itemId) => setArchived(projectId, itemId, false),
    delete: remove,
  } satisfies BoardService["Service"];
});

export const layer = Layer.effect(BoardService, make);
