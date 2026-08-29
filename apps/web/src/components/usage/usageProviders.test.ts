import { UsageProviderKind } from "@t3tools/contracts";
import { assert, describe, it } from "vite-plus/test";

import { PROVIDER_ORDER, PROVIDER_PRESENTATION } from "./usageProviders";

describe("usageProviders", () => {
  it("presents every provider the usage contract can report", () => {
    const kinds = [...UsageProviderKind.literals];
    assert.sameMembers([...PROVIDER_ORDER], kinds);
    assert.sameMembers(Object.keys(PROVIDER_PRESENTATION), kinds);
  });
});
