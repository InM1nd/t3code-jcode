import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type {
  EnvironmentId,
  ProjectBoardItem,
  ProjectBoardItemId,
  ProjectId,
  ThreadId,
} from "@t3tools/contracts";
import { useRouter } from "@tanstack/react-router";
import { Archive, ChevronDown, ChevronRight, ListTodo, Play, RotateCcw, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { projectEnvironment } from "~/state/projects";
import { readThreadShell, useProject } from "~/state/entities";
import { useAtomCommand } from "~/state/use-atom-command";
import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { markBoardItemAwaitingTurnLink } from "~/lib/boardTurnLinkPending";
import { cn, newProjectBoardItemId } from "~/lib/utils";
import { Checkbox } from "~/components/ui/checkbox";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "~/components/ui/collapsible";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Textarea } from "~/components/ui/textarea";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

import {
  buildBoardImplementPrompt,
  createBoardItemDraft,
  findDraftIdForThread,
  groupProjectBoardItems,
  nextProjectBoardItemStatus,
  PROJECT_BOARD_STATUS_ORDER,
  projectBoardStatusLabel,
} from "./ProjectBoardPanel.logic";

interface ProjectBoardPanelProps {
  environmentId: EnvironmentId;
  projectId: ProjectId;
  sourceThreadId: ThreadId | null;
  selectedItemId: ProjectBoardItemId | null;
  onSelectItem: (itemId: ProjectBoardItemId | null) => void;
}

function BoardItemRow({
  item,
  onToggleDone,
  onCycleStatus,
  onDelete,
  onArchive,
  onRestore,
  onImplement,
  onOpenDetails,
  onOpenLinkedThread,
}: {
  item: ProjectBoardItem;
  onToggleDone: (item: ProjectBoardItem) => void;
  onCycleStatus: (item: ProjectBoardItem) => void;
  onDelete: (item: ProjectBoardItem) => void;
  onArchive: (item: ProjectBoardItem) => void;
  onRestore: (item: ProjectBoardItem) => void;
  onImplement: (item: ProjectBoardItem) => void;
  onOpenDetails: (item: ProjectBoardItem) => void;
  onOpenLinkedThread: (threadId: ThreadId) => void;
}) {
  const completed = item.status === "completed";
  const linkedThreadId = item.sourceThreadId ?? null;
  return (
    <div
      className="group flex items-start gap-2 rounded-md px-1.5 py-1 hover:bg-accent/50"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("button")) return;
        onOpenDetails(item);
      }}
    >
      <Checkbox
        checked={completed}
        onCheckedChange={() => onToggleDone(item)}
        className="mt-0.5"
        aria-label={completed ? `Mark "${item.title}" open` : `Mark "${item.title}" done`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => onOpenDetails(item)}
            className={cn(
              "min-w-0 cursor-pointer truncate text-left text-sm",
              completed && "text-muted-foreground line-through decoration-muted-foreground/60",
            )}
          >
            {item.title}
          </button>
          <button
            type="button"
            onClick={() => onCycleStatus(item)}
            className={cn(
              "shrink-0 cursor-pointer rounded px-1 py-px text-[10px] font-medium uppercase tracking-wide",
              item.status === "inProgress"
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
            aria-label={`Cycle status for "${item.title}" (currently ${projectBoardStatusLabel(item.status)})`}
          >
            {projectBoardStatusLabel(item.status)}
          </button>
          {item.source === "agent" ? (
            <span className="shrink-0 rounded bg-muted px-1 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              agent
            </span>
          ) : null}
        </div>
        {item.notes ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.notes}</p>
        ) : null}
        {(linkedThreadId || (item.linkedTurnIds?.length ?? 0) > 0) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            {(item.linkedTurnIds?.length ?? 0) > 0 ? (
              <span>
                {item.linkedTurnIds?.length} linked turn
                {item.linkedTurnIds?.length === 1 ? "" : "s"}
              </span>
            ) : null}
            {linkedThreadId ? (
              <button
                type="button"
                onClick={() => onOpenLinkedThread(linkedThreadId)}
                className="cursor-pointer underline-offset-2 hover:text-foreground hover:underline"
              >
                Open linked thread
              </button>
            ) : null}
          </div>
        )}
      </div>
      {!completed && !item.archivedAt ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() => onImplement(item)}
                className="mt-0.5 inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Implement "${item.title}" in a new thread`}
              >
                <Play className="size-3" />
              </button>
            }
          />
          <TooltipPopup side="top">Implement in new thread</TooltipPopup>
        </Tooltip>
      ) : null}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          if (item.archivedAt) onRestore(item);
          else onArchive(item);
        }}
        className="mt-0.5 inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
        aria-label={`${item.archivedAt ? "Restore" : "Archive"} "${item.title}"`}
      >
        {item.archivedAt ? <RotateCcw className="size-3" /> : <Archive className="size-3" />}
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onDelete(item);
        }}
        className="mt-0.5 inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
        aria-label={`Delete "${item.title}"`}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

