import { assert, describe, it } from "@effect/vitest";

import { shouldStartLocalDomainListener } from "./DesktopLocalDomainListener.ts";

describe("DesktopLocalDomainListener", () => {
  it("only enables the packaged macOS listener", () => {
    assert.isTrue(
      shouldStartLocalDomainListener({
        platform: "darwin",
        isPackaged: true,
        isDevelopment: false,
      }),
    );
    assert.isFalse(
      shouldStartLocalDomainListener({
        platform: "darwin",
        isPackaged: false,
        isDevelopment: true,
      }),
    );
    assert.isFalse(
      shouldStartLocalDomainListener({ platform: "linux", isPackaged: true, isDevelopment: false }),
    );
  });
});
