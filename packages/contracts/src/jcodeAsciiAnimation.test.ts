import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { DEFAULT_JCODE_ASCII_ANIMATION, JcodeAsciiAnimation } from "./jcodeAsciiAnimation.ts";

describe("JcodeAsciiAnimation", () => {
  it("defaults to the existing blob and only accepts supported animations", () => {
    const decode = Schema.decodeUnknownSync(JcodeAsciiAnimation);

    expect(DEFAULT_JCODE_ASCII_ANIMATION).toBe("blob");
    expect(decode("logo")).toBe("logo");
    expect(() => decode("static")).toThrow();
  });
});
