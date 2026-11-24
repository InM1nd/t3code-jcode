/**
 * Resolve which LLM-backend brand icon to show next to the Jcode harness icon.
 *
 * jcode itself is not a model vendor — it routes to claude / openai / cursor / …
 * via `-p` / login. T3 surfaces that as a second icon beside Jcode.
 */

import { ProviderDriverKind } from "@t3tools/contracts";

export const JCODE_INNER_PROVIDERS = [
  { id: "claude", label: "Claude", driverKind: ProviderDriverKind.make("claudeAgent") },
  { id: "openai", label: "Codex", driverKind: ProviderDriverKind.make("codex") },
  { id: "cursor", label: "Cursor", driverKind: ProviderDriverKind.make("cursor") },
  { id: "xai", label: "Grok", driverKind: ProviderDriverKind.make("grok") },
  { id: "opencode", label: "OpenCode", driverKind: ProviderDriverKind.make("opencode") },
  { id: "antigravity", label: "Antigravity", driverKind: ProviderDriverKind.make("antigravity") },
] as const;

export type JcodeInnerProvider = (typeof JCODE_INNER_PROVIDERS)[number];

export type JcodeInnerProviderIconKind =
  | "claudeAgent"
  | "cursor"
  | "codex"
  | "grok"
  | "opencode"
  | "antigravity";

const JCODE_PROVIDER_TO_ICON: Record<string, JcodeInnerProviderIconKind> = {
  claude: "claudeAgent",
  "anthropic-api": "claudeAgent",
  openai: "codex",
  "openai-api": "codex",
  "openai-compatible": "codex",
  cursor: "cursor",
  grok: "grok",
  xai: "grok",
  opencode: "opencode",
  "opencode-go": "opencode",
  antigravity: "antigravity",
  gemini: "antigravity",
  "gemini-api": "antigravity",
};

function normalizeToken(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

/** The explicit provider choices supported by the Jcode model picker. */
export function resolveJcodeInnerProvider(
  value: string | null | undefined,
): JcodeInnerProvider | null {
  const token = normalizeToken(value);
  return JCODE_INNER_PROVIDERS.find((provider) => provider.id === token) ?? null;
}

function iconKindFromJcodeProvider(jcodeProvider: string): JcodeInnerProviderIconKind | null {
  const token = normalizeToken(jcodeProvider);
  if (!token || token === "auto") return null;
  return JCODE_PROVIDER_TO_ICON[token] ?? null;
}

function iconKindFromModelSlug(model: string): JcodeInnerProviderIconKind | null {
  const slug = normalizeToken(model);
  if (!slug) return null;
  if (
    slug.includes("claude") ||
    slug.includes("anthropic") ||
    slug.includes("opus") ||
    slug.includes("sonnet") ||
    slug.includes("haiku")
  ) {
    return "claudeAgent";
  }
  if (slug.includes("cursor") || slug.includes("composer")) {
    return "cursor";
  }
  if (slug.includes("grok") || slug.startsWith("xai")) {
    return "grok";
  }
  if (slug.includes("opencode")) {
    return "opencode";
  }
  if (slug.includes("antigravity")) {
    return "antigravity";
  }
  if (
    slug.includes("gpt") ||
    slug.includes("codex") ||
    slug.startsWith("o1") ||
    slug.startsWith("o3") ||
    slug.startsWith("o4")
  ) {
    return "codex";
  }
  return null;
}

/**
 * The `-p` id implied by a model slug. Used when a turn never recorded
 * `jcodeProvider`. The harness toggle records the backend explicitly.
 */
export function inferJcodeInnerProviderId(
  model: string | null | undefined,
): JcodeInnerProvider["id"] | undefined {
  switch (iconKindFromModelSlug(model ?? "")) {
    case "claudeAgent":
      return "claude";
    case "cursor":
      return "cursor";
    case "codex":
      return "openai";
    case "grok":
      return "xai";
    case "opencode":
      return "opencode";
    case "antigravity":
      return "antigravity";
    default:
      return undefined;
  }
}

/** The jcode `-p` id for a Tandem driver. Jcode itself and unknown drivers have none. */
export function jcodeProviderForDriverKind(
  driverKind: string | null | undefined,
): JcodeInnerProvider | null {
  if (!driverKind || driverKind === "jcode") return null;
  return JCODE_INNER_PROVIDERS.find((provider) => provider.driverKind === driverKind) ?? null;
}

/** Map a discovered model's `subProvider` label (or a raw `-p` id) to the launch id. */
export function jcodeProviderIdForSubProvider(
  subProvider: string | null | undefined,
): JcodeInnerProvider["id"] | undefined {
  const token = normalizeToken(subProvider);
  if (!token) return undefined;
  return JCODE_INNER_PROVIDERS.find(
    (provider) => provider.id === token || normalizeToken(provider.label) === token,
  )?.id;
}

/**
 * Record the Via backend on a model selection. Replaces any previous
 * `jcodeProvider` option so a remembered choice cannot point at another backend.
 */
export function withJcodeProviderOption<
  T extends {
    readonly options?: ReadonlyArray<{
      readonly id: string;
      readonly value: string | boolean;
    }>;
  },
>(selection: T, providerId: string | null | undefined): T {
  const provider = resolveJcodeInnerProvider(providerId);
  if (!provider) return selection;
  const options = [
    { id: "jcodeProvider", value: provider.id },
    ...(selection.options ?? []).filter((option) => option.id !== "jcodeProvider"),
  ];
  return { ...selection, options };
}

export function readJcodeProviderOption(
  options:
    | ReadonlyArray<{ readonly id: string; readonly value: string | boolean }>
    | null
    | undefined,
): string | undefined {
  const value = options?.find((option) => option.id === "jcodeProvider")?.value;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Prefer an explicit jcode `-p` setting; fall back to model-slug heuristics.
 */
export function resolveJcodeInnerProviderIconKind(input: {
  readonly jcodeProvider?: string | null | undefined;
  readonly model?: string | null | undefined;
}): JcodeInnerProviderIconKind | null {
  return (
    iconKindFromJcodeProvider(input.jcodeProvider ?? "") ?? iconKindFromModelSlug(input.model ?? "")
  );
}

/**
 * Read `jcodeProvider` from instance config or the legacy providers.jcode blob.
 */
export function readJcodeProviderSetting(input: {
  readonly instanceId: string;
  readonly providerInstances?:
    | Readonly<Record<string, { readonly config?: unknown } | undefined>>
    | null
    | undefined;
  readonly legacyJcodeProvider?: string | null | undefined;
}): string | undefined {
  const config = input.providerInstances?.[input.instanceId]?.config;
  if (config !== null && typeof config === "object") {
    const value = (config as Record<string, unknown>).jcodeProvider;
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  const legacy = input.legacyJcodeProvider?.trim();
  return legacy || undefined;
}
