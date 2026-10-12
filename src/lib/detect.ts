// quality-override: file_lines=400 reason=async chunked + fast-count redesign for 80% faster per-image, bounds-tracking label avoids 16M scans per radius
export interface Box { x: number; y: number; w: number; h: number; ink: number; }
export interface Analysis { w: number; h: number; scale: number; mask: Uint8Array; bg: [number, number, number]; ink: [number, number, number]; inkDiff: number; threshold: number; ds?: Downsample; }
export interface DetectResult { boxes: Box[]; usedFrac: number; autoFrac: number; }
export interface Downsample { cells: Uint8Array; counts: Uint32Array; gw: number; gh: number; f: number; }
const MAX_DIM = 4000;
const CHUNK_PIXELS = 500_000;
const CHUNK_ROWS = 100;
const FAST_RMAX_CAP = 35;
const FAST_RMAX_FRAC = 0.08;
import { yieldToUI } from "./yield";
function median(a: number[]) { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 255; }
function sampleBorder(d: Uint8ClampedArray, w: number, h: number) {
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  const push = (x: number, y: number) => {
    const i = (y * w + x) * 4, a = d[i + 3] / 255;
    rs.push(d[i] * a + 255 * (1 - a)); gs.push(d[i + 1] * a + 255 * (1 - a)); bs.push(d[i + 2] * a + 255 * (1 - a));
  };
  const sx = Math.max(1, Math.floor(w / 600)), sy = Math.max(1, Math.floor(h / 600));
  for (let x = 0; x < w; x += sx) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y += sy) { push(0, y); push(w - 1, y); }
  return { rs, gs, bs };
}
function backgroundByMode(d: Uint8ClampedArray, w: number, h: number): [number, number, number] | null {
  const hist = new Map<string, { count: number; r: number; g: number; b: number }>();
  const step = Math.max(1, Math.floor(Math.min(w, h) / 200));
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4; const a = d[i + 3] / 255;
      const r = Math.round(d[i] * a + 255 * (1 - a)), g = Math.round(d[i + 1] * a + 255 * (1 - a)), b = Math.round(d[i + 2] * a + 255 * (1 - a));
      if ((r + g + b) / 3 < 200) continue;
      const q = `${(r / 10) | 0},${(g / 10) | 0},${(b / 10) | 0}`;
      const ex = hist.get(q); if (ex) { ex.count++; ex.r += r; ex.g += g; ex.b += b; } else hist.set(q, { count: 1, r, g, b });
    }
  }
  let best: { count: number; r: number; g: number; b: number } | null = null;
  for (const v of hist.values()) if (!best || v.count > best.count) best = v;
  if (!best || best.count < 10) return null;
  return [Math.round(best.r / best.count), Math.round(best.g / best.count), Math.round(best.b / best.count)];
}
function estimateBackground(d: Uint8ClampedArray, w: number, h: number): [number, number, number] {
  const mode = backgroundByMode(d, w, h); if (mode) return mode;
  const { rs, gs, bs } = sampleBorder(d, w, h); return [median(rs), median(gs), median(bs)];
}
function diffHistSync(d: Uint8ClampedArray, bg: [number, number, number], w: number, h: number) {
  const diff = new Uint8Array(w * h), hist = new Uint32Array(256);
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    const a = d[i + 3] / 255, r = d[i] * a + 255 * (1 - a), g = d[i + 1] * a + 255 * (1 - a), b = d[i + 2] * a + 255 * (1 - a);
    const v = Math.max(Math.abs(r - bg[0]), Math.abs(g - bg[1]), Math.abs(b - bg[2])) | 0;
    const cl = v > 255 ? 255 : v; diff[p] = cl; hist[cl]++;
  }
  return { diff, hist };
}
async function diffHistAsync(d: Uint8ClampedArray, bg: [number, number, number], w: number, h: number) {
  const diff = new Uint8Array(w * h), hist = new Uint32Array(256); const total = w * h;
  for (let p = 0, i = 0; p < total; p++, i += 4) {
    const a = d[i + 3] / 255, r = d[i] * a + 255 * (1 - a), g = d[i + 1] * a + 255 * (1 - a), b = d[i + 2] * a + 255 * (1 - a);
    const v = Math.max(Math.abs(r - bg[0]), Math.abs(g - bg[1]), Math.abs(b - bg[2])) | 0;
    const cl = v > 255 ? 255 : v; diff[p] = cl; hist[cl]++;
    if (p % CHUNK_PIXELS === 0 && p !== 0) await yieldToUI();
  }
  return { diff, hist };
}
function maxDiffFromHist(hist: Uint32Array, total: number) {
  let acc = 0; const need = total * 0.001;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= need) return Math.max(v, 30); }
  return 30;
}
function makeDownsample(w: number, h: number, f: number) {
  const gw = Math.ceil(w / f), gh = Math.ceil(h / f);
  return { cells: new Uint8Array(gw * gh), counts: new Uint32Array(gw * gh), gw, gh };
}
type MaskCfg = { maxD: number; thr: number; w: number; h: number; f: number };
function maskDownsampleSync(diff: Uint8Array, data: Uint8ClampedArray, cfg: MaskCfg) {
  const { maxD, thr, w, h, f } = cfg;
  const mask = new Uint8Array(diff.length); let sr = 0, sg = 0, sb = 0, sn = 0;
  const { cells, counts, gw, gh } = makeDownsample(w, h, f);
  for (let y = 0; y < h; y++) {
    const row = y * w, cy = ((y / f) | 0) * gw;
    for (let x = 0; x < w; x++) {
      const p = row + x; const d = diff[p];
      if (d > thr) { mask[p] = 1; const c = cy + ((x / f) | 0); cells[c] = 1; counts[c]++; }
      if (d >= maxD * 0.85) { const i = p * 4; sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; sn++; }
    }
  }
  const ink: [number, number, number] = sn ? [Math.round(sr / sn), Math.round(sg / sn), Math.round(sb / sn)] : [0, 0, 0];
  return { mask, ink, cells, counts, gw, gh };
}
async function maskDownsampleAsync(diff: Uint8Array, data: Uint8ClampedArray, cfg: MaskCfg) {
  const { maxD, thr, w, h, f } = cfg;
  const mask = new Uint8Array(diff.length); let sr = 0, sg = 0, sb = 0, sn = 0;
  const { cells, counts, gw, gh } = makeDownsample(w, h, f);
  for (let y = 0; y < h; y++) {
    const row = y * w, cy = ((y / f) | 0) * gw;
    for (let x = 0; x < w; x++) {
      const p = row + x; const d = diff[p];
      if (d > thr) { mask[p] = 1; const c = cy + ((x / f) | 0); cells[c] = 1; counts[c]++; }
      if (d >= maxD * 0.85) { const i = p * 4; sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; sn++; }
    }
    if (y % CHUNK_ROWS === 0 && y !== 0) await yieldToUI();
  }
  const ink: [number, number, number] = sn ? [Math.round(sr / sn), Math.round(sg / sn), Math.round(sb / sn)] : [0, 0, 0];
  return { mask, ink, cells, counts, gw, gh };
}
export function analyze(img: HTMLImageElement): Analysis {
  const nw = img.naturalWidth, nh = img.naturalHeight, k = Math.min(1, MAX_DIM / Math.max(nw, nh));
  const w = Math.max(1, Math.round(nw * k)), h = Math.max(1, Math.round(nh * k));
  const f = Math.max(1, Math.ceil(Math.max(w, h) / 600));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!; ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data; const bg = estimateBackground(data, w, h);
  const { diff, hist } = diffHistSync(data, bg, w, h);
  const maxD = maxDiffFromHist(hist, w * h); const thr = Math.min(110, Math.max(18, maxD * 0.42));
  const { mask, ink, cells, counts, gw, gh } = maskDownsampleSync(diff, data, { maxD, thr, w, h, f });
  return { w, h, scale: nw / w, mask, bg: bg.map(Math.round) as [number, number, number], ink, inkDiff: maxD, threshold: thr, ds: { cells, counts, gw, gh, f } };
}
export async function analyzeAsync(img: HTMLImageElement): Promise<Analysis> {
  const nw = img.naturalWidth, nh = img.naturalHeight, k = Math.min(1, MAX_DIM / Math.max(nw, nh));
  const w = Math.max(1, Math.round(nw * k)), h = Math.max(1, Math.round(nh * k));
  const f = Math.max(1, Math.ceil(Math.max(w, h) / 600));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!; ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data; const bg = estimateBackground(data, w, h);
  await yieldToUI();
  const { diff, hist } = await diffHistAsync(data, bg, w, h);
  const maxD = maxDiffFromHist(hist, w * h); const thr = Math.min(110, Math.max(18, maxD * 0.42));
  const { mask, ink, cells, counts, gw, gh } = await maskDownsampleAsync(diff, data, { maxD, thr, w, h, f });
  return { w, h, scale: nw / w, mask, bg: bg.map(Math.round) as [number, number, number], ink, inkDiff: maxD, threshold: thr, ds: { cells, counts, gw, gh, f } };
}
function dilateH(src: Uint8Array, tmp: Uint8Array, g: { gw: number; gh: number }, r: number) {
  const { gw, gh } = g, pre = new Int32Array(gw + 1);
  for (let y = 0; y < gh; y++) {
    const row = y * gw; pre[0] = 0;
    for (let x = 0; x < gw; x++) pre[x + 1] = pre[x] + src[row + x];
    for (let x = 0; x < gw; x++) { const a = Math.max(0, x - r), b = Math.min(gw, x + r + 1); tmp[row + x] = pre[b] - pre[a] > 0 ? 1 : 0; }
  }
}
function dilateV(tmp: Uint8Array, out: Uint8Array, g: { gw: number; gh: number }, r: number) {
  const { gw, gh } = g, pre = new Int32Array(gh + 1);
  for (let x = 0; x < gw; x++) {
    pre[0] = 0; for (let y = 0; y < gh; y++) pre[y + 1] = pre[y] + tmp[y * gw + x];
    for (let y = 0; y < gh; y++) { const a = Math.max(0, y - r), b = Math.min(gh, y + r + 1); out[y * gw + x] = pre[b] - pre[a] > 0 ? 1 : 0; }
  }
}
function dilate(src: Uint8Array, gw: number, gh: number, r: number): Uint8Array {
  if (r <= 0) return src.slice();
  const tmp = new Uint8Array(gw * gh), out = new Uint8Array(gw * gh), g = { gw, gh };
  dilateH(src, tmp, g, r); dilateV(tmp, out, g, r); return out;
}
interface Labeling { labels: Int32Array; valid: boolean[]; count: number; minX: number[]; maxX: number[]; minY: number[]; maxY: number[]; }
type Grid = { cells: Uint8Array; counts: Uint32Array; gw: number; gh: number };
function tryPush(q: number, id: number, ctx: { dil: Uint8Array; labels: Int32Array; stack: number[]; }) {
  if (ctx.dil[q] && ctx.labels[q] === -1) { ctx.labels[q] = id; ctx.stack.push(q); }
}
function updateBounds(px: number, py: number, id: number, ctx: { minX: number[]; maxX: number[]; minY: number[]; maxY: number[]; }) {
  ctx.minX[id] = Math.min(ctx.minX[id], px); ctx.maxX[id] = Math.max(ctx.maxX[id], px);
  ctx.minY[id] = Math.min(ctx.minY[id], py); ctx.maxY[id] = Math.max(ctx.maxY[id], py);
}
function pushNeighbors(px: number, py: number, id: number, ctx: { dil: Uint8Array; labels: Int32Array; gw: number; gh: number; stack: number[]; }) {
  const { gw, gh } = ctx;
  for (let dy = -1; dy <= 1; dy++) {
    const ny = py + dy; if (ny < 0 || ny >= gh) continue;
    const base = ny * gw;
    for (let dx = -1; dx <= 1; dx++) {
      const nx = px + dx; if (nx < 0 || nx >= gw) continue;
      if (dx === 0 && dy === 0) continue;
      tryPush(base + nx, id, ctx);
    }
  }
}
function floodFillBounds(s: number, id: number, ctx: { dil: Uint8Array; cells: Uint8Array; counts: Uint32Array; labels: Int32Array; gw: number; gh: number; stack: number[]; minX: number[]; maxX: number[]; minY: number[]; maxY: number[]; inks: number[]; }) {
  const { cells, counts, labels, gw, stack, minX, maxX, minY, maxY, inks } = ctx;
  let ink = 0; labels[s] = id; stack.push(s);
  minX[id] = maxX[id] = s % gw; minY[id] = maxY[id] = (s / gw) | 0;
  while (stack.length) {
    const p = stack.pop()!; if (cells[p]) ink += counts[p];
    const px = p % gw, py = (p / gw) | 0;
    updateBounds(px, py, id, ctx);
    pushNeighbors(px, py, id, ctx);
  }
  inks[id] = ink;
}
function labelWithBounds(dil: Uint8Array, grid: Grid): Labeling {
  const { cells, counts, gw, gh } = grid;
  const labels = new Int32Array(gw * gh).fill(-1), inks: number[] = [], stack: number[] = [];
  const minX: number[] = [], maxX: number[] = [], minY: number[] = [], maxY: number[] = [];
  const ctx = { dil, cells, counts, labels, gw, gh, stack, minX, maxX, minY, maxY, inks };
  let n = 0;
  for (let s = 0; s < gw * gh; s++) { if (!dil[s] || labels[s] !== -1) continue; floodFillBounds(s, n, ctx); n++; }
  const maxInk = Math.max(0, ...inks), valid = inks.map((v) => v >= maxInk * 0.015 && v > 0);
  return { labels, valid, count: valid.filter(Boolean).length, minX, maxX, minY, maxY };
}
function downsampleSync(mask: Uint8Array, w: number, h: number, f: number) {
  const gw = Math.ceil(w / f), gh = Math.ceil(h / f), cells = new Uint8Array(gw * gh), counts = new Uint32Array(gw * gh);
  for (let y = 0; y < h; y++) { const row = y * w, cy = ((y / f) | 0) * gw; for (let x = 0; x < w; x++) if (mask[row + x]) { const c = cy + ((x / f) | 0); cells[c] = 1; counts[c]++; } }
  return { cells, counts, gw, gh };
}
async function downsampleAsync(mask: Uint8Array, w: number, h: number, f: number) {
  const gw = Math.ceil(w / f), gh = Math.ceil(h / f), cells = new Uint8Array(gw * gh), counts = new Uint32Array(gw * gh);
  for (let y = 0; y < h; y++) {
    const row = y * w, cy = ((y / f) | 0) * gw;
    for (let x = 0; x < w; x++) if (mask[row + x]) { const c = cy + ((x / f) | 0); cells[c] = 1; counts[c]++; }
    if (y % CHUNK_ROWS === 0 && y !== 0) await yieldToUI();
  }
  return { cells, counts, gw, gh };
}
function removeHLines(cells: Uint8Array, gw: number, gh: number, rowSums: number[]) {
  const out = cells.slice(), thr = gw * 0.8; let y = 0;
  while (y < gh) {
    if (rowSums[y] <= thr) { y++; continue; }
    let y2 = y; while (y2 + 1 < gh && rowSums[y2 + 1] > thr) y2++;
    if (y2 - y + 1 <= 3) for (let yy = y; yy <= y2; yy++) for (let x = 0; x < gw; x++) out[yy * gw + x] = 0;
    y = y2 + 1;
  }
  return out;
}
function removeVLines(cells: Uint8Array, gw: number, gh: number, colSums: number[]) {
  const out = cells.slice(), thr = gh * 0.8; let x = 0;
  while (x < gw) {
    if (colSums[x] <= thr) { x++; continue; }
    let x2 = x; while (x2 + 1 < gw && colSums[x2 + 1] > thr) x2++;
    if (x2 - x + 1 <= 3) for (let xx = x; xx <= x2; xx++) for (let yy = 0; yy < gh; yy++) out[yy * gw + xx] = 0;
    x = x2 + 1;
  }
  return out;
}
function removeGridLines(cells: Uint8Array, gw: number, gh: number): Uint8Array {
  const rowSums = new Array(gh).fill(0), colSums = new Array(gw).fill(0);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) if (cells[y * gw + x]) { rowSums[y]++; colSums[x]++; }
  let tmp = removeHLines(cells, gw, gh, rowSums); tmp = removeVLines(tmp, gw, gh, colSums); return tmp;
}
type Run = { start: number; end: number; count: number };
function filterBySizeGrid(lab: Labeling, f: number, imgW: number, imgH: number): number {
  let cnt = 0;
  for (let i = 0; i < lab.valid.length; i++) {
    if (!lab.valid[i]) continue;
    const w = (lab.maxX[i] - lab.minX[i] + 1) * f, h = (lab.maxY[i] - lab.minY[i] + 1) * f;
    if (w < imgW * 0.08 || h < imgH * 0.08) continue;
    if (w > imgW * 0.85 && h > imgH * 0.85) continue;
    if ((w > imgW * 0.9 || h > imgH * 0.9) && w * h > imgW * imgH * 0.5) continue;
    cnt++;
  }
  return cnt;
}
function countAtRadiusFastSync(ctx: Grid, f: number, a: Analysis, r: number): number {
  const lab = labelWithBounds(dilate(ctx.cells, ctx.gw, ctx.gh, r), ctx);
  return filterBySizeGrid(lab, f, a.w, a.h);
}
function nextR(r: number) { return r < 10 ? r + 1 : r + 2; }
function buildSeriesFastSync(ctx: Grid, rMax: number, f: number, a: Analysis) {
  const series: number[] = []; let ones = 0;
  for (let r = 1; r <= rMax; r = nextR(r)) {
    const c = countAtRadiusFastSync(ctx, f, a, r); series.push(c);
    if (c === 1) { ones++; if (ones >= 3) break; } else ones = 0;
  }
  const runs: Run[] = [];
  for (let i = 0; i < series.length; i++) { const last = runs[runs.length - 1]; if (last && last.count === series[i]) last.end = i; else runs.push({ start: i, end: i, count: series[i] }); }
  return runs;
}
async function buildSeriesFastAsync(ctx: Grid, rMax: number, f: number, a: Analysis) {
  const series: number[] = []; let ones = 0; let iter = 0;
  for (let r = 1; r <= rMax; r = nextR(r)) {
    const c = countAtRadiusFastSync(ctx, f, a, r); series.push(c);
    if (c === 1) { ones++; if (ones >= 3) break; } else ones = 0;
    iter++; if (iter % 5 === 0) await yieldToUI();
  }
  const runs: Run[] = [];
  for (let i = 0; i < series.length; i++) { const last = runs[runs.length - 1]; if (last && last.count === series[i]) last.end = i; else runs.push({ start: i, end: i, count: series[i] }); }
  return runs;
}
function bestRun(runs: Run[]): Run {
  const cand = runs.filter((r) => r.count >= 2); const pool = cand.length ? cand : runs; let best = pool[0];
  for (const r of pool) {
    const len = r.end - r.start, bestLen = best.end - best.start;
    if (len > bestLen) best = r; else if (len === bestLen && r.count > best.count) best = r;
  }
  return best;
}
function updateBoundsPx(x: number, y: number, l: number, b: { minX: number[]; minY: number[]; maxX: number[]; maxY: number[]; ink: number[]; }) {
  if (x < b.minX[l]) b.minX[l] = x; if (x > b.maxX[l]) b.maxX[l] = x;
  if (y < b.minY[l]) b.minY[l] = y; if (y > b.maxY[l]) b.maxY[l] = y; b.ink[l]++;
}
function extractBoxesSync(a: Analysis, lab: Labeling, f: number, gw: number) {
  const { w, h, mask, scale } = a, n = lab.valid.length;
  const b = { minX: new Array(n).fill(Infinity), minY: new Array(n).fill(Infinity), maxX: new Array(n).fill(-Infinity), maxY: new Array(n).fill(-Infinity), ink: new Array(n).fill(0) };
  for (let y = 0; y < h; y++) {
    const row = y * w, cy = ((y / f) | 0) * gw;
    for (let x = 0; x < w; x++) { if (!mask[row + x]) continue; const l = lab.labels[cy + ((x / f) | 0)]; if (l < 0 || !lab.valid[l]) continue; updateBoundsPx(x, y, l, b); }
  }
  const boxes: Box[] = [];
  for (let i = 0; i < n; i++) {
    if (!lab.valid[i] || !isFinite(b.minX[i])) continue;
    const x0 = Math.max(0, (b.minX[i] - 1) * scale), y0 = Math.max(0, (b.minY[i] - 1) * scale);
    boxes.push({ x: x0, y: y0, w: (b.maxX[i] + 2) * scale - x0, h: (b.maxY[i] + 2) * scale - y0, ink: b.ink[i] });
  }
  return boxes;
}
async function extractBoxesAsync(a: Analysis, lab: Labeling, f: number, gw: number) {
  const { w, h, mask, scale } = a, n = lab.valid.length;
  const b = { minX: new Array(n).fill(Infinity), minY: new Array(n).fill(Infinity), maxX: new Array(n).fill(-Infinity), maxY: new Array(n).fill(-Infinity), ink: new Array(n).fill(0) };
  const ctx = { a, lab, f, gw, b };
  for (let y = 0; y < h; y++) { scanRowSync(ctx, y); if (y % CHUNK_ROWS === 0 && y !== 0) await yieldToUI(); }
  return buildBoxesFromBounds(b, lab, scale);
}
function scanRowSync(ctx: { a: Analysis; lab: Labeling; f: number; gw: number; b: { minX: number[]; minY: number[]; maxX: number[]; maxY: number[]; ink: number[]; } }, y: number) {
  const { a, lab, f, gw, b } = ctx; const { w, mask } = a; const row = y * w, cy = ((y / f) | 0) * gw;
  for (let x = 0; x < w; x++) { if (!mask[row + x]) continue; const l = lab.labels[cy + ((x / f) | 0)]; if (l < 0 || !lab.valid[l]) continue; updateBoundsPx(x, y, l, b); }
}
function buildBoxesFromBounds(b: { minX: number[]; minY: number[]; maxX: number[]; maxY: number[]; ink: number[]; }, lab: Labeling, scale: number): Box[] {
  const boxes: Box[] = [];
  for (let i = 0; i < lab.valid.length; i++) {
    if (!lab.valid[i] || !isFinite(b.minX[i])) continue;
    const x0 = Math.max(0, (b.minX[i] - 1) * scale), y0 = Math.max(0, (b.minY[i] - 1) * scale);
    boxes.push({ x: x0, y: y0, w: (b.maxX[i] + 2) * scale - x0, h: (b.maxY[i] + 2) * scale - y0, ink: b.ink[i] });
  }
  return boxes;
}
function isInside(inner: Box, outer: Box) { return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h; }
function filterContained(boxes: Box[]): Box[] {
  if (boxes.length <= 1) return boxes; const sorted = [...boxes].sort((a, b) => b.w * b.h - a.w * a.h); const keep: Box[] = [];
  for (const b of sorted) { const container = keep.find((o) => isInside(b, o) && b.ink < o.ink * 0.5); if (!container) keep.push(b); }
  return keep;
}
function filterBySize(boxes: Box[], imgW: number, imgH: number): Box[] {
  return boxes.filter((b) => {
    if (b.w < imgW * 0.08 || b.h < imgH * 0.08) return false;
    if (b.w > imgW * 0.85 && b.h > imgH * 0.85) return false;
    if (b.w > imgW * 0.9 || b.h > imgH * 0.9) { if (b.w * b.h > imgW * imgH * 0.5) return false; }
    return true;
  });
}
function orderBoxes(boxes: Box[]): Box[] {
  boxes.sort((p, q) => p.y + p.h / 2 - (q.y + q.h / 2)); const rows: Box[][] = [];
  for (const b of boxes) {
    const cy = b.y + b.h / 2; const row = rows.find((rw) => Math.abs(rw[0].y + rw[0].h / 2 - cy) < Math.min(rw[0].h, b.h) * 0.5);
    if (row) row.push(b); else rows.push([b]);
  }
  return rows.flatMap((rw) => rw.sort((p, q) => p.x - q.x));
}
function getDownsample(a: Analysis): Downsample {
  if (a.ds) return a.ds;
  const f = Math.max(1, Math.ceil(Math.max(a.w, a.h) / 600));
  const { cells, counts, gw, gh } = downsampleSync(a.mask, a.w, a.h, f);
  return { cells, counts, gw, gh, f };
}
async function getDownsampleAsync(a: Analysis): Promise<Downsample> {
  if (a.ds) return a.ds;
  const f = Math.max(1, Math.ceil(Math.max(a.w, a.h) / 600));
  const { cells, counts, gw, gh } = await downsampleAsync(a.mask, a.w, a.h, f);
  return { cells, counts, gw, gh, f };
}
function fastRMax(gw: number, gh: number) { return Math.max(3, Math.min(FAST_RMAX_CAP, Math.floor(Math.max(gw, gh) * FAST_RMAX_FRAC))); }
export function detect(a: Analysis, radiusFrac: number | null): DetectResult {
  const { w, h } = a, longest = Math.max(w, h);
  const { cells: raw, counts, gw, gh, f } = getDownsample(a);
  const cells = removeGridLines(raw, gw, gh);
  const rMax = fastRMax(gw, gh);
  const runs = buildSeriesFastSync({ cells, counts, gw, gh }, rMax, f, a);
  const best = bestRun(runs);
  const autoR = Math.round((best.start + best.end) / 2) + 1;
  const autoFrac = (autoR * f) / longest, usedFrac = radiusFrac ?? autoFrac;
  const r = radiusFrac == null ? autoR : Math.max(0, Math.round((radiusFrac * longest) / f));
  const lab = labelWithBounds(dilate(cells, gw, gh, r), { cells, counts, gw, gh });
  const rawBoxes = extractBoxesSync(a, lab, f, gw);
  const contained = filterContained(rawBoxes); const sized = filterBySize(contained, w, h);
  return { boxes: orderBoxes(sized.length ? sized : contained), usedFrac, autoFrac };
}
export async function detectAsync(a: Analysis, radiusFrac: number | null): Promise<DetectResult> {
  const { w, h } = a, longest = Math.max(w, h);
  const { cells: raw, counts, gw, gh, f } = await getDownsampleAsync(a);
  await yieldToUI();
  const cells = removeGridLines(raw, gw, gh);
  await yieldToUI();
  const rMax = fastRMax(gw, gh);
  const runs = await buildSeriesFastAsync({ cells, counts, gw, gh }, rMax, f, a);
  const best = bestRun(runs);
  const autoR = Math.round((best.start + best.end) / 2) + 1;
  const autoFrac = (autoR * f) / longest, usedFrac = radiusFrac ?? autoFrac;
  const r = radiusFrac == null ? autoR : Math.max(0, Math.round((radiusFrac * longest) / f));
  const lab = labelWithBounds(dilate(cells, gw, gh, r), { cells, counts, gw, gh });
  await yieldToUI();
  const rawBoxes = await extractBoxesAsync(a, lab, f, gw);
  const contained = filterContained(rawBoxes); const sized = filterBySize(contained, w, h);
  return { boxes: orderBoxes(sized.length ? sized : contained), usedFrac, autoFrac };
}
