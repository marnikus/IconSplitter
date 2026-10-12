// detect_oracle.ts — a FROZEN copy of the detector as it was before the
// one-sweep merge series (src/lib/detect.ts at HEAD 488b649, 2026-10-12).
//
// It exists for exactly one job: tests/detect_equivalence.test.ts compares the
// shipped `detect` against this copy, so any output change — box coordinates,
// usedFrac, autoFrac, the chosen auto radius — fails a test instead of quietly
// shipping. It is never imported by src/, and it must NOT be edited to follow
// the implementation: if the two ever disagree on purpose, the equivalence
// claim (docs/archive/2026-10-12-batch-preview-splits/design.md, D1) is void and
// the design's fallback applies.
//
// Verbatim from the pre-change file; only the name `detect` -> `detectOracle`.

import type { Analysis, Box, DetectResult } from "../../src/lib/detect";

function dilate(src: Uint8Array, gw: number, gh: number, r: number): Uint8Array {
  if (r <= 0) return src.slice();
  const tmp = new Uint8Array(gw * gh);
  const out = new Uint8Array(gw * gh);
  const pre = new Int32Array(Math.max(gw, gh) + 1);
  // horizontal
  for (let y = 0; y < gh; y++) {
    const row = y * gw;
    pre[0] = 0;
    for (let x = 0; x < gw; x++) pre[x + 1] = pre[x] + src[row + x];
    for (let x = 0; x < gw; x++) {
      const a = Math.max(0, x - r);
      const b = Math.min(gw, x + r + 1);
      tmp[row + x] = pre[b] - pre[a] > 0 ? 1 : 0;
    }
  }
  // vertical
  for (let x = 0; x < gw; x++) {
    pre[0] = 0;
    for (let y = 0; y < gh; y++) pre[y + 1] = pre[y] + tmp[y * gw + x];
    for (let y = 0; y < gh; y++) {
      const a = Math.max(0, y - r);
      const b = Math.min(gh, y + r + 1);
      out[y * gw + x] = pre[b] - pre[a] > 0 ? 1 : 0;
    }
  }
  return out;
}

interface Labeling {
  labels: Int32Array;
  valid: boolean[];
  count: number;
}

function label(
  dil: Uint8Array,
  cells: Uint8Array,
  counts: Uint32Array,
  gw: number,
  gh: number,
): Labeling {
  const labels = new Int32Array(gw * gh).fill(-1);
  const inks: number[] = [];
  let n = 0;
  const stack: number[] = [];
  for (let s = 0; s < gw * gh; s++) {
    if (!dil[s] || labels[s] !== -1) continue;
    let ink = 0;
    labels[s] = n;
    stack.push(s);
    while (stack.length) {
      const p = stack.pop()!;
      if (cells[p]) ink += counts[p];
      const px = p % gw;
      const py = (p / gw) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = py + dy;
        if (ny < 0 || ny >= gh) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx;
          if (nx < 0 || nx >= gw) continue;
          const q = ny * gw + nx;
          if (dil[q] && labels[q] === -1) {
            labels[q] = n;
            stack.push(q);
          }
        }
      }
    }
    inks.push(ink);
    n++;
  }
  const maxInk = Math.max(0, ...inks);
  const valid = inks.map((v) => v >= maxInk * 0.015 && v > 0);
  return { labels, valid, count: valid.filter(Boolean).length };
}

export function detectOracle(a: Analysis, radiusFrac: number | null): DetectResult {
  const { w, h, mask } = a;
  const longest = Math.max(w, h);
  const f = Math.max(1, Math.ceil(longest / 400));
  const gw = Math.ceil(w / f);
  const gh = Math.ceil(h / f);
  const cells = new Uint8Array(gw * gh);
  const counts = new Uint32Array(gw * gh);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    const cy = ((y / f) | 0) * gw;
    for (let x = 0; x < w; x++) {
      if (mask[row + x]) {
        const c = cy + ((x / f) | 0);
        cells[c] = 1;
        counts[c]++;
      }
    }
  }

  const run = (r: number) => label(dilate(cells, gw, gh, r), cells, counts, gw, gh);

  // ---- automatic radius ----
  const rMax = Math.max(3, Math.floor(Math.max(gw, gh) * 0.2));
  const series: number[] = [];
  for (let r = 1; r <= rMax; r++) series.push(run(r).count);
  type Run = { start: number; end: number; count: number };
  const runs: Run[] = [];
  for (let i = 0; i < series.length; i++) {
    const last = runs[runs.length - 1];
    if (last && last.count === series[i]) last.end = i;
    else runs.push({ start: i, end: i, count: series[i] });
  }
  const len = (r: Run) => r.end - r.start + 1;
  let best: Run | undefined;
  for (const r of runs) {
    if (r.count < 2) continue;
    if (!best || len(r) > len(best) || (len(r) === len(best) && r.count > best.count)) best = r;
  }
  if (!best || len(best) < 3) {
    best = runs.reduce((p, c) => (len(c) > len(p) ? c : p), runs[0]);
  }
  const autoR = Math.round((best.start + best.end) / 2) + 1; // series index 0 => r=1
  const autoFrac = (autoR * f) / longest;

  const usedFrac = radiusFrac ?? autoFrac;
  const r = radiusFrac == null ? autoR : Math.max(0, Math.round((radiusFrac * longest) / f));
  const lab = run(r);

  // ---- exact boxes from the full-resolution mask ----
  const n = lab.valid.length;
  const minX = new Array(n).fill(Infinity);
  const minY = new Array(n).fill(Infinity);
  const maxX = new Array(n).fill(-Infinity);
  const maxY = new Array(n).fill(-Infinity);
  const ink = new Array(n).fill(0);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    const cy = ((y / f) | 0) * gw;
    for (let x = 0; x < w; x++) {
      if (!mask[row + x]) continue;
      const l = lab.labels[cy + ((x / f) | 0)];
      if (l < 0 || !lab.valid[l]) continue;
      if (x < minX[l]) minX[l] = x;
      if (x > maxX[l]) maxX[l] = x;
      if (y < minY[l]) minY[l] = y;
      if (y > maxY[l]) maxY[l] = y;
      ink[l]++;
    }
  }
  const s = a.scale;
  const boxes: Box[] = [];
  for (let i = 0; i < n; i++) {
    if (!lab.valid[i] || !isFinite(minX[i])) continue;
    const x0 = Math.max(0, (minX[i] - 1) * s);
    const y0 = Math.max(0, (minY[i] - 1) * s);
    const x1 = (maxX[i] + 2) * s;
    const y1 = (maxY[i] + 2) * s;
    boxes.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, ink: ink[i] });
  }

  // reading order (rows, then left → right)
  boxes.sort((p, q) => p.y + p.h / 2 - (q.y + q.h / 2));
  const rows: Box[][] = [];
  for (const b of boxes) {
    const cy = b.y + b.h / 2;
    const row = rows.find((rw) => {
      const ref = rw[0];
      return Math.abs(ref.y + ref.h / 2 - cy) < Math.min(ref.h, b.h) * 0.5;
    });
    if (row) row.push(b);
    else rows.push([b]);
  }
  const ordered = rows.flatMap((rw) => rw.sort((p, q) => p.x - q.x));

  return { boxes: ordered, usedFrac, autoFrac };
}
