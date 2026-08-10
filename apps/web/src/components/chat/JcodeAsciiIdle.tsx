import { memo, useEffect, useRef } from "react";
import { textmode, type Textmodifier } from "textmode.js";

import { cn } from "~/lib/utils";
import {
  idleBackgroundRgb,
  idleGlyphRgba,
  readJcodeAsciiThemeColors,
  type JcodeAsciiThemeColors,
} from "./jcodeAsciiTheme";

const RAMP = " .·:;=+*#%@";
const TARGET_FPS = 12;
/** Keep the JS cell loop bounded — textmode's responsive grid can get large on wide panes. */
const MAX_COLS = 64;
const MAX_ROWS = 28;
const PERF_KEY = "t3.debugJcodeAscii";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function measure(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  return {
    w: Math.max(0, Math.floor(rect.width)),
    h: Math.max(0, Math.floor(rect.height)),
  };
}

function clampGrid(tm: Textmodifier) {
  const grid = tm.grid;
  if (!grid) return;
  if (grid.cols > MAX_COLS) grid.cols = MAX_COLS;
  if (grid.rows > MAX_ROWS) grid.rows = MAX_ROWS;
}

function paintBlob(
  tm: Textmodifier,
  ramp: { at: (n: number) => string },
  theme: JcodeAsciiThemeColors,
) {
  const grid = tm.grid;
  if (!grid) return;

  const bg = idleBackgroundRgb(theme.canvas);
  tm.background(bg.r, bg.g, bg.b);

  const cols = grid.cols;
  const rows = grid.rows;
  if (cols < 2 || rows < 2) return;

  const halfCols = cols / 2;
  const halfRows = rows / 2;
  const t = tm.frameCount * 0.018;
  const maxR = Math.hypot(halfCols, halfRows * 2) || 1;

  for (let row = 0; row < rows; row += 1) {
    const y = row - halfRows + 0.5;
    for (let col = 0; col < cols; col += 1) {
      const x = col - halfCols + 0.5;
      const dx = x;
      const dy = y * 2;
      const dist = Math.hypot(dx, dy) / maxR;
      if (dist > 0.95) continue;

      const angle = Math.atan2(dy, dx);
      const wobble =
        tm.noise(Math.cos(angle) * 0.9 + 3, Math.sin(angle) * 0.9 + 3, t) * 0.45 +
        tm.noise(col * 0.07, row * 0.07, t * 0.7) * 0.25;
      const radius = 0.32 + wobble;
      const edge = radius - dist;
      if (edge < -0.06) continue;

      const interior = tm.noise(col * 0.11 + t, row * 0.11 - t * 0.6);
      const level = Math.min(1, Math.max(0, edge * 2.4) * (0.35 + interior * 0.65));
      if (level < 0.08) continue;

      const [r, g, b, a] = idleGlyphRgba(theme.accent, level, interior, t + dist * 4);

      tm.push();
      tm.translate(x, y);
      tm.char(ramp.at(level));
      tm.charColor(r, g, b, a);
      tm.point();
      tm.pop();
    }
  }
}

/** Decorative ASCII blob — empty jcode chats only. Colors follow the active theme. */
export const JcodeAsciiIdle = memo(function JcodeAsciiIdle(props: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const reduced = prefersReducedMotion();
    const showPerf = typeof window !== "undefined" && window.localStorage.getItem(PERF_KEY) === "1";

    let tm: Textmodifier | null = null;
    let disposed = false;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let perfEl: HTMLDivElement | null = null;
    let frameMsEma = 0;
    let lastPerfUi = 0;
    let theme = readJcodeAsciiThemeColors();

    if (showPerf) {
      perfEl = document.createElement("div");
      perfEl.className =
        "pointer-events-none absolute right-3 bottom-3 z-20 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-emerald-200/90";
      wrap.appendChild(perfEl);
    }

    const mount = (w: number, h: number) => {
      if (disposed || tm) return;

      try {
        tm = textmode.create({
          width: w,
          height: h,
          fontSize: 14,
          frameRate: reduced ? 1 : TARGET_FPS,
          pixelDensity: Math.min(window.devicePixelRatio || 1, 1.25),
        });
      } catch (error) {
        console.error("[JcodeAsciiIdle] textmode create failed", error);
        return;
      }

      const canvas = tm.canvas;
      canvas.className = "block size-full opacity-[0.48] dark:opacity-[0.55]";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      wrap.appendChild(canvas);

      clampGrid(tm);
      const activeRamp = tm.createGlyphRamp(RAMP);

      tm.draw(() => {
        if (!tm) return;
        const started = showPerf ? performance.now() : 0;
        paintBlob(tm, activeRamp, theme);
        if (showPerf && perfEl) {
          const ms = performance.now() - started;
          frameMsEma = frameMsEma === 0 ? ms : frameMsEma * 0.9 + ms * 0.1;
          const now = performance.now();
          if (now - lastPerfUi > 250) {
            lastPerfUi = now;
            const grid = tm.grid;
            perfEl.textContent = `${frameMsEma.toFixed(1)}ms · ${grid?.cols ?? "?"}×${grid?.rows ?? "?"} · ${TARGET_FPS}fps cap`;
          }
        }
      });

      if (reduced) {
        tm.noLoop();
        tm.redraw();
      }
    };

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

    const observer = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (disposed) return;
        const { w, h } = measure(wrap);
        if (w < 8 || h < 8) return;
        if (!tm) {
          mount(w, h);
          return;
        }
        tm.resizeCanvas(w, h);
        clampGrid(tm);
      }, 0);
    });
    observer.observe(wrap);

    const { w, h } = measure(wrap);
    if (w >= 8 && h >= 8) mount(w, h);

    return () => {
      disposed = true;
      if (resizeTimer) clearTimeout(resizeTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      themeObserver.disconnect();
      observer.disconnect();
      perfEl?.remove();
      tm?.destroy();
      tm = null;
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", props.className)}
    />
  );
});
