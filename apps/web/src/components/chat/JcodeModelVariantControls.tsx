import { useMemo } from "react";

import { cn } from "~/lib/utils";
import { resolveJcodeModelVariants } from "./jcodeModelVariants";

/**
 * Reasoning and speed choices for the selected Jcode model. Shown only when
 * the catalog has a discovered sibling. Selecting one picks that model the
 * same way as choosing it in the list.
 */
export function JcodeModelVariantControls(props: {
  readonly models: ReadonlyArray<{ readonly slug: string }>;
  readonly currentSlug: string;
  readonly onSelect: (slug: string) => void;
}) {
  const variants = useMemo(
    () => resolveJcodeModelVariants(props.models, props.currentSlug),
    [props.currentSlug, props.models],
  );
  if (!variants) return null;
  const showReasoning = variants.reasoning.length > 1;
  const showSpeed = variants.speed.length > 1;
  if (!showReasoning && !showSpeed) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 pt-2">
      {showReasoning ? (
        <VariantGroup
          label="Reasoning"
          values={variants.reasoning}
          selected={variants.selectedReasoning}
          slugFor={variants.slugForReasoning}
          onSelect={props.onSelect}
        />
      ) : null}
      {showSpeed ? (
        <VariantGroup
          label="Speed"
          values={variants.speed}
          selected={variants.selectedSpeed}
          slugFor={variants.slugForSpeed}
          onSelect={props.onSelect}
        />
      ) : null}
    </div>
  );
}

function VariantGroup(props: {
  readonly label: string;
  readonly values: ReadonlyArray<string>;
  readonly selected: string;
  readonly slugFor: (value: string) => string | null;
  readonly onSelect: (slug: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      {props.values.map((value) => {
        const slug = props.slugFor(value);
        if (!slug) return null;
        return (
          <button
            key={value}
            type="button"
            className={cn(
              "rounded px-1.5 py-1 text-xs hover:bg-muted",
              value === props.selected && "bg-muted font-medium",
            )}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              props.onSelect(slug);
            }}
          >
            {value}
          </button>
        );
      })}
    </div>
  );
}
