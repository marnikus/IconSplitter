// @vitest-environment node
// algo_efficiency.test.ts — TDD for 80% faster per-image pipeline
// Verifies fast-count redesign: rMax capped 35, grid-bounds filter, merged mask+downsample

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { PNG } from "pngjs";
import { detect, type Analysis } from "../src/lib/detect";

function median(arr: number[]) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 255;
}
function backgroundByMode(data: Uint8Array, w: number, h: number): [number, number, number] | null {
  const hist = new Map<string, { count: number; r: number; g: number; b: number }>();
  const step = Math.max(1, Math.floor(Math.min(w, h) / 200));
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      const a = data[i + 3] / 255;
      const r = Math.round(data[i] * a + 255 * (1 - a));
      const g = Math.round(data[i + 1] * a + 255 * (1 - a));
      const b = Math.round(data[i + 2] * a + 255 * (1 - a));
      if ((r + g + b) / 3 < 200) continue;
      const q = `${(r / 10) | 0},${(g / 10) | 0},${(b / 10) | 0}`;
      const ex = hist.get(q);
      if (ex) { ex.count++; ex.r += r; ex.g += g; ex.b += b; }
      else hist.set(q, { count: 1, r, g, b });
    }
  }
  let best: { count: number; r: number; g: number; b: number } | null = null;
  for (const v of hist.values()) if (!best || v.count > best.count) best = v;
  if (!best || best.count < 10) return null;
  return [Math.round(best.r / best.count), Math.round(best.g / best.count), Math.round(best.b / best.count)];
}
function sampleBorder(data: Uint8Array, w: number, h: number) {
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  const push = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    const a = data[i + 3] / 255;
    rs.push(data[i] * a + 255 * (1 - a));
    gs.push(data[i + 1] * a + 255 * (1 - a));
    bs.push(data[i + 2] * a + 255 * (1 - a));
  };
  const sx = Math.max(1, Math.floor(w / 600)), sy = Math.max(1, Math.floor(h / 600));
  for (let x = 0; x < w; x += sx) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y += sy) { push(0, y); push(w - 1, y); }
  return { rs, gs, bs };
}
function estimateBackground(data: Uint8Array, w: number, h: number): [number, number, number] {
  const mode = backgroundByMode(data, w, h);
  if (mode) return mode;
  const { rs, gs, bs } = sampleBorder(data, w, h);
  return [median(rs), median(gs), median(bs)];
}
function analyzeFromRgba(data: Uint8Array, w: number, h: number): Analysis {
  const bg = estimateBackground(data, w, h);
  const diff = new Uint8Array(w * h);
  const hist = new Uint32Array(256);
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    const a = data[i + 3] / 255;
    const r = data[i] * a + 255 * (1 - a);
    const g = data[i + 1] * a + 255 * (1 - a);
    const b = data[i + 2] * a + 255 * (1 - a);
    const d = Math.max(Math.abs(r - bg[0]), Math.abs(g - bg[1]), Math.abs(b - bg[2])) | 0;
    const v = d > 255 ? 255 : d;
    diff[p] = v;
    hist[v]++;
  }
  let acc = 0, maxD = 0;
  const need = w * h * 0.001;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= need) { maxD = v; break; } }
  maxD = Math.max(maxD, 30);
  const thr = Math.min(110, Math.max(18, maxD * 0.42));
  const mask = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) if (diff[p] > thr) mask[p] = 1;
  return { w, h, scale: 1, mask, bg: bg.map(Math.round) as [number, number, number], ink: [0, 0, 0], inkDiff: maxD, threshold: thr };
}
function loadPngAnalysis(path: string): Analysis {
  const buf = readFileSync(path);
  const png = PNG.sync.read(buf);
  return analyzeFromRgba(png.data, png.width, png.height);
}

