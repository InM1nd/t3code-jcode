import {
  TANDEM_THEME_IDS,
  type ThemeAppearance,
  type ThemeColors,
  type ThemeDefinition,
} from "@t3tools/shared/themePalettes";

type CreateThemeColors = (
  appearance: ThemeAppearance,
  backgroundValue: string,
  accentValue: string,
) => ThemeColors;

type StandardThemeColors = (appearance: ThemeAppearance) => ThemeColors;

type ModeSeed = {
  readonly background: string;
  readonly accent: string;
  readonly action?: string;
};

type TandemThemeSeed = {
  readonly label: string;
  readonly light: ModeSeed;
  readonly dark: ModeSeed;
  readonly noir?: boolean;
};

const TANDEM_THEME_SEEDS: Record<(typeof TANDEM_THEME_IDS)[number], TandemThemeSeed> = {
  signal: {
    label: "Signal",
    light: { background: "#fff5f2", accent: "#ff3300" },
    dark: { background: "#0a0a0a", accent: "#ff3300" },
  },
  volt: {
    label: "Volt",
    light: { background: "#f4faf3", accent: "#5ee000" },
    dark: { background: "#0a0a0a", accent: "#b8ff3c" },
  },
  ion: {
    label: "Ion",
    light: { background: "#f2f9fb", accent: "#0891b2" },
    dark: { background: "#0a0a0a", accent: "#22d3ee" },
  },
  nova: {
    label: "Nova",
    light: { background: "#fdf2f9", accent: "#d6249f", action: "#8b2fd1" },
    dark: { background: "#0a0a0f", accent: "#ff3ec8", action: "#7c4dff" },
  },
  slate: {
    label: "Slate",
    light: { background: "#f4f6f8", accent: "#3f5b74", action: "#5c7a92" },
    dark: { background: "#1a2027", accent: "#8fb3cc", action: "#7ba0b8" },
  },
  copper: {
    label: "Copper",
    light: { background: "#fbf3ea", accent: "#b5651d", action: "#8a4b2e" },
    dark: { background: "#241a14", accent: "#e0954a", action: "#d9a441" },
  },
  borealis: {
    label: "Borealis",
    light: { background: "#eefaf5", accent: "#0fd68a", action: "#7c3aed" },
    dark: { background: "#071a14", accent: "#2ee6a6", action: "#a855f7" },
  },
  sakura: {
    label: "Sakura",
    light: { background: "#fff0f5", accent: "#ff5ca8", action: "#ff2e7e" },
    dark: { background: "#0f0a0d", accent: "#ff7ec2", action: "#ff2e7e" },
  },
  gilded: {
    label: "Gilded",
    light: { background: "#faf6ec", accent: "#a9822f", action: "#8a6d1f" },
    dark: { background: "#0c0b08", accent: "#e8c565", action: "#f0d78c" },
  },
  tangerine: {
    label: "Tangerine",
    light: { background: "#fff4e8", accent: "#ff7a1a", action: "#ff5200" },
    dark: { background: "#1a120a", accent: "#ff9a3d", action: "#ff6a00" },
  },
  mint: {
    label: "Mint",
    light: { background: "#eefaf6", accent: "#00c896", action: "#00a884" },
    dark: { background: "#0a1512", accent: "#3de8b8", action: "#1fd9a8" },
  },
  ignite: {
    label: "Ignite",
    light: { background: "#fff4ee", accent: "#e85002", action: "#c10801" },
    dark: { background: "#0a0a0a", accent: "#e85002", action: "#f16001" },
  },
  circuit: {
    label: "Circuit",
    light: { background: "#f5f0fe", accent: "#7d39eb", action: "#c6ff33" },
    dark: { background: "#0a0a0a", accent: "#7d39eb", action: "#c6ff33" },
  },
  pulse: {
    label: "Pulse",
    light: { background: "#fefffc", accent: "#8116e0", action: "#d0ff00" },
    dark: { background: "#0a0a0a", accent: "#8116e0", action: "#d0ff00" },
  },
  noir: {
    label: "Noir",
    light: { background: "#ffffff", accent: "#e85002" },
    dark: { background: "#0a0a0a", accent: "#ff5a1f" },
    noir: true,
  },
};

function withActionAccent(
  create: CreateThemeColors,
  appearance: ThemeAppearance,
  seed: ModeSeed,
): ThemeColors {
  const colors = create(appearance, seed.background, seed.accent);
  if (seed.action === undefined || seed.action === seed.accent) return colors;
  const action = create(appearance, seed.background, seed.action);
  return {
    ...colors,
    messageAction: action.messageAction,
    messageActionForeground: action.messageActionForeground,
    messageActionHover: action.messageActionHover,
  };
}

function noirThemeColors(
  standard: StandardThemeColors,
  create: CreateThemeColors,
  appearance: ThemeAppearance,
  accent: string,
): ThemeColors {
  const stock = standard(appearance);
  const vivid = create(appearance, stock.canvas, accent);
  return {
    ...stock,
    focus: vivid.accent,
    accent: vivid.accent,
    accentForeground: vivid.accentForeground,
    update: vivid.accent,
    updateForeground: vivid.updateForeground,
    updateSurface: vivid.updateSurface,
    messageAction: vivid.messageAction,
    messageActionForeground: vivid.messageActionForeground,
    messageActionHover: vivid.messageActionHover,
    terminalCursor: vivid.accent,
  };
}

/** Fork palettes, derived by the current theme engine from the v1 seeds. */
export function buildTandemThemes(
  create: CreateThemeColors,
  standard: StandardThemeColors,
): ReadonlyArray<ThemeDefinition> {
  return TANDEM_THEME_IDS.map((id) => {
    const seed = TANDEM_THEME_SEEDS[id];
    return {
      id,
      label: seed.label,
      appearance: "light" as const,
      colors: seed.noir
        ? noirThemeColors(standard, create, "light", seed.light.accent)
        : withActionAccent(create, "light", seed.light),
      variants: {
        dark: seed.noir
          ? noirThemeColors(standard, create, "dark", seed.dark.accent)
          : withActionAccent(create, "dark", seed.dark),
      },
    };
  });
}

/** Splash colors the pre-React boot script needs for each fork palette. */
export function tandemBootBlock(themes: ReadonlyArray<ThemeDefinition>): string {
  return themes
    .map((theme) => {
      const dark = theme.variants?.dark;
      if (!dark) throw new Error(`Tandem theme ${theme.id} is missing its dark palette`);
      const mode = (name: string, colors: ThemeColors) =>
        [
          `            ${name}: {`,
          `              background: "${colors.canvas}",`,
          `              foreground: "${colors.text}",`,
          `              accent: "${colors.accent}",`,
          `              chrome: "${colors.chrome}",`,
          "            },",
        ].join("\n");
      return [
        `          ${theme.id}: {`,
        mode("light", theme.colors),
        mode("dark", dark),
        "          },",
      ].join("\n");
    })
    .join("\n");
}
