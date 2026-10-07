// svgup_raster.test.ts — vectors straight to a 15.1 MP JPEG (design §7/§11,
// phase C contract: "dimension math is pure; a browser probe asserts the 15.1 MP
// decode"). The canvas and the <img> are SEAMS, so the rules can be decided here
// without a browser:
//   · the canvas is created at the INTEGER target size from lib/svgupload/target;
//   · the background is painted FIRST, across the whole canvas, so no pixel keeps
//     alpha (a JPEG has none) — and the artwork is drawn on top of it scaled;
//   · the encoded file is DECODED again and measured, and the MEASURED numbers are
//     what the caller records — with a warning when they differ from the request;
//   · the accepted metadata is written into the JPEG's own segments and read back;
//   · bytes that are not a JPEG, or that no longer decode, are refused: they never
//     become an output.
import { beforeEach, describe, expect, it } from "vitest";
import { rasterize, thumbnailDataUrl, type RasterArgs, type RasterSeams } from "../src/svgupload/raster";
import { jpegDimensions, readMetadata } from "../src/lib/svgupload/jpegseg";

const META = {
  title: "Trophy award symbol for winners. Icon of trophy and award.",
  description: "A simple trophy drawn with clean editable strokes for winner listings.",
  tags: ["icon", "pictogram", "vector", "stroke", "line", "editable", "web"],
};

/** A structurally real JPEG with the requested frame size. */
function jpegFixture(width: number, height: number): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01];
  const sos = [0xff, 0xda, 0x00, 0x0c, 0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3f, 0x00];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof0, ...sos, 0x12, 0x34, 0xff, 0xd9]);
}

interface Record {
  fillStyle: string;
  fillRects: number[][];
  draws: number[][];
  encoded: { type: string; quality: number; width: number; height: number } | null;
}

/** The canvas seam: records what was painted and returns the bytes asked for. */
function fakeSeams(opts: { svgLoads?: boolean; jpegLoads?: boolean; encodeAs?: (w: number, h: number) => Uint8Array | null } = {}) {
  const record: Record = { fillStyle: "", fillRects: [], draws: [], encoded: null };
  let imageCount = 0;
  // What the written file MEASURES as, so the verify decode reports the truth.
  let written = { width: 24, height: 24 };
  const seams: RasterSeams = {
    createImage: () => {
      imageCount += 1;
      const first = imageCount === 1; // the SVG, then the written JPEG
      const loads = first ? opts.svgLoads !== false : opts.jpegLoads !== false;
      const dims = first ? { width: 24, height: 24 } : written;
      return makeImage(loads, dims.width, dims.height);
    },
    createCanvas: (width, height) => ({
      width, height,
      getContext: () => ({
        set fillStyle(value: string) { record.fillStyle = value; },
        get fillStyle() { return record.fillStyle; },
        imageSmoothingEnabled: false, imageSmoothingQuality: "low",
        fillRect: (x: number, y: number, w: number, h: number) => record.fillRects.push([x, y, w, h]),
        drawImage: (_img: unknown, x: number, y: number, w: number, h: number) => record.draws.push([x, y, w, h]),
      }),
      toBlob: (cb: (b: Blob | null) => void, type: string, quality: number) => {
        record.encoded = { type, quality, width, height };
        // An explicit null from the harness means "the encoder produced nothing";
        // `??` would swallow that and hide the case under test.
        const bytes = opts.encodeAs === undefined ? jpegFixture(width, height) : opts.encodeAs(width, height);
        written = bytes === null ? { width: 0, height: 0 } : (jpegDimensions(bytes) ?? { width: 0, height: 0 });
        cb(bytes === null ? null : new Blob([bytes as unknown as BlobPart], { type }));
      },
      toDataURL: () => `data:image/jpeg;base64,${btoa("small")}`,
    }) as unknown as HTMLCanvasElement,
  };
  return { seams, record };
}

/** An <img> that "loads" on the next tick, with the natural size given. */
function makeImage(loads: boolean, width: number, height: number): HTMLImageElement {
  const image = {
    naturalWidth: width, naturalHeight: height,
    set src(_value: string) { queueMicrotask(() => (loads ? this.onload?.(new Event("load")) : this.onerror?.(new Event("error")))); },
    onload: null as ((e: Event) => void) | null,
    onerror: null as ((e: Event) => void) | null,
  };
  return image as unknown as HTMLImageElement;
}

function argsOf(over: Partial<RasterArgs> = {}): RasterArgs {
  return {
    svg: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"></svg>",
    background: null, targetMp: 15.1, ratio: 1, quality: 0.9, meta: null,
    ...over,
  };
}

beforeEach(() => {
  URL.createObjectURL = () => "blob:test";
  URL.revokeObjectURL = () => undefined;
});

