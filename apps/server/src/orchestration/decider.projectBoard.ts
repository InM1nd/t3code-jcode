/**
 * Project board command decisions.
 *
 * Fork-owned cases live here rather than inline in `decider.ts`: upstream
 * rewrites that switch often, and a 180-line fork block wedged into it is a
 * guaranteed merge conflict. `decider.ts` keeps one delegating case group.
 *
 * `nowIso` and `withEventBase` are passed in instead of imported because they
 * are module-private in `decider.ts` — exporting them would mean editing
 * upstream lines, which is exactly what this split avoids.
 */
import {
  PROJECT_BOARD_ITEM_LIMIT,
  ProjectBoardHandoffId,
  type OrchestrationCommand,
  type OrchestrationEvent,
  type OrchestrationReadModel,
  type ProjectBoardItem,
} from "@t3tools/contracts";
import {
  mergeProjectBoardExternalRefs,
  mergeProjectBoardLinkedTurnIds,
  mergeProjectBoardRelatedItemIds,
} from "@t3tools/shared/projectBoard";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import type * as PlatformError from "effect/PlatformError";

import { OrchestrationCommandInvariantError } from "./Errors.ts";
import { requireProject, requireThread } from "./commandInvariants.ts";

type PlannedOrchestrationEvent = Omit<OrchestrationEvent, "sequence">;

export type ProjectBoardCommand = Extract<
  OrchestrationCommand,
  { type: `project.board.item.${string}` }
>;

type WithEventBase = (
  input: Pick<OrchestrationCommand, "commandId"> & {
    readonly aggregateKind: OrchestrationEvent["aggregateKind"];
    readonly aggregateId: OrchestrationEvent["aggregateId"];
    readonly occurredAt: string;
    readonly metadata?: OrchestrationEvent["metadata"];
  },
) => Effect.Effect<
  Omit<OrchestrationEvent, "sequence" | "type" | "payload">,
  PlatformError.PlatformError,
  Crypto.Crypto
>;

