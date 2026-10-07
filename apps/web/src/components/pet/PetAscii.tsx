import { memo, useEffect, useRef } from "react";
import { textmode, type Textmodifier } from "textmode.js";

import {
  idleBackgroundRgb,
  idleGlyphRgba,
  readJcodeAsciiThemeColors,
  type JcodeAsciiThemeColors,
} from "../chat/jcodeAsciiTheme";
import type { PetMood } from "./petMood";

const RAMP = " .·:;=+*#%@";
const MAX_COLS = 28;
const MAX_ROWS = 28;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function moodFrameRate(mood: PetMood, reduced: boolean): number {
  if (reduced) return 1;
  switch (mood) {
    case "thinking":
      return 12;
    case "happy":
      return 14;
    case "sad":
      return 6;
    case "idle":
      return 8;
  }
}

function moodPaintParams(mood: PetMood) {
  switch (mood) {
    case "thinking":
      return { speed: 0.04, radius: 0.38, wobble: 0.55 };
    case "happy":
      return { speed: 0.055, radius: 0.42, wobble: 0.65 };
    case "sad":
      return { speed: 0.012, radius: 0.28, wobble: 0.2 };
    case "idle":
      return { speed: 0.018, radius: 0.34, wobble: 0.4 };
  }
}

function clampGrid(tm: Textmodifier) {
  const grid = tm.grid;
  if (!grid) return;
  if (grid.cols > MAX_COLS) grid.cols = MAX_COLS;
  if (grid.rows > MAX_ROWS) grid.rows = MAX_ROWS;
}

function paintPet(
  tm: Textmodifier,
  ramp: { at: (n: number) => string },
  theme: JcodeAsciiThemeColors,
  mood: PetMood,
) {
  const grid = tm.grid;
  if (!grid) return;

  const bg = idleBackgroundRgb(theme.canvas);
  tm.background(bg.r, bg.g, bg.b);

  const cols = grid.cols;
  const rows = grid.rows;
  if (cols < 2 || rows < 2) return;

  const params = moodPaintParams(mood);
  const halfCols = cols / 2;
  const halfRows = rows / 2;
  const t = tm.frameCount * params.speed;
  const maxR = Math.hypot(halfCols, halfRows) || 1;
  const accent =
    mood === "sad"
      ? {
          r: Math.round(theme.accent.r * 0.55 + 40),
          g: Math.round(theme.accent.g * 0.45 + 40),
          b: Math.round(theme.accent.b * 0.7 + 60),
        }
      : theme.accent;

  for (let row = 0; row < rows; row += 1) {
    const y = row - halfRows + 0.5;
    for (let col = 0; col < cols; col += 1) {
      const x = col - halfCols + 0.5;
      const dist = Math.hypot(x, y) / maxR;
      if (dist > 0.98) continue;

      const angle = Math.atan2(y, x);
      const wobble =
        tm.noise(Math.cos(angle) * 0.9 + 3, Math.sin(angle) * 0.9 + 3, t) * params.wobble +
        tm.noise(col * 0.08, row * 0.08, t * 0.7) * 0.22;
      const radius = params.radius + wobble * 0.12;
      const edge = radius - dist;
      if (edge < -0.05) continue;

      const interior = tm.noise(col * 0.12 + t, row * 0.12 - t * 0.55);
      const level = Math.min(1, Math.max(0, edge * 2.6) * (0.35 + interior * 0.65));
      if (level < 0.08) continue;

      const [r, g, b, a] = idleGlyphRgba(accent, level, interior, t + dist * 4);
      tm.push();
      tm.translate(x, y);
      tm.char(ramp.at(level));
      tm.charColor(r, g, b, a);
      tm.point();
      tm.pop();
    }
  }
}

/** Small circular ASCII blob for the floating companion pet. */
export const PetAscii = memo(function PetAscii(props: { mood: PetMood; size: number }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const moodRef = useRef(props.mood);
  moodRef.current = props.mood;

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const reduced = prefersReducedMotion();
    let tm: Textmodifier | null = null;
    let disposed = false;
    let theme = readJcodeAsciiThemeColors();

    try {
      tm = textmode.create({
        width: props.size,
        height: props.size,
        fontSize: 11,
        frameRate: moodFrameRate(moodRef.current, reduced),
        pixelDensity: Math.min(window.devicePixelRatio || 1, 1.25),
      });
    } catch (error) {
      console.error("[PetAscii] textmode create failed", error);
      return;
    }

    const canvas = tm.canvas;
    canvas.className = "block size-full";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    wrap.appendChild(canvas);

    clampGrid(tm);
    const activeRamp = tm.createGlyphRamp(RAMP);

    tm.draw(() => {
      if (!tm) return;
      paintPet(tm, activeRamp, theme, moodRef.current);
    });

    if (reduced) {
      tm.noLoop();
      tm.redraw();
    }

    const onVisibility = () => {
      if (!tm || reduced || disposed) return;
      if (document.hidden) tm.noLoop();
      else tm.loop();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const themeObserver = new MutationObserver(() => {
      theme = readJcodeAsciiThemeColors();
      if (reduced && tm) tm.redraw();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme-id"],
    });

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      themeObserver.disconnect();
      tm?.destroy();
      tm = null;
    };
  }, [props.size]);

  // Mood only changes paint params via moodRef each frame — remounting on
  // mood would churn the textmode canvas.

  return <div ref={wrapRef} aria-hidden className="size-full overflow-hidden" />;
});
