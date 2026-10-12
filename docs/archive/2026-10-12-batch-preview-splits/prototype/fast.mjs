// Prototype: exact-equivalent replacement for detect()'s auto-radius series.
// Series today = rMax full dilate+label runs (~68-80 per image, ~170-430 ms).
// Prototype = one chessboard distance transform + one union-find sweep (~O(N a)).
import { dilate, label } from "./reference.mjs";

/** Components' ink per merge radius r = 1..rMax, same numbers as run(r).count. */
export function seriesProto(cells, counts, gw, gh, rMax) {
  const N = gw * gh;
  const dist = new Int32Array(N).fill(0x3fffffff);
  let inkCells = 0;
  for (let p = 0; p < N; p++) if (cells[p]) { dist[p] = 0; inkCells++; }
  if (inkCells === 0) return { series: new Array(rMax).fill(0), maxDist: 0 };
  // exact chessboard (Chebyshev) distance to the nearest ink cell: two passes
  const INF = 0x3fffffff;
  for (let y = 0; y < gh; y++) {
    const row = y * gw;
    for (let x = 0; x < gw; x++) {
      const p = row + x;
      if (dist[p] === 0) continue;
      let best = INF;
      if (y > 0) {
        const up = p - gw;
        if (x > 0) best = Math.min(best, dist[up - 1]);
        best = Math.min(best, dist[up]);
        if (x < gw - 1) best = Math.min(best, dist[up + 1]);
      }
      if (x > 0) best = Math.min(best, dist[p - 1]);
      dist[p] = best >= INF ? INF : best + 1;
    }
  }
  let maxDist = 0;
  for (let y = gh - 1; y >= 0; y--) {
    const row = y * gw;
    for (let x = gw - 1; x >= 0; x--) {
      const p = row + x;
      if (dist[p] === 0) continue;
      let best = dist[p];
      if (y < gh - 1) {
        const dn = p + gw;
        if (x > 0) best = Math.min(best, dist[dn - 1]);
        best = Math.min(best, dist[dn]);
        if (x < gw - 1) best = Math.min(best, dist[dn + 1]);
      }
      if (x < gw - 1) best = Math.min(best, dist[p + 1]);
      dist[p] = best >= INF ? INF : (best + 1 < dist[p] ? best + 1 : dist[p]);
    }
  }
  // counting sort of cells by distance
  const hist = new Uint32Array(gw + gh + 2);
  for (let p = 0; p < N; p++) { const d = dist[p]; if (d < INF) { hist[d]++; if (d > maxDist) maxDist = d; } }
  const start = new Uint32Array(maxDist + 2);
  for (let d = 1; d <= maxDist + 1; d++) start[d] = start[d - 1] + hist[d - 1];
  const order = new Int32Array(N);
  const cur = start.slice();
  for (let p = 0; p < N; p++) { const d = dist[p]; if (d < INF) order[cur[d]++] = p; }
  // union-find sweep: after bucket d the set is {dist <= d}
  const parent = new Int32Array(N);
  const size = new Int32Array(N);
  const ink = new Int32Array(N);
  const added = new Uint8Array(N);
  const isRoot = new Uint8Array(N);
  const liveList = new Int32Array(N);
  const livePos = new Int32Array(N);
  for (let p = 0; p < N; p++) parent[p] = p;
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  let liveCount = 0;
  const addRoot = (r0) => { isRoot[r0] = 1; livePos[r0] = liveCount; liveList[liveCount++] = r0; };
  const dropRoot = (r0) => { const i = livePos[r0]; const last = liveList[--liveCount]; liveList[i] = last; livePos[last] = i; isRoot[r0] = 0; };
  const addCell = (p) => { parent[p] = p; ink[p] = counts[p]; size[p] = 1; added[p] = 1; addRoot(p); };
  const union = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    const big = size[ra] >= size[rb] ? ra : rb;
    const small = big === ra ? rb : ra;
    parent[small] = big; size[big] += size[small]; ink[big] += ink[small];
    dropRoot(small);
  };
  const series = new Array(rMax);
  let at = 0; // index into order
  for (let d = 0; d <= maxDist; d++) {
    const stop = start[d + 1];
    for (; at < stop; at++) addCell(order[at]);
    for (let i = start[d]; i < start[d + 1]; i++) {
      const p = order[i], x = p % gw, y = (p / gw) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy; if (ny < 0 || ny >= gh) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx; if (nx < 0 || nx >= gw) continue;
          const q = ny * gw + nx; if (added[q]) union(p, q);
        }
      }
    }
    if (d >= 1 && d <= rMax) {
      let maxInk = 0;
      for (let i = 0; i < liveCount; i++) { const v = ink[liveList[i]]; if (v > maxInk) maxInk = v; }
      let cnt = 0;
      for (let i = 0; i < liveCount; i++) { const v = ink[liveList[i]]; if (v >= maxInk * 0.015 && v > 0) cnt++; }
      series[d - 1] = cnt;
    }
  }
  for (let r = maxDist + 1; r <= rMax; r++) series[r - 1] = 1; // set == every cell
  return { series, maxDist };
}

