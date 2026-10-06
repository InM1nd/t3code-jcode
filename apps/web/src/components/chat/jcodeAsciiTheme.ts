export type ThemeRgb = Readonly<{ r: number; g: number; b: number }>;

export type JcodeAsciiThemeColors = Readonly<{
  canvas: ThemeRgb;
  accent: ThemeRgb;
}>;

const FALLBACK_CANVAS: ThemeRgb = { r: 10, g: 10, b: 10 };
const FALLBACK_ACCENT: ThemeRgb = { r: 255, g: 51, b: 0 };

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** Parse `#rgb` / `#rrggbb` / `rgb()` / `rgba()` from computed theme CSS. */
export function parseCssColor(value: string): ThemeRgb | null {
  const raw = value.trim();
  if (!raw) return null;

  const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex?.[1]) {
    const body = hex[1];
    if (body.length === 3) {
      return {
        r: Number.parseInt(body[0]! + body[0]!, 16),
        g: Number.parseInt(body[1]! + body[1]!, 16),
        b: Number.parseInt(body[2]! + body[2]!, 16),
      };
    }
    return {
      r: Number.parseInt(body.slice(0, 2), 16),
      g: Number.parseInt(body.slice(2, 4), 16),
      b: Number.parseInt(body.slice(4, 6), 16),
    };
  }

  const rgb = raw.match(
    /^rgba?\(\s*([0-9.]+)\s*[, ]\s*([0-9.]+)\s*[, ]\s*([0-9.]+)(?:\s*[,/]\s*[0-9.%]+)?\s*\)$/i,
  );
  if (!rgb) return null;
  return {
    r: clampByte(Number(rgb[1])),
    g: clampByte(Number(rgb[2])),
    b: clampByte(Number(rgb[3])),
  };
}

export function readJcodeAsciiThemeColors(
  style: Pick<CSSStyleDeclaration, "getPropertyValue"> = getComputedStyle(document.documentElement),
): JcodeAsciiThemeColors {
  return {
    canvas: parseCssColor(style.getPropertyValue("--app-theme-canvas")) ?? FALLBACK_CANVAS,
    accent: parseCssColor(style.getPropertyValue("--app-theme-accent")) ?? FALLBACK_ACCENT,
  };
}

/** Dark wash derived from the theme canvas so light themes still read as a field. */
export function idleBackgroundRgb(canvas: ThemeRgb): ThemeRgb {
  return {
    r: clampByte(canvas.r * 0.22),
    g: clampByte(canvas.g * 0.22),
    b: clampByte(canvas.b * 0.22),
  };
}

/** Accent-tinted glyph color; level/interior lift toward white, phase adds a tiny wobble. */
export function idleGlyphRgba(
  accent: ThemeRgb,
  level: number,
  interior: number,
  phase: number,
): readonly [number, number, number, number] {
  const lift = 0.35 + level * 0.5 + interior * 0.15;
  const wobble = Math.sin(phase) * 0.08;
  const towardWhite = Math.max(0, lift - 0.55 + wobble);
  const base = 0.45 + lift * 0.4;
  return [
    clampByte(accent.r * base + 255 * towardWhite),
    clampByte(accent.g * base + 255 * towardWhite * 0.92),
    clampByte(accent.b * base + 255 * towardWhite * 0.85),
    clampByte(130 + level * 110),
  ];
}