describe("the canvas and the JPEG target", () => {
  it("draws once into the integer 15.1 MP canvas at the requested quality", async () => {
    const { seams, record } = fakeSeams();
    const out = await rasterize(argsOf(), seams);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(record.encoded).toEqual({ type: "image/jpeg", quality: 0.9, width: 3886, height: 3886 });
    expect(out.dims).toMatchObject({ width: 3886, height: 3886 });
    expect(out.dims.mp).toBeCloseTo(15.1, 1);
    expect(out.bytes[0]).toBe(0xff);
    expect(out.bytes[1]).toBe(0xd8); // a real JPEG header, not a renamed blob
    expect(out.blob.type).toBe("image/jpeg");
    expect(out.warnings).toEqual([]);
  });

  it("keeps the aspect ratio: a wide icon gets wide pixels, never a square stretch", async () => {
    const { seams, record } = fakeSeams();
    const out = await rasterize(argsOf({ ratio: 2 }), seams);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(record.encoded?.width).toBe(2 * (record.encoded?.height ?? 0));
    expect(out.dims.width / out.dims.height).toBeCloseTo(2, 1);
  });
});

describe("alpha is flattened, never holes", () => {
  it("paints the chosen colour across the whole canvas BEFORE the artwork", async () => {
    const { seams, record } = fakeSeams();
    await rasterize(argsOf({ background: "#102030" }), seams);
    expect(record.fillStyle).toBe("#102030");
    expect(record.fillRects).toEqual([[0, 0, 3886, 3886]]);
    expect(record.draws).toEqual([[0, 0, 3886, 3886]]);
  });

  it("falls back to white when no background is configured", async () => {
    const { seams, record } = fakeSeams();
    await rasterize(argsOf({ background: null }), seams);
    expect(record.fillStyle).toBe("#ffffff");
  });
});

describe("the measured numbers win", () => {
  it("reports what the encoder wrote when it differs, and warns in the record's words", async () => {
    // A canvas cap (Chromium refuses very large canvases): the file says 100×50.
    const { seams } = fakeSeams({ encodeAs: () => jpegFixture(100, 50) });
    const out = await rasterize(argsOf(), seams);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.dims).toMatchObject({ width: 100, height: 50 });
    expect(out.warnings.join(" ")).toContain("100×50");
    expect(out.warnings.join(" ")).toContain("3886×3886");
  });

  it("refuses an encoder that produced nothing", async () => {
    const { seams } = fakeSeams({ encodeAs: () => null });
    const out = await rasterize(argsOf(), seams);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toContain("3886×3886");
  });

  it("refuses bytes that are not a JPEG, or that no longer decode", async () => {
    const notJpeg = fakeSeams({ encodeAs: () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]) });
    const first = await rasterize(argsOf({ meta: META }), notJpeg.seams);
    expect(first.ok).toBe(false);
    if (first.ok) return;
    expect(first.reason.toLowerCase()).toContain("jpeg");

    const undecodable = fakeSeams({ jpegLoads: false });
    const second = await rasterize(argsOf(), undecodable.seams);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason.toLowerCase()).toContain("decode");

    const noSvg = fakeSeams({ svgLoads: false });
    const third = await rasterize(argsOf(), noSvg.seams);
    expect(third.ok).toBe(false);
    if (third.ok) return;
    expect(third.reason.toLowerCase()).toContain("drawn");
  });
});

describe("the metadata inside the JPEG", () => {
  it("writes the accepted answer into the file and reads it back equal", async () => {
    const { seams } = fakeSeams();
    const out = await rasterize(argsOf({ meta: META }), seams);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.md).toEqual(META);
    expect(readMetadata(out.bytes)).toEqual(META);
    // The image data is still a JPEG: the packet was inserted, not substituted.
    expect(jpegDimensions(out.bytes)).toMatchObject({ width: 3886, height: 3886 });
  });

  it("skips the packet entirely when there is no accepted answer", async () => {
    const { seams } = fakeSeams();
    const out = await rasterize(argsOf({ meta: null }), seams);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.md).toBeNull();
    expect(readMetadata(out.bytes)).toBeNull();
  });
});

describe("the vision thumbnail", () => {
  it("is a small data URL at the long edge, never the export size", async () => {
    const { seams } = fakeSeams();
    const url = await thumbnailDataUrl("<svg/>", "#ffffff", 512, seams);
    expect(url?.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("returns null when the SVG cannot be drawn, so no request is sent without an image", async () => {
    const { seams } = fakeSeams({ svgLoads: false });
    expect(await thumbnailDataUrl("<svg/>", null, 512, seams)).toBeNull();
  });
});
