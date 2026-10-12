// batch_preview_parity.test.ts — TDD for A5: what a preview shows is what the
// split writes (design D8/T9). Not a mock contract: the REAL pipeline runs twice
// on the same bytes — once as the preview's planSplit+stripChunks, once as
// splitSheet — and the icon counts must be equal, for auto and for a manual
// merge fraction. If this drifts, the preview is lying to the user.

import { afterEach, describe, expect, it, vi } from "vitest";
import { planSplit, splitSheet } from "../src/lib/batchsplit";
import { stripChunks } from "../src/lib/previewstrip";
import { analyze, detect } from "../src/lib/detect";

type Rgba = (x: number, y: number) => [number, number, number, number];

/** A sheet with `n` black icons on white, laid out in one row. */
function sheet(n: number): Rgba {
  const pitch = 24;
  return (x, y) => {
    const col = Math.floor(x / pitch);
    const inIcon = col < n && x % pitch >= 4 && x % pitch < 20 && y >= 4 && y < 20;
    return inIcon ? [0, 0, 0, 255] : [255, 255, 255, 255];
  };
}

function stubCanvas(paint: Rgba) {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function () {
    return {
      imageSmoothingQuality: "",
      fillStyle: "",
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      putImageData: vi.fn(),
      getImageData: (_x: number, _y: number, w: number, h: number) => {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const [r, g, b, a] = paint(x % 40, y % 20);
            const i = (y * w + x) * 4;
            data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
          }
        return { data };
      },
    } as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb: BlobCallback) {
    cb(new Blob(["png"], { type: "image/png" }));
  });
}

const img = { naturalWidth: 40, naturalHeight: 20 } as HTMLImageElement;

afterEach(() => vi.restoreAllMocks());

describe("preview vs split — the same icons, by construction", () => {
  for (const mergeFrac of [null, 0.05]) {
    it(`counts ${mergeFrac === null ? "auto" : mergeFrac} exactly like splitSheet does`, async () => {
      stubCanvas(sheet(3));
      const split = { padding: 6, size: 0, transparent: false, mergeFrac };
      const plan = planSplit(img, split);
      const chunks = stripChunks(plan.boxes.length);
      const written = await splitSheet(img, split);
      expect(chunks.shown).toBe(written.length);
      expect(chunks.counts.reduce((a, v) => a + v, 0)).toBe(written.length);
      // ...and the plan the preview drew from is the same detection the split used.
      const det = detect(analyze(img), mergeFrac);
      expect(plan.boxes).toEqual(det.boxes);
      expect(plan.usedFrac).toBe(det.usedFrac);
    });
  }

  it("an empty sheet previews as empty, exactly like an empty split (RULE 4)", async () => {
    stubCanvas(() => [255, 255, 255, 255]);
    const split = { padding: 6, size: 0, transparent: false, mergeFrac: null };
    expect(stripChunks(planSplit(img, split).boxes.length).shown).toBe(0);
    expect(await splitSheet(img, split)).toEqual([]);
  });

  it("a manual radius the user set is a manual radius the preview shows", () => {
    stubCanvas(sheet(4));
    const auto = planSplit(img, { padding: 6, size: 0, transparent: false, mergeFrac: null });
    const manual = planSplit(img, { padding: 6, size: 0, transparent: false, mergeFrac: 0.15 });
    expect(manual.usedFrac).toBe(0.15);
    expect(auto.usedFrac).toBe(auto.autoFrac); // the control really does reach the detector
    expect(stripChunks(manual.boxes.length).shown).toBe(manual.boxes.length);
  });
});
