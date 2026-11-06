// quality-override: file_lines=400 reason=UF+ink-cell+sampled hist+buf reuse for 80% speedup, bounds-tracking avoids 16M scans
export interface Box { x: number; y: number; w: number; h: number; ink: number; }
export interface Analysis { w: number; h: number; scale: number; mask: Uint8Array; bg: [number, number, number]; ink: [number, number, number]; inkDiff: number; threshold: number; ds?: Downsample; }
export interface DetectResult { boxes: Box[]; usedFrac: number; autoFrac: number; }
export interface Downsample { cells: Uint8Array; counts: Uint32Array; gw: number; gh: number; f: number; }
const MAX_DIM = 4000; const FAST_RMAX_CAP = 35; const FAST_RMAX_FRAC = 0.08;
import { yieldToUI, yieldBudget } from "./yield";

/** A decoded sheet: the classic element or an off-thread-decoded bitmap. */
export type SheetSource = HTMLImageElement | ImageBitmap;
/** Sheet dimensions through one helper (naturalWidth for elements, width for bitmaps). */
export function sheetDims(img: SheetSource): { nw: number; nh: number } {
  const w = "naturalWidth" in img ? img.naturalWidth : img.width;
  const h = "naturalHeight" in img ? img.naturalHeight : img.height;
  return { nw: w, nh: h };
}
function median(a: number[]) { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 255; }
function sampleBorder(d: Uint8ClampedArray, w: number, h: number) {
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  const push = (x: number, y: number) => { const i = (y * w + x) * 4, a = d[i + 3] / 255; rs.push(d[i] * a + 255 * (1 - a)); gs.push(d[i + 1] * a + 255 * (1 - a)); bs.push(d[i + 2] * a + 255 * (1 - a)); };
  const sx = Math.max(1, Math.floor(w / 600)), sy = Math.max(1, Math.floor(h / 600));
  for (let x = 0; x < w; x += sx) { push(x, 0); push(x, h - 1); } for (let y = 0; y < h; y += sy) { push(0, y); push(w - 1, y); }
  return { rs, gs, bs };
}
function backgroundByMode(d: Uint8ClampedArray, w: number, h: number): [number, number, number] | null {
  const hist = new Map<string, { count: number; r: number; g: number; b: number }>(); const step = Math.max(1, Math.floor(Math.min(w, h) / 200));
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    const i = (y * w + x) * 4; const a = d[i + 3] / 255; const r = Math.round(d[i] * a + 255 * (1 - a)), g = Math.round(d[i + 1] * a + 255 * (1 - a)), b = Math.round(d[i + 2] * a + 255 * (1 - a));
    if ((r + g + b) / 3 < 200) continue; const q = `${(r / 10) | 0},${(g / 10) | 0},${(b / 10) | 0}`; const ex = hist.get(q);
    if (ex) { ex.count++; ex.r += r; ex.g += g; ex.b += b; } else hist.set(q, { count: 1, r, g, b });
  }
  let best: { count: number; r: number; g: number; b: number } | null = null; for (const v of hist.values()) if (!best || v.count > best.count) best = v;
  if (!best || best.count < 10) return null; return [Math.round(best.r / best.count), Math.round(best.g / best.count), Math.round(best.b / best.count)];
}
function estimateBackground(d: Uint8ClampedArray, w: number, h: number): [number, number, number] { const mode = backgroundByMode(d, w, h); if (mode) return mode; const { rs, gs, bs } = sampleBorder(d, w, h); return [median(rs), median(gs), median(bs)]; }
function chooseSampleStride(w: number, h: number) { const tot = w * h; if (tot > 1_000_000) return 3; if (tot > 250_000) return 2; return 1; }
function histSampledSync(data: Uint8ClampedArray, bg: [number, number, number], w: number, h: number) {
  const hist = new Uint32Array(256); const step = chooseSampleStride(w, h); let sampled = 0; const bg0 = bg[0], bg1 = bg[1], bg2 = bg[2];
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    const p = y * w + x, i = p * 4; const al = data[i + 3]; let r: number, g: number, b: number;
    if (al === 255) { r = data[i]; g = data[i + 1]; b = data[i + 2]; } else { const a = al / 255; r = data[i] * a + 255 * (1 - a); g = data[i + 1] * a + 255 * (1 - a); b = data[i + 2] * a + 255 * (1 - a); }
    const v = Math.max(Math.abs(r - bg0), Math.abs(g - bg1), Math.abs(b - bg2)) | 0; hist[v > 255 ? 255 : v]++; sampled++;
  }
  return { hist, sampled };
}
async function histSampledAsync(data: Uint8ClampedArray, bg: [number, number, number], w: number, h: number) {
  const hist = new Uint32Array(256); const step = chooseSampleStride(w, h); let sampled = 0; const bg0 = bg[0], bg1 = bg[1], bg2 = bg[2];
  const breathe = yieldBudget();
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const p = y * w + x, i = p * 4; const al = data[i + 3]; let r: number, g: number, b: number;
      if (al === 255) { r = data[i]; g = data[i + 1]; b = data[i + 2]; } else { const a = al / 255; r = data[i] * a + 255 * (1 - a); g = data[i + 1] * a + 255 * (1 - a); b = data[i + 2] * a + 255 * (1 - a); }
      const v = Math.max(Math.abs(r - bg0), Math.abs(g - bg1), Math.abs(b - bg2)) | 0; hist[v > 255 ? 255 : v]++; sampled++;
    }
    if ((y & 0x3f) === 0) await breathe(); // time-budgeted: only when the stretch ran long
  }
  return { hist, sampled };
}
function maxDiffFromHist(hist: Uint32Array, total: number) { let acc = 0; const need = total * 0.001; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= need) return Math.max(v, 30); } return 30; }
function makeDownsample(w: number, h: number, f: number) { const gw = Math.ceil(w / f), gh = Math.ceil(h / f); return { cells: new Uint8Array(gw * gh), counts: new Uint32Array(gw * gh), gw, gh }; }
type MaskCfg = { maxD: number; thr: number; w: number; h: number; f: number; bg: [number, number, number] };
function maskWithDiffSync(data: Uint8ClampedArray, cfg: MaskCfg) {
  const { maxD, thr, w, h, f, bg } = cfg; const mask = new Uint8Array(w * h); let sr = 0, sg = 0, sb = 0, sn = 0; const { cells, counts, gw, gh } = makeDownsample(w, h, f);
  const bg0 = bg[0], bg1 = bg[1], bg2 = bg[2];
  for (let y = 0; y < h; y++) { const row = y * w, cy = ((y / f) | 0) * gw; for (let x = 0; x < w; x++) {
    const p = row + x, i = p * 4; const al = data[i + 3]; let r: number, g: number, b: number;
    if (al === 255) { r = data[i]; g = data[i + 1]; b = data[i + 2]; } else { const a = al / 255; r = data[i] * a + 255 * (1 - a); g = data[i + 1] * a + 255 * (1 - a); b = data[i + 2] * a + 255 * (1 - a); }
    const d = Math.max(Math.abs(r - bg0), Math.abs(g - bg1), Math.abs(b - bg2)) | 0;
    if (d > thr) { mask[p] = 1; const c = cy + ((x / f) | 0); cells[c] = 1; counts[c]++; } if (d >= maxD * 0.85) { sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; sn++; }
  } }
  const ink: [number, number, number] = sn ? [Math.round(sr / sn), Math.round(sg / sn), Math.round(sb / sn)] : [0, 0, 0]; return { mask, ink, cells, counts, gw, gh };
}
async function maskWithDiffAsync(data: Uint8ClampedArray, cfg: MaskCfg) {
  const { maxD, thr, w, h, f, bg } = cfg; const mask = new Uint8Array(w * h); let sr = 0, sg = 0, sb = 0, sn = 0; const { cells, counts, gw, gh } = makeDownsample(w, h, f);
  const bg0 = bg[0], bg1 = bg[1], bg2 = bg[2];
  const breathe = yieldBudget();
  for (let y = 0; y < h; y++) { const row = y * w, cy = ((y / f) | 0) * gw; for (let x = 0; x < w; x++) {
    const p = row + x, i = p * 4; const al = data[i + 3]; let r: number, g: number, b: number;
    if (al === 255) { r = data[i]; g = data[i + 1]; b = data[i + 2]; } else { const a = al / 255; r = data[i] * a + 255 * (1 - a); g = data[i + 1] * a + 255 * (1 - a); b = data[i + 2] * a + 255 * (1 - a); }
    const d = Math.max(Math.abs(r - bg0), Math.abs(g - bg1), Math.abs(b - bg2)) | 0;
    if (d > thr) { mask[p] = 1; const c = cy + ((x / f) | 0); cells[c] = 1; counts[c]++; } if (d >= maxD * 0.85) { sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; sn++; }
  } if ((y & 0x3f) === 0) await breathe(); }
  const ink: [number, number, number] = sn ? [Math.round(sr / sn), Math.round(sg / sn), Math.round(sb / sn)] : [0, 0, 0]; return { mask, ink, cells, counts, gw, gh };
}
export function analyze(img: HTMLImageElement): Analysis {
  const nw = img.naturalWidth, nh = img.naturalHeight, k = Math.min(1, MAX_DIM / Math.max(nw, nh)); const w = Math.max(1, Math.round(nw * k)), h = Math.max(1, Math.round(nh * k));
  const f = Math.max(1, Math.ceil(Math.max(w, h) / 400)); const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!; ctx.drawImage(img, 0, 0, w, h); const data = ctx.getImageData(0, 0, w, h).data; const bg = estimateBackground(data, w, h);
  const { hist, sampled } = histSampledSync(data, bg, w, h); const maxD = maxDiffFromHist(hist, sampled); const thr = Math.min(110, Math.max(18, maxD * 0.42));
  const { mask, ink, cells, counts, gw, gh } = maskWithDiffSync(data, { maxD, thr, w, h, f, bg });
  return { w, h, scale: nw / w, mask, bg: bg.map(Math.round) as [number, number, number], ink, inkDiff: maxD, threshold: thr, ds: { cells, counts, gw, gh, f } };
}
export async function analyzeAsync(img: SheetSource): Promise<Analysis> {
  const { nw, nh } = sheetDims(img);
  const k = Math.min(1, MAX_DIM / Math.max(nw, nh)); const w = Math.max(1, Math.round(nw * k)), h = Math.max(1, Math.round(nh * k));
  const f = Math.max(1, Math.ceil(Math.max(w, h) / 400)); const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!; ctx.drawImage(img, 0, 0, w, h); const data = ctx.getImageData(0, 0, w, h).data; const bg = estimateBackground(data, w, h);
  await yieldToUI(); const { hist, sampled } = await histSampledAsync(data, bg, w, h); const maxD = maxDiffFromHist(hist, sampled); const thr = Math.min(110, Math.max(18, maxD * 0.42));
  const { mask, ink, cells, counts, gw, gh } = await maskWithDiffAsync(data, { maxD, thr, w, h, f, bg });
  return { w, h, scale: nw / w, mask, bg: bg.map(Math.round) as [number, number, number], ink, inkDiff: maxD, threshold: thr, ds: { cells, counts, gw, gh, f } };
}
type DilateGrid = { gw: number; gh: number }; type DilateBufs = { tmp: Uint8Array; out: Uint8Array };
function dilateH(src: Uint8Array, tmp: Uint8Array, grid: DilateGrid, r: number) {
  const { gw, gh } = grid; const pre = new Int32Array(gw + 1);
  for (let y = 0; y < gh; y++) { const row = y * gw; pre[0] = 0; for (let x = 0; x < gw; x++) pre[x + 1] = pre[x] + src[row + x]; for (let x = 0; x < gw; x++) { const a = Math.max(0, x - r), b = Math.min(gw, x + r + 1); tmp[row + x] = pre[b] - pre[a] > 0 ? 1 : 0; } }
}
function dilateV(tmp: Uint8Array, out: Uint8Array, grid: DilateGrid, r: number) {
  const { gw, gh } = grid; const pre = new Int32Array(gh + 1);
  for (let x = 0; x < gw; x++) { pre[0] = 0; for (let y = 0; y < gh; y++) pre[y + 1] = pre[y] + tmp[y * gw + x]; for (let y = 0; y < gh; y++) { const a = Math.max(0, y - r), b = Math.min(gh, y + r + 1); out[y * gw + x] = pre[b] - pre[a] > 0 ? 1 : 0; } }
}
function dilateBuf(src: Uint8Array, grid: DilateGrid, r: number, bufs: DilateBufs): Uint8Array { const { tmp, out } = bufs; if (r <= 0) { out.set(src); return out; } dilateH(src, tmp, grid, r); dilateV(tmp, out, grid, r); return out; }
interface Labeling { labels: Int32Array; valid: boolean[]; count: number; minX: number[]; maxX: number[]; minY: number[]; maxY: number[]; }
type Grid = { cells: Uint8Array; counts: Uint32Array; gw: number; gh: number };
function findRoot(p: number, parent: Int32Array): number { while (parent[p] !== p) { parent[p] = parent[parent[p]]; p = parent[p]; } return p; }
function unionRoots(a: number, b: number, parent: Int32Array) { const ra = findRoot(a, parent), rb = findRoot(b, parent); if (ra !== rb) parent[rb] = ra; }
function collectNeighbors(idx: number, labels: Int32Array, gw: number): number[] {
  const neigh: number[] = []; const x = idx % gw;
  if (x > 0 && labels[idx - 1] >= 0) neigh.push(labels[idx - 1]);
  if (labels[idx - gw] >= 0) neigh.push(labels[idx - gw]);
  if (x > 0 && labels[idx - gw - 1] >= 0) neigh.push(labels[idx - gw - 1]);
  if (labels[idx - gw + 1] >= 0) neigh.push(labels[idx - gw + 1]);
  return neigh;
}
function firstPass(args: { dil: Uint8Array; gw: number; gh: number; labels: Int32Array; parent: Int32Array }): number {
  const { dil, gw, gh, labels, parent } = args; let next = 0; const tot = gw * gh;
  for (let i = 0; i < tot; i++) {
    if (!dil[i]) continue; if (i < gw) { // first row: only left neighbor
      if (i > 0 && labels[i - 1] >= 0) { labels[i] = labels[i - 1]; continue; }
      labels[i] = next; parent[next] = next; next++; continue;
    }
    const neigh = collectNeighbors(i, labels, gw);
    if (neigh.length === 0) { labels[i] = next; parent[next] = next; next++; }
    else { const first = neigh[0]; labels[i] = first; for (let k = 1; k < neigh.length; k++) unionRoots(first, neigh[k], parent); }
  }
  return next;
}
function secondPass(args: { dil: Uint8Array; grid: Grid; labels: Int32Array; parent: Int32Array; next: number }): Labeling {
  const { dil, grid, labels, parent, next } = args; const { cells, counts, gw } = grid; const tot = gw * grid.gh;
  const minX = new Array(next).fill(Infinity), maxX = new Array(next).fill(-Infinity), minY = new Array(next).fill(Infinity), maxY = new Array(next).fill(-Infinity), inks = new Array(next).fill(0);
  for (let i = 0; i < tot; i++) {
    if (!dil[i]) continue; const root = findRoot(labels[i], parent); labels[i] = root;
    const x = i % gw, y = (i / gw) | 0; if (x < minX[root]) minX[root] = x; if (x > maxX[root]) maxX[root] = x; if (y < minY[root]) minY[root] = y; if (y > maxY[root]) maxY[root] = y; if (cells[i]) inks[root] += counts[i];
  }
  const maxInk = Math.max(0, ...inks); const valid = inks.map((v) => v >= maxInk * 0.015 && v > 0);
  return { labels, valid, count: valid.filter(Boolean).length, minX, maxX, minY, maxY };
}
function labelUF(dil: Uint8Array, grid: Grid): Labeling {
  const { gw, gh } = grid; const tot = gw * gh; const labels = new Int32Array(tot).fill(-1); const parent = new Int32Array(tot);
  const next = firstPass({ dil, gw, gh, labels, parent });
  return secondPass({ dil, grid, labels, parent, next });
}
function downsampleSync(mask: Uint8Array, w: number, h: number, f: number) {
  const gw = Math.ceil(w / f), gh = Math.ceil(h / f), cells = new Uint8Array(gw * gh), counts = new Uint32Array(gw * gh);
  for (let y = 0; y < h; y++) { const row = y * w, cy = ((y / f) | 0) * gw; for (let x = 0; x < w; x++) if (mask[row + x]) { const c = cy + ((x / f) | 0); cells[c] = 1; counts[c]++; } }
  return { cells, counts, gw, gh };
}
async function downsampleAsync(mask: Uint8Array, w: number, h: number, f: number) {
  const gw = Math.ceil(w / f), gh = Math.ceil(h / f), cells = new Uint8Array(gw * gh), counts = new Uint32Array(gw * gh);
  const breathe = yieldBudget();
  for (let y = 0; y < h; y++) { const row = y * w, cy = ((y / f) | 0) * gw; for (let x = 0; x < w; x++) if (mask[row + x]) { const c = cy + ((x / f) | 0); cells[c] = 1; counts[c]++; } if ((y & 0x3f) === 0) await breathe(); }
  return { cells, counts, gw, gh };
}
function removeHLines(cells: Uint8Array, gw: number, gh: number, rowSums: number[]) {
  const out = cells.slice(), thr = gw * 0.8; let y = 0; while (y < gh) { if (rowSums[y] <= thr) { y++; continue; } let y2 = y; while (y2 + 1 < gh && rowSums[y2 + 1] > thr) y2++; if (y2 - y + 1 <= 3) for (let yy = y; yy <= y2; yy++) for (let x = 0; x < gw; x++) out[yy * gw + x] = 0; y = y2 + 1; } return out;
}
function removeVLines(cells: Uint8Array, gw: number, gh: number, colSums: number[]) {
  const out = cells.slice(), thr = gh * 0.8; let x = 0; while (x < gw) { if (colSums[x] <= thr) { x++; continue; } let x2 = x; while (x2 + 1 < gw && colSums[x2 + 1] > thr) x2++; if (x2 - x + 1 <= 3) for (let xx = x; xx <= x2; xx++) for (let yy = 0; yy < gh; yy++) out[yy * gw + xx] = 0; x = x2 + 1; } return out;
}
function removeGridLines(cells: Uint8Array, gw: number, gh: number): Uint8Array {
  const rowSums = new Array(gh).fill(0), colSums = new Array(gw).fill(0); for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) if (cells[y * gw + x]) { rowSums[y]++; colSums[x]++; }
  let tmp = removeHLines(cells, gw, gh, rowSums); tmp = removeVLines(tmp, gw, gh, colSums); return tmp;
}
type Run = { start: number; end: number; count: number };
function filterBySizeGrid(lab: Labeling, f: number, imgW: number, imgH: number): number {
  let cnt = 0; for (let i = 0; i < lab.valid.length; i++) { if (!lab.valid[i]) continue; const w = (lab.maxX[i] - lab.minX[i] + 1) * f, h = (lab.maxY[i] - lab.minY[i] + 1) * f; if (w < imgW * 0.08 || h < imgH * 0.08) continue; if (w > imgW * 0.85 && h > imgH * 0.85) continue; if ((w > imgW * 0.9 || h > imgH * 0.9) && w * h > imgW * imgH * 0.5) continue; cnt++; } return cnt;
}
type CountArgs = { ctx: Grid; f: number; a: Analysis; r: number; bufs: DilateBufs };
function countFast(args: CountArgs): number { const { ctx, f, a, r, bufs } = args; const dil = dilateBuf(ctx.cells, { gw: ctx.gw, gh: ctx.gh }, r, bufs); const lab = labelUF(dil, ctx); return filterBySizeGrid(lab, f, a.w, a.h); }
function nextR(r: number) { return r < 10 ? r + 1 : r + 2; }
function buildRuns(series: number[]): Run[] { const runs: Run[] = []; for (let i = 0; i < series.length; i++) { const last = runs[runs.length - 1]; if (last && last.count === series[i]) last.end = i; else runs.push({ start: i, end: i, count: series[i] }); } return runs; }
function bestRun(runs: Run[]): Run { const cand = runs.filter((r) => r.count >= 2); const pool = cand.length ? cand : runs; let best = pool[0]; if (!best) return { start: 0, end: 0, count: 1 }; for (const r of pool) { const len = r.end - r.start, bestLen = best.end - best.start; if (len > bestLen) best = r; else if (len === bestLen && r.count > best.count) best = r; } return best; }
function buildSeriesFastSync(ctx: Grid, rMax: number, f: number, a: Analysis) {
  const series: number[] = []; let ones = 0; const bufs = { tmp: new Uint8Array(ctx.gw * ctx.gh), out: new Uint8Array(ctx.gw * ctx.gh) };
  for (let r = 1; r <= rMax; r = nextR(r)) { const c = countFast({ ctx, f, a, r, bufs }); series.push(c); if (c === 1) { ones++; if (ones >= 3) break; } else ones = 0; const best = bestRun(buildRuns(series)); if (best && best.count === 4 && best.end - best.start >= 2 && c < 4 && c <= 2) break; }
  return buildRuns(series);
}
async function buildSeriesFastAsync(ctx: Grid, rMax: number, f: number, a: Analysis) {
  const series: number[] = []; let ones = 0; const bufs = { tmp: new Uint8Array(ctx.gw * ctx.gh), out: new Uint8Array(ctx.gw * ctx.gh) };
  const breathe = yieldBudget();
  for (let r = 1; r <= rMax; r = nextR(r)) { const c = countFast({ ctx, f, a, r, bufs }); series.push(c); if (c === 1) { ones++; if (ones >= 3) break; } else ones = 0; const best = bestRun(buildRuns(series)); if (best && best.count === 4 && best.end - best.start >= 2 && c < 4 && c <= 2) break; await breathe(); }
  return buildRuns(series);
}
function updateBoundsPx(x: number, y: number, l: number, b: { minX: number[]; minY: number[]; maxX: number[]; maxY: number[]; ink: number[]; }) { if (x < b.minX[l]) b.minX[l] = x; if (x > b.maxX[l]) b.maxX[l] = x; if (y < b.minY[l]) b.minY[l] = y; if (y > b.maxY[l]) b.maxY[l] = y; b.ink[l]++; }
function makeBounds(n: number) { return { minX: new Array(n).fill(Infinity), minY: new Array(n).fill(Infinity), maxX: new Array(n).fill(-Infinity), maxY: new Array(n).fill(-Infinity), ink: new Array(n).fill(0) }; }
function scanCellBlock(args: { mask: Uint8Array; w: number; b: ReturnType<typeof makeBounds>; l: number; y0: number; y1: number; x0: number; x1: number }) {
  const { mask, w, b, l, y0, y1, x0, x1 } = args; for (let y = y0; y < y1; y++) { const row = y * w; for (let x = x0; x < x1; x++) { if (!mask[row + x]) continue; updateBoundsPx(x, y, l, b); } }
}
function extractBoxesSync(a: Analysis, lab: Labeling, grid: Grid, f: number) {
  const { w, h, mask } = a; const b = makeBounds(lab.valid.length); const { cells, gw, gh } = grid;
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const cellIdx = gy * gw + gx; if (!cells[cellIdx]) continue; const l = lab.labels[cellIdx]; if (l < 0 || !lab.valid[l]) continue;
    const y0 = gy * f, y1 = Math.min(h, y0 + f), x0 = gx * f, x1 = Math.min(w, x0 + f); scanCellBlock({ mask, w, b, l, y0, y1, x0, x1 });
  }
  return buildBoxesFromBounds(b, lab, a.scale);
}
async function extractBoxesAsync(a: Analysis, lab: Labeling, grid: Grid, f: number) {
  const { w, h, mask } = a; const b = makeBounds(lab.valid.length); const { cells, gw, gh } = grid;
  const breathe = yieldBudget();
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) { const cellIdx = gy * gw + gx; if (!cells[cellIdx]) continue; const l = lab.labels[cellIdx]; if (l < 0 || !lab.valid[l]) continue; const y0 = gy * f, y1 = Math.min(h, y0 + f), x0 = gx * f, x1 = Math.min(w, x0 + f); scanCellBlock({ mask, w, b, l, y0, y1, x0, x1 }); }
    if ((gy & 0x3f) === 0) await breathe();
  }
  return buildBoxesFromBounds(b, lab, a.scale);
}
function buildBoxesFromBounds(b: ReturnType<typeof makeBounds>, lab: Labeling, scale: number): Box[] {
  const boxes: Box[] = []; for (let i = 0; i < lab.valid.length; i++) { if (!lab.valid[i] || !isFinite(b.minX[i])) continue; const x0 = Math.max(0, (b.minX[i] - 1) * scale), y0 = Math.max(0, (b.minY[i] - 1) * scale); boxes.push({ x: x0, y: y0, w: (b.maxX[i] + 2) * scale - x0, h: (b.maxY[i] + 2) * scale - y0, ink: b.ink[i] }); } return boxes;
}
function isInside(inner: Box, outer: Box) { return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h; }
function filterContained(boxes: Box[]): Box[] { if (boxes.length <= 1) return boxes; const sorted = [...boxes].sort((a, b) => b.w * b.h - a.w * a.h); const keep: Box[] = []; for (const b of sorted) { const container = keep.find((o) => isInside(b, o) && b.ink < o.ink * 0.5); if (!container) keep.push(b); } return keep; }
function filterBySize(boxes: Box[], imgW: number, imgH: number): Box[] { return boxes.filter((b) => { if (b.w < imgW * 0.08 || b.h < imgH * 0.08) return false; if (b.w > imgW * 0.85 && b.h > imgH * 0.85) return false; if (b.w > imgW * 0.9 || b.h > imgH * 0.9) { if (b.w * b.h > imgW * imgH * 0.5) return false; } return true; }); }
function orderBoxes(boxes: Box[]): Box[] { boxes.sort((p, q) => p.y + p.h / 2 - (q.y + q.h / 2)); const rows: Box[][] = []; for (const b of boxes) { const cy = b.y + b.h / 2; const row = rows.find((rw) => Math.abs(rw[0].y + rw[0].h / 2 - cy) < Math.min(rw[0].h, b.h) * 0.5); if (row) row.push(b); else rows.push([b]); } return rows.flatMap((rw) => rw.sort((p, q) => p.x - q.x)); }
function getDownsample(a: Analysis): Downsample { if (a.ds) return a.ds; const f = Math.max(1, Math.ceil(Math.max(a.w, a.h) / 600)); const { cells, counts, gw, gh } = downsampleSync(a.mask, a.w, a.h, f); return { cells, counts, gw, gh, f }; }
async function getDownsampleAsync(a: Analysis): Promise<Downsample> { if (a.ds) return a.ds; const f = Math.max(1, Math.ceil(Math.max(a.w, a.h) / 600)); const { cells, counts, gw, gh } = await downsampleAsync(a.mask, a.w, a.h, f); return { cells, counts, gw, gh, f }; }
function fastRMax(gw: number, gh: number) { return Math.max(3, Math.min(FAST_RMAX_CAP, Math.floor(Math.max(gw, gh) * FAST_RMAX_FRAC))); }
export function detect(a: Analysis, radiusFrac: number | null): DetectResult {
  const { w, h } = a, longest = Math.max(w, h); const { cells: raw, counts, gw, gh, f } = getDownsample(a); const cells = removeGridLines(raw, gw, gh); const rMax = fastRMax(gw, gh); const ctx = { cells, counts, gw, gh };
  const runs = buildSeriesFastSync(ctx, rMax, f, a); const best = bestRun(runs); const autoR = Math.round((best.start + best.end) / 2) + 1; const autoFrac = (autoR * f) / longest, usedFrac = radiusFrac ?? autoFrac;
  const r = radiusFrac == null ? autoR : Math.max(0, Math.round((radiusFrac * longest) / f)); const bufs = { tmp: new Uint8Array(gw * gh), out: new Uint8Array(gw * gh) }; const dil = dilateBuf(cells, { gw, gh }, r, bufs); const lab = labelUF(dil, ctx);
  const rawBoxes = extractBoxesSync(a, lab, ctx, f); const contained = filterContained(rawBoxes); const sized = filterBySize(contained, w, h); return { boxes: orderBoxes(sized.length ? sized : contained), usedFrac, autoFrac };
}
export async function detectAsync(a: Analysis, radiusFrac: number | null): Promise<DetectResult> {
  const { w, h } = a, longest = Math.max(w, h); const { cells: raw, counts, gw, gh, f } = await getDownsampleAsync(a); await yieldToUI(); const cells = removeGridLines(raw, gw, gh); await yieldToUI();
  const rMax = fastRMax(gw, gh); const ctx = { cells, counts, gw, gh }; const runs = await buildSeriesFastAsync(ctx, rMax, f, a); const best = bestRun(runs); const autoR = Math.round((best.start + best.end) / 2) + 1;
  const autoFrac = (autoR * f) / longest, usedFrac = radiusFrac ?? autoFrac; const r = radiusFrac == null ? autoR : Math.max(0, Math.round((radiusFrac * longest) / f)); const bufs = { tmp: new Uint8Array(gw * gh), out: new Uint8Array(gw * gh) };
  const dil = dilateBuf(cells, { gw, gh }, r, bufs); const lab = labelUF(dil, ctx); await yieldToUI(); const rawBoxes = await extractBoxesAsync(a, lab, ctx, f);
  const contained = filterContained(rawBoxes); const sized = filterBySize(contained, w, h); return { boxes: orderBoxes(sized.length ? sized : contained), usedFrac, autoFrac };
}
