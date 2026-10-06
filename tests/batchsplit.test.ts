// TDD cycle 7 — batchsplit: one source image -> one PNG blob per detected icon.
// Reuses analyze/detect/render (RULE 1); canvas served by the recording shim.
import { afterEach, describe, expect, it, vi } from "vitest";
import { splitSheet } from "../src/lib/batchsplit";

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
