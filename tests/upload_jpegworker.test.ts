// upload_jpegworker.test.ts — the JPEG encoder pool of the export (2026-11-08).
// The browser parts (Worker, OffscreenCanvas, createImageBitmap, Image) are
// stubbed, the pool, the job protocol and the rasterizeJpeg wiring run for real:
// the bitmap is painted on the background fill and moved (not copied) to a
// worker, never more workers than `poolSize`, a crashed worker fails only its own
// job, and a browser without workers keeps the original canvas path.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeInWorker, jpegWorkersAvailable, poolSize, releasePool, WORKER_SOURCE, type JpegJob } from "../src/lib/upload/jpegworker";
import { rasterizeJpeg } from "../src/lib/upload/raster";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100"/></svg>`;

function jpegOf(width: number, height: number): ArrayBuffer {
  const sof = [0xff, 0xc0, 0x00, 0x0b, 0x08, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff, 0x01, 0x01, 0x11, 0x00];
  return new Uint8Array([0xff, 0xd8, ...sof, 0xff, 0xd9]).buffer;
}

interface Posted { id: number; width: number; height: number; quality: number; background: string }

/** A worker the test drives by hand: `answer` resolves its job, `crash` fires `onerror`. */
class FakeWorker {
  static all: FakeWorker[] = [];
  static terminated = 0;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  posted: Posted[] = [];
  constructor(public url: string) { FakeWorker.all.push(this); }
  postMessage(message: Posted & { bitmap: unknown }, transfer?: unknown[]): void {
    expect(transfer).toEqual([message.bitmap]); // moved, never copied
    this.posted.push(message);
  }
  answer(width: number, height: number): void {
    const job = this.posted.shift()!;
    this.onmessage?.({ data: { id: job.id, buffer: jpegOf(width, height) } } as MessageEvent);
  }
  fail(error: string): void {
    const job = this.posted.shift()!;
    this.onmessage?.({ data: { id: job.id, error } } as MessageEvent);
  }
  crash(): void { this.onerror?.({ message: "boom" }); }
  terminate(): void { FakeWorker.terminated += 1; }
}

interface Painted { fill: string; rects: number[][]; draws: unknown[][] }
const painted: Painted[] = [];

class FakeOffscreenCanvas {
  constructor(public width: number, public height: number) {}
  getContext() {
    const log: Painted = { fill: "", rects: [], draws: [] };
    painted.push(log);
    return {
      set fillStyle(v: string) { log.fill = v; },
      fillRect: (...a: number[]) => { log.rects.push(a); },
      drawImage: (...a: unknown[]) => { log.draws.push(a); },
    };
  }
  transferToImageBitmap() { return { width: this.width, height: this.height, close: vi.fn() }; }
}

class FakeImage {
  src = "";
  decode() { return Promise.resolve(); }
}

function stubBrowser(): void {
  FakeWorker.all = []; FakeWorker.terminated = 0; painted.length = 0;
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
  vi.stubGlobal("createImageBitmap", vi.fn());
  vi.stubGlobal("Image", FakeImage);
  vi.stubGlobal("URL", { createObjectURL: () => "blob:fake", revokeObjectURL: () => {} });
}

const job = (over: Partial<JpegJob> = {}): JpegJob => ({
  bitmap: { width: 40, height: 20, close: () => {} } as unknown as ImageBitmap,
  width: 40, height: 20, quality: 1, background: "#FFFFFF", ...over,
});