/** detectProto — old detect() body, with a column map and the union-find series. */
export function detectProto(a, radiusFrac, useFast = true) {
  const { w, h, mask } = a;
  const longest = Math.max(w, h);
  const f = Math.max(1, Math.ceil(longest / 400));
  const gw = Math.ceil(w / f), gh = Math.ceil(h / f);
  const cells = new Uint8Array(gw * gh), counts = new Uint32Array(gw * gh);
  const col = new Int32Array(w);
  for (let x = 0; x < w; x++) col[x] = (x / f) | 0;
  for (let y = 0; y < h; y++) {
    const row = y * w, cy = ((y / f) | 0) * gw;
    for (let x = 0; x < w; x++) if (mask[row + x]) { const c = cy + col[x]; cells[c] = 1; counts[c]++; }
  }
  const run = (r) => label(dilate(cells, gw, gh, r), cells, counts, gw, gh);
  const rMax = Math.max(3, Math.floor(Math.max(gw, gh) * 0.2));
  const series = [];
  if (useFast) series.push(...seriesProto(cells, counts, gw, gh, rMax).series);
  else for (let r = 1; r <= rMax; r++) series.push(run(r).count);
  const runs = [];
  for (let i = 0; i < series.length; i++) {
    const last = runs[runs.length - 1];
    if (last && last.count === series[i]) last.end = i; else runs.push({ start: i, end: i, count: series[i] });
  }
  const len = (r) => r.end - r.start + 1;
  let best;
  for (const r of runs) { if (r.count < 2) continue; if (!best || len(r) > len(best) || (len(r) === len(best) && r.count > best.count)) best = r; }
  if (!best || len(best) < 3) best = runs.reduce((p, c) => (len(c) > len(p) ? c : p), runs[0]);
  const autoR = Math.round((best.start + best.end) / 2) + 1;
  const autoFrac = (autoR * f) / longest;
  const usedFrac = radiusFrac ?? autoFrac;
  const r = radiusFrac == null ? autoR : Math.max(0, Math.round((radiusFrac * longest) / f));
  const lab = run(r);
  const n = lab.valid.length;
  const minX = new Array(n).fill(Infinity), minY = new Array(n).fill(Infinity);
  const maxX = new Array(n).fill(-Infinity), maxY = new Array(n).fill(-Infinity);
  const ink = new Array(n).fill(0);
  for (let y = 0; y < h; y++) {
    const row = y * w, cy = ((y / f) | 0) * gw;
    for (let x = 0; x < w; x++) {
      if (!mask[row + x]) continue;
      const l = lab.labels[cy + col[x]];
      if (l < 0 || !lab.valid[l]) continue;
      if (x < minX[l]) minX[l] = x; if (x > maxX[l]) maxX[l] = x;
      if (y < minY[l]) minY[l] = y; if (y > maxY[l]) maxY[l] = y;
      ink[l]++;
    }
  }
  const s = a.scale;
  const boxes = [];
  for (let i = 0; i < n; i++) {
    if (!lab.valid[i] || !isFinite(minX[i])) continue;
    const x0 = Math.max(0, (minX[i] - 1) * s), y0 = Math.max(0, (minY[i] - 1) * s);
    const x1 = (maxX[i] + 2) * s, y1 = (maxY[i] + 2) * s;
    boxes.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, ink: ink[i] });
  }
  boxes.sort((p, q) => p.y + p.h / 2 - (q.y + q.h / 2));
  const rows = [];
  for (const b of boxes) {
    const cy = b.y + b.h / 2;
    const row = rows.find((rw) => { const ref = rw[0]; return Math.abs(ref.y + ref.h / 2 - cy) < Math.min(ref.h, b.h) * 0.5; });
    if (row) row.push(b); else rows.push([b]);
  }
  const ordered = rows.flatMap((rw) => rw.sort((p, q) => p.x - q.x));
  return { boxes: ordered, usedFrac, autoFrac, series };
}