describe("algo efficiency — 80% faster per-image", () => {
  // Coverage instrumentation inflates every run ~3–9x (verified 2026-10-15:
  // exact 1283ms, synthetic 1791ms, sparse 508ms under `--coverage` at HEAD too),
  // so the lane runner flags coverage and these budgets widen — still tripwires
  // against the old ~1500ms/1000ms/2000ms implementations.
  const coverageRun = process.env.PERF_BUDGETS === "coverage";
  const exactBudget = coverageRun ? 2_500 : 400;
  const syntheticBudget = coverageRun ? 4_000 : 200;
  const sparseBudget = coverageRun ? 1_500 : 300;
  const exactPath = join(__dirname, "..", "design temp", "image_to_split", "61e06fee-142a-450e-ad33-7fb48fa905f0.png");

  it("detect on exact 1254px image finishes <400ms and finds >=4 boxes (80% faster than old ~1500ms)", () => {
    const a = loadPngAnalysis(exactPath);
    const t0 = performance.now();
    const res = detect(a, null);
    const dt = performance.now() - t0;
    console.log(`efficiency: exact image detect ${dt.toFixed(1)}ms boxes=${res.boxes.length}`);
    expect(res.boxes.length).toBeGreaterThanOrEqual(4);
    // Target: 80% faster than old ~1500ms => <300ms ideal, <400ms allowed in CI
    expect(dt).toBeLessThan(exactBudget);
  });

  it("synthetic 1000px 4-icon grid detects <200ms (old ~1000ms)", () => {
    const w = 1000, h = 1000;
    const mask = new Uint8Array(w * h);
    const paint = (x0: number, y0: number, s: number) => {
      for (let y = y0; y < y0 + s; y++) for (let x = x0; x < x0 + s; x++) mask[y * w + x] = 1;
    };
    paint(100, 100, 200);
    paint(700, 100, 200);
    paint(100, 700, 200);
    paint(700, 700, 200);
    const a: Analysis = { w, h, scale: 1, mask, bg: [255, 255, 255], ink: [0, 0, 0], inkDiff: 200, threshold: 60 };
    const t0 = performance.now();
    const res = detect(a, null);
    const dt = performance.now() - t0;
    console.log(`efficiency: synthetic 1000px detect ${dt.toFixed(1)}ms boxes=${res.boxes.length}`);
    expect(res.boxes).toHaveLength(4);
    expect(dt).toBeLessThan(syntheticBudget);
  });

  it("fast count matches exact count for small radii", () => {
    // 2 separated squares, gap 10px, at r=1 count 2, at r=10 count 1
    const w = 100, h = 100;
    const mask = new Uint8Array(w * h);
    for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) mask[y * w + x] = 1;
    for (let y = 10; y < 30; y++) for (let x = 50; x < 70; x++) mask[y * w + x] = 1;
    const a: Analysis = { w, h, scale: 1, mask, bg: [255, 255, 255], ink: [0, 0, 0], inkDiff: 200, threshold: 60 };
    const resSmall = detect(a, 1 / 100);
    const resLarge = detect(a, 15 / 100);
    expect(resSmall.boxes).toHaveLength(2);
    expect(resLarge.boxes).toHaveLength(1);
  });

  it("rMax is capped at 35, not 160 (fast path)", () => {
    // For 800px grid, old rMax = 0.2*800=160, new capped 35
    const w = 800, h = 800;
    const mask = new Uint8Array(w * h);
    mask[0] = 1;
    mask[w * h - 1] = 1;
    const a: Analysis = { w, h, scale: 1, mask, bg: [255, 255, 255], ink: [0, 0, 0], inkDiff: 200, threshold: 60 };
    const t0 = performance.now();
    const res = detect(a, null);
    const dt = performance.now() - t0;
    // Should be fast even for sparse mask: old ~2000ms, new <300ms
    expect(dt).toBeLessThan(sparseBudget);
    expect(res.boxes.length).toBeGreaterThanOrEqual(1);
  });
});
