import { makeWindow } from "@t3tools/shared/usageFormat";
import { Link } from "@tanstack/react-router";
import { GaugeIcon } from "lucide-react";
import { useMemo } from "react";

import { useUsage } from "../../state/usage";
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
  const { environments, isPending } = useUsage(window);
  const hasData = environments.some((environment) => environment.summary !== null);

  return (
    <div className="flex flex-col gap-3">
      {hasData ? (
        <ProviderLimits environments={environments} gridClassName="grid-cols-1" />
      ) : (
        <p className="text-muted-foreground text-xs">
          {isPending ? "Checking provider limits…" : "No limit data yet."}
        </p>
      )}
      <Link
        className="text-muted-foreground text-xs underline-offset-2 hover:underline"
        to="/usage"
      >
        View usage history
      </Link>
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
        <PopoverPopup className="w-[min(90vw,26rem)]" side="top" align="end">
          <ProviderLimitsPopoverBody />
        </PopoverPopup>
      </Popover>
    </SidebarMenuItem>
  );
}
