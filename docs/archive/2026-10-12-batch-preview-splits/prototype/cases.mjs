function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
export function build(seed) {
  const rnd = rng(seed * 7919);
  const kinds = ["icons", "sparse", "noise", "blobs", "blank", "ring"];
  const sizes = [[256, 256], [400, 300], [812, 812], [1024, 1024], [512, 1536]];
  const kind = kinds[seed % kinds.length];
  const [w, h] = sizes[seed % sizes.length];
  const mask = new Uint8Array(w * h);
  const put = (x, y, r) => { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const xx = x + i, yy = y + j; if (xx >= 0 && yy >= 0 && xx < w && yy < h) mask[yy * w + xx] = 1; } };
  if (kind === "icons") {
    const icons = 1 + Math.floor(rnd() * 60), cols = Math.ceil(Math.sqrt(icons));
    const r = 2 + Math.floor(rnd() * Math.min(w, h) / 30);
    for (let i = 0; i < icons; i++) put(Math.floor(((i % cols) + 1) * w / (cols + 1)), Math.floor((Math.floor(i / cols) + 1) * h / (cols + 1)), r);
  } else if (kind === "sparse") {
    for (let i = 0; i < 400; i++) mask[Math.floor(rnd() * h) * w + Math.floor(rnd() * w)] = 1;
  } else if (kind === "noise") {
    for (let p = 0; p < w * h; p++) if (rnd() < 0.02) mask[p] = 1;
  } else if (kind === "blobs") {
    for (let i = 0; i < 12; i++) {
      const cx = Math.floor(rnd() * w), cy = Math.floor(rnd() * h), r = 3 + Math.floor(rnd() * 20);
      for (let a = 0; a < 400; a++) { const t = rnd() * Math.PI * 2, d = rnd() * r; const x = Math.round(cx + Math.cos(t) * d), y = Math.round(cy + Math.sin(t) * d); if (x >= 0 && y >= 0 && x < w && y < h) mask[y * w + x] = 1; }
    }
  } else if (kind === "ring") {
    const cx = w / 2, cy = h / 2, rad = Math.min(w, h) * 0.35;
    for (let a = 0; a < 2000; a++) { const t = a / 2000 * Math.PI * 2 + rnd(); const x = Math.round(cx + Math.cos(t) * rad), y = Math.round(cy + Math.sin(t) * rad); if (x >= 0 && y >= 0 && x < w && y < h) mask[y * w + x] = 1; }
  }
  return { w, h, scale: 1, mask, bg: [255, 255, 255], ink: [0, 0, 0], inkDiff: 255, threshold: 60 };
}
