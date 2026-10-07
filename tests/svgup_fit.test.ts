// svgup_fit.test.ts — fitting the artwork into the padded artboard (design §5).
// The rules the request states, each one a case here: the VISIBLE bounds include
// the stroke (so nothing is clipped), the padding is uniform or per-side, the
// content is scaled proportionally (never stretched, never cropped) and centred
// inside what remains, and the stroke scale the pipeline must apply is reported
// rather than guessed. The output is ONE transform for the export copy — the
// approved source document is never touched.
import { describe, expect, it } from "vitest";
import { fitArtboard, strokeMargin, type Bounds } from "../src/lib/svgupload/fit";

const src = (w: number, h: number): Bounds => ({ x: 0, y: 0, w, h });

describe("strokeMargin — visible bounds include the stroke", () => {
  it("adds half the stroke width on every side", () => {
    expect(strokeMargin(2)).toBe(1);
    expect(strokeMargin(0)).toBe(0);
    expect(strokeMargin(2.9333333)).toBeCloseTo(1.4666667, 6);
  });

  it("refuses a nonsense width by reporting no margin, never a negative one", () => {
    expect(strokeMargin(Number.NaN)).toBe(0);
    expect(strokeMargin(-4)).toBe(0);
  });
});

describe("fitArtboard — proportional, padded, centred", () => {
  it("gives back an artboard of the bounds plus the padding", () => {
    const fit = fitArtboard({ bounds: src(100, 50), padding: 10 });
    expect(fit.artboard).toEqual({ w: 120, h: 70 });
    expect(fit.scale).toBe(1); // it already fits: never upscaled by default
  });

  it("places the content so the padding is exact on all four sides", () => {
    const fit = fitArtboard({ bounds: { x: 10, y: 20, w: 100, h: 50 }, padding: 10 });
    // the transform maps a source point to the export copy: (x*s + tx, y*s + ty)
    expect(place(fit, 10, 20)).toEqual({ x: 10, y: 10 });        // top-left of the bounds
    expect(place(fit, 110, 70)).toEqual({ x: 110, y: 60 });      // bottom-right
    expect(fit.artboard).toEqual({ w: 120, h: 70 });
  });

  it("includes the stroke margin in the visible bounds", () => {
    // a 6-unit stroke reaches 3 units outside the geometry on every side
    const fit = fitArtboard({ bounds: src(100, 100), padding: 4, strokeWidth: 6 });
    expect(fit.artboard).toEqual({ w: 114, h: 114 }); // 100 + 2*3 + 2*4
    expect(place(fit, 0, 0)).toEqual({ x: 7, y: 7 }); // margin then padding
  });

  it("scales proportionally when the output scale asks for a bigger copy", () => {
    const fit = fitArtboard({ bounds: src(100, 50), padding: 10, outputScale: 2 });
    expect(fit.artboard).toEqual({ w: 240, h: 140 }); // the padded artboard doubles
    expect(fit.scale).toBe(2);
    expect(place(fit, 0, 0)).toEqual({ x: 20, y: 20 }); // padding doubles with it
  });

  it("never stretches: an oblique ratio keeps its own proportions", () => {
    const fit = fitArtboard({ bounds: src(300, 100), padding: 0 });
    expect(fit.scale).toBe(1);
    expect(place(fit, 300, 100)).toEqual({ x: 300, y: 100 });
    expect(fit.artboard).toEqual({ w: 300, h: 100 });
  });

  it("takes per-side padding, top-right-bottom-left, and stays centred", () => {
    const fit = fitArtboard({ bounds: src(100, 100), padding: { sides: [2, 4, 6, 8] } });
    expect(fit.artboard).toEqual({ w: 112, h: 108 });
    expect(place(fit, 0, 0)).toEqual({ x: 8, y: 2 });
    expect(place(fit, 100, 100)).toEqual({ x: 108, y: 102 });
  });

  it("refuses to crop: the content box always fits inside the artboard", () => {
    for (const [w, h, pad] of [[100, 100, 20], [1000, 12, 5], [12, 1000, 5], [7, 3, 0]] as const) {
      const fit = fitArtboard({ bounds: src(w, h), padding: pad });
      const box = contentBox(fit);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.w).toBeLessThanOrEqual(fit.artboard.w + 1e-6);
      expect(box.y + box.h).toBeLessThanOrEqual(fit.artboard.h + 1e-6);
    }
  });

  it("reports the stroke scale the pipeline must apply to the document", () => {
    const fit = fitArtboard({ bounds: src(100, 100), padding: 0, outputScale: 3 });
    expect(fit.scale).toBe(3);
    expect(fit.transform).toBe("translate(0 0) scale(3)"); // SVG attribute form, unchanged geometry
  });

  it("degrades honestly on degenerate bounds instead of dividing by zero", () => {
    const fit = fitArtboard({ bounds: src(0, 0), padding: 4 });
    expect(fit.scale).toBe(1);
    expect(fit.artboard).toEqual({ w: 8, h: 8 });
  });
});

/** A source point through the fit transform, as the export copy will see it. */
function place(fit: ReturnType<typeof fitArtboard>, x: number, y: number) {
  return { x: x * fit.scale + fit.dx, y: y * fit.scale + fit.dy };
}

/** Where the source bounds land in the artboard, from the public numbers. */
function contentBox(fit: ReturnType<typeof fitArtboard>) {
  return { x: fit.dx, y: fit.dy, w: fit.content.w, h: fit.content.h };
}
