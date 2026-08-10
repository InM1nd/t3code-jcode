import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ProjectBoardItem, ProjectId } from "@t3tools/contracts";
import { ChevronDown, ChevronRight, ListTodo, X } from "lucide-react";
import { useCallback, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";

import { projectEnvironment } from "~/state/projects";
import { useProject } from "~/state/entities";
import { useAtomCommand } from "~/state/use-atom-command";
import { cn, newProjectBoardItemId } from "~/lib/utils";
import { Checkbox } from "~/components/ui/checkbox";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "~/components/ui/collapsible";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";

interface ProjectBoardPanelProps {
  environmentId: EnvironmentId;
  projectId: ProjectId;
}

function isOpenStatus(status: ProjectBoardItem["status"]): boolean {
  return status === "pending" || status === "inProgress";
}

function BoardItemRow({
  item,
  onToggle,
  onDelete,
}: {
  item: ProjectBoardItem;
  onToggle: (item: ProjectBoardItem) => void;
  onDelete: (item: ProjectBoardItem) => void;
}) {
  const completed = item.status === "completed";
  return (
    <div className="group flex items-start gap-2 rounded-md px-1.5 py-1 hover:bg-accent/50">
      <Checkbox
        checked={completed}
        onCheckedChange={() => onToggle(item)}
        className="mt-0.5"
        aria-label={completed ? `Mark "${item.title}" open` : `Mark "${item.title}" done`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "truncate text-sm",
              completed && "text-muted-foreground line-through decoration-muted-foreground/60",
            )}
          >
            {item.title}
          </span>
          {item.source === "agent" ? (
            <span className="shrink-0 rounded bg-muted px-1 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              agent
            </span>
          ) : null}
        </div>
        {item.notes ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.notes}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onDelete(item)}
        className="mt-0.5 inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
        aria-label={`Delete "${item.title}"`}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

export function ProjectBoardPanel({ environmentId, projectId }: ProjectBoardPanelProps) {
  const project = useProject(scopeProjectRef(environmentId, projectId));
  const upsertBoardItem = useAtomCommand(projectEnvironment.upsertBoardItem);
  const deleteBoardItem = useAtomCommand(projectEnvironment.deleteBoardItem);
  const [draftTitle, setDraftTitle] = useState("");
  const [doneOpen, setDoneOpen] = useState(false);

  const boardItems = project?.boardItems ?? [];
  const { openItems, doneItems } = useMemo(() => {
    const open: ProjectBoardItem[] = [];
    const done: ProjectBoardItem[] = [];
    for (const item of boardItems) {
      if (isOpenStatus(item.status)) open.push(item);
      else done.push(item);
    }
    open.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    done.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { openItems: open, doneItems: done };
  }, [boardItems]);

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
        status: "pending",
        source: "user",
      },
    });
  }, [draftTitle, environmentId, project, projectId, upsertBoardItem]);

  const onToggle = useCallback(
    async (item: ProjectBoardItem) => {
      await upsertBoardItem({
        environmentId,
        input: {
          projectId,
          itemId: item.id,
          title: item.title,
          status: item.status === "completed" ? "pending" : "completed",
          ...(item.notes !== undefined ? { notes: item.notes } : {}),
          source: item.source,
          ...(item.sourceThreadId !== undefined ? { sourceThreadId: item.sourceThreadId } : {}),
        },
      });
    },
    [environmentId, projectId, upsertBoardItem],
  );

  const onDelete = useCallback(
    async (item: ProjectBoardItem) => {
      await deleteBoardItem({
        environmentId,
        input: { projectId, itemId: item.id },
      });
    },
    [deleteBoardItem, environmentId, projectId],
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

  const isEmpty = openItems.length === 0 && doneItems.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
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
            Track project todos here. Agents can add items too.
          </p>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-3 p-2">
            <section>
              <div className="px-1.5 pt-1 text-[.65rem] font-medium uppercase tracking-wider text-muted-foreground">
                Open
                {openItems.length > 0 ? (
                  <span className="ml-1 tabular-nums text-muted-foreground/70">
                    {openItems.length}
                  </span>
                ) : null}
              </div>
              {openItems.length === 0 ? (
                <p className="px-1.5 py-2 text-xs text-muted-foreground">Nothing open</p>
              ) : (
                openItems.map((item) => (
                  <BoardItemRow key={item.id} item={item} onToggle={onToggle} onDelete={onDelete} />
                ))
              )}
            </section>
            {doneItems.length > 0 ? (
              <Collapsible open={doneOpen} onOpenChange={setDoneOpen}>
                <CollapsibleTrigger className="flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-[.65rem] font-medium uppercase tracking-wider text-muted-foreground hover:bg-accent/50 hover:text-foreground">
                  {doneOpen ? (
                    <ChevronDown aria-hidden className="size-3" />
                  ) : (
                    <ChevronRight aria-hidden className="size-3" />
                  )}
                  Done
                  <span className="ml-1 tabular-nums text-muted-foreground/70">
                    {doneItems.length}
                  </span>
                </CollapsibleTrigger>
                <CollapsiblePanel>
                  {doneItems.map((item) => (
                    <BoardItemRow
                      key={item.id}
                      item={item}
                      onToggle={onToggle}
                      onDelete={onDelete}
                    />
                  ))}
                </CollapsiblePanel>
              </Collapsible>
            ) : null}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
