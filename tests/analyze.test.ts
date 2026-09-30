// RULE 8 — analyze() runs for real: the canvas 2D context is replaced by a
// thin shim that serves synthetic pixels, but every line of analyze()
// (border median background, threshold, ink mask, ink colour, downscale)
// executes. Deleting or inverting analyze() fails these tests.
import { afterEach, describe, expect, it, vi } from "vitest";
import { analyze } from "../src/lib/detect";
import { detect } from "../src/lib/detect";

type Rgba = (x: number, y: number) => [number, number, number, number];

/** Installs a canvas shim: getImageData serves pixels from `paint`. */
function stubCanvas(paint: Rgba) {
  return vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
    return {
      drawImage: vi.fn(),
      getImageData: (_x: number, _y: number, w: number, h: number) => {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const [r, g, b, a] = paint(x, y);
            const i = (y * w + x) * 4;
            data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
          }
        return { data };
      },
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
  });
}

const fakeImg = (w: number, h: number) =>
  ({ naturalWidth: w, naturalHeight: h }) as unknown as HTMLImageElement;

afterEach(() => vi.restoreAllMocks());

describe("analyze — real background/ink detection over synthetic pixels", () => {
  it("finds a white background, an ink threshold and the ink mask", () => {
    // 40×40 white sheet with an 8×8 black icon at (10,10)
    stubCanvas((x, y) => (x >= 10 && x < 18 && y >= 10 && y < 18 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    const a = analyze(fakeImg(40, 40));
    expect(a.w).toBe(40);
    expect(a.scale).toBe(1);
    expect(a.bg).toEqual([255, 255, 255]);
    expect(a.threshold).toBeGreaterThanOrEqual(18);
    expect(a.threshold).toBeLessThanOrEqual(110);
    expect(a.inkDiff).toBe(255);
    expect(a.ink).toEqual([0, 0, 0]);
    expect(a.mask[12 * 40 + 12]).toBe(1); // inside the icon
    expect(a.mask[0]).toBe(0); // background corner
  });

  it("treats transparent pixels as white", () => {
    stubCanvas(() => [12, 34, 56, 0]); // any RGB, alpha 0 => composited to white
    const a = analyze(fakeImg(30, 30));
    expect(a.bg).toEqual([255, 255, 255]);
    expect(a.mask.every((v) => v === 0)).toBe(true);
  });

  it("downscales sheets longer than 4000px and records the scale", () => {
    stubCanvas(() => [255, 255, 255, 255]);
    const a = analyze(fakeImg(5000, 10)); // k = 4000/5000 = 0.8
    expect(a.w).toBe(4000);
    expect(a.h).toBe(8);
    expect(a.scale).toBeCloseTo(5000 / 4000);
  });

  it("feeds detect(): one sheet pixel-analysis → one icon box (end-to-end)", () => {
    stubCanvas((x, y) => (x >= 10 && x < 18 && y >= 10 && y < 18 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    const res = detect(analyze(fakeImg(40, 40)), null);
    expect(res.boxes).toHaveLength(1);
    expect(res.boxes[0].x).toBeLessThanOrEqual(10);
    expect(res.boxes[0].x + res.boxes[0].w).toBeGreaterThanOrEqual(18);
  });
});
