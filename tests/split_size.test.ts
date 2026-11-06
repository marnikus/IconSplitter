// split_size.test.ts — the exported split size must equal the preset size
// exactly (user report 2026-10-15: "size 1024 does nothing; exported files
// have a different size"). Two links are pinned here:
//   1. preset parse repairs recoverable stored values (a legacy string
//      `"size": "1024"` was silently coerced to 0 = auto — the reported bug);
//   2. the split pipeline renders each blob at exactly `split.size` px
//      (0 = native content size).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parsePresetList } from "../src/lib/presets";
import { splitSheet } from "../src/lib/batchsplit";

function canvasWidths(paint: (x: number, y: number, w: number, h: number) => [number, number, number, number]): number[] {
  const widths: number[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function () {
    return {
      imageSmoothingQuality: "", fillStyle: "",
      drawImage: vi.fn(), fillRect: vi.fn(), putImageData: vi.fn(),
      getImageData: (_x: number, _y: number, w: number, h: number) => {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const [r, g, b, a] = paint(x, y, w, h);
          const i = (y * w + x) * 4;
          data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
        }
        return { data };
      },
    } as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, cb) {
    widths.push(this.width);
    cb(new Blob(["png"], { type: "image/png" }));
  });
  return widths;
}

const fourIcons = (x: number, y: number): [number, number, number, number] => {
  const inSq = (x0: number, y0: number) => x >= x0 && x < x0 + 20 && y >= y0 && y < y0 + 20;
  return inSq(15, 15) || inSq(65, 15) || inSq(15, 65) || inSq(65, 65) ? [0, 0, 0, 255] : [255, 255, 255, 255];
};

beforeEach(() => vi.restoreAllMocks());

describe("preset parse — the chosen size survives storage (RULE 13 repair)", () => {
  it("a legacy string size ('1024') parses back to the number 1024, never to auto", () => {
    const list = parsePresetList(JSON.stringify([{ name: "Default", split: { padding: 6, size: "1024", transparent: false, mergeFrac: null } }]));
    expect(list[0]?.split.size).toBe(1024);
  });

  it("a legacy string padding ('8') parses back to the number 8", () => {
    const list = parsePresetList(JSON.stringify([{ name: "Default", split: { padding: "8", size: 512, transparent: false, mergeFrac: null } }]));
    expect(list[0]?.split.padding).toBe(8);
  });

  it("exact allowed sizes stay; junk and off-list values still fall back to auto (integrity)", () => {
    const list = parsePresetList(JSON.stringify([
      { name: "A", split: { size: 2048 } },
      { name: "B", split: { size: "abc" } },
      { name: "C", split: { size: 1500 } },
      { name: "D", split: { size: true } },
    ]));
    expect(list.map((p) => p.split.size)).toEqual([2048, 0, 0, 0]);
  });
});

describe("split pipeline — exported blobs are exactly split.size px", () => {
  const run = async (size: number): Promise<number[]> => {
    const widths = canvasWidths(fourIcons);
    const blobs = await splitSheet({ naturalWidth: 100, naturalHeight: 100 } as HTMLImageElement, { padding: 6, size, transparent: false, mergeFrac: null });
    expect(blobs.length).toBe(4);
    return widths;
  };

  it("size 1024 → four 1024×1024 PNGs", async () => {
    expect(await run(1024)).toEqual([1024, 1024, 1024, 1024]);
  });

  it("size 512 → four 512×512 PNGs", async () => {
    expect(await run(512)).toEqual([512, 512, 512, 512]);
  });

  it("size 0 (auto) → native content + padding", async () => {
    expect(await run(0)).toEqual([25, 25, 25, 25]);
  });
});
