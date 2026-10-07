import { ZapIcon } from "lucide-react";

import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import {
  formatTurnUsageDetail,
  formatTurnUsageLabel,
  type TandemTurnUsage as TandemTurnUsageValue,
} from "./turnUsage";

export function TandemTurnUsage({ usage }: { usage: TandemTurnUsageValue | undefined }) {
  if (!usage) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            aria-label={formatTurnUsageDetail(usage)}
            className="inline-flex items-center text-muted-foreground"
          />
        }
      >
        <ZapIcon aria-hidden className="mr-1 size-3" />
        {formatTurnUsageLabel(usage)}
      </TooltipTrigger>
      <TooltipPopup className="max-w-72 whitespace-normal" side="top">
        {formatTurnUsageDetail(usage)}
      </TooltipPopup>
    </Tooltip>
  );
}
