import { UsageProviderKind } from "@t3tools/contracts";
import { assert, describe, it, vi } from "vite-plus/test";

// The real provider pulls in React Native, which this environment cannot load.
vi.mock("../settings/appearance/AppearancePreferencesProvider", () => ({
  useAppearancePreferences: () => ({ themeAppearance: "dark" }),
}));

const { PROVIDER_LABEL, PROVIDER_ORDER, useProviderColors } = await import("./usageProviders");

describe("usageProviders", () => {
  it("presents every provider the usage contract can report", () => {
    const kinds = [...UsageProviderKind.literals];
    assert.sameMembers([...PROVIDER_ORDER], kinds);
    assert.sameMembers(Object.keys(PROVIDER_LABEL), kinds);
    assert.sameMembers(Object.keys(useProviderColors()), kinds);
  });
});
