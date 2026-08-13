import type { ProjectBoardItem, ProjectBoardItemStatus, TurnId } from "@t3tools/contracts";

export const PROJECT_BOARD_LINKED_TURN_LIMIT = 20;

export function mergeProjectBoardLinkedTurnIds(input: {
  existing: ReadonlyArray<TurnId> | undefined;
  linkedTurnIds?: ReadonlyArray<TurnId> | undefined;
  linkTurnId?: TurnId | null | undefined;
  limit?: number;
}): TurnId[] {
  const limit = input.limit ?? PROJECT_BOARD_LINKED_TURN_LIMIT;
  const base =
    input.linkedTurnIds !== undefined ? [...input.linkedTurnIds] : [...(input.existing ?? [])];
  if (input.linkTurnId) {
    if (!base.includes(input.linkTurnId)) {
      base.push(input.linkTurnId);
    }
  }
  if (base.length <= limit) return base;
  return base.slice(base.length - limit);
}

export function indexProjectBoardItemsByTurnId(
  items: ReadonlyArray<ProjectBoardItem>,
): Map<TurnId, ProjectBoardItem[]> {
  const byTurnId = new Map<TurnId, ProjectBoardItem[]>();
  for (const item of items) {
    for (const turnId of item.linkedTurnIds ?? []) {
      const existing = byTurnId.get(turnId);
      if (existing) existing.push(item);
      else byTurnId.set(turnId, [item]);
    }
  }
  return byTurnId;
}

function statusSectionLabel(status: ProjectBoardItemStatus): string {
  switch (status) {
    case "backlog":
      return "Backlog";
    case "ready":
      return "Ready";
    case "inProgress":
      return "In progress";
    case "inReview":
      return "In review";
    case "blocked":
      return "Blocked";
    case "completed":
      return "Done";
    case "cancelled":
      return "Cancelled";
  }
}

/**
 * Compact board digest for humans and agents — not a full dump of notes.
 */
export function formatProjectBoardDigest(items: ReadonlyArray<ProjectBoardItem>): string {
  const activeItems = items.filter((item) => !item.archivedAt);
  const statuses: ReadonlyArray<ProjectBoardItemStatus> = [
    "backlog",
    "ready",
    "inProgress",
    "inReview",
    "blocked",
    "completed",
    "cancelled",
  ];
  const byStatus = Object.fromEntries(
    statuses.map((status) => [status, activeItems.filter((item) => item.status === status)]),
  ) as Record<ProjectBoardItemStatus, ProjectBoardItem[]>;

  if (activeItems.length === 0) {
    return ["Project board digest", "", "Board is empty."].join("\n");
  }

  const lines = [
    "Project board digest",
    "",
    `Totals: ${byStatus.inProgress.length} in progress, ${byStatus.backlog.length} backlog, ${byStatus.ready.length} ready, ${byStatus.inReview.length} in review, ${byStatus.blocked.length} blocked, ${byStatus.completed.length} done, ${byStatus.cancelled.length} cancelled (${activeItems.length} total).`,
  ];

  const appendSection = (status: ProjectBoardItemStatus, sectionItems: ProjectBoardItem[]) => {
    if (sectionItems.length === 0) return;
    lines.push("", `${statusSectionLabel(status)}:`);
    for (const item of sectionItems) {
      const turnCount = item.linkedTurnIds?.length ?? 0;
      const turnSuffix =
        turnCount > 0 ? ` · ${turnCount} linked turn${turnCount === 1 ? "" : "s"}` : "";
      lines.push(`- [${item.id}] ${item.title}${turnSuffix}`);
    }
  };

  for (const status of statuses) {
    const sectionItems = status === "completed" ? byStatus[status].slice(0, 10) : byStatus[status];
    appendSection(status, sectionItems);
  }
  if (byStatus.completed.length > 10) {
    lines.push(`- …and ${byStatus.completed.length - 10} more done`);
  }

  return lines.join("\n");
}
