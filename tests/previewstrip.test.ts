// previewstrip.test.ts — TDD for one row's preview strip (design P2, D6-D8).
// RULE 8: the real `renderIcon`/`canvasToBlob` render into recording 2D-context
// shims, so the assertions are about pixels being drawn where they must be —
// number of icons, their order, the thumb cap, and the chunk geometry.

import { afterEach, describe, expect, it, vi } from "vitest";
import { renderStrip, stripBlobs, stripChunks } from "../src/lib/previewstrip";
import { CHUNK_ICONS, MAX_ICONS_PER_ROW, MAX_STRIP_PX, THUMB_PX } from "../src/lib/previewlimits";
import type { SplitPlan } from "../src/lib/batchsplit";
import type { Box } from "../src/lib/detect";

type Call = { fn: string; args: unknown[] };

function stubCanvas() {
  const calls: Call[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function () {
    return {
      imageSmoothingQuality: "",
      fillStyle: "",
      drawImage: (...args: unknown[]) => calls.push({ fn: "drawImage", args }),
      fillRect: (...args: unknown[]) => calls.push({ fn: "fillRect", args }),
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: (...args: unknown[]) => calls.push({ fn: "putImageData", args }),
    } as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb: BlobCallback) {
    cb(new Blob(["png"], { type: "image/png" }));
  });
  return calls;
}

const img = { naturalWidth: 400, naturalHeight: 200 } as HTMLImageElement;

function planOf(icons: number): SplitPlan {
  const boxes: Box[] = Array.from({ length: icons }, (_, i) => ({
    x: (i % 8) * 40, y: Math.floor(i / 8) * 40, w: 30, h: 30, ink: 500,
  }));
  return {
    an: { w: 400, h: 200, scale: 1, mask: new Uint8Array(400 * 200), bg: [255, 255, 255], ink: [0, 0, 0], inkDiff: 255, threshold: 60 },
    boxes, usedFrac: 0.01, autoFrac: 0.01, sq: { content: 30, total: 33 },
  };
}

const SPLIT = { padding: 6, size: 0, transparent: false, mergeFrac: null };

afterEach(() => vi.restoreAllMocks());

describe("stripChunks — how one row's icons become chunks", () => {
  it("keeps every chunk inside the width cap the canvas has to honour", () => {
    expect(CHUNK_ICONS * THUMB_PX).toBeLessThanOrEqual(MAX_STRIP_PX);
    expect(MAX_ICONS_PER_ROW).toBeGreaterThanOrEqual(CHUNK_ICONS);
  });

  it("plans nothing for an empty row", () => {
    expect(stripChunks(0, 128)).toEqual({ counts: [], shown: 0, capped: false });
  });

  it("keeps a full row in one chunk and spills the remainder into the next", () => {
    expect(stripChunks(1, 128)).toEqual({ counts: [1], shown: 1, capped: false });
    expect(stripChunks(128, 128)).toEqual({ counts: [128], shown: 128, capped: false });
    expect(stripChunks(129, 128)).toEqual({ counts: [128, 1], shown: 129, capped: false });
  });

  it("caps the strip at the per-row limit and says so", () => {
    const p = stripChunks(913, 128);
    expect(p.shown).toBe(512);
    expect(p.capped).toBe(true);
    expect(p.counts.reduce((a, v) => a + v, 0)).toBe(512);
    expect(p.counts).toEqual([128, 128, 128, 128]);
  });

  it("never plans a chunk wider than the width cap, whatever it is asked for", () => {
    const p = stripChunks(1000, 128);
    expect(p.shown).toBeLessThanOrEqual(MAX_ICONS_PER_ROW);
    for (const n of p.counts) expect(n * THUMB_PX).toBeLessThanOrEqual(MAX_STRIP_PX);
  });
});

describe("renderStrip — the real icons, in detection order, at thumb size", () => {
  it("draws one composite canvas per chunk, sized by the icons it holds", () => {
    stubCanvas();
    const canvases = renderStrip(img, planOf(5), SPLIT, THUMB_PX);
    expect(canvases).toHaveLength(1);
    expect(canvases[0].width).toBe(5 * THUMB_PX);
    expect(canvases[0].height).toBe(THUMB_PX);
  });

  it("composites every icon once, each exactly one thumb wide and tall", () => {
    const calls = stubCanvas();
    renderStrip(img, planOf(3), SPLIT, THUMB_PX);
    // A composite draw is the 5-argument form; renderIcon's own source draws take 9.
    const composited = calls.filter((c) => c.fn === "drawImage" && c.args.length === 5);
    expect(composited).toHaveLength(3);
    for (const c of composited) expect([c.args[3], c.args[4]]).toEqual([THUMB_PX, THUMB_PX]);
  });

  it("lays the icons out left to right, in detection order", () => {
    const calls = stubCanvas();
    renderStrip(img, planOf(3), SPLIT, THUMB_PX);
    // renderIcon draws the source; the composite draws each finished icon at i * thumb.
    const draws = calls.filter((c) => c.fn === "drawImage").map((c) => c.args);
    const composite = draws.filter((args) => args.length === 5 && args[3] === THUMB_PX && args[4] === THUMB_PX);
    expect(composite[0][1]).toBe(0);
    expect(composite[1][1]).toBe(THUMB_PX);
    expect(composite[2][1]).toBe(2 * THUMB_PX);
  });

  it("splits a long row across canvases without losing an icon", () => {
    stubCanvas();
    const plan = stripChunks(300, 128);
    const canvases = renderStrip(img, planOf(300), SPLIT, THUMB_PX);
    expect(canvases).toHaveLength(plan.counts.length);
    expect(canvases.map((c) => c.width / THUMB_PX)).toEqual(plan.counts);
  });
});

describe("stripBlobs — what the UI actually caches", () => {
  it("produces one PNG blob per chunk, never an empty one (RULE 15)", async () => {
    stubCanvas();
    const blobs = await stripBlobs(img, planOf(130), SPLIT);
    expect(blobs).toHaveLength(2);
    for (const b of blobs) {
      expect(b.type).toBe("image/png");
      expect(b.size).toBeGreaterThan(0);
    }
  });

  it("produces nothing for a row with no icons (empty stays empty, RULE 4)", async () => {
    stubCanvas();
    expect(await stripBlobs(img, planOf(0), SPLIT)).toEqual([]);
  });
});
