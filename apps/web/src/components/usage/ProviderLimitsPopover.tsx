import { makeWindow } from "@t3tools/shared/usageFormat";
import { Link } from "@tanstack/react-router";
import { GaugeIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useMemo } from "react";

import { useUsage } from "../../state/usage";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { SidebarMenuButton, SidebarMenuItem } from "../ui/sidebar";
import { ProviderLimits } from "./ProviderLimits";

/**
 * Popup body is a separate component so `useUsage` only starts fetching once
 * the popover actually opens: `PopoverPopup` doesn't mount its children
 * until then, so the per-environment provider-limit requests (live HTTP
 * calls to Anthropic/Cursor/OpenCode plus a Codex transcript scan) don't
 * fire on every app boot.
 */
function ProviderLimitsPopoverBody() {
  const window = useMemo(() => makeWindow(1), []);
  const { environments, isPending, refresh } = useUsage(window);
  const hasData = environments.some((environment) => environment.summary !== null);

  // The shared usage query caches for 60s so re-rendering or switching
  // windows doesn't re-trigger the (slow) transcript scan; that also means a
  // stale reading from the last minute can be showing when this opens.
  // Force a live refetch every time the popover opens instead of waiting.
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per popover open, not on every environment list change
  }, []);

  return (
    <div className="flex flex-col gap-2">
      {hasData ? (
        <ProviderLimits environments={environments} gridClassName="grid-cols-1" compact />
      ) : (
        <p className="text-muted-foreground text-xs">
          {isPending ? "Checking provider limits…" : "No limit data yet."}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <Link
          className="text-muted-foreground text-xs underline-offset-2 hover:underline"
          to="/usage"
        >
          View usage history
        </Link>
        <Button
          aria-label="Refresh provider limits"
          className="size-6 text-muted-foreground"
          disabled={isPending}
          onClick={() => refresh()}
          size="icon-xs"
          variant="ghost"
        >
          <RefreshCwIcon className={isPending ? "size-3 animate-spin" : "size-3"} />
        </Button>
      </div>
    </div>
  );
}

/** Sidebar shortcut for the same provider-limit cards the Usage page shows. */
export function ProviderLimitsWidgetButton() {
  return (
    <SidebarMenuItem>
      <Popover>
        <PopoverTrigger render={<SidebarMenuButton aria-label="Provider limits" size="icon" />}>
          <GaugeIcon />
        </PopoverTrigger>
        <PopoverPopup className="w-[min(85vw,16rem)]" side="top" align="end">
          <ProviderLimitsPopoverBody />
        </PopoverPopup>
      </Popover>
    </SidebarMenuItem>
  );
}
