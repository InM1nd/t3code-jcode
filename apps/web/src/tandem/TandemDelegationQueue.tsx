import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ProjectBoardItem, ProjectId } from "@t3tools/contracts";
import { PlayIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useComposerDraftStore } from "../composerDraftStore";
import { Button } from "../components/ui/button";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { markBoardItemAwaitingTurnLink } from "../lib/boardTurnLinkPending";
import { useProjects } from "../state/entities";
import { projectBoardItems, upsertBoardItem } from "../state/projectBoard";
import { useEnvironmentQuery } from "../state/query";
import { useAtomCommand } from "../state/use-atom-command";
import { buildTandemDelegationPrompt, isTandemDelegation } from "./delegationQueue";

type PreparedDelegation = {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly item: ProjectBoardItem;
};

function ProjectReadyReporter(props: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly onChange: (key: string, items: ReadonlyArray<PreparedDelegation>) => void;
}) {
  const key = `${props.environmentId}:${props.projectId}`;
  const boardAtom = useMemo(
    () =>
      projectBoardItems({
        environmentId: props.environmentId,
        input: { projectId: props.projectId },
      }),
    [props.environmentId, props.projectId],
  );
  const board = useEnvironmentQuery(boardAtom);
  const ready = useMemo(
    () =>
      (board.data?.items ?? []).filter(isTandemDelegation).map((item) => ({
        environmentId: props.environmentId,
        projectId: props.projectId,
        item,
      })),
    [board.data?.items, props.environmentId, props.projectId],
  );

  useEffect(() => {
    props.onChange(key, ready);
    return () => props.onChange(key, []);
  }, [key, props.onChange, ready]);

  return null;
}

export function TandemDelegationQueue() {
  const projects = useProjects();
  const handleNewThread = useNewThreadHandler();
  const upsert = useAtomCommand(upsertBoardItem, { reportFailure: false });
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [byProject, setByProject] = useState<
    ReadonlyMap<string, ReadonlyArray<PreparedDelegation>>
  >(() => new Map());
  const onChange = useCallback((key: string, items: ReadonlyArray<PreparedDelegation>) => {
    setByProject((current) => {
      const next = new Map(current);
      if (items.length === 0) next.delete(key);
      else next.set(key, items);
      return next;
    });
  }, []);
  const delegations = useMemo(() => [...byProject.values()].flat().slice(0, 5), [byProject]);

  const launch = async (delegation: PreparedDelegation) => {
    if (launchingId) return;
    setLaunchingId(delegation.item.id);
    try {
      const created = await handleNewThread(
        scopeProjectRef(delegation.environmentId, delegation.projectId),
        { envMode: "worktree", startFromOrigin: false },
      );
      if (!created) return;
      useComposerDraftStore
        .getState()
        .setPrompt(created.draftId, buildTandemDelegationPrompt(delegation.item));
      await upsert({
        environmentId: delegation.environmentId,
        input: {
          projectId: delegation.projectId,
          itemId: delegation.item.id,
          title: delegation.item.title,
          status: "inProgress",
          ...(delegation.item.notes !== undefined ? { notes: delegation.item.notes } : {}),
          ...(delegation.item.source !== undefined ? { source: delegation.item.source } : {}),
          sourceThreadId: created.threadId,
        },
      });
      markBoardItemAwaitingTurnLink(created.threadId, delegation.item.id);
    } finally {
      setLaunchingId(null);
    }
  };

  return (
    <>
      {projects.map((project) => (
        <ProjectReadyReporter
          key={`${project.environmentId}:${project.id}`}
          environmentId={project.environmentId}
          projectId={project.id}
          onChange={onChange}
        />
      ))}
      {delegations.length === 0 ? null : (
        <section className="border-border/60 border-t pt-2.5">
          <p className="mb-1 px-0.5 font-medium text-2xs text-muted-foreground uppercase tracking-wide">
            Ready to delegate
          </p>
          {delegations.map((delegation) => {
            const isLaunching = launchingId === delegation.item.id;
            return (
              <div
                key={`${delegation.environmentId}:${delegation.item.id}`}
                className="flex gap-2 px-1.5 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{delegation.item.title}</span>
                <Button
                  size="xs"
                  variant="secondary"
                  disabled={launchingId !== null}
                  onClick={() => void launch(delegation)}
                >
                  {isLaunching ? null : <PlayIcon className="size-3" />}
                  {isLaunching ? "Launching" : "Launch"}
                </Button>
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}
