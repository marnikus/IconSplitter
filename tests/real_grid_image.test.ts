// real_grid_image.test.ts — TDD for exact user image (2x2 lightbulb grid)
// Must split into at least 4 icons, otherwise incorrect
// Uses pngjs to decode real PNG without canvas

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

describe("real grid image — exact user image must split into at least 4", () => {
  const exactPath = join(__dirname, "..", "design temp", "image_to_split", "61e06fee-142a-450e-ad33-7fb48fa905f0.png");

  it("exact user image 61e06fee...png should split into at least 4 at auto", () => {
    const a = loadPngAnalysis(exactPath);
    const resAuto = detect(a, null);
    console.log(`exact auto boxes=${resAuto.boxes.length}`);
    expect(resAuto.boxes.length).toBeGreaterThanOrEqual(4);
  });

  it("exact user image should split into at least 4 at radius 0", () => {
    const a = loadPngAnalysis(exactPath);
    const res0 = detect(a, 0);
    console.log(`exact r0 boxes=${res0.boxes.length}`);
    expect(res0.boxes.length).toBeGreaterThanOrEqual(4);
  });

  it("exact user image: no huge box covering >80% and at least 4 meaningful", () => {
    const a = loadPngAnalysis(exactPath);
    const res = detect(a, null);
    const huge = res.boxes.filter(b => b.w > a.w * 0.8 && b.h > a.h * 0.8);
    expect(huge.length).toBe(0);
    const meaningful = res.boxes.filter(b => b.w > a.w * 0.15 && b.h > a.h * 0.15);
    expect(meaningful.length).toBeGreaterThanOrEqual(4);
  });
});
