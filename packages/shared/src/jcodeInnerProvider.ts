/**
 * Resolve which LLM-backend brand icon to show next to the Jcode harness icon.
 *
 * jcode itself is not a model vendor — it routes to claude / openai / cursor / …
 * via `-p` / login. T3 surfaces that as a second icon beside Jcode.
 */

export type JcodeInnerProviderIconKind = "claudeAgent" | "cursor" | "codex" | "grok";

const JCODE_PROVIDER_TO_ICON: Record<string, JcodeInnerProviderIconKind> = {
  claude: "claudeAgent",
  "anthropic-api": "claudeAgent",
  openai: "codex",
  "openai-api": "codex",
  "openai-compatible": "codex",
  cursor: "cursor",
  grok: "grok",
  xai: "grok",
};

function normalizeToken(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
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
