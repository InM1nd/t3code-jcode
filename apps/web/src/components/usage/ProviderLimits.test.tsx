import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ProviderLimits } from "./ProviderLimits";

describe("ProviderLimits", () => {
  it("renders provider windows from the environment that reported them", () => {
    const markup = renderToStaticMarkup(
      <ProviderLimits
        environments={[
          {
            environmentId: "local" as never,
            label: "MacBook",
            isPending: false,
            error: null,
            summary: {
              limits: [
                {
                  provider: "codex",
                  windows: [{ label: "5h", usedPercent: 42, resetsAt: "2026-09-01T10:00:00.000Z" }],
                },
              ],
            } as never,
          },
        ]}
      />,
    );

    expect(markup).toContain("Provider limits");
    expect(markup).toContain("Codex");
    expect(markup).toContain("42%");
    expect(markup).toContain("MacBook");
  });
});
