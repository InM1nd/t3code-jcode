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
  if (item.brief) {
    lines.push("", "## Task brief", `Goal: ${item.brief.goal}`);
    if (item.brief.acceptanceCriteria.length > 0) {
      lines.push(
        "Acceptance criteria:",
        ...item.brief.acceptanceCriteria.map((value) => `- ${value}`),
      );
    }
    if (item.brief.importantFiles.length > 0) {
      lines.push("Important files:", ...item.brief.importantFiles.map((value) => `- ${value}`));
    }
    if (item.brief.notes) lines.push(`Notes: ${item.brief.notes}`);
  }
  if (item.latestHandoff) {
    lines.push("", "## Latest handoff", item.latestHandoff.summary);
    if (item.latestHandoff.decisions.length > 0) {
      lines.push("Decisions:", ...item.latestHandoff.decisions.map((value) => `- ${value}`));
    }
    lines.push(`Next step: ${item.latestHandoff.nextStep}`);
  }
  lines.push(
    "",
    "Use the project board MCP tools (`board_get_brief`, `board_set_status`, `board_upsert`, `board_handoff`) to keep this item updated. Mark it completed when the work is done.",
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
