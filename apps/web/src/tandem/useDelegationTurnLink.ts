import type { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { TurnId } from "@t3tools/contracts";
import { useEffect, useMemo } from "react";

import {
  consumeBoardItemAwaitingTurnLink,
  peekBoardItemAwaitingTurnLink,
} from "../lib/boardTurnLinkPending";
import { projectBoardItems, upsertBoardItem } from "../state/projectBoard";
import { useEnvironmentQuery } from "../state/query";
import { useAtomCommand } from "../state/use-atom-command";

/** Attach the first provider turn of a launched delegation to its card. */
export function useDelegationTurnLink(input: {
  readonly environmentId: EnvironmentId | null;
  readonly projectId: ProjectId | null;
  readonly threadId: ThreadId | null;
  readonly latestTurnId: string | null;
}) {
  const upsert = useAtomCommand(upsertBoardItem, { reportFailure: false });
  const boardAtom = useMemo(
    () =>
      input.environmentId && input.projectId
        ? projectBoardItems({
            environmentId: input.environmentId,
            input: { projectId: input.projectId },
          })
        : null,
    [input.environmentId, input.projectId],
  );
  const board = useEnvironmentQuery(boardAtom);

  useEffect(() => {
    if (!input.threadId || !input.latestTurnId || !input.environmentId || !input.projectId) {
      return;
    }
    if (!peekBoardItemAwaitingTurnLink(input.threadId)) return;
    if (!board.data) return;
    const itemId = consumeBoardItemAwaitingTurnLink(input.threadId);
    if (!itemId) return;
    const item = board.data.items.find((entry) => entry.id === itemId);
    if (!item) return;
    const linkTurnId = TurnId.make(input.latestTurnId);
    if (item.linkedTurnIds?.includes(linkTurnId)) return;
    void upsert({
      environmentId: input.environmentId,
      input: {
        projectId: input.projectId,
        itemId: item.id,
        title: item.title,
        status: item.status,
        ...(item.notes !== undefined ? { notes: item.notes } : {}),
        ...(item.source !== undefined ? { source: item.source } : {}),
        sourceThreadId: item.sourceThreadId ?? input.threadId,
        linkTurnId,
      },
    });
  }, [
    board.data,
    input.environmentId,
    input.latestTurnId,
    input.projectId,
    input.threadId,
    upsert,
  ]);
}
