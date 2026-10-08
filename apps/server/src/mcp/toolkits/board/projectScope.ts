import { ProjectId, TurnId } from "@t3tools/contracts";

/**
 * A thread caller stays on its own project. A client outside a thread must
 * name the project. An explicit id that disagrees with the caller is refused.
 */
export function resolveCallerBoardProject(input: {
  readonly callerProjectId: ProjectId | undefined;
  readonly requestedProjectId: ProjectId | undefined;
}): ProjectId | "missing" | "mismatch" {
  if (input.requestedProjectId !== undefined) {
    if (input.callerProjectId !== undefined && input.callerProjectId !== input.requestedProjectId) {
      return "mismatch";
    }
    return input.requestedProjectId;
  }
  return input.callerProjectId ?? "missing";
}

/** The latest provider turn is the one an agent card should remember. */
export function latestBoardTurnId(
  turns: ReadonlyArray<{ readonly id: string; readonly ordinal: number }>,
): TurnId | undefined {
  let latest: { readonly id: string; readonly ordinal: number } | undefined;
  for (const turn of turns) {
    if (latest === undefined || turn.ordinal >= latest.ordinal) latest = turn;
  }
  return latest === undefined ? undefined : TurnId.make(latest.id);
}
