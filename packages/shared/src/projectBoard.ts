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
    case "inProgress":
      return "In progress";
    case "pending":
      return "Pending";
    case "completed":
      return "Done";
  }
}

/**
 * Compact board digest for humans and agents — not a full dump of notes.
 */
export function formatProjectBoardDigest(items: ReadonlyArray<ProjectBoardItem>): string {
  const inProgress = items.filter((item) => item.status === "inProgress");
  const pending = items.filter((item) => item.status === "pending");
  const done = items.filter((item) => item.status === "completed");

  if (items.length === 0) {
    return ["Project board digest", "", "Board is empty."].join("\n");
  }

  const lines = [
    "Project board digest",
    "",
    `Totals: ${inProgress.length} in progress, ${pending.length} pending, ${done.length} done (${items.length} total).`,
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

  appendSection("inProgress", inProgress);
  appendSection("pending", pending);
  // Keep done short: only recent-ish titles, still listed for orientation.
  appendSection("completed", done.slice(0, 10));
  if (done.length > 10) {
    lines.push(`- …and ${done.length - 10} more done`);
  }

  return lines.join("\n");
}
