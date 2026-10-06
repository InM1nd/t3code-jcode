import { describe, expect, it } from "vite-plus/test";

import { shouldLoopJcodeAscii } from "./JcodeAsciiIdle";

describe("shouldLoopJcodeAscii", () => {
  it("stops the render loop for static and off modes", () => {
    expect(shouldLoopJcodeAscii("static", false)).toBe(false);
    expect(shouldLoopJcodeAscii("off", false)).toBe(false);
  });

  it("keeps existing animations looping unless reduced motion is enabled", () => {
    expect(shouldLoopJcodeAscii("blob", false)).toBe(true);
    expect(shouldLoopJcodeAscii("logo", false)).toBe(true);
    expect(shouldLoopJcodeAscii("blob", true)).toBe(false);
  });
});
