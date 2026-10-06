import { describe, expect, it } from "vite-plus/test";

import {
  idleBackgroundRgb,
  idleGlyphRgba,
  parseCssColor,
  readJcodeAsciiThemeColors,
} from "./jcodeAsciiTheme";

describe("jcodeAsciiTheme", () => {
  it("parses hex and rgb theme colors", () => {
    expect(parseCssColor("#0a0a0a")).toEqual({ r: 10, g: 10, b: 10 });
    expect(parseCssColor("#f30")).toEqual({ r: 255, g: 51, b: 0 });
    expect(parseCssColor("rgb(34, 211, 238)")).toEqual({ r: 34, g: 211, b: 238 });
  });

  it("reads app theme CSS variables with fallbacks", () => {
    const style = {
      getPropertyValue: (name: string) => {
        if (name === "--app-theme-canvas") return "#0a0a0a";
        if (name === "--app-theme-accent") return "#ff3300";
        return "";
      },
    };
    expect(readJcodeAsciiThemeColors(style)).toEqual({
      canvas: { r: 10, g: 10, b: 10 },
      accent: { r: 255, g: 51, b: 0 },
    });
  });

  it("keeps idle backgrounds dark even on light canvases", () => {
    expect(idleBackgroundRgb({ r: 255, g: 245, b: 242 })).toEqual({
      r: 56,
      g: 54,
      b: 53,
    });
  });

  it("tints glyphs from the accent", () => {
    const [r, g, b, a] = idleGlyphRgba({ r: 255, g: 51, b: 0 }, 0.8, 0.5, 0);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(a).toBeGreaterThan(150);
  });
});
