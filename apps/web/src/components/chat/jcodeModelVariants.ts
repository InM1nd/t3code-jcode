const REASONING_SUFFIXES = new Set(["low", "medium", "high", "xhigh", "max", "ultra"]);

type Variant = {
  readonly slug: string;
  readonly base: string;
  readonly reasoning: string;
  readonly speed: string;
};

function parseVariant(slug: string): Variant {
  const parts = slug.split("-");
  const speed = parts.at(-1) === "fast" ? "fast" : "standard";
  if (speed === "fast") parts.pop();
  const reasoning = REASONING_SUFFIXES.has(parts.at(-1) ?? "")
    ? (parts.pop() ?? "standard")
    : "standard";
  return { slug, base: parts.join("-"), reasoning, speed };
}

export function resolveJcodeModelVariants(
  models: ReadonlyArray<{ readonly slug: string }>,
  currentSlug: string,
) {
  const current = parseVariant(currentSlug);
  const family = models
    .map((model) => parseVariant(model.slug))
    .filter((item) => item.base === current.base);
  if (family.length < 2 || !family.some((item) => item.slug === currentSlug)) return null;

  const reasoning = [...new Set(family.map((item) => item.reasoning))];
  const speed = [...new Set(family.map((item) => item.speed))];
  const slugForReasoning = (nextReasoning: string) =>
    family.find((item) => item.reasoning === nextReasoning && item.speed === current.speed)?.slug ??
    family.find((item) => item.reasoning === nextReasoning)?.slug ??
    null;
  const slugForSpeed = (nextSpeed: string) =>
    family.find((item) => item.reasoning === current.reasoning && item.speed === nextSpeed)?.slug ??
    family.find((item) => item.speed === nextSpeed)?.slug ??
    null;
  return {
    reasoning,
    speed,
    selectedReasoning: current.reasoning,
    selectedSpeed: current.speed,
    slugForReasoning,
    slugForSpeed,
    slugFor: (nextReasoning: string, nextSpeed: string) =>
      family.find((item) => item.reasoning === nextReasoning && item.speed === nextSpeed)?.slug ??
      null,
  };
}
