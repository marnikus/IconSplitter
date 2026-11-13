// jpegworker.ts — the JPEG encoder pool of the "SVG to upload" export
// (2026-11-08, export speed). `canvas.toBlob` encodes a 16 MP picture on ONE
// thread and eight at once take eight times as long, so a batch spent ~60 % of
// its time in it. An OffscreenCanvas in a worker encodes on its own thread: the
// main thread rasterizes the SVG into an ImageBitmap (a few ms, transferred, not
// copied) and a small pool of workers draws it onto a background-filled canvas
// and encodes it. The pixels, the fill and the quality are exactly what the
// main-thread path produces, so the bytes are the same (tests/upload_jpegworker).
// The worker is built from a Blob URL, so the single-file `dist/index.html`
// needs no extra asset. Any missing capability or a worker failure hands back
// to the caller's main-thread path — never a silent loss.

import { normalizeHex } from "../svgbackground";

export interface JpegJob {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  /** JPEG quality 0.5..1. */
  quality: number;
  /** Normalized #rrggbb the canvas is pre-filled with. */
  background: string;
}

/** The worker body: fill, draw the transferred bitmap, encode, transfer the bytes back. */
export const WORKER_SOURCE = `
self.onmessage = async (event) => {
  const { id, bitmap, width, height, quality, background } = event.data;
  try {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("no 2d canvas context");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
    canvas.width = 0; canvas.height = 0;
    const buffer = await blob.arrayBuffer();
    self.postMessage({ id, buffer }, [buffer]);
  } catch (error) {
    self.postMessage({ id, error: String(error && error.message ? error.message : error) });
  }
};`;

/** Idle workers are released after this long, so a finished batch holds nothing. */
export const POOL_IDLE_MS = 20000;
/** Memory bound: each running job holds ~2 full-size bitmaps (≈130 MB at 16 MP). */
const POOL_MAX = 6;

interface Waiting { job: JpegJob; resolve: (jpeg: Uint8Array) => void; reject: (error: Error) => void }
interface Slot { worker: Worker; current: { id: number } & Omit<Waiting, "job"> | null }

const slots: Slot[] = [];
const queue: Waiting[] = [];
let nextId = 1;
let workerUrl: string | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

/** How many workers a batch may keep busy on this machine (2..6, half the cores; the main thread keeps its share). */
export function poolSize(cores: number = typeof navigator === "undefined" ? 4 : navigator.hardwareConcurrency || 4): number {
  return Math.min(POOL_MAX, Math.max(2, Math.floor(cores / 2)));
}

/** True when this browser can encode off the main thread. */
export function jpegWorkersAvailable(): boolean {
  return typeof Worker === "function" && typeof OffscreenCanvas === "function" && typeof createImageBitmap === "function"
    && typeof URL !== "undefined" && typeof URL.createObjectURL === "function";
}

/**
 * The decoded SVG image → a bitmap at exactly the target px, painted by the SAME
 * `drawImage` the main-thread path uses, onto the background fill. (A bitmap made
 * straight from the `<img>` rasterizes antialiased edges differently, so the
 * pictures would differ at edge pixels.) `transferToImageBitmap` moves the pixels,
 * it does not copy them, and the fill is opaque, so the worker's copy is exact.
 */
export function bitmapOf(img: HTMLImageElement, width: number, height: number, background: string): ImageBitmap {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("no 2d canvas context");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.transferToImageBitmap();
}

/** Encodes one job on a pool worker; the job's bitmap is transferred (and closed by the worker). */
export function encodeInWorker(job: JpegJob): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    queue.push({ job: { ...job, background: normalizeHex(job.background) ?? "#ffffff" }, resolve, reject });
    if (idleTimer !== null) { clearTimeout(idleTimer); idleTimer = null; }
    pump();
  });
}

function pump(): void {
  while (queue.length > 0) {
    const slot = freeSlot();
    if (slot === null) return;
    const waiting = queue.shift() as Waiting;
    const id = nextId++;
    slot.current = { id, resolve: waiting.resolve, reject: waiting.reject };
    const { bitmap, width, height, quality, background } = waiting.job;
    try {
      slot.worker.postMessage({ id, bitmap, width, height, quality, background }, [bitmap]);
    } catch (error) {
      slot.current = null;
      waiting.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
  if (slots.every((s) => s.current === null)) scheduleRelease();
}

function freeSlot(): Slot | null {
  const idle = slots.find((s) => s.current === null);
  if (idle) return idle;
  if (slots.length >= poolSize()) return null;
  const slot = openSlot();
  slots.push(slot);
  return slot;
}

function openSlot(): Slot {
  workerUrl ??= URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
  const worker = new Worker(workerUrl);
  const slot: Slot = { worker, current: null };
  worker.onmessage = (event: MessageEvent<{ id: number; buffer?: ArrayBuffer; error?: string }>) => {
    const current = slot.current;
    if (current === null || current.id !== event.data.id) return;
    slot.current = null;
    if (event.data.buffer) current.resolve(new Uint8Array(event.data.buffer));
    else current.reject(new Error(event.data.error ?? "the JPEG worker failed"));
    pump();
  };
  worker.onerror = (event) => failSlot(slot, new Error(event.message || "the JPEG worker crashed"));
  return slot;
}

/** A crashed worker fails ITS job (the caller falls back) and leaves the pool, never the others. */
function failSlot(slot: Slot, error: Error): void {
  const current = slot.current;
  slot.current = null;
  const at = slots.indexOf(slot);
  if (at >= 0) slots.splice(at, 1);
  slot.worker.terminate();
  current?.reject(error);
  pump();
}

function scheduleRelease(): void {
  if (idleTimer !== null) clearTimeout(idleTimer);
  idleTimer = setTimeout(releasePool, POOL_IDLE_MS);
}

/** Terminates every worker and the Blob URL (also what the tests call). */
export function releasePool(): void {
  if (idleTimer !== null) { clearTimeout(idleTimer); idleTimer = null; }
  for (const slot of slots.splice(0)) slot.worker.terminate();
  if (workerUrl !== null) { URL.revokeObjectURL(workerUrl); workerUrl = null; }
}