beforeEach(stubBrowser);
afterEach(() => { releasePool(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("poolSize", () => {
  it("is half the cores, between 2 and 6", () => {
    expect([1, 2, 4, 8, 12, 16, 64].map((c) => poolSize(c))).toEqual([2, 2, 2, 4, 6, 6, 6]);
  });
});

describe("the worker body", () => {
  it("fills the background, draws the transferred bitmap and encodes at the asked quality", () => {
    expect(WORKER_SOURCE).toContain("new OffscreenCanvas(width, height)");
    expect(WORKER_SOURCE).toContain("ctx.fillRect(0, 0, width, height)");
    expect(WORKER_SOURCE).toContain("ctx.drawImage(bitmap, 0, 0, width, height)");
    expect(WORKER_SOURCE).toContain(`convertToBlob({ type: "image/jpeg", quality })`);
  });
});

describe("encodeInWorker — pool, protocol, failure", () => {
  it("sends the job to a worker, normalises the fill and resolves the returned bytes", async () => {
    const done = encodeInWorker(job());
    expect(FakeWorker.all).toHaveLength(1);
    expect(FakeWorker.all[0].posted[0]).toMatchObject({ width: 40, height: 20, quality: 1, background: "#ffffff" });
    FakeWorker.all[0].answer(40, 20);
    const bytes = await done;
    expect(Array.from(bytes.slice(0, 2))).toEqual([0xff, 0xd8]);
  });

  it("never opens more workers than the pool size and runs the rest as workers free up, in order", async () => {
    vi.stubGlobal("navigator", { hardwareConcurrency: 4 }); // → 2 workers
    const results = Array.from({ length: 5 }, (_, i) => encodeInWorker(job({ width: 40 + i, height: 20 })));
    expect(FakeWorker.all).toHaveLength(2);
    expect(FakeWorker.all.map((w) => w.posted.length)).toEqual([1, 1]);
    FakeWorker.all[0].answer(40, 20);
    await results[0];
    expect(FakeWorker.all[0].posted[0].width).toBe(42); // the third job took the freed worker
    FakeWorker.all[1].answer(41, 20);
    FakeWorker.all[0].answer(42, 20);
    FakeWorker.all[1].answer(43, 20);
    FakeWorker.all[0].answer(44, 20);
    expect(await Promise.all(results)).toHaveLength(5);
    expect(FakeWorker.all).toHaveLength(2);
  });

  it("a worker that reports an error fails only that job", async () => {
    const first = encodeInWorker(job()); const second = encodeInWorker(job());
    const bad = expect(first).rejects.toThrow("no 2d canvas context");
    FakeWorker.all[0].fail("no 2d canvas context");
    await bad;
    FakeWorker.all[1].answer(40, 20);
    expect((await second).length).toBeGreaterThan(4);
  });

  it("a crashed worker fails its job, leaves the pool, and the next job gets a fresh worker", async () => {
    const first = encodeInWorker(job());
    const bad = expect(first).rejects.toThrow("boom");
    FakeWorker.all[0].crash();
    await bad;
    expect(FakeWorker.terminated).toBe(1);
    const next = encodeInWorker(job());
    expect(FakeWorker.all).toHaveLength(2);
    FakeWorker.all[1].answer(40, 20);
    expect((await next).length).toBeGreaterThan(4);
  });

  it("releases every worker after the pool has been idle", async () => {
    vi.useFakeTimers();
    const done = encodeInWorker(job());
    FakeWorker.all[0].answer(40, 20);
    await done;
    expect(FakeWorker.terminated).toBe(0);
    vi.advanceTimersByTime(25000);
    expect(FakeWorker.terminated).toBe(1);
  });
});

describe("rasterizeJpeg — worker pool by default, canvas path otherwise", () => {
  it("paints the SVG on the background fill (the same drawImage as the canvas path) and returns the worker's JPEG", async () => {
    const target = { width: 60, height: 30, quality: 1, background: "#123456" };
    const run = rasterizeJpeg(SVG, target);
    await vi.waitFor(() => expect(FakeWorker.all[0]?.posted).toHaveLength(1));
    expect(painted[0].fill).toBe("#123456");
    expect(painted[0].rects).toEqual([[0, 0, 60, 30]]);
    expect(painted[0].draws[0].slice(1)).toEqual([0, 0, 60, 30]);
    expect(FakeWorker.all[0].posted[0]).toMatchObject({ width: 60, height: 30, quality: 1, background: "#123456" });
    FakeWorker.all[0].answer(60, 30);
    const result = await run;
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.record).toMatchObject({ width: 60, height: 30, quality: 1, profile: "baseline" });
  });

  it("still refuses a JPEG whose decoded size is not the target (the worker is not trusted blindly)", async () => {
    const run = rasterizeJpeg(SVG, { width: 60, height: 30, quality: 1, background: "#ffffff" });
    await vi.waitFor(() => expect(FakeWorker.all[0]?.posted).toHaveLength(1));
    FakeWorker.all[0].answer(61, 30);
    const result = await run;
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.reason).toContain("do not match the target 60x30");
  });

  it("injected transports (and browsers without workers) keep the main-thread canvas path", async () => {
    const encode = vi.fn(async () => new Uint8Array(jpegOf(60, 30)));
    const result = await rasterizeJpeg(SVG, { width: 60, height: 30, quality: 1, background: "#ffffff" }, {
      render: async () => ({}) as HTMLCanvasElement, encode,
    });
    expect(result.ok).toBe(true);
    expect(encode).toHaveBeenCalledOnce();
    expect(FakeWorker.all).toHaveLength(0);
    vi.unstubAllGlobals();
    expect(jpegWorkersAvailable()).toBe(false); // happy-dom has no Worker/OffscreenCanvas
  });
});
