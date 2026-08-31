import { isProviderDriverKind, type ProviderDriverKind } from "@t3tools/contracts";
import { BotIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { ProviderInstanceIcon } from "./components/chat/ProviderInstanceIcon";
import { formatWorktreePathForDisplay } from "./worktreeCleanup";

export type WorkspaceScopeMismatch = {
  readonly threadWorktree: string;
  readonly usedPath: string;
  readonly provider: ProviderDriverKind | null;
};

const THREAD_PREFIX = "Thread worktree: ";
const USED_PREFIX = "Used path: ";
const PROVIDER_PREFIX = "Provider: ";

export function parseWorkspaceScopeWarning(entry: {
  readonly sourceActivityKind?: string;
  readonly detail?: string;
}): WorkspaceScopeMismatch | null {
  if (entry.sourceActivityKind !== "runtime.warning") {
    return null;
  }
  const detail = entry.detail?.trim() ?? "";
  if (!detail.startsWith(THREAD_PREFIX)) {
    return null;
  }
  let threadWorktree = "";
  let usedPath = "";
  let provider: ProviderDriverKind | null = null;
  for (const rawLine of detail.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (line.startsWith(THREAD_PREFIX)) {
      threadWorktree = line.slice(THREAD_PREFIX.length).trim();
    } else if (line.startsWith(USED_PREFIX)) {
      usedPath = line.slice(USED_PREFIX.length).trim();
    } else if (line.startsWith(PROVIDER_PREFIX)) {
      const raw = line.slice(PROVIDER_PREFIX.length).trim();
      provider = isProviderDriverKind(raw) ? raw : null;
    }
  }
  if (!threadWorktree || !usedPath) {
    return null;
  }
  return { threadWorktree, usedPath, provider };
}

export function WorkspaceScopeWarningRow(props: {
  readonly label: string;
  readonly mismatch: WorkspaceScopeMismatch;
  readonly isExpandedToolGroupEntry: boolean;
}) {
  const threadLabel = formatWorktreePathForDisplay(props.mismatch.threadWorktree);
  const usedLabel = formatWorktreePathForDisplay(props.mismatch.usedPath);
  const providerName = props.mismatch.provider ?? "Agent";

  return (
    <div
      className={cn(
        "flex flex-col rounded-md px-0.5",
        props.isExpandedToolGroupEntry ? "py-0" : "py-0.5",
      )}
      data-testid="workspace-scope-warning"
    >
      <div className="flex items-start gap-1.5">
        <span
          className="relative flex size-6 shrink-0 items-center justify-center overflow-visible rounded-md bg-warning/15 text-warning ring-1 ring-warning/50"
          role="img"
          aria-label="Agent used a different checkout"
        >
          {props.mismatch.provider ? (
            <ProviderInstanceIcon
              driverKind={props.mismatch.provider}
              displayName={providerName}
              showBadge={false}
              iconClassName="size-4"
              statusDotClassName="bg-warning"
              indicatorBackground="var(--background)"
            />
          ) : (
            <BotIcon className="size-4" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-6 text-warning">{props.label}</p>
          <dl className="mt-0.5 grid grid-cols-[3.25rem_minmax(0,1fr)] items-baseline gap-x-2 gap-y-0.5 text-xs leading-5">
            <dt className="text-end text-muted-foreground">Thread</dt>
            <dd
              className="min-w-0 truncate font-medium text-foreground"
              title={props.mismatch.threadWorktree}
            >
              {threadLabel}
            </dd>
            <dt className="text-end text-muted-foreground">Agent</dt>
            <dd
              className="min-w-0 truncate font-medium text-warning"
              title={props.mismatch.usedPath}
            >
              {usedLabel}
            </dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
