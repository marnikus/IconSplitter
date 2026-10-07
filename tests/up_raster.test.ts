// up_raster.test.ts — the raster pipeline executes for real (RULE 8): the
// ~15.1 MP integer dimensions are computed from the artboard (never an
// enlarged thumbnail), the drawing code runs against a recording 2D-context
// shim (background fill first, then the vector draw at exact pixels), and the
// produceJpeg orchestration verifies structure, dimensions, decode and hash
// before a byte is accepted. Deleting the module fails every assertion here.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Bounds } from "../src/lib/upgeom";
import { fitPlan, rasterSize } from "../src/lib/upfit";
import { drawRenderedIcon, produceJpeg, type RasterDeps } from "../src/lib/upraster";

const SQUARE: Bounds = { minX: 10, minY: 20, maxX: 110, maxY: 120 };

/** A fake JPEG with an honest SOF frame header (dimension verification reads it). */
function fakeJpeg(w: number, h: number): Uint8Array {
  // SOF0 payload: precision, height, width, 1 component, component spec.
  const payload = [8, (h >> 8) & 0xff, h & 0xff, (w >> 8) & 0xff, w & 0xff, 1, 1, 0x11, 0x00];
  const len = payload.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xc0, (len >> 8) & 0xff, len & 0xff, ...payload, 0xff, 0xd9]);
}

type Call = { fn: string; args: unknown[] };

function stubCanvas() {
  const calls: Call[] = [];
  const ctx = {
    fillStyle: "",
    imageSmoothingEnabled: false,
    fillRect: (...args: unknown[]) => calls.push({ fn: "fillRect", args }),
    drawImage: (...args: unknown[]) => calls.push({ fn: "drawImage", args }),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ctx as never);
  return calls;
}

afterEach(() => vi.restoreAllMocks());

describe("upraster — the drawing step", () => {
  it("fills the background first, then draws the vector at the exact pixel size", () => {
    const calls = stubCanvas();
    const canvas = document.createElement("canvas");
    const img = {} as CanvasImageSource;
    drawRenderedIcon({ canvas, img, width: 3886, height: 3886, background: "#123456" });
    expect(canvas.width).toBe(3886);
    expect(canvas.height).toBe(3886);
    expect(calls[0]).toEqual({ fn: "fillRect", args: [0, 0, 3886, 3886] }); // alpha flattening first
    expect(calls[1]).toEqual({ fn: "drawImage", args: [img, 0, 0, 3886, 3886] }); // the vector draw
  });

  it("sets the flattening colour on the context before the fill runs", () => {
    const order: string[] = [];
    const ctx = {
      imageSmoothingEnabled: false,
      fillRect: () => order.push("fillRect"),
      drawImage: () => order.push("drawImage"),
    };
    Object.defineProperty(ctx, "fillStyle", {
      set: (v: string) => order.push(`fillStyle:${v}`),
      get: () => "#000000",
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ctx as never);
    drawRenderedIcon({ canvas: document.createElement("canvas"), img: {} as CanvasImageSource, width: 10, height: 10, background: "#ffffff" });
    expect(order).toEqual(["fillStyle:#ffffff", "fillRect", "drawImage"]);
  });
});

describe("upraster — produceJpeg (the verified pipeline)", () => {
  const plan = fitPlan(SQUARE, { paddingPct: 8, artboard: "square" });
  const raster = rasterSize(plan, 15.1);
  const deps = (over: Partial<RasterDeps> = {}): RasterDeps => ({
    rasterize: async () => fakeJpeg(raster.width, raster.height),
    decode: async () => true,
    sha256: async () => "abc123",
    ...over,
  });

  it("produces the ~15.1 MP JPEG with dims, MP and hash recorded", async () => {
    const out = await produceJpeg("<svg/>", plan, { mpx: 15.1, quality: 0.92, background: "#ffffff" }, deps());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.width).toBe(3886);
    expect(out.height).toBe(3886);
    expect(out.mpx).toBeGreaterThanOrEqual(15.1);
    expect(out.mpx).toBeLessThan(15.11);
    expect(out.hash).toBe("abc123");
  });

  it("passes the exact size, background and quality to the rasterizer", async () => {
    const calls: unknown[][] = [];
    const out = await produceJpeg("<svg/>", plan, { mpx: 15.1, quality: 0.9, background: "#010203" }, deps({
      rasterize: async (...a) => { calls.push(a); return fakeJpeg(raster.width, raster.height); },
    }));
    expect(out.ok).toBe(true);
    expect(calls[0]).toEqual(["<svg/>", 3886, 3886, "#010203", 0.9]);
  });

  it("fails honestly when the rasterizer returns nothing (RULE 4)", async () => {
    const out = await produceJpeg("<svg/>", plan, { mpx: 15.1, quality: 0.9, background: "#fff" }, deps({ rasterize: async () => null }));
    expect(out).toMatchObject({ ok: false });
  });

  it("refuses bytes that are not a JPEG or have no frame header", async () => {
    const bad = await produceJpeg("<svg/>", plan, { mpx: 15.1, quality: 0.9, background: "#fff" }, deps({ rasterize: async () => new Uint8Array([1, 2, 3]) }));
    expect(bad).toMatchObject({ ok: false });
  });

  it("refuses a JPEG whose dimensions do not match the computed target", async () => {
    const wrong = await produceJpeg("<svg/>", plan, { mpx: 15.1, quality: 0.9, background: "#fff" }, deps({ rasterize: async () => fakeJpeg(1000, 1000) }));
    expect(wrong).toMatchObject({ ok: false });
    if (!wrong.ok) expect(wrong.error).toContain("1000");
  });

  it("refuses a JPEG that will not decode (deep verification)", async () => {
    const out = await produceJpeg("<svg/>", plan, { mpx: 15.1, quality: 0.9, background: "#fff" }, deps({ decode: async () => false }));
    expect(out).toMatchObject({ ok: false });
  });
});
