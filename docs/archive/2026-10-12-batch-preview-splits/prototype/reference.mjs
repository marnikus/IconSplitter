// Verbatim copies of the hot internals of src/lib/detect.ts (research oracle).
export function dilate(src, gw, gh, r) {
  if (r <= 0) return src.slice();
  const tmp = new Uint8Array(gw * gh);
  const out = new Uint8Array(gw * gh);
  const pre = new Int32Array(Math.max(gw, gh) + 1);
  for (let y = 0; y < gh; y++) {
    const row = y * gw;
    pre[0] = 0;
    for (let x = 0; x < gw; x++) pre[x + 1] = pre[x] + src[row + x];
    for (let x = 0; x < gw; x++) {
      const a = Math.max(0, x - r); const b = Math.min(gw, x + r + 1);
      tmp[row + x] = pre[b] - pre[a] > 0 ? 1 : 0;
    }
  }
  for (let x = 0; x < gw; x++) {
    pre[0] = 0;
    for (let y = 0; y < gh; y++) pre[y + 1] = pre[y] + tmp[y * gw + x];
    for (let y = 0; y < gh; y++) {
      const a = Math.max(0, y - r); const b = Math.min(gh, y + r + 1);
      out[y * gw + x] = pre[b] - pre[a] > 0 ? 1 : 0;
    }
  }
  return out;
}
export function label(dil, cells, counts, gw, gh) {
  const labels = new Int32Array(gw * gh).fill(-1);
  const inks = []; let n = 0; const stack = [];
  for (let s = 0; s < gw * gh; s++) {
    if (!dil[s] || labels[s] !== -1) continue;
    let ink = 0; labels[s] = n; stack.push(s);
    while (stack.length) {
      const p = stack.pop();
      if (cells[p]) ink += counts[p];
      const px = p % gw, py = (p / gw) | 0;
      for (let dy = -1; dy <= 1; dy++) { const ny = py + dy; if (ny < 0 || ny >= gh) continue;
        for (let dx = -1; dx <= 1; dx++) { const nx = px + dx; if (nx < 0 || nx >= gw) continue;
          const q = ny * gw + nx; if (dil[q] && labels[q] === -1) { labels[q] = n; stack.push(q); } } }
    }
    inks.push(ink); n++;
  }
  const maxInk = Math.max(0, ...inks);
  const valid = inks.map((v) => v >= maxInk * 0.015 && v > 0);
  return { labels, valid, count: valid.filter(Boolean).length };
}
