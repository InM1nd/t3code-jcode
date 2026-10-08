import {
  ProjectBoardItemId,
  type ProjectBoardItem,
  type ProjectBoardItemStatus,
  type ProjectBoardUpsertInput,
} from "@t3tools/contracts";

export interface BoardCardDraft {
  readonly title: string;
  readonly notes: string;
  readonly status: ProjectBoardItemStatus;
  readonly area: string;
  readonly briefGoal: string;
  readonly briefCriteria: string;
  readonly briefFiles: string;
  readonly briefNotes: string;
  readonly externalRefs: string;
  readonly relatedItemIds: ReadonlyArray<ProjectBoardItemId>;
}

type BoardCardSource = Pick<
  ProjectBoardItem,
  | "id"
  | "title"
  | "notes"
  | "status"
  | "area"
  | "brief"
  | "externalRefs"
  | "relatedItemIds"
  | "source"
  | "sourceThreadId"
>;

export function boardCardDraftFromItem(item: BoardCardSource): BoardCardDraft {
  return {
    title: item.title,
    notes: item.notes ?? "",
    status: item.status,
    area: item.area ?? "",
    briefGoal: item.brief?.goal ?? "",
    briefCriteria: item.brief?.acceptanceCriteria.join("\n") ?? "",
    briefFiles: item.brief?.importantFiles.join("\n") ?? "",
    briefNotes: item.brief?.notes ?? "",
    externalRefs: item.externalRefs?.join("\n") ?? "",
    relatedItemIds: item.relatedItemIds ? [...item.relatedItemIds] : [],
  };
}

/** Fields for an upsert. An empty title is not saved. An empty goal clears the brief. */
export function boardCardUpsertFields(
  item: BoardCardSource,
  draft: BoardCardDraft,
): Omit<ProjectBoardUpsertInput, "projectId" | "itemId"> | null {
  const title = draft.title.trim();
  if (title.length === 0) return null;
  const goal = draft.briefGoal.trim();
  return {
    title,
    status: draft.status,
    notes: emptyToNull(draft.notes),
    area: emptyToNull(draft.area),
    externalRefs: lines(draft.externalRefs),
    relatedItemIds: draft.relatedItemIds
      .filter((id) => id !== item.id)
      .map((id) => ProjectBoardItemId.make(id)),
    source: item.source,
    sourceThreadId: item.sourceThreadId ?? null,
    brief: goal
      ? {
          goal,
          acceptanceCriteria: lines(draft.briefCriteria),
          importantFiles: lines(draft.briefFiles),
          notes: emptyToNull(draft.briefNotes),
        }
      : null,
  };
}

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
