import { memo } from "react";
import { ProviderDriverKind } from "@t3tools/contracts";
import {
  readJcodeProviderSetting,
  resolveJcodeInnerProviderIconKind,
  type JcodeInnerProviderIconKind,
} from "@t3tools/shared/jcodeInnerProvider";

import { ProviderInstanceIcon } from "./ProviderInstanceIcon";
import { PROVIDER_ICON_BY_PROVIDER } from "./providerIconUtils";
import { cn } from "~/lib/utils";

const INNER_KIND_TO_DRIVER: Record<JcodeInnerProviderIconKind, ProviderDriverKind> = {
  claudeAgent: ProviderDriverKind.make("claudeAgent"),
  cursor: ProviderDriverKind.make("cursor"),
  codex: ProviderDriverKind.make("codex"),
  grok: ProviderDriverKind.make("grok"),
};

const INNER_KIND_LABEL: Record<JcodeInnerProviderIconKind, string> = {
  claudeAgent: "Claude",
  cursor: "Cursor",
  codex: "Codex",
  grok: "Grok",
};

const JCODE_DRIVER = ProviderDriverKind.make("jcode");

export function formatJcodeThreadProviderLabel(input: {
  readonly innerKind: JcodeInnerProviderIconKind | null | undefined;
  readonly modelLabel: string;
}): string {
  const model = input.modelLabel.trim() || "model";
  const inner = input.innerKind ? INNER_KIND_LABEL[input.innerKind] : null;
  return inner ? `Jcode · ${inner} · ${model}` : `Jcode · ${model}`;
}

export function isJcodeDriverKind(driverKind: ProviderDriverKind | null | undefined): boolean {
  return driverKind === JCODE_DRIVER;
}

export function resolveThreadInnerProviderIconKind(input: {
  readonly driverKind: ProviderDriverKind | null | undefined;
  readonly model: string | null | undefined;
  readonly instanceId: string;
  readonly providerInstances?:
    | Readonly<Record<string, { readonly config?: unknown } | undefined>>
    | null
    | undefined;
  readonly legacyJcodeProvider?: string | null | undefined;
}): JcodeInnerProviderIconKind | null {
  if (input.driverKind !== JCODE_DRIVER) return null;
  return resolveJcodeInnerProviderIconKind({
    jcodeProvider: readJcodeProviderSetting({
      instanceId: input.instanceId,
      providerInstances: input.providerInstances,
      legacyJcodeProvider: input.legacyJcodeProvider,
    }),
    model: input.model,
  });
}

/** Jcode harness icon, optionally followed by the inner LLM brand icon. */
export const ThreadProviderIcons = memo(function ThreadProviderIcons(props: {
  driverKind: ProviderDriverKind;
  displayName: string;
  innerKind?: JcodeInnerProviderIconKind | null;
  iconClassName?: string;
  className?: string;
}) {
  const innerDriver = props.innerKind ? INNER_KIND_TO_DRIVER[props.innerKind] : null;
  const InnerIcon = innerDriver ? (PROVIDER_ICON_BY_PROVIDER[innerDriver] ?? null) : null;
  const innerLabel = props.innerKind ? INNER_KIND_LABEL[props.innerKind] : null;
  const title =
    props.driverKind === JCODE_DRIVER
      ? innerLabel
        ? `Jcode · ${innerLabel}`
        : "Jcode"
      : props.displayName;

  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-0.5", props.className)}
      title={title}
    >
      <ProviderInstanceIcon
        driverKind={props.driverKind}
        displayName={props.displayName}
        {...(props.iconClassName ? { iconClassName: props.iconClassName } : {})}
      />
      {InnerIcon ? (
        <InnerIcon className={cn("size-3.5 shrink-0", props.iconClassName)} aria-hidden />
      ) : null}
    </span>
  );
});
