import { ChevronDownIcon, FolderIcon } from "lucide-react";

import { cn } from "../lib/utils";

/** Fork: a collapsible project header above that project's Active rows. */
export function SidebarProjectHeader(props: {
  readonly name: string;
  readonly expanded: boolean;
  readonly count: number;
  readonly working: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <li className="list-none">
      <button
        type="button"
        data-thread-selection-safe
        aria-expanded={props.expanded}
        className="mt-2 mb-0.5 flex h-7 w-full cursor-pointer items-center gap-2 rounded-md px-2.5 text-left text-xs font-medium text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
        onClick={props.onToggle}
      >
        <ChevronDownIcon
          aria-hidden
          className={cn("size-3 shrink-0", !props.expanded && "-rotate-90")}
        />
        <FolderIcon aria-hidden className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{props.name}</span>
        {!props.expanded && props.working ? (
          <span aria-label="Working" className="size-1.5 shrink-0 rounded-full bg-info" />
        ) : null}
        {!props.expanded ? (
          <span className="shrink-0 tabular-nums text-sidebar-muted-foreground/65">
            {props.count}
          </span>
        ) : null}
      </button>
    </li>
  );
}
