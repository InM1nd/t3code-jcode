import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { DEFAULT_JCODE_ASCII_ANIMATION, JcodeAsciiAnimation } from "./jcodeAsciiAnimation.ts";

describe("JcodeAsciiAnimation", () => {
  it("defaults to the existing blob and accepts animated, static, and off modes", () => {
    const decode = Schema.decodeUnknownSync(JcodeAsciiAnimation);

    expect(DEFAULT_JCODE_ASCII_ANIMATION).toBe("blob");
    expect(decode("logo")).toBe("logo");
    expect(decode("static")).toBe("static");
    expect(decode("off")).toBe("off");
  });
});
