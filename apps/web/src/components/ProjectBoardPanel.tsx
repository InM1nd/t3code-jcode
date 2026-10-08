import {
  ProjectBoardItemId,
  type EnvironmentId,
  type ProjectBoardItem,
  type ProjectId,
} from "@t3tools/contracts";
import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "~/components/ui/collapsible";
import { cn, randomUUID } from "~/lib/utils";

import type { ComposerThreadTarget } from "../composerDraftStore";
import { useComposerDraftStore } from "../composerDraftStore";
import { useEnvironmentQuery } from "../state/query";
import {
  archiveBoardItem,
  deleteBoardItem,
  projectBoardItems,
  restoreBoardItem,
  upsertBoardItem,
} from "../state/projectBoard";
import { useAtomCommand } from "../state/use-atom-command";
import { BoardCardEditor } from "../tandem/BoardCardEditor";
import { boardCardUpsertFields } from "../tandem/boardCardDraft";
import { buildTandemDelegationPrompt, isTandemDelegation } from "../tandem/delegationQueue";
import { ProjectActivityTimeline } from "../tandem/ProjectActivityTimeline";
import { formatQuietBoardLabel } from "../tandem/quietBoard";
import {
  buildBoardImplementPrompt,
  filterProjectBoardItemsByArea,
  filterProjectBoardItemsByQuery,
  getProjectBoardAreas,
  groupProjectBoardItems,
  nextProjectBoardItemStatus,
  PROJECT_BOARD_STATUS_ORDER,
  projectBoardItemDisplayTitle,
  projectBoardStatusLabel,
} from "./ProjectBoardPanel.logic";

const BOARD_STATUS_STYLES: Record<
  ProjectBoardItem["status"],
  { readonly accent: string; readonly chip: string }
