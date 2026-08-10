import type {
  EnvironmentId,
  ProjectBoardItem,
  ProjectBoardItemStatus,
  ThreadId,
} from "@t3tools/contracts";

/** Cycle open/done statuses for the board row control. */
export function nextProjectBoardItemStatus(status: ProjectBoardItemStatus): ProjectBoardItemStatus {
  switch (status) {
    case "pending":
      return "inProgress";
    case "inProgress":
      return "completed";
    case "completed":
      return "pending";
  }
}

/** Find a local draft-session id for a board-linked thread id. */
export function findDraftIdForThread(input: {
  draftThreadsByThreadKey: Readonly<
    Record<string, { environmentId: EnvironmentId; threadId: ThreadId }>
  >;
  environmentId: EnvironmentId;
  threadId: ThreadId;
}): string | null {
  for (const [draftId, session] of Object.entries(input.draftThreadsByThreadKey)) {
    if (session.environmentId === input.environmentId && session.threadId === input.threadId) {
      return draftId;
    }
  }
  return null;
}

export function partitionProjectBoardItems(items: ReadonlyArray<ProjectBoardItem>): {
  inProgressItems: ProjectBoardItem[];
  pendingItems: ProjectBoardItem[];
  doneItems: ProjectBoardItem[];
} {
  const inProgressItems: ProjectBoardItem[] = [];
  const pendingItems: ProjectBoardItem[] = [];
  const doneItems: ProjectBoardItem[] = [];
  for (const item of items) {
    if (item.status === "inProgress") inProgressItems.push(item);
    else if (item.status === "pending") pendingItems.push(item);
    else doneItems.push(item);
  }
  inProgressItems.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  pendingItems.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  doneItems.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { inProgressItems, pendingItems, doneItems };
}

export function buildBoardImplementPrompt(item: ProjectBoardItem): string {
  const lines = [
    `Implement this project board item: ${item.title}`,
    "",
    `Board item id: ${item.id}`,
  ];
  if (item.notes?.trim()) {
    lines.push("", item.notes.trim());
  }
  lines.push(
    "",
    "Use the project board MCP tools (`board_list`, `board_set_status`, `board_upsert`) to keep this item updated. Mark it completed when the work is done.",
  );
  return lines.join("\n");
}

export function projectBoardStatusLabel(status: ProjectBoardItemStatus): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "inProgress":
      return "In progress";
    case "completed":
      return "Done";
  }
}
