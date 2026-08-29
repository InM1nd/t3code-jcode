import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ProjectBoardItem, ProjectId } from "@t3tools/contracts";
import { LoaderCircleIcon, PlayIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "../components/ui/button";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { markBoardItemAwaitingTurnLink } from "../lib/boardTurnLinkPending";
import { useProjects } from "../state/entities";
import { projectEnvironment } from "../state/projects";
import { useAtomCommand } from "../state/use-atom-command";
import { buildTandemDelegationPrompt, isTandemDelegation } from "./delegationQueue";

type PreparedDelegation = {
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly item: ProjectBoardItem;
};

export function TandemDelegationQueue() {
  const projects = useProjects();
  const handleNewThread = useNewThreadHandler();
  const upsertBoardItem = useAtomCommand(projectEnvironment.upsertBoardItem, {
    reportFailure: false,
  });
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const delegations = useMemo<ReadonlyArray<PreparedDelegation>>(
    () =>
      projects.flatMap((project) =>
        (project.boardItems ?? [])
          .filter(isTandemDelegation)
          .map((item) => ({ projectId: project.id, environmentId: project.environmentId, item })),
      ),
    [projects],
  );

  const launch = async (delegation: PreparedDelegation) => {
    if (launchingId) return;
    setLaunchingId(delegation.item.id);
    try {
      const created = await handleNewThread(
        scopeProjectRef(delegation.environmentId, delegation.projectId),
        {
          envMode: "worktree",
          startFromOrigin: false,
          seedPrompt: buildTandemDelegationPrompt(delegation.item),
        },
      );
      if (!created) return;
      await upsertBoardItem({
        environmentId: delegation.environmentId,
        input: {
          projectId: delegation.projectId,
          itemId: delegation.item.id,
          title: delegation.item.title,
          status: "inProgress",
          ...(delegation.item.notes !== undefined ? { notes: delegation.item.notes } : {}),
          source: delegation.item.source,
          sourceThreadId: created.threadId,
        },
      });
      markBoardItemAwaitingTurnLink(created.threadId, delegation.item.id);
    } finally {
      setLaunchingId(null);
    }
  };

  if (delegations.length === 0) return null;

  return (
    <section className="border-border/60 border-t pt-2.5">
      <p className="mb-1 px-0.5 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
        Ready to delegate
      </p>
      {delegations.slice(0, 5).map((delegation) => {
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
              disabled={isLaunching}
              onClick={() => void launch(delegation)}
            >
              {isLaunching ? (
                <LoaderCircleIcon className="size-3 animate-spin" />
              ) : (
                <PlayIcon className="size-3" />
              )}
              Launch
            </Button>
          </div>
        );
      })}
    </section>
  );
}