function BoardSection({
  title,
  items,
  emptyLabel,
  onToggleDone,
  onCycleStatus,
  onDelete,
  onArchive,
  onRestore,
  onImplement,
  onOpenDetails,
  onOpenLinkedThread,
}: {
  title: string;
  items: ProjectBoardItem[];
  emptyLabel?: string;
  onToggleDone: (item: ProjectBoardItem) => void;
  onCycleStatus: (item: ProjectBoardItem) => void;
  onDelete: (item: ProjectBoardItem) => void;
  onArchive: (item: ProjectBoardItem) => void;
  onRestore: (item: ProjectBoardItem) => void;
  onImplement: (item: ProjectBoardItem) => void;
  onOpenDetails: (item: ProjectBoardItem) => void;
  onOpenLinkedThread: (threadId: ThreadId) => void;
}) {
  return (
    <section>
      <div className="px-1.5 pt-1 text-[.65rem] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
        {items.length > 0 ? (
          <span className="ml-1 tabular-nums text-muted-foreground/70">{items.length}</span>
        ) : null}
      </div>
      {items.length === 0 ? (
        emptyLabel ? (
          <p className="px-1.5 py-2 text-xs text-muted-foreground">{emptyLabel}</p>
        ) : null
      ) : (
        items.map((item) => (
          <BoardItemRow
            key={item.id}
            item={item}
            onToggleDone={onToggleDone}
            onCycleStatus={onCycleStatus}
            onDelete={onDelete}
            onArchive={onArchive}
            onRestore={onRestore}
            onImplement={onImplement}
            onOpenDetails={onOpenDetails}
            onOpenLinkedThread={onOpenLinkedThread}
          />
        ))
      )}
    </section>
  );
}

