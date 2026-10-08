// RULE 8 — the tidy stroke-width rule runs for real (2026-10-08, stock review
// item 2): the FEWEST decimals that stay within 10 % of the exact width, so a
// file never carries export garbage like 2.806 or 7.999906, and a thin local
// width under a big artboard scale (0.2) is never rounded into a fat stroke.
import { describe, expect, it } from "vitest";
import { tidyStrokeWidth, STROKE_TIDY_TOLERANCE } from "../src/lib/upload/geom/stroke";

describe("tidyStrokeWidth — fewest decimals within the tolerance", () => {
  it.each([
    [2.806, 3],       // the reviewer's example: 6.9 % off → integer
    [7.999906, 8],    // float noise → integer
    [2.9333, 3],      // 2.2 pt in px → integer (2.3 % off)
    [4, 4],           // already tidy
    [2.6667, 2.7],    // 2 pt in px: 3 would be 12.5 % off → one decimal
    [1.4667, 1.5],    // 1 would be 32 % off → one decimal
    [0.2, 0.2],       // the 24-unit icon on a 512 px artboard: NEVER 0 or 1
    [0.0625, 0.06],   // two decimals are the first within 10 %
    [0.0042, 0.004],  // three decimals — the same precision fmt() already wrote
  ])("%s → %s", (exact, tidy) => {
    expect(tidyStrokeWidth(exact)).toBe(tidy);
  });

  it("never returns 0 for a positive width, and never drifts more than the tolerance", () => {
    for (const exact of [0.001, 0.049, 0.51, 1.05, 3.3, 12.49, 99.6]) {
      const tidy = tidyStrokeWidth(exact);
      expect(tidy).toBeGreaterThan(0);
      expect(Math.abs(tidy - exact) / exact).toBeLessThanOrEqual(STROKE_TIDY_TOLERANCE + 1e-9);
    }
  });

  it("honours a custom tolerance", () => {
    expect(tidyStrokeWidth(2.6667, 0.15)).toBe(3);
    expect(tidyStrokeWidth(2.6667, 0.01)).toBe(2.67);
  });
});
