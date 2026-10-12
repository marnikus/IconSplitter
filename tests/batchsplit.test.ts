// TDD cycle 7 — batchsplit: one source image -> one PNG blob per detected icon.
// Reuses analyze/detect/render (RULE 1); canvas served by the recording shim.
import { afterEach, describe, expect, it, vi } from "vitest";
import { planSplit, splitSheet } from "../src/lib/batchsplit";

type Rgba = (x: number, y: number) => [number, number, number, number];

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
            const [r, g, b, a] = paint(x, y);
            const i = (y * w + x) * 4;
            data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
          }
        return { data };
      },
    } as unknown as CanvasRenderingContext2D;
  });
  // toBlob is the delivery gate (RULE 15) — resolve with a real blob.
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb) {
    cb(new Blob(["png"], { type: "image/png" }));
  });
}

const fakeImg = (w: number, h: number) => ({ naturalWidth: w, naturalHeight: h }) as HTMLImageElement;

afterEach(() => vi.restoreAllMocks());

describe("splitSheet — detect then render every icon", () => {
  it("returns one blob per detected icon, in reading order", async () => {
    // white sheet, two black icons
    stubCanvas((x, y) => {
      const inA = x >= 5 && x < 15 && y >= 5 && y < 15;
      const inB = x >= 25 && x < 35 && y >= 5 && y < 15;
      return inA || inB ? [0, 0, 0, 255] : [255, 255, 255, 255];
    });
    const blobs = await splitSheet(fakeImg(40, 20), { padding: 6, size: 0, transparent: false, mergeFrac: null });
    expect(blobs).toHaveLength(2);
    expect(blobs[0].type).toBe("image/png");
  });

  it("returns an empty list for a blank sheet (RULE 4 — empty, not broken)", async () => {
    stubCanvas(() => [255, 255, 255, 255]);
    const blobs = await splitSheet(fakeImg(30, 30), { padding: 6, size: 0, transparent: false, mergeFrac: null });
    expect(blobs).toEqual([]);
  });
});

describe("planSplit — the one plan the split and a preview share (design D2)", () => {
  const twoIcons = (x: number, y: number): [number, number, number, number] => {
    const inA = x >= 5 && x < 15 && y >= 5 && y < 15;
    const inB = x >= 25 && x < 35 && y >= 5 && y < 15;
    return inA || inB ? [0, 0, 0, 255] : [255, 255, 255, 255];
  };

  it("returns the analysis, the boxes, both fractions and the shared square", () => {
    stubCanvas(twoIcons);
    const plan = planSplit(fakeImg(40, 20), { padding: 6, size: 0, transparent: false, mergeFrac: null });
    expect(plan.boxes).toHaveLength(2);
    expect(plan.an.w).toBe(40);
    expect(plan.an.scale).toBe(1);
    expect(plan.usedFrac).toBe(plan.autoFrac); // auto picks the fraction it measured
    // square = largest icon side + padding, exactly as the split uses it
    expect(plan.sq.content).toBe(Math.max(...plan.boxes.map((b) => Math.max(b.w, b.h))));
    expect(plan.sq.total).toBeCloseTo(plan.sq.content * 1.12, 6);
  });

  it("honours a manual merge fraction and reports it as used (the slider's wire)", () => {
    stubCanvas(twoIcons);
    const plan = planSplit(fakeImg(40, 20), { padding: 6, size: 0, transparent: false, mergeFrac: 0.05 });
    expect(plan.usedFrac).toBe(0.05);
  });

  it("encodes nothing: a plan costs no blob and no PNG encode", () => {
    const toBlob = vi.fn();
    stubCanvas(twoIcons);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(toBlob);
    planSplit(fakeImg(40, 20), { padding: 6, size: 0, transparent: false, mergeFrac: null });
    expect(toBlob).not.toHaveBeenCalled();
  });

  it("gives an empty sheet an honest empty plan, not a broken one (RULE 4)", () => {
    stubCanvas(() => [255, 255, 255, 255]);
    const plan = planSplit(fakeImg(30, 30), { padding: 6, size: 0, transparent: false, mergeFrac: null });
    expect(plan.boxes).toEqual([]);
    expect(plan.sq.content).toBe(1);
  });
});
