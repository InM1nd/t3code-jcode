import {
  EventId,
  type OrchestrationThreadActivity,
  type ProviderRuntimeEvent,
} from "@t3tools/contracts";
import { findOutOfWorkspaceScopePath } from "@t3tools/shared/workspaceScope";

const WARNABLE_EVENT_TYPES = new Set([
  "item.started",
  "item.updated",
  "item.completed",
  "request.opened",
]);

const FILE_PATH_ITEM_TYPES = new Set([
  "command_execution",
  "file_change",
  "file_edit",
  "create_file",
  "edit",
]);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function payloadLooksLikeFileMutation(payload: Record<string, unknown>): boolean {
  const itemType = typeof payload.itemType === "string" ? payload.itemType : undefined;
  if (itemType && FILE_PATH_ITEM_TYPES.has(itemType)) {
    return true;
  }
  const requestType = typeof payload.requestType === "string" ? payload.requestType : undefined;
  return requestType === "command" || requestType === "file-change";
}

export function maybeWorkspaceScopeWarningActivity(input: {
  readonly event: ProviderRuntimeEvent;
  readonly worktreePath: string | null;
  readonly warnedKeys: Set<string>;
}): OrchestrationThreadActivity | null {
  const worktreePath = input.worktreePath?.trim() ?? "";
  if (!worktreePath || !WARNABLE_EVENT_TYPES.has(input.event.type)) {
    return null;
  }
  const payload = asRecord(input.event.payload) ?? {};
  const outOfScopePath = findOutOfWorkspaceScopePath({
    workspaceRoot: worktreePath,
    data: payload,
    includeFilePaths: payloadLooksLikeFileMutation(payload),
  });
  if (!outOfScopePath) {
    return null;
  }
  const warningKey = `${input.event.threadId}:${outOfScopePath}`;
  if (input.warnedKeys.has(warningKey)) {
    return null;
  }
  input.warnedKeys.add(warningKey);
  return {
    id: EventId.make(`workspace-scope:${input.event.eventId}`),
    createdAt: input.event.createdAt,
    tone: "info",
    kind: "runtime.warning",
    summary: "Agent used a different checkout than this thread's worktree",
    payload: {
      message: "Agent used a different checkout than this thread's worktree",
      detail: `Thread worktree: ${worktreePath}\nUsed path: ${outOfScopePath}\nProvider: ${input.event.provider}`,
    },
    turnId: input.event.turnId ?? null,
  };
}
