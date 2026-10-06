export type TandemAgentState =
  | "permission"
  | "question"
  | "error"
  | "working"
  | "monitoring"
  | "completed"
  | "ready";

export type TandemAgentAttentionThread = {
  readonly id: string;
  readonly title: string;
  readonly archivedAt: string | null;
  readonly updatedAt: string;
  readonly state: TandemAgentState;
};

export function summarizeAgentAttention(threads: ReadonlyArray<TandemAgentAttentionThread>) {
  const visible = threads.filter((thread) => thread.archivedAt === null);
  const byRecentUpdate = (a: TandemAgentAttentionThread, b: TandemAgentAttentionThread) =>
    Date.parse(b.updatedAt) - Date.parse(a.updatedAt);

  return {
    needsAction: visible
      .filter(
        (thread) =>
          thread.state === "permission" || thread.state === "question" || thread.state === "error",
      )
      .sort(byRecentUpdate),
    active: visible
      .filter((thread) => thread.state === "working" || thread.state === "monitoring")
      .sort(byRecentUpdate),
    completed: visible.filter((thread) => thread.state === "completed").sort(byRecentUpdate),
  };
}
