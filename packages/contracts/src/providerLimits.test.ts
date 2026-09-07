import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { ProviderLimit } from "./providerLimits.ts";

const decodeProviderLimit = Schema.decodeUnknownSync(ProviderLimit);

describe("ProviderLimit", () => {
  it("still decodes reports from servers without availability metadata", () => {
    expect(
      decodeProviderLimit({
        provider: "codex",
        windows: [{ label: "5h", usedPercent: 42, resetsAt: null }],
      }),
    ).toEqual({
      provider: "codex",
      windows: [{ label: "5h", usedPercent: 42, resetsAt: null }],
    });
  });
});
