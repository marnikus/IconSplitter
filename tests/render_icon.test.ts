// RULE 8 — renderIcon / canvasToBlob execute for real against a recording
// 2D-context shim: sizing, clamping, background fill, neighbour wipe,
// transparent recolour pass and blob delivery are asserted on behaviour.
import { afterEach, describe, expect, it, vi } from "vitest";
import { canvasToBlob, renderIcon } from "../src/lib/render";
import type { Analysis, Box } from "../src/lib/detect";

type Call = { fn: string; args: unknown[] };

function stubCanvas(pixels?: Uint8ClampedArray) {
  const calls: Call[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function () {
    return {
      imageSmoothingQuality: "",
      fillStyle: "",
      drawImage: (...args: unknown[]) => calls.push({ fn: "drawImage", args }),
      fillRect: (...args: unknown[]) => calls.push({ fn: "fillRect", args }),
      getImageData: (_x: number, _y: number, w: number, h: number) => ({
        data: pixels ?? new Uint8ClampedArray(w * h * 4),
      }),
      putImageData: (...args: unknown[]) => calls.push({ fn: "putImageData", args }),
    } as unknown as CanvasRenderingContext2D;
  });
  return calls;
}

const analysis: Analysis = {
  w: 40, h: 40, scale: 1, mask: new Uint8Array(0),
  bg: [255, 255, 255], ink: [0, 0, 0], inkDiff: 255, threshold: 60,
};
const box: Box = { x: 10, y: 10, w: 20, h: 20, ink: 400 };
const neighbour: Box = { x: 34, y: 10, w: 4, h: 4, ink: 16 };
const img = { naturalWidth: 40, naturalHeight: 40 } as HTMLImageElement;
const sq = { content: 20, total: 24 };

afterEach(() => vi.restoreAllMocks());

describe("renderIcon — sizing and drawing", () => {
  it("uses the requested fixed size and draws background + source + wipe + restore", () => {
    const calls = stubCanvas();
    const c = renderIcon(img, analysis, [box, neighbour], box, sq, { padding: 0, size: 128, transparent: false });
    expect(c.width).toBe(128);
    expect(c.height).toBe(128);
    expect(calls.filter((x) => x.fn === "drawImage")).toHaveLength(2); // main + restore
    expect(calls.filter((x) => x.fn === "fillRect").length).toBe(2); // bg + 1 neighbour wipe
  });

  it("falls back to the shared square size, clamped by maxOut and never below 8", () => {
    stubCanvas();
    expect(renderIcon(img, analysis, [box], box, sq, { padding: 0, size: 0, transparent: false }).width).toBe(24);
    expect(renderIcon(img, analysis, [box], box, sq, { padding: 0, size: 512, transparent: false }, 64).width).toBe(64);
    const tiny = { content: 2, total: 2 };
    expect(renderIcon(img, analysis, [box], box, tiny, { padding: 0, size: 0, transparent: false }).width).toBe(8);
  });

  it("transparent mode skips the background fill and rewrites alpha from bg distance", () => {
    // pixels equal to bg => alpha 0; one dark pixel => alpha > 0, recoloured to ink
    const px = new Uint8ClampedArray(24 * 24 * 4);
    for (let i = 0; i < px.length; i += 4) { px[i] = 255; px[i + 1] = 255; px[i + 2] = 255; px[i + 3] = 255; }
    px[0] = 0; px[1] = 0; px[2] = 0; // one fully dark pixel
    const calls = stubCanvas(px);
    renderIcon(img, analysis, [box], box, sq, { padding: 0, size: 24, transparent: true });
    expect(calls.some((x) => x.fn === "putImageData")).toBe(true);
    expect(px[3]).toBe(255); // dark pixel: alpha 1 → ink colour kept
    const white = 4; // second pixel stayed white bg => alpha 0
    expect(px[white + 3]).toBe(0);
  });
});

describe("canvasToBlob — delivery gate (RULE 15)", () => {
  it("resolves with the encoded blob", async () => {
    const blob = new Blob(["x"], { type: "image/png" });
    const c = { toBlob: (cb: (b: Blob | null) => void) => cb(blob) } as unknown as HTMLCanvasElement;
    await expect(canvasToBlob(c)).resolves.toBe(blob);
  });

  it("fails closed when encoding returns nothing", async () => {
    const c = { toBlob: (cb: (b: Blob | null) => void) => cb(null) } as unknown as HTMLCanvasElement;
    await expect(canvasToBlob(c)).rejects.toThrow("Could not encode image");
  });
});
