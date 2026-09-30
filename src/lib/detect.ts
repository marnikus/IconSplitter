export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  ink: number;
}

export interface Analysis {
  w: number; // analysis width
  h: number;
  scale: number; // natural / analysis
  mask: Uint8Array; // 1 = ink
  bg: [number, number, number];
  ink: [number, number, number];
  inkDiff: number;
  threshold: number;
}

export interface DetectResult {
  boxes: Box[];
  usedFrac: number; // merge radius as fraction of the longest side
  autoFrac: number;
}

const MAX_DIM = 4000;

function median(arr: number[]) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 255;
}

/** Reads the image, finds the background colour and builds an "ink" mask. */
export function analyze(img: HTMLImageElement): Analysis {
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const k = Math.min(1, MAX_DIM / Math.max(nw, nh));
  const w = Math.max(1, Math.round(nw * k));
  const h = Math.max(1, Math.round(nh * k));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  // background = median colour of the image border
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const push = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    // treat transparent as white
    const a = data[i + 3] / 255;
    rs.push(data[i] * a + 255 * (1 - a));
    gs.push(data[i + 1] * a + 255 * (1 - a));
    bs.push(data[i + 2] * a + 255 * (1 - a));
  };
  const stepX = Math.max(1, Math.floor(w / 600));
  const stepY = Math.max(1, Math.floor(h / 600));
  for (let x = 0; x < w; x += stepX) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y += stepY) {
    push(0, y);
    push(w - 1, y);
  }
  const bg: [number, number, number] = [median(rs), median(gs), median(bs)];

  const diff = new Uint8Array(w * h);
  const hist = new Uint32Array(256);
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    const a = data[i + 3] / 255;
    const r = data[i] * a + 255 * (1 - a);
    const g = data[i + 1] * a + 255 * (1 - a);
    const b = data[i + 2] * a + 255 * (1 - a);
    const d = Math.max(Math.abs(r - bg[0]), Math.abs(g - bg[1]), Math.abs(b - bg[2]));
    const v = d > 255 ? 255 : d | 0;
    diff[p] = v;
    hist[v]++;
  }
  // robust "full ink" contrast = ~99.97th percentile
  let acc = 0;
  let maxDiff = 0;
  const need = w * h * 0.0003;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc >= need) {
      maxDiff = v;
      break;
    }
  }
  maxDiff = Math.max(maxDiff, 30);
  const threshold = Math.min(110, Math.max(18, maxDiff * 0.42));

  const mask = new Uint8Array(w * h);
  let sr = 0,
    sg = 0,
    sb = 0,
    sn = 0;
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    if (diff[p] > threshold) mask[p] = 1;
    if (diff[p] >= maxDiff * 0.85) {
      sr += data[i];
      sg += data[i + 1];
      sb += data[i + 2];
      sn++;
    }
  }
  const ink: [number, number, number] = sn
    ? [Math.round(sr / sn), Math.round(sg / sn), Math.round(sb / sn)]
    : [0, 0, 0];

  return {
    w,
    h,
    scale: nw / w,
    mask,
    bg: bg.map(Math.round) as [number, number, number],
    ink,
    inkDiff: maxDiff,
    threshold,
  };
}

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

/**
 * Splits the ink mask into separate icons. Nearby strokes (motion lines, dots,
 * arcs, etc.) are merged by growing the ink by `radius`; the radius is picked
 * automatically by finding the most stable number of icons.
 */
export function detect(a: Analysis, radiusFrac: number | null): DetectResult {
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
