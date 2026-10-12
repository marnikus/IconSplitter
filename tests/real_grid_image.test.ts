// real_grid_image.test.ts — TDD for exact user image (2x2 lightbulb grid)
// Must split into at least 4 icons, otherwise incorrect
// Uses pngjs to decode real PNG without canvas (happy-dom has no canvas)

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { PNG } from "pngjs";
import { detect, type Analysis } from "../src/lib/detect";

function median(arr: number[]) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 255;
}

function analyzeFromRgba(data: Uint8Array, w: number, h: number): Analysis {
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
  const bg: [number, number, number] = [median(rs), median(gs), median(bs)];
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

describe("real grid image — must split into at least 4", () => {
  it("generated grid-lightbulb.png should split into at least 4 (proxy for user image)", () => {
    const filePath = join(__dirname, "assets", "grid-lightbulb.png");
    const a = loadPngAnalysis(filePath);
    const resAuto = detect(a, null);
    const res0 = detect(a, 0);
    console.log(`auto boxes=${resAuto.boxes.length}, r0 boxes=${res0.boxes.length}`);
    expect(resAuto.boxes.length).toBeGreaterThanOrEqual(4);
    expect(res0.boxes.length).toBeGreaterThanOrEqual(4);
  });

  it("exact user condition: 2x2 grid must be at least 4, otherwise incorrect", () => {
    const filePath = join(__dirname, "assets", "grid-lightbulb.png");
    const a = loadPngAnalysis(filePath);
    const res = detect(a, null);
    expect(res.boxes.length).toBeGreaterThanOrEqual(4);
    // No single box should cover >80% of image (would mean failed to split)
    const huge = res.boxes.filter(b => b.w > a.w * 0.8 && b.h > a.h * 0.8);
    expect(huge.length).toBe(0);
    // Each box should be at least 15% of width/height (not dust)
    const meaningful = res.boxes.filter(b => b.w > a.w * 0.15 && b.h > a.h * 0.15);
    expect(meaningful.length).toBeGreaterThanOrEqual(4);
  });
});
