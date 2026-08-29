import { describe, expect, it } from "vite-plus/test";

import { formatQuietBoardLabel } from "./quietBoard";

describe("formatQuietBoardLabel", () => {
  it("uses singular and plural labels", () => {
    expect(formatQuietBoardLabel(1)).toBe("Board · 1 card updated");
    expect(formatQuietBoardLabel(2)).toBe("Board · 2 cards updated");
  });
});
