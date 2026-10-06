import { describe, expect, it } from "vite-plus/test";
import { TANDEM_THEME_IDS } from "@t3tools/shared/themePalettes";

import indexHtml from "../../index.html?raw";
import {
  createVividThemeColors,
  getStandardThemeColors,
  getThemeDefinition,
  toCanonicalThemeColor,
} from "../themePalette";
import { buildTandemThemes, tandemBootBlock } from "./tandemThemes";

const tandemThemes = buildTandemThemes(createVividThemeColors, getStandardThemeColors);

describe("tandem themes", () => {
  it("registers every fork palette with both appearances", () => {
    expect(tandemThemes.map((theme) => theme.id)).toEqual([...TANDEM_THEME_IDS]);
    for (const theme of tandemThemes) {
      expect(getThemeDefinition(theme.id)?.label).toBe(theme.label);
      expect(theme.variants?.dark).toBeTruthy();
      for (const color of Object.values(theme.colors)) {
        expect(toCanonicalThemeColor(color)).not.toBeNull();
      }
      for (const color of Object.values(theme.variants?.dark ?? {})) {
        expect(toCanonicalThemeColor(color)).not.toBeNull();
      }
    }
  });

  it("keeps the boot splash in sync with the fork palettes", () => {
    expect(indexHtml).toContain(tandemBootBlock(tandemThemes));
  });
});
