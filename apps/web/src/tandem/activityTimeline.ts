import type { ProjectActivityItem } from "@t3tools/contracts";

export interface ProjectActivityDayGroup {
  readonly key: string;
  readonly label: string;
  readonly items: ReadonlyArray<ProjectActivityItem>;
}

interface GroupOptions {
  readonly now?: Date;
  readonly locale?: string;
  readonly timeZone?: string;
}

function dateParts(date: Date, timeZone?: string) {
  const parts = new Intl.DateTimeFormat("en", {
    ...(timeZone ? { timeZone } : {}),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

function dayKey(date: Date, timeZone?: string): string {
  const { year, month, day } = dateParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function previousDayKey(date: Date, timeZone?: string): string {
  const { year, month, day } = dateParts(date, timeZone);
  return dayKey(new Date(Date.UTC(year, month - 1, day - 1, 12)), "UTC");
}

export function groupProjectActivityByDay(
  items: ReadonlyArray<ProjectActivityItem>,
  options: GroupOptions = {},
): ReadonlyArray<ProjectActivityDayGroup> {
  const now = options.now ?? new Date();
  const today = dayKey(now, options.timeZone);
  const yesterday = previousDayKey(now, options.timeZone);
  const groups = new Map<string, ProjectActivityItem[]>();

  for (const item of items) {
    const key = dayKey(new Date(item.occurredAt), options.timeZone);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }

  return Array.from(groups, ([key, groupItems]) => ({
    key,
    label:
      key === today
        ? "Today"
        : key === yesterday
          ? "Yesterday"
          : new Intl.DateTimeFormat(options.locale, {
              ...(options.timeZone ? { timeZone: options.timeZone } : {}),
              year: "numeric",
              month: "short",
              day: "numeric",
            }).format(new Date(groupItems[0]!.occurredAt)),
    items: groupItems,
  }));
}

export function formatCheckpointSummary(
  item: Extract<ProjectActivityItem, { kind: "checkpoint" }>,
): string {
  const files = `${item.fileCount} ${item.fileCount === 1 ? "file" : "files"}`;
  return `${files} · +${item.additions} −${item.deletions}`;
}
