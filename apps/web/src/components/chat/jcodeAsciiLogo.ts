import type { Textmodifier } from "textmode.js";

import { idleBackgroundRgb, type JcodeAsciiThemeColors } from "./jcodeAsciiTheme";

// 28×17 luminance mask sampled from the selected fork icon. `R` preserves the red core.
const LOGO_CELLS = [
  "           .++++.           ",
  "        .+@@@@@+++.         ",
  "      +@@@@@@++...+.        ",
  "    .+@@@@@@+...+++.        ",
  "   .@@@@@@++. .+@@@@@+.     ",
  "  .@@@@@@+.     ++@@@@@+.   ",
  "  +@@@@++.       .++@@@@@.  ",
  " .@@@@++.  RRRRR  .++@@@@+  ",
  " .@@@++..  RRRRRR  .++@@++. ",
  "  +@@++++. RRRRRR  .+@@+++. ",
  "  .+++++++.  RR    +@@++++  ",
  "   .++++++@+.    .+@@++++.  ",
  "     .+++++++. .+@@@++++.   ",
  "        .+.....@@@+++++.    ",
  "       .++...+@@+++++.      ",
  "       .@++++++++++..       ",
  "        .++++++...          ",
] as const;

const CORE = { r: 255, g: 26, b: 0 };

/** Animated ASCII rendition sampled from the fork mark for an empty chat. */
export function paintJcodeAsciiLogo(tm: Textmodifier, theme: JcodeAsciiThemeColors) {
  const grid = tm.grid;
  if (!grid) return;

  const bg = idleBackgroundRgb(theme.canvas);
  tm.background(bg.r, bg.g, bg.b);
  if (grid.cols < LOGO_CELLS[0].length || grid.rows < LOGO_CELLS.length) return;

  const luminance =
    (theme.canvas.r * 0.2126 + theme.canvas.g * 0.7152 + theme.canvas.b * 0.0722) / 255;
  const glyph = luminance < 0.5 ? { r: 246, g: 246, b: 246 } : { r: 28, g: 28, b: 28 };
  const originCol = Math.floor((grid.cols - LOGO_CELLS[0].length) / 2);
  const originRow = Math.max(0, grid.rows - LOGO_CELLS.length - 1);
  const t = tm.frameCount * 0.035;

  for (const [row, cells] of LOGO_CELLS.entries()) {
    for (const [col, cell] of [...cells].entries()) {
      if (cell === " ") continue;

      const glow = 0.9 + Math.sin(t + col * 0.16 - row * 0.11) * 0.1;
      tm.push();
      tm.translate(originCol + col + 0.5 - grid.cols / 2, originRow + row + 0.5 - grid.rows / 2);
      if (cell === "R") {
        tm.char("o");
        tm.charColor(CORE.r, CORE.g, CORE.b, Math.round(165 + glow * 80));
      } else {
        tm.char(cell === "." ? "·" : cell);
        const opacity = cell === "@" ? 210 : cell === "+" ? 160 : 100;
        tm.charColor(glyph.r, glyph.g, glyph.b, Math.round(opacity * glow));
      }
      tm.point();
      tm.pop();
    }
  }
}
