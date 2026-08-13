import { describe, expect, it } from "vite-plus/test";

import { resolveJcodeModelVariants } from "./jcodeModelVariants";

describe("resolveJcodeModelVariants", () => {
  it("returns only discovered reasoning and speed siblings", () => {
    const variants = resolveJcodeModelVariants(
      [
        { slug: "cursor-grok-4.6-high" },
        { slug: "cursor-grok-4.6-high-fast" },
        { slug: "composer-2" },
      ],
      "cursor-grok-4.6-high",
    );

    expect(variants).toMatchObject({
      reasoning: ["high"],
      speed: ["standard", "fast"],
      selectedReasoning: "high",
      selectedSpeed: "standard",
    });
    expect(variants?.slugFor("high", "fast")).toBe("cursor-grok-4.6-high-fast");
  });

  it("resolves an exact discovered combined variant", () => {
    const variants = resolveJcodeModelVariants(
      [{ slug: "gpt-5.6-luna-high" }, { slug: "gpt-5.6-luna-xhigh-fast" }],
      "gpt-5.6-luna-high",
    );

    expect(variants?.slugFor("xhigh", "fast")).toBe("gpt-5.6-luna-xhigh-fast");
    expect(variants?.slugFor("xhigh", "standard")).toBeNull();
    expect(variants?.slugForReasoning("xhigh")).toBe("gpt-5.6-luna-xhigh-fast");
    expect(variants?.slugForSpeed("fast")).toBe("gpt-5.6-luna-xhigh-fast");
  });

  it("does not add controls for a model without discovered siblings", () => {
    expect(resolveJcodeModelVariants([{ slug: "composer-2" }], "composer-2")).toBeNull();
  });
});
