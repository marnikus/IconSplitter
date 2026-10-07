// svgup_target.test.ts — the 15.1 MP JPEG size (design §7). The request is
// explicit: rasterise the VECTOR at ≈15.1 million pixels, with integer
// dimensions and the icon's own proportions — never an enlarged thumbnail, never
// a distorted square. The numbers here are the contract the raster and the
// export JSON both read, including the honest case where a canvas limit makes
// the target unreachable.
import { describe, expect, it } from "vitest";
import { JPEG_TARGET_MP, MAX_CANVAS_DIM, jpegTarget, mpOf } from "../src/lib/svgupload/target";

describe("mpOf — megapixels as the JSON reports them", () => {
  it("rounds to three decimals so 15.1 MP is readable", () => {
    expect(mpOf(3886, 3886)).toBe(15.101);
    expect(mpOf(1000, 1000)).toBe(1);
    expect(mpOf(0, 100)).toBe(0);
  });
});

describe("jpegTarget — integer dimensions at the target resolution", () => {
  it("squares off a square icon just past the target, never below it", () => {
    const t = jpegTarget();
    expect(t.width).toBe(3886);
    expect(t.height).toBe(3886);
    expect(t.clamped).toBe(false);
    expect(t.mp).toBeGreaterThanOrEqual(JPEG_TARGET_MP);
    expect(t.mp).toBe(15.101);
  });

  it("preserves a wide icon's proportions to within a pixel of rounding", () => {
    const t = jpegTarget(JPEG_TARGET_MP, 2);
    expect(t.mp).toBeGreaterThanOrEqual(JPEG_TARGET_MP);
    expect(Math.abs(t.width / t.height - 2)).toBeLessThan(0.01);
    expect(Number.isInteger(t.width) && Number.isInteger(t.height)).toBe(true);
  });

  it("makes a tall icon taller, not stretched", () => {
    const wide = jpegTarget(JPEG_TARGET_MP, 2);
    const tall = jpegTarget(JPEG_TARGET_MP, 0.5);
    expect(tall.height).toBeGreaterThan(tall.width);
    expect(tall.height).toBe(wide.width); // the same document rotated
    expect(tall.width).toBe(wide.height);
  });

  it("honours a different target without changing the rule", () => {
    const t = jpegTarget(1);
    expect(t.width).toBe(1000);
    expect(t.height).toBe(1000);
    expect(t.mp).toBe(1);
  });

  it("stays inside the canvas limit and SAYS so when a ratio cannot reach the target", () => {
    const t = jpegTarget(JPEG_TARGET_MP, 100);
    expect(t.width).toBe(MAX_CANVAS_DIM);
    expect(t.height).toBeLessThan(MAX_CANVAS_DIM);
    expect(t.clamped).toBe(true);          // reported, not hidden
    expect(t.mp).toBeLessThan(JPEG_TARGET_MP);
  });

  it("refuses a nonsense ratio or target instead of producing zero pixels", () => {
    const t = jpegTarget(JPEG_TARGET_MP, Number.NaN);
    expect(t.width).toBeGreaterThan(0);
    expect(t.mp).toBeGreaterThanOrEqual(JPEG_TARGET_MP);
    expect(jpegTarget(-5).width).toBeGreaterThan(0);
  });
});
