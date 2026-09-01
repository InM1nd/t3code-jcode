export interface ActivePortEntry {
  readonly port: number;
  readonly processName: string | null;
  readonly threadTitle: string;
}

export function formatActivePortsPromptBlock(
  entries: ReadonlyArray<ActivePortEntry>,
): string | null {
  if (entries.length === 0) return null;
  const lines = entries
    .toSorted((left, right) => left.port - right.port)
    .map(
      (entry) =>
        `- ${entry.port}${entry.processName ? ` (${entry.processName})` : ""} — thread "${entry.threadTitle}"`,
    );
  return [
    "<t3_active_ports>",
    "Other threads in this environment currently have local dev servers running on these ports. Do not stop, reuse, or rebind them without checking with the user first:",
    ...lines,
    "</t3_active_ports>",
  ].join("\n");
}

export function prependActivePortsToTurnInput(
  input: string | undefined,
  block: string | null,
): string | undefined {
  if (!block) return input;
  const trimmed = input?.trim();
  if (!trimmed) return block;
  return `${block}\n\n${trimmed}`;
}
