// RULE 8 — the composite pixels are produced by the real drawing code against a
// recording 2D-context shim: canvas size, background, one draw per used cell,
// nothing drawn into an empty cell, aspect-preserving rects, PNG delivery.
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderComposite, canvasToPng, hashBytes, COMPOSITE_BG, type CompositeImage } from "../src/lib/svgcanvas";
import { compositeLayout } from "../src/lib/svgcomposite";

type Call = { fn: string; args: unknown[] };

function stubCanvas() {
  const calls: Call[] = [];
  const ctx = {
    fillStyle: "",
    drawImage: (...args: unknown[]) => calls.push({ fn: "drawImage", args }),
    fillRect: (...args: unknown[]) => calls.push({ fn: "fillRect", args }),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ctx as never);
  return calls;
}

const img = (w: number, h: number): CompositeImage => ({ src: { w, h } as unknown as CanvasImageSource, w, h });

afterEach(() => vi.restoreAllMocks());

describe("renderComposite", () => {
  it("draws a square sheet, the background and one fitted image per used cell", () => {
    const calls = stubCanvas();
    const layout = compositeLayout(3, { cell: 100, padding: 10 });
    const canvas = renderComposite(layout, [img(200, 100), img(100, 100), img(50, 200)]);
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(200);
    expect(calls[0]).toEqual({ fn: "fillRect", args: [0, 0, 200, 200] });
    const draws = calls.filter((c) => c.fn === "drawImage");
    expect(draws).toHaveLength(3); // the empty 4th cell draws nothing
    expect(draws[0].args.slice(1)).toEqual([10, 30, 80, 40]); // centred, not stretched
    expect(draws[2].args.slice(1)).toEqual([40, 110, 20, 80]);
  });

  it("uses a neutral background and keeps the sheet square for a 2x2 batch", () => {
    const calls = stubCanvas();
    const layout = compositeLayout(4, { cell: 100, padding: 8 });
    const canvas = renderComposite(layout, [img(10, 10), img(10, 10), img(10, 10), img(10, 10)], "#ffffff");
    expect(canvas.width).toBe(200);
    expect(calls.filter((c) => c.fn === "drawImage")).toHaveLength(4);
    expect(COMPOSITE_BG).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("throws instead of drawing nothing when no 2d context exists", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(() => renderComposite(compositeLayout(1), [img(4, 4)])).toThrow(/context/);
  });
});

describe("canvasToPng", () => {
  it("delivers PNG bytes from toBlob", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb: BlobCallback) {
      cb(new Blob(["png"], { type: "image/png" }));
    });
    const blob = await canvasToPng(document.createElement("canvas"));
    expect(blob.type).toBe("image/png");
    expect(await blob.text()).toBe("png");
  });

  it("falls back to the data URL when toBlob is unavailable", async () => {
    const canvas = document.createElement("canvas");
    Object.defineProperty(canvas, "toBlob", { value: undefined });
    vi.spyOn(canvas, "toDataURL").mockReturnValue("data:image/png;base64,cG5n");
    const blob = await canvasToPng(canvas);
    expect(blob.type).toBe("image/png");
    expect(await blob.text()).toBe("png");
  });
});

describe("hashBytes", () => {
  it("is stable for the same bytes and differs for different bytes", () => {
    expect(hashBytes("abc")).toBe(hashBytes("abc"));
    expect(hashBytes("abc")).not.toBe(hashBytes("abd"));
  });
});
