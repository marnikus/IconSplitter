// upload_raster.test.ts — the raster path with a recording canvas (RULE 8): the
// canvas really is the declared pixel size, the background really is painted
// before the artwork (that is what flattens alpha), and a decode mismatch is
// reported instead of being called a success.
import { describe, expect, it } from "vitest";
import { blobBytes, decodeVerify, rasterize, svgDataUrl, type RasterDeps } from "../src/lib/uploadraster";

/** Records what the pipeline asked the canvas to do. */
function recordingDeps(over: Partial<RasterDeps> = {}): { deps: RasterDeps; calls: string[]; size: [number, number] } {
  const calls: string[] = [];
  const size: [number, number] = [0, 0];
  const context = {
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "",
    fillStyle: "",
    fillRect: (x: number, y: number, w: number, h: number) => calls.push(`fill ${x},${y},${w},${h} ${String(context.fillStyle)}`),
    drawImage: () => calls.push("draw"),
  };
  const deps: RasterDeps = {
    load: async () => ({ width: 10, height: 10 } as unknown as CanvasImageSource & { width: number; height: number }),
    createCanvas: (width, height) => {
      size[0] = width; size[1] = height;
      return { width, height, getContext: () => context } as unknown as HTMLCanvasElement;
    },
    encode: async (_c, quality) => { calls.push(`encode q=${quality}`); return new Blob(["jpeg"], { type: "image/jpeg" }); },
    ...over,
  };
  return { deps, calls, size };
}

describe("svgDataUrl", () => {
  it("encodes the document so unicode and quotes survive", () => {
    expect(svgDataUrl('<svg><title>Ünïcode "x"</title></svg>')).toContain("data:image/svg+xml;charset=utf-8,");
    expect(decodeURIComponent(svgDataUrl("<svg/>").split(",")[1])).toBe("<svg/>");
  });
});

describe("rasterize", () => {
  it("renders at the declared pixel size, painting the background first", async () => {
    const r = recordingDeps();
    const out = await rasterize({
      svg: "<svg/>", px: { width: 3886, height: 3886, mp: 15.1 }, background: "#123456", quality: 0.8,
    }, r.deps);
    expect(out.ok).toBe(true);
    expect(r.size).toEqual([3886, 3886]);
    expect(r.calls[0]).toBe("fill 0,0,3886,3886 #123456");
    expect(r.calls[1]).toBe("draw");
    expect(r.calls[2]).toBe("encode q=0.8");
    expect(out.bytes).toBeGreaterThan(0);
  });

  it("clamps a nonsense quality instead of asking the encoder for it", async () => {
    const r = recordingDeps();
    await rasterize({ svg: "<svg/>", px: { width: 8, height: 8, mp: 0 }, background: "#fff", quality: 42 }, r.deps);
    expect(r.calls.at(-1)).toBe("encode q=1");
  });

  it("reports a missing context, a failed load and empty bytes as failures", async () => {
    const noContext = recordingDeps({
      createCanvas: (w, h) => ({ width: w, height: h, getContext: () => null }) as unknown as HTMLCanvasElement,
    });
    expect((await rasterize({ svg: "<svg/>", px: { width: 4, height: 4, mp: 0 }, background: "#fff", quality: 0.9 }, noContext.deps)).error)
      .toBe("canvas 2d context unavailable");

    const badLoad = recordingDeps({ load: async () => { throw new Error("broken SVG"); } });
    expect((await rasterize({ svg: "<svg/>", px: { width: 4, height: 4, mp: 0 }, background: "#fff", quality: 0.9 }, badLoad.deps)).error)
      .toBe("broken SVG");

    const noBytes = recordingDeps({ encode: async () => null });
    const result = await rasterize({ svg: "<svg/>", px: { width: 4, height: 4, mp: 0 }, background: "#fff", quality: 0.9 }, noBytes.deps);
    expect(result.ok).toBe(false);
    expect(result.blob).toBeNull();
  });
});

describe("verification", () => {
  it("reads the bytes of the blob it is about to write", async () => {
    const bytes = await blobBytes(new Blob(["abcd"]));
    expect([...bytes]).toEqual([97, 98, 99, 100]);
  });

  it("accepts an output that decodes at the expected size", async () => {
    const decoded = await decodeVerify(new Uint8Array([1, 2, 3]), "image/jpeg", async () => ({ width: 3886, height: 3886, error: null }));
    expect(decoded).toEqual({ width: 3886, height: 3886, error: null });
  });

  it("reports a decoder that fails, instead of pretending the file is fine", async () => {
    const decoded = await decodeVerify(new Uint8Array([1]), "image/jpeg", async () => { throw new Error("bad SOF"); });
    expect(decoded).toEqual({ width: 0, height: 0, error: "bad SOF" });
  });
});
