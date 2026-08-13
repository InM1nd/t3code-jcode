import type {
  EnvironmentId,
  ProjectBoardItem,
  ProjectBoardItemStatus,
  ThreadId,
} from "@t3tools/contracts";

/** Cycle open/done statuses for the board row control. */
export function nextProjectBoardItemStatus(status: ProjectBoardItemStatus): ProjectBoardItemStatus {
  switch (status) {
    case "backlog":
      return "ready";
    case "ready":
      return "inProgress";
    case "inProgress":
      return "inReview";
    case "inReview":
      return "completed";
    case "blocked":
      return "ready";
    case "completed":
    case "cancelled":
      return "backlog";
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

export const PROJECT_BOARD_STATUS_ORDER: ReadonlyArray<ProjectBoardItemStatus> = [
  "backlog",
  "ready",
  "inProgress",
  "inReview",
  "blocked",
  "completed",
  "cancelled",
];

export function groupProjectBoardItems(items: ReadonlyArray<ProjectBoardItem>): {
  active: Record<ProjectBoardItemStatus, ProjectBoardItem[]>;
  archived: ProjectBoardItem[];
} {
  const active: Record<ProjectBoardItemStatus, ProjectBoardItem[]> = {
    backlog: [],
    ready: [],
    inProgress: [],
    inReview: [],
    blocked: [],
    completed: [],
    cancelled: [],
  };
  const archived: ProjectBoardItem[] = [];
  for (const item of items) {
    if (item.archivedAt) archived.push(item);
    else active[item.status].push(item);
  }
  for (const status of PROJECT_BOARD_STATUS_ORDER) {
    active[status].sort((a, b) =>
      status === "completed" || status === "cancelled"
        ? b.updatedAt.localeCompare(a.updatedAt)
        : a.createdAt.localeCompare(b.createdAt),
    );
  }
  archived.sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""));
  return { active, archived };
}

export interface BoardItemDraft {
  title: string;
  notes: string;
  status: ProjectBoardItemStatus;
  briefGoal: string;
  briefCriteria: string;
  briefFiles: string;
  briefNotes: string;
}

export function createBoardItemDraft(item: ProjectBoardItem): BoardItemDraft {
  return {
    title: item.title,
    notes: item.notes ?? "",
    status: item.status,
    briefGoal: item.brief?.goal ?? "",
    briefCriteria: item.brief?.acceptanceCriteria.join("\n") ?? "",
    briefFiles: item.brief?.importantFiles.join("\n") ?? "",
    briefNotes: item.brief?.notes ?? "",
  };
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
