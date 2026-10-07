import { describe, expect, it } from "vite-plus/test";

import { clampPetPosition, defaultPetPosition, PET_SIZE_PX } from "./petUiStore";

describe("clampPetPosition", () => {
  it("keeps the pet fully inside the viewport", () => {
    expect(clampPetPosition(-40, -40, PET_SIZE_PX, { width: 400, height: 300 })).toEqual({
      x: 8,
      y: 8,
    });
    expect(clampPetPosition(999, 999, PET_SIZE_PX, { width: 400, height: 300 })).toEqual({
      x: 400 - PET_SIZE_PX - 8,
      y: 300 - PET_SIZE_PX - 8,
    });
  });
});

describe("defaultPetPosition", () => {
  it("parks the pet in the bottom-right corner with margin", () => {
    expect(defaultPetPosition(PET_SIZE_PX, { width: 800, height: 600 })).toEqual({
      x: 800 - PET_SIZE_PX - 24,
      y: 600 - PET_SIZE_PX - 24,
    });
  });
});
