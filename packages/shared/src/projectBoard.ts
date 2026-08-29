import type { ProjectBoardItem, ProjectBoardItemStatus, TurnId } from "@t3tools/contracts";

export const PROJECT_BOARD_LINKED_TURN_LIMIT = 20;
export const PROJECT_BOARD_DIGEST_ITEM_LIMIT = 20;

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
 * Split items into area groups: named areas sorted alphabetically, then
 * uncategorized (area: null) last. A single group back means the caller
 * shouldn't bother rendering area headers — nothing to distinguish.
 */
export function groupProjectBoardItemsByArea(
  items: ReadonlyArray<ProjectBoardItem>,
): Array<{ area: string | null; items: ProjectBoardItem[] }> {
  const byArea = new Map<string, ProjectBoardItem[]>();
  for (const item of items) {
    const key = item.area ?? "";
    const group = byArea.get(key);
    if (group) group.push(item);
    else byArea.set(key, [item]);
  }
  const areaNames = [...byArea.keys()].filter((name) => name !== "").sort();
  const groups: Array<{ area: string | null; items: ProjectBoardItem[] }> = areaNames.map(
    (area) => ({ area, items: byArea.get(area) ?? [] }),
  );
  const uncategorized = byArea.get("");
  if (uncategorized) groups.push({ area: null, items: uncategorized });
  return groups;
}

/**
 * Compact board digest for humans and agents — not a full dump of notes.
 */
export function formatProjectBoardDigest(items: ReadonlyArray<ProjectBoardItem>): string {
  const activeItems = items.filter((item) => !item.archivedAt);
  const archivedCount = items.length - activeItems.length;
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
    return [
      "Project board digest",
      "",
      archivedCount === 0 ? "Board is empty." : `No active items (${archivedCount} archived).`,
    ].join("\n");
  }

  const lines = [
    "Project board digest",
    "",
    `Totals: ${byStatus.inProgress.length} in progress, ${byStatus.backlog.length} backlog, ${byStatus.ready.length} ready, ${byStatus.inReview.length} in review, ${byStatus.blocked.length} blocked, ${byStatus.completed.length} done, ${byStatus.cancelled.length} cancelled (${activeItems.length} active${archivedCount > 0 ? `, ${archivedCount} archived` : ""}).`,
  ];

  const itemLine = (item: ProjectBoardItem): string => {
    const turnCount = item.linkedTurnIds?.length ?? 0;
    const turnSuffix =
      turnCount > 0 ? ` · ${turnCount} linked turn${turnCount === 1 ? "" : "s"}` : "";
    return `- [${item.id}] ${item.title}${turnSuffix}`;
  };

  const appendSection = (status: ProjectBoardItemStatus, sectionItems: ProjectBoardItem[]) => {
    if (sectionItems.length === 0) return;
    lines.push("", `${statusSectionLabel(status)}:`);

    // Grouped by area so an agent can see at a glance which areas a status
    // hasn't touched yet, without rereading every card. Skipped when the
    // section only spans one area (or none): a heading over a single group
    // teaches nothing and costs a line.
    const groups = groupProjectBoardItemsByArea(sectionItems);
    if (groups.length <= 1) {
      for (const item of sectionItems) lines.push(itemLine(item));
      return;
    }

    for (const group of groups) {
      lines.push(`  ${group.area ?? "Uncategorized"}:`);
      for (const item of group.items) lines.push(`  ${itemLine(item)}`);
    }
  };

  const digestStatusOrder: ReadonlyArray<ProjectBoardItemStatus> = [
    "inProgress",
    "ready",
    "inReview",
    "blocked",
    "backlog",
    "completed",
    "cancelled",
  ];
  let remainingItems = PROJECT_BOARD_DIGEST_ITEM_LIMIT;
  for (const status of digestStatusOrder) {
    const sectionItems = byStatus[status].slice(0, remainingItems);
    appendSection(status, sectionItems);
    remainingItems -= sectionItems.length;
  }
  if (activeItems.length > PROJECT_BOARD_DIGEST_ITEM_LIMIT) {
    lines.push(
      `- …and ${activeItems.length - PROJECT_BOARD_DIGEST_ITEM_LIMIT} more active items; use board_list with status and pagination to browse them.`,
    );
  }

  return lines.join("\n");
}
