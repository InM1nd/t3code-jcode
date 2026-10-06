import {
  ProjectBoardItemId,
  type EnvironmentId,
  type ProjectBoardItem,
  type ProjectId,
} from "@t3tools/contracts";
import { useMemo, useState } from "react";

import type { ComposerThreadTarget } from "../composerDraftStore";
import { useComposerDraftStore } from "../composerDraftStore";
import { useEnvironmentQuery } from "../state/query";
import {
  archiveBoardItem,
  projectBoardItems,
  restoreBoardItem,
  upsertBoardItem,
} from "../state/projectBoard";
import { useAtomCommand } from "../state/use-atom-command";
import { randomUUID } from "~/lib/utils";
import { buildTandemDelegationPrompt, isTandemDelegation } from "../tandem/delegationQueue";
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
  const [title, setTitle] = useState("");
  const [search, setSearch] = useState("");
  const [area, setArea] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const items = query.data?.items ?? [];
  const searched = filterProjectBoardItemsByQuery(items, search);
  const visible = filterProjectBoardItemsByArea(searched, area);
  const grouped = groupProjectBoardItems(visible);
  const areas = getProjectBoardAreas(items);
  const activeCount = items.filter((item) => !item.archivedAt).length;

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
          <div className="truncate text-xs opacity-70" title={formatQuietBoardLabel(activeCount)}>
            {formatQuietBoardLabel(activeCount)}
          </div>
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
        {PROJECT_BOARD_STATUS_ORDER.map((status) => {
          const section = grouped.active[status];
          if (section.length === 0) return null;
          return (
            <section key={status} className="mb-3">
              <h3 className="mb-1 text-xs font-medium opacity-70">
                {projectBoardStatusLabel(status)}
              </h3>
              <ul className="flex flex-col gap-1">
                {section.map((item) => (
                  <li key={item.id} className="flex items-start gap-2">
                    <button
                      type="button"
                      className="mt-0.5 shrink-0 text-xs opacity-70"
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
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{projectBoardItemDisplayTitle(item.title)}</div>
                      {item.area ? (
                        <div className="truncate text-xs opacity-70">{item.area}</div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="shrink-0 text-xs opacity-70"
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
                      className="shrink-0 text-xs opacity-70"
                      onClick={() => {
                        void archive({
                          environmentId: props.environmentId,
                          input: { projectId: props.projectId, itemId: item.id },
                        });
                      }}
                    >
                      Archive
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {showArchived && grouped.archived.length > 0 ? (
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
        <HandoffActivity items={items} />
      </div>
    </div>
  );
}

function HandoffActivity(props: { readonly items: ReadonlyArray<ProjectBoardItem> }) {
  const handoffs = props.items
    .flatMap((item) => (item.latestHandoff ? [{ item, handoff: item.latestHandoff }] : []))
    .sort((left, right) => right.handoff.createdAt.localeCompare(left.handoff.createdAt))
    .slice(0, 12);
  if (handoffs.length === 0) return null;
  return (
    <section className="mt-4 border-t pt-3">
      <h3 className="mb-1 text-xs font-medium opacity-70">Activity</h3>
      <ul className="flex flex-col gap-2">
        {handoffs.map((entry) => (
          <li key={entry.item.id}>
            <div className="truncate text-xs">{projectBoardItemDisplayTitle(entry.item.title)}</div>
            <p className="text-xs opacity-70">{entry.handoff.summary}</p>
            <p className="text-xs opacity-70">Next: {entry.handoff.nextStep}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