export function ProjectBoardPanel({
  environmentId,
  projectId,
  sourceThreadId,
  selectedItemId,
  onSelectItem,
}: ProjectBoardPanelProps) {
  const project = useProject(scopeProjectRef(environmentId, projectId));
  const upsertBoardItem = useAtomCommand(projectEnvironment.upsertBoardItem);
  const deleteBoardItem = useAtomCommand(projectEnvironment.deleteBoardItem);
  const archiveBoardItem = useAtomCommand(projectEnvironment.archiveBoardItem);
  const restoreBoardItem = useAtomCommand(projectEnvironment.restoreBoardItem);
  const appendBoardHandoff = useAtomCommand(projectEnvironment.appendBoardHandoff);
  const handleNewThread = useNewThreadHandler();
  const router = useRouter();
  const [draftTitle, setDraftTitle] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [implementingId, setImplementingId] = useState<string | null>(null);
  const [itemDraft, setItemDraft] = useState<ReturnType<typeof createBoardItemDraft> | null>(null);
  const [handoffSummary, setHandoffSummary] = useState("");
  const [handoffDecisions, setHandoffDecisions] = useState("");
  const [handoffNextStep, setHandoffNextStep] = useState("");

  const boardItems = project?.boardItems ?? [];
  const detailItem = boardItems.find((item) => item.id === selectedItemId) ?? null;
  const groupedItems = useMemo(() => groupProjectBoardItems(boardItems), [boardItems]);

  useEffect(() => {
    setItemDraft(detailItem ? createBoardItemDraft(detailItem) : null);
  }, [detailItem?.id]);

  useEffect(() => {
    if (project && selectedItemId && !detailItem) onSelectItem(null);
  }, [detailItem, onSelectItem, project, selectedItemId]);

  const upsertItemStatus = useCallback(
    async (
      item: ProjectBoardItem,
      status: ProjectBoardItem["status"],
      sourceThreadId?: ThreadId | null,
    ) => {
      await upsertBoardItem({
        environmentId,
        input: {
          projectId,
          itemId: item.id,
          title: item.title,
          status,
          ...(item.notes !== undefined ? { notes: item.notes } : {}),
          source: item.source,
          sourceThreadId:
            sourceThreadId !== undefined ? sourceThreadId : (item.sourceThreadId ?? null),
        },
      });
    },
    [environmentId, projectId, upsertBoardItem],
  );

  const submitDraft = useCallback(async () => {
    const title = draftTitle.trim();
    if (!title || !project) return;
    setDraftTitle("");
    await upsertBoardItem({
      environmentId,
      input: {
        projectId,
        itemId: newProjectBoardItemId(),
        title,
        status: "backlog",
        source: "user",
      },
    });
  }, [draftTitle, environmentId, project, projectId, upsertBoardItem]);

  const onToggleDone = useCallback(
    async (item: ProjectBoardItem) => {
      await upsertItemStatus(item, item.status === "completed" ? "backlog" : "completed");
    },
    [upsertItemStatus],
  );

  const onCycleStatus = useCallback(
    async (item: ProjectBoardItem) => {
      await upsertItemStatus(item, nextProjectBoardItemStatus(item.status));
    },
    [upsertItemStatus],
  );

  const onDelete = useCallback(
    async (item: ProjectBoardItem) => {
      await deleteBoardItem({
        environmentId,
        input: { projectId, itemId: item.id },
      });
      if (selectedItemId === item.id) onSelectItem(null);
    },
    [deleteBoardItem, environmentId, onSelectItem, projectId, selectedItemId],
  );

  const onOpenDetails = useCallback(
    (item: ProjectBoardItem) => {
      onSelectItem(item.id);
      setHandoffSummary("");
      setHandoffDecisions("");
      setHandoffNextStep("");
    },
    [onSelectItem],
  );

  const onArchive = useCallback(
    async (item: ProjectBoardItem) => {
      await archiveBoardItem({ environmentId, input: { projectId, itemId: item.id } });
    },
    [archiveBoardItem, environmentId, projectId],
  );

  const onRestore = useCallback(
    async (item: ProjectBoardItem) => {
      await restoreBoardItem({ environmentId, input: { projectId, itemId: item.id } });
    },
    [environmentId, projectId, restoreBoardItem],
  );

  const saveBrief = useCallback(async () => {
    if (!detailItem || !itemDraft) return;
    const list = (value: string) =>
      value
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean);
    const goal = itemDraft.briefGoal.trim();
    await upsertBoardItem({
      environmentId,
      input: {
        projectId,
        itemId: detailItem.id,
        title: itemDraft.title.trim(),
        status: itemDraft.status,
        notes: itemDraft.notes.trim() || null,
        source: detailItem.source,
        sourceThreadId: detailItem.sourceThreadId ?? null,
        brief: goal
          ? {
              goal,
              acceptanceCriteria: list(itemDraft.briefCriteria),
              importantFiles: list(itemDraft.briefFiles),
              notes: itemDraft.briefNotes.trim() || null,
            }
          : null,
      },
    });
  }, [detailItem, environmentId, projectId, itemDraft, upsertBoardItem]);

  const submitHandoff = useCallback(async () => {
    if (!detailItem || !sourceThreadId || !handoffSummary.trim() || !handoffNextStep.trim()) return;
    await appendBoardHandoff({
      environmentId,
      input: {
        projectId,
        itemId: detailItem.id,
        sourceThreadId,
        summary: handoffSummary.trim(),
        decisions: handoffDecisions
          .split("\n")
          .map((entry) => entry.trim())
          .filter(Boolean),
        nextStep: handoffNextStep.trim(),
      },
    });
    setHandoffSummary("");
    setHandoffDecisions("");
    setHandoffNextStep("");
  }, [
    appendBoardHandoff,
    detailItem,
    environmentId,
    handoffDecisions,
    handoffNextStep,
    handoffSummary,
    projectId,
    sourceThreadId,
  ]);

  const resolveDraftIdForThread = useCallback(
    (threadId: ThreadId) =>
      findDraftIdForThread({
        draftThreadsByThreadKey: useComposerDraftStore.getState().draftThreadsByThreadKey,
        environmentId,
        threadId,
      }),
    [environmentId],
  );

  const onOpenLinkedThread = useCallback(
    (threadId: ThreadId) => {
      const threadRef = scopeThreadRef(environmentId, threadId);
      if (readThreadShell(threadRef)) {
        void router.navigate({
          to: "/$environmentId/$threadId",
          params: { environmentId, threadId },
        });
        return;
      }
      const draftId = resolveDraftIdForThread(threadId);
      if (draftId) {
        void router.navigate({
          to: "/draft/$draftId",
          params: { draftId },
        });
      }
    },
    [environmentId, resolveDraftIdForThread, router],
  );

  const onImplement = useCallback(
    async (item: ProjectBoardItem) => {
      if (implementingId) return;
      setImplementingId(item.id);
      try {
        if (item.sourceThreadId) {
          const threadRef = scopeThreadRef(environmentId, item.sourceThreadId);
          if (readThreadShell(threadRef)) {
            await upsertItemStatus(item, "inProgress", item.sourceThreadId);
            markBoardItemAwaitingTurnLink(item.sourceThreadId, item.id);
            await router.navigate({
              to: "/$environmentId/$threadId",
              params: { environmentId, threadId: item.sourceThreadId },
            });
            return;
          }
          const draftId = resolveDraftIdForThread(item.sourceThreadId);
          if (draftId) {
            await upsertItemStatus(item, "inProgress", item.sourceThreadId);
            markBoardItemAwaitingTurnLink(item.sourceThreadId, item.id);
            useComposerDraftStore
              .getState()
              .setPrompt(DraftId.make(draftId), buildBoardImplementPrompt(item));
            await router.navigate({
              to: "/draft/$draftId",
              params: { draftId },
            });
            return;
          }
        }

        const created = await handleNewThread(scopeProjectRef(environmentId, projectId), {
          seedPrompt: buildBoardImplementPrompt(item),
        });
        if (!created) return;
        await upsertItemStatus(item, "inProgress", created.threadId);
        markBoardItemAwaitingTurnLink(created.threadId, item.id);
      } finally {
        setImplementingId(null);
      }
    },
    [
      environmentId,
      handleNewThread,
      implementingId,
      projectId,
      resolveDraftIdForThread,
      router,
      upsertItemStatus,
    ],
  );

  const onDraftKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void submitDraft();
  };

  const onDraftSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submitDraft();
  };

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <ListTodo aria-hidden className="size-6 text-muted-foreground/60" />
        <p className="text-sm font-medium">No project</p>
        <p className="max-w-56 text-xs text-muted-foreground">
          Open a project thread to manage its board.
        </p>
      </div>
    );
  }

  const activeCount = PROJECT_BOARD_STATUS_ORDER.reduce(
    (total, status) => total + groupedItems.active[status].length,
    0,
  );
  const isEmpty = activeCount === 0 && groupedItems.archived.length === 0;

  const rowHandlers = {
    onToggleDone,
    onCycleStatus,
    onDelete,
    onArchive,
    onRestore,
    onImplement,
    onOpenDetails,
    onOpenLinkedThread,
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {detailItem && itemDraft ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-3 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Task details</p>
              <button
                type="button"
                className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onSelectItem(null)}
              >
                Back to board
              </button>
            </div>
            <Input
              size="sm"
              value={itemDraft.title}
              onChange={(event) => setItemDraft({ ...itemDraft, title: event.target.value })}
              placeholder="Title"
            />
            <Textarea
              size="sm"
              value={itemDraft.notes}
              onChange={(event) => setItemDraft({ ...itemDraft, notes: event.target.value })}
              placeholder="Notes"
            />
            <select
              value={itemDraft.status}
              onChange={(event) =>
                setItemDraft({
                  ...itemDraft,
                  status: event.target.value as ProjectBoardItem["status"],
                })
              }
              className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              aria-label="Task status"
            >
              {PROJECT_BOARD_STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {projectBoardStatusLabel(status)}
                </option>
              ))}
            </select>
            <Input
              size="sm"
              value={itemDraft.briefGoal}
              onChange={(event) => setItemDraft({ ...itemDraft, briefGoal: event.target.value })}
              placeholder="Task goal"
            />
            <Textarea
              size="sm"
              value={itemDraft.briefCriteria}
              onChange={(event) =>
                setItemDraft({ ...itemDraft, briefCriteria: event.target.value })
              }
              placeholder="Acceptance criteria (one per line)"
            />
            <Textarea
              size="sm"
              value={itemDraft.briefFiles}
              onChange={(event) => setItemDraft({ ...itemDraft, briefFiles: event.target.value })}
              placeholder="Important files (one per line)"
            />
            <Textarea
              size="sm"
              value={itemDraft.briefNotes}
              onChange={(event) => setItemDraft({ ...itemDraft, briefNotes: event.target.value })}
              placeholder="Brief notes"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!itemDraft.title.trim()}
                onClick={() => void saveBrief()}
                className="cursor-pointer rounded bg-foreground px-2 py-1 text-xs font-medium text-background disabled:cursor-not-allowed disabled:opacity-40"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setItemDraft(createBoardItemDraft(detailItem))}
                className="cursor-pointer rounded px-2 py-1 text-xs font-medium hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  void (detailItem.archivedAt ? onRestore(detailItem) : onArchive(detailItem))
                }
                className="cursor-pointer rounded px-2 py-1 text-xs font-medium hover:bg-accent"
              >
                {detailItem.archivedAt ? "Restore" : "Archive"}
              </button>
              <button
                type="button"
                onClick={() => void onDelete(detailItem)}
                className="cursor-pointer rounded px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
              >
                Delete
              </button>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-border/50 pt-3 text-xs">
              <dt className="text-muted-foreground">Source</dt>
              <dd>{detailItem.source}</dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd>{detailItem.createdAt}</dd>
              <dt className="text-muted-foreground">Updated</dt>
              <dd>{detailItem.updatedAt}</dd>
              {detailItem.archivedAt ? (
                <>
                  <dt className="text-muted-foreground">Archived</dt>
                  <dd>{detailItem.archivedAt}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">Linked turns</dt>
              <dd>{detailItem.linkedTurnIds?.join(", ") || "None"}</dd>
            </dl>
            {detailItem.latestHandoff ? (
              <div className="rounded bg-muted/50 p-2 text-xs">
                <p className="font-medium">Latest handoff</p>
                <p className="mt-1">{detailItem.latestHandoff.summary}</p>
                {detailItem.latestHandoff.decisions.length > 0 ? (
                  <p className="mt-1">Decisions: {detailItem.latestHandoff.decisions.join(", ")}</p>
                ) : null}
                <p className="mt-1 text-muted-foreground">
                  Next: {detailItem.latestHandoff.nextStep}
                </p>
                <button
                  type="button"
                  onClick={() => onOpenLinkedThread(detailItem.latestHandoff!.sourceThreadId)}
                  className="mt-1 cursor-pointer text-muted-foreground underline hover:text-foreground"
                >
                  Open source thread
                </button>
              </div>
            ) : null}
            {sourceThreadId ? (
              <div className="space-y-1 border-t border-border/50 pt-2">
                <Textarea
                  size="sm"
                  value={handoffSummary}
                  onChange={(event) => setHandoffSummary(event.target.value)}
                  placeholder="Handoff summary"
                />
                <Textarea
                  size="sm"
                  value={handoffDecisions}
                  onChange={(event) => setHandoffDecisions(event.target.value)}
                  placeholder="Decisions (one per line)"
                />
                <Textarea
                  size="sm"
                  value={handoffNextStep}
                  onChange={(event) => setHandoffNextStep(event.target.value)}
                  placeholder="Concrete next step"
                />
                <button
                  type="button"
                  disabled={!handoffSummary.trim() || !handoffNextStep.trim()}
                  onClick={() => void submitHandoff()}
                  className="cursor-pointer rounded px-2 py-1 text-xs font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Add handoff
                </button>
              </div>
            ) : null}
          </div>
        </ScrollArea>
      ) : (
        <>
          <form
            onSubmit={onDraftSubmit}
            className="flex shrink-0 items-center gap-2 border-b border-border/60 px-2 py-2"
          >
            <Input
              size="sm"
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onKeyDown={onDraftKeyDown}
              placeholder="Add item…"
              aria-label="Add board item"
              className="min-w-0 flex-1"
            />
            <button
              type="submit"
              disabled={draftTitle.trim().length === 0}
              className="cursor-pointer shrink-0 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add
            </button>
          </form>
          {isEmpty ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
              <ListTodo aria-hidden className="size-6 text-muted-foreground/60" />
              <p className="text-sm font-medium">No board items</p>
              <p className="max-w-56 text-xs text-muted-foreground">
                Track project todos here. Use Implement to start a thread from an item.
              </p>
            </div>
          ) : (
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col gap-3 p-2">
                {PROJECT_BOARD_STATUS_ORDER.map((status) =>
                  groupedItems.active[status].length > 0 ? (
                    <BoardSection
                      key={status}
                      title={projectBoardStatusLabel(status)}
                      items={groupedItems.active[status]}
                      {...rowHandlers}
                    />
                  ) : null,
                )}
                {groupedItems.archived.length > 0 ? (
                  <Collapsible open={archiveOpen} onOpenChange={setArchiveOpen}>
                    <CollapsibleTrigger className="flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-[.65rem] font-medium uppercase tracking-wider text-muted-foreground hover:bg-accent/50 hover:text-foreground">
                      {archiveOpen ? (
                        <ChevronDown aria-hidden className="size-3" />
                      ) : (
                        <ChevronRight aria-hidden className="size-3" />
                      )}
                      Archive
                      <span className="ml-1 tabular-nums text-muted-foreground/70">
                        {groupedItems.archived.length}
                      </span>
                    </CollapsibleTrigger>
                    <CollapsiblePanel>
                      {groupedItems.archived.map((item) => (
                        <BoardItemRow key={item.id} item={item} {...rowHandlers} />
                      ))}
                    </CollapsiblePanel>
                  </Collapsible>
                ) : null}
              </div>
            </ScrollArea>
          )}
        </>
      )}
    </div>
  );
}