export const decideProjectBoardCommand = Effect.fn("decideProjectBoardCommand")(function* ({
  command,
  readModel,
  nowIso,
  withEventBase,
}: {
  readonly command: ProjectBoardCommand;
  readonly readModel: OrchestrationReadModel;
  readonly nowIso: Effect.Effect<string>;
  readonly withEventBase: WithEventBase;
}): Effect.fn.Return<
  PlannedOrchestrationEvent,
  OrchestrationCommandInvariantError | PlatformError.PlatformError,
  Crypto.Crypto
> {
  switch (command.type) {
    case "project.board.item.upsert": {
      const project = yield* requireProject({
        readModel,
        command,
        projectId: command.projectId,
      });
      const occurredAt = yield* nowIso;
      const boardItems = project.boardItems ?? [];
      const existing = boardItems.find((item) => item.id === command.itemId);
      if (!existing && boardItems.length >= PROJECT_BOARD_ITEM_LIMIT) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Project board is limited to ${PROJECT_BOARD_ITEM_LIMIT} items.`,
        });
      }
      const item: ProjectBoardItem = {
        id: command.itemId,
        title: command.title,
        status: command.status,
        notes: command.notes === undefined ? (existing?.notes ?? null) : command.notes,
        brief: command.brief === undefined ? (existing?.brief ?? null) : command.brief,
        latestHandoff: existing?.latestHandoff ?? null,
        handoffHistory: existing?.handoffHistory ?? [],
        source: command.source ?? existing?.source ?? "user",
        sourceThreadId:
          command.sourceThreadId === undefined
            ? (existing?.sourceThreadId ?? null)
            : command.sourceThreadId,
        linkedTurnIds: mergeProjectBoardLinkedTurnIds({
          existing: existing?.linkedTurnIds,
          ...(command.linkedTurnIds !== undefined ? { linkedTurnIds: command.linkedTurnIds } : {}),
          ...(command.linkTurnId !== undefined ? { linkTurnId: command.linkTurnId } : {}),
        }),
        area: command.area === undefined ? (existing?.area ?? null) : command.area,
        externalRefs: mergeProjectBoardExternalRefs({
          existing: existing?.externalRefs,
          ...(command.externalRefs !== undefined ? { externalRefs: command.externalRefs } : {}),
        }),
        relatedItemIds: mergeProjectBoardRelatedItemIds({
          existing: existing?.relatedItemIds,
          ...(command.relatedItemIds !== undefined
            ? { relatedItemIds: command.relatedItemIds }
            : {}),
          selfId: command.itemId,
        }),
        archivedAt: existing?.archivedAt ?? null,
        createdAt: existing?.createdAt ?? occurredAt,
        updatedAt: occurredAt,
      };
      return {
        ...(yield* withEventBase({
          aggregateKind: "project",
          aggregateId: command.projectId,
          occurredAt,
          commandId: command.commandId,
        })),
        type: "project.board-item-upserted" as const,
        payload: {
          projectId: command.projectId,
          item,
          updatedAt: occurredAt,
        },
      };
    }

    case "project.board.item.handoff.append": {
      const project = yield* requireProject({ readModel, command, projectId: command.projectId });
      const item = (project.boardItems ?? []).find((entry) => entry.id === command.itemId);
      if (!item) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Board item '${command.itemId}' was not found on project '${command.projectId}'.`,
        });
      }
      const thread = yield* requireThread({ readModel, command, threadId: command.sourceThreadId });
      if (thread.projectId !== command.projectId) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Thread '${command.sourceThreadId}' does not belong to project '${command.projectId}'.`,
        });
      }
      const occurredAt = yield* nowIso;
      const crypto = yield* Crypto.Crypto;
      const handoffId = ProjectBoardHandoffId.make(yield* crypto.randomUUIDv4.pipe(Effect.orDie));
      return {
        ...(yield* withEventBase({
          aggregateKind: "project",
          aggregateId: command.projectId,
          occurredAt,
          commandId: command.commandId,
        })),
        type: "project.board-item-handoff-appended" as const,
        payload: {
          projectId: command.projectId,
          itemId: item.id,
          itemTitle: item.title,
          handoff: {
            id: handoffId,
            sourceThreadId: command.sourceThreadId,
            summary: command.summary,
            decisions: command.decisions ?? [],
            nextStep: command.nextStep,
            createdAt: occurredAt,
          },
          updatedAt: occurredAt,
        },
      };
    }

    case "project.board.item.delete": {
      const project = yield* requireProject({
        readModel,
        command,
        projectId: command.projectId,
      });
      if (!(project.boardItems ?? []).some((item) => item.id === command.itemId)) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Board item '${command.itemId}' was not found on project '${command.projectId}'.`,
        });
      }
      const occurredAt = yield* nowIso;
      return {
        ...(yield* withEventBase({
          aggregateKind: "project",
          aggregateId: command.projectId,
          occurredAt,
          commandId: command.commandId,
        })),
        type: "project.board-item-deleted" as const,
        payload: {
          projectId: command.projectId,
          itemId: command.itemId,
          updatedAt: occurredAt,
        },
      };
    }

    case "project.board.item.archive": {
      const project = yield* requireProject({ readModel, command, projectId: command.projectId });
      if (!(project.boardItems ?? []).some((item) => item.id === command.itemId)) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Board item '${command.itemId}' was not found on project '${command.projectId}'.`,
        });
      }
      const occurredAt = yield* nowIso;
      return {
        ...(yield* withEventBase({
          aggregateKind: "project",
          aggregateId: command.projectId,
          occurredAt,
          commandId: command.commandId,
        })),
        type: "project.board.item.archived" as const,
        payload: {
          projectId: command.projectId,
          itemId: command.itemId,
          archivedAt: occurredAt,
          updatedAt: occurredAt,
        },
      };
    }

    case "project.board.item.restore": {
      const project = yield* requireProject({ readModel, command, projectId: command.projectId });
      if (!(project.boardItems ?? []).some((item) => item.id === command.itemId)) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Board item '${command.itemId}' was not found on project '${command.projectId}'.`,
        });
      }
      const occurredAt = yield* nowIso;
      return {
        ...(yield* withEventBase({
          aggregateKind: "project",
          aggregateId: command.projectId,
          occurredAt,
          commandId: command.commandId,
        })),
        type: "project.board.item.restored" as const,
        payload: {
          projectId: command.projectId,
          itemId: command.itemId,
          updatedAt: occurredAt,
        },
      };
    }
  }
});
