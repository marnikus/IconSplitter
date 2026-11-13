// split_speed.test.ts — TDD benchmark for the "split approved" pipeline
// (process.ts → batchsplit.ts → render.ts). Baseline anatomy per 4-icon sheet:
// 19 cooperative yields (2 frame + 17 ui timeouts) + serial PNG encode +
// strictly sequential items. Gates: yield diet (19 → ≤6), overlapping encode,
// bounded item pipeline. The 80% model lives in
// docs/archive/2026-10-15-split-speed/README.md.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { splitSheet } from "../src/lib/batchsplit";
import { processItems, type BatchItem } from "../src/batch/process";
import { FakeDir, FakeFile } from "./helpers/fakefs";

// Count and slow every cooperative yield: the browser bills 4–16 ms per
// timeout yield under load; 10 ms is the conservative mid-range model.
const YIELD_MS = 10;
const counts = { ui: 0, frame: 0 };
vi.mock("../src/lib/yield", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/yield")>();
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  return {
    ...actual,
    yieldToUI: async () => { counts.ui += 1; await sleep(YIELD_MS); },
    yieldToFrame: async () => { counts.frame += 1; await sleep(YIELD_MS); },
  };
});

type Rgba = (x: number, y: number) => [number, number, number, number];

/** White 4-icon sheet: four 20×20 black squares on white. */
const fourIcons: Rgba = (x, y) => {
  const inSquare = (x0: number, y0: number) => x >= x0 && x < x0 + 20 && y >= y0 && y < y0 + 20;
  const ink = inSquare(15, 15) || inSquare(65, 15) || inSquare(15, 65) || inSquare(65, 65);
  return ink ? [0, 0, 0, 255] : [255, 255, 255, 255];
};

function stubCanvas(paint: Rgba): void {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    return {
      imageSmoothingQuality: "",
      fillStyle: "",
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      putImageData: vi.fn(),
      getImageData: (_x: number, _y: number, w: number, h: number) => {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const [r, g, b, a] = paint(x, y);
          const i = (y * w + x) * 4;
          data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
        }
        return { data };
      },
    } as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb) {
    cb(new Blob(["png"], { type: "image/png" }));
  });
}

const fakeImg = (w: number, h: number) => ({ naturalWidth: w, naturalHeight: h }) as HTMLImageElement;

beforeEach(() => { counts.ui = 0; counts.frame = 0; });
afterEach(() => vi.restoreAllMocks());

describe("split pipeline speed — yield diet and overlap", () => {
  it("a 4-icon split spends at most 6 cooperative yields (was 19)", async () => {
    stubCanvas(fourIcons);
    const blobs = await splitSheet(fakeImg(100, 100), { padding: 6, size: 0, transparent: false, mergeFrac: null });
    expect(blobs.length).toBe(4);
    expect(counts.ui + counts.frame, `yields: ${counts.ui} ui + ${counts.frame} frame`).toBeLessThanOrEqual(6);
  });

  it("encodes all icons concurrently — every toBlob is issued before the first resolves", async () => {
    stubCanvas(fourIcons);
    const issued: number[] = [];
    const resolved: number[] = [];
    const pending: ((b: Blob) => void)[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb) {
      issued.push(performance.now());
      pending.push((b) => { cb(b); resolved.push(performance.now()); });
    });
    const t0 = performance.now();
    const drain = (async () => {
      // keep releasing whatever encodes are pending until all four resolve
      while (resolved.length < 4 && performance.now() - t0 < 4000) {
        await new Promise((r) => setTimeout(r, 40));
        for (const g of pending.splice(0)) g(new Blob(["x"], { type: "image/png" }));
      }
    })();
    const blobs = await splitSheet(fakeImg(100, 100), { padding: 6, size: 0, transparent: false, mergeFrac: null });
    await drain;
    expect(blobs.length).toBe(4);
    expect(issued.length).toBe(4);
    // Concurrency: the LAST encode was issued no later than the FIRST resolve.
    expect(Math.max(...issued), `issued at ${issued.map((t) => t.toFixed(0))}, resolved at ${resolved.map((t) => t.toFixed(0))}`)
      .toBeLessThanOrEqual(Math.min(...resolved) + 1);
  });
});

describe("split pipeline speed — bounded item pipeline", () => {
  const SPLIT = { padding: 6, size: 0, transparent: false, mergeFrac: null };
  const item = (relPath: string): BatchItem => {
    const relDir = relPath.includes("/") ? relPath.slice(0, relPath.lastIndexOf("/")) : "";
    return { source: { relPath, name: relPath.split("/").pop()!, relDir, refRelPath: null }, file: new FakeFile(relPath.split("/").pop()!), refFile: null };
  };

  it("12 approved items overlap compute/IO — wall ≤ 40% of the sequential run", async () => {
    const dest = new FakeDir("out");
    const items = Array.from({ length: 12 }, (_, i) => item(`a/sheet${i}_AI.png`));
    const splitImage = async () => { await new Promise((r) => setTimeout(r, 24)); return [new Blob(["1"]), new Blob(["2"])]; };
    const t0 = performance.now();
    const report = await processItems(items, { dest, split: SPLIT, splitImage, now: new Date(2026, 8, 30, 14, 32, 8) });
    const wall = performance.now() - t0;
    expect(report.results.length).toBe(12);
    expect(report.results.every((r) => r.outcome === "processed")).toBe(true);
    expect(report.results.map((r) => r.relPath)).toEqual(items.map((i) => i.source.relPath)); // report stays in item order
    // Sequential floor: 12 × 24 ms = 288 ms of compute alone. Overlapping it
    // 3-wide must land well under half — and leaves room for the yield diet
    // measured separately above.
    expect(wall, `wall ${wall.toFixed(0)}ms`).toBeLessThan(150);
  });

  it("stop still works: items not started are reported as stopped, finished ones kept", async () => {
    const dest = new FakeDir("out");
    const items = Array.from({ length: 8 }, (_, i) => item(`a/s${i}_AI.png`));
    let started = 0;
    const splitImage = async () => { started += 1; if (started >= 3) stopFlag = true; await new Promise((r) => setTimeout(r, 5)); return [new Blob(["x"])]; };
    let stopFlag = false;
    const report = await processItems(items, { dest, split: SPLIT, splitImage, now: new Date(2026, 8, 30, 14, 32, 8), shouldStop: () => stopFlag });
    expect(report.stopped).toBe(true);
    expect(report.results.length).toBeLessThan(8);
    expect(report.results.length).toBeGreaterThanOrEqual(3);
  });
});