> = {
  backlog: { accent: "bg-slate-400", chip: "bg-slate-500/15 text-slate-600 dark:text-slate-300" },
  ready: { accent: "bg-sky-400", chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  inProgress: {
    accent: "bg-violet-400",
    chip: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  },
  inReview: { accent: "bg-amber-400", chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  blocked: { accent: "bg-rose-400", chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  completed: {
    accent: "bg-emerald-400",
    chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  cancelled: { accent: "bg-zinc-400", chip: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300" },
};

export function ProjectBoardPanel(props: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly composerTarget: ComposerThreadTarget;
}) {
  const boardAtom = useMemo(
    () =>
      projectBoardItems({
        environmentId: props.environmentId,
        input: { projectId: props.projectId },
      }),
    [props.environmentId, props.projectId],
  );
  const query = useEnvironmentQuery(boardAtom);
  const upsert = useAtomCommand(upsertBoardItem);
  const archive = useAtomCommand(archiveBoardItem);
  const restore = useAtomCommand(restoreBoardItem);
  const remove = useAtomCommand(deleteBoardItem);
  const [title, setTitle] = useState("");
  const [search, setSearch] = useState("");
  const [area, setArea] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<ProjectBoardItem["id"] | null>(null);

  const items = query.data?.items ?? [];
  const searched = filterProjectBoardItemsByQuery(items, search);
  const visible = filterProjectBoardItemsByArea(searched, area);
  const grouped = groupProjectBoardItems(visible);
  const areas = getProjectBoardAreas(items);
  const activeCount = items.filter((item) => !item.archivedAt).length;
  const selected = items.find((item) => item.id === selectedId) ?? null;

  const insertPrompt = (prompt: string) => {
    const existing =
      useComposerDraftStore.getState().getComposerDraft(props.composerTarget)?.prompt ?? "";
    const next = existing.trim().length > 0 ? `${existing.trim()}\n\n${prompt}` : prompt;
    useComposerDraftStore.getState().setPrompt(props.composerTarget, next);
  };

  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <div className="font-medium">Board</div>
          <div className="truncate text-xs opacity-70">{formatQuietBoardLabel(activeCount)}</div>
        </div>
        <button
          type="button"
          className="text-xs opacity-70"
          onClick={() => setShowArchived((current) => !current)}
        >
          {showArchived ? "Hide archived" : `Archived (${grouped.archived.length})`}
        </button>
      </div>
      <form
        className="flex gap-2 border-b px-3 py-2"
        onSubmit={(event) => {
          event.preventDefault();
          const nextTitle = title.trim();
          if (nextTitle.length === 0) return;
          void upsert({
            environmentId: props.environmentId,
            input: {
              projectId: props.projectId,
              itemId: ProjectBoardItemId.make(randomUUID()),
              title: nextTitle,
              status: "backlog",
              source: "user",
            },
          });
          setTitle("");
        }}
      >
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="New card"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          aria-label="New board card"
        />
        <button type="submit" className="text-xs">
          Add
        </button>
      </form>
      <div className="flex gap-2 border-b px-3 py-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter"
          className="min-w-0 flex-1 bg-transparent text-xs outline-none"
          aria-label="Filter board cards"
        />
        <select
          value={area ?? ""}
          onChange={(event) => setArea(event.target.value.length > 0 ? event.target.value : null)}
          className="bg-transparent text-xs"
          aria-label="Filter board by area"
        >
          <option value="">All areas</option>
          {areas.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
        {query.isPending && items.length === 0 ? (
          <p className="text-xs opacity-70">Loading board…</p>
        ) : null}
        {query.error ? <p className="text-xs">{query.error}</p> : null}
        {selected ? (
          <BoardCardEditor
            key={selected.id}
            item={selected}
            items={items}
            areas={areas}
            onClose={() => setSelectedId(null)}
            onSave={(draft) => {
              const fields = boardCardUpsertFields(selected, draft);
              if (!fields) return;
              void upsert({
                environmentId: props.environmentId,
                input: { projectId: props.projectId, itemId: selected.id, ...fields },
              });
              setSelectedId(null);
            }}
            onDelete={() => {
              void remove({
                environmentId: props.environmentId,
                input: { projectId: props.projectId, itemId: selected.id },
              });
              setSelectedId(null);
            }}
          />
        ) : null}
        {selected ? null : (
          <div className="mb-2 flex flex-wrap gap-1">
            {PROJECT_BOARD_STATUS_ORDER.map((status) =>
              grouped.active[status].length > 0 ? (
                <span
                  key={status}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                    BOARD_STATUS_STYLES[status].chip,
                  )}
                >
                  {grouped.active[status].length} {projectBoardStatusLabel(status)}
                </span>
              ) : null,
            )}
          </div>
        )}
        {selected
          ? null
          : PROJECT_BOARD_STATUS_ORDER.map((status) => {
              const section = grouped.active[status];
              if (section.length === 0) return null;
              return (
                <Collapsible
                  key={status}
                  defaultOpen={status === "inProgress" || status === "ready"}
                  className="mb-1"
                >
                  <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-xs font-medium text-foreground/85 hover:bg-accent/40">
                    <ChevronRight
                      aria-hidden
                      className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-open:rotate-90 group-data-panel-open:rotate-90"
                    />
                    <span
                      aria-hidden
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        BOARD_STATUS_STYLES[status].accent,
                      )}
                    />
                    <span>{projectBoardStatusLabel(status)}</span>
                    <span className="tabular-nums text-muted-foreground">{section.length}</span>
                  </CollapsibleTrigger>
                  <CollapsiblePanel>
                    {section.map((item) => (
                      <div
                        key={item.id}
                        className="group/card rounded-md px-1.5 py-1.5 hover:bg-accent/40"
                      >
                        <div className="flex items-start gap-2">
                          <span
                            aria-hidden
                            className={cn(
                              "mt-1 h-4 w-0.5 shrink-0 rounded-full",
                              BOARD_STATUS_STYLES[item.status].accent,
                            )}
                          />
                          <button
                            type="button"
                            className="min-w-0 flex-1 truncate text-left text-sm leading-5"
                            onClick={() => setSelectedId(item.id)}
                          >
                            {projectBoardItemDisplayTitle(item.title)}
                          </button>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 pl-3">
                          {item.area ? (
                            <span className="shrink-0 rounded bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                              {item.area}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            className={cn(
                              "shrink-0 cursor-pointer rounded px-1.5 py-px text-[10px] font-medium uppercase tracking-wide",
                              BOARD_STATUS_STYLES[item.status].chip,
                            )}
                            aria-label={`${projectBoardStatusLabel(item.status)}. Advance status.`}
                            onClick={() => {
                              void upsert({
                                environmentId: props.environmentId,
                                input: {
                                  projectId: props.projectId,
                                  itemId: item.id,
                                  title: item.title,
                                  status: nextProjectBoardItemStatus(item.status),
                                },
                              });
                            }}
                          >
                            {projectBoardStatusLabel(item.status)}
                          </button>
                          <span className="ml-auto flex items-center gap-1 opacity-0 group-hover/card:opacity-100">
                            <button
                              type="button"
                              className="cursor-pointer rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                              onClick={() =>
                                insertPrompt(
                                  isTandemDelegation(item)
                                    ? buildTandemDelegationPrompt(item)
                                    : buildBoardImplementPrompt(item),
                                )
                              }
                            >
                              Start
                            </button>
                            <button
                              type="button"
                              className="cursor-pointer rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                              onClick={() => {
                                void archive({
                                  environmentId: props.environmentId,
                                  input: { projectId: props.projectId, itemId: item.id },
                                });
                              }}
                            >
                              Archive
                            </button>
                          </span>
                        </div>
                      </div>
                    ))}
                  </CollapsiblePanel>
                </Collapsible>
              );
            })}
        {!selected && showArchived && grouped.archived.length > 0 ? (
          <section>
            <h3 className="mb-1 text-xs font-medium opacity-70">Archived</h3>
            <ul className="flex flex-col gap-1">
              {grouped.archived.map((item) => (
                <li key={item.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate opacity-70">
                    {projectBoardItemDisplayTitle(item.title)}
                  </span>
                  <button
                    type="button"
                    className="text-xs"
                    onClick={() => {
                      void restore({
                        environmentId: props.environmentId,
                        input: { projectId: props.projectId, itemId: item.id },
                      });
                    }}
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {selected ? null : (
          <ProjectActivityTimeline
            environmentId={props.environmentId}
            projectId={props.projectId}
          />
        )}
      </div>
    </div>
  );
}
