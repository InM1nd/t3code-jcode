import type { WorkMode } from "@t3tools/contracts";
import { memo } from "react";

import { Select, SelectItem, SelectPopup, SelectValue } from "../ui/select";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  ComposerControlIcon,
  ComposerControlSeparator,
  ComposerSelectControl,
} from "./ComposerControl";
import { useComposerMenuProps } from "./composerEventScope";
import { useComposerMenuState } from "./useComposerMenuState";
import { composerWorkModeById, composerWorkModes } from "./workModes";

export const WorkModeControl = memo(function WorkModeControl(props: {
  readonly workMode: WorkMode;
  readonly size?: "sm" | "xs";
  readonly hidden?: boolean | undefined;
  readonly onWorkModeChange: (mode: WorkMode) => void;
}) {
  const size = props.size ?? "sm";
  const composerFloatingLayerProps = useComposerMenuProps();
  const [open, setOpen] = useComposerMenuState(props.hidden);
  const option = composerWorkModeById[props.workMode];

  return (
    <>
      <ComposerControlSeparator size={size} />
      <Tooltip>
        <Select
          open={open}
          onOpenChange={setOpen}
          value={props.workMode}
          onValueChange={(value) => {
            if (!value || value === props.workMode) return;
            props.onWorkModeChange(value as WorkMode);
          }}
        >
          <TooltipTrigger
            render={
              <ComposerSelectControl size={size} aria-label="Work mode" className="shrink-0" />
            }
          >
            <ComposerControlIcon icon={option.icon} size={size} />
            <SelectValue data-composer-control-label>{option.label}</SelectValue>
          </TooltipTrigger>
          <SelectPopup alignItemWithTrigger={false} {...composerFloatingLayerProps}>
            {composerWorkModes.map((entry) => {
              const OptionIcon = entry.icon;
              return (
                <SelectItem key={entry.mode} value={entry.mode} hideIndicator className="min-w-64">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                        <OptionIcon className="size-3.5 shrink-0 text-muted-foreground" />
                        {entry.label}
                      </span>
                      <span className="text-muted-foreground text-xs leading-4">
                        {entry.description}
                      </span>
                    </div>
                  </div>
                </SelectItem>
              );
            })}
          </SelectPopup>
        </Select>
        <TooltipPopup side="top">{option.description}</TooltipPopup>
      </Tooltip>
    </>
  );
});
