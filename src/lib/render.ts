import type { Analysis, Box } from "./detect";

export interface ExportOpts {
  padding: number; // percent of the largest icon side, added on every side
  size: number; // output px (0 = native resolution)
  transparent: boolean;
}

export interface SquareInfo {
  content: number;
  total: number;
}

/** All icons share one square size = largest icon side + padding. */
export function squareInfo(boxes: Box[], padding: number): SquareInfo {
  const content = Math.max(1, ...boxes.map((b) => Math.max(b.w, b.h)));
  return { content, total: content * (1 + (2 * padding) / 100) };
}

export function cropRect(box: Box, total: number) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return { x: cx - total / 2, y: cy - total / 2, size: total };
}

export function renderIcon(
  img: HTMLImageElement,
  an: Analysis,
  allBoxes: Box[],
  box: Box,
  sq: SquareInfo,
  opts: ExportOpts,
  maxOut?: number,
): HTMLCanvasElement {
  let out = opts.size > 0 ? opts.size : Math.round(sq.total);
  if (maxOut) out = Math.min(out, maxOut);
  out = Math.max(8, out);
  const scale = out / sq.total;
  const c = document.createElement("canvas");
  c.width = out;
  c.height = out;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  const bgCss = `rgb(${an.bg[0]},${an.bg[1]},${an.bg[2]})`;
  ctx.fillStyle = bgCss;
  ctx.fillRect(0, 0, out, out);

  const r = cropRect(box, sq.total);
  const draw = (sx: number, sy: number, sw: number, sh: number) => {
    const ix0 = Math.max(sx, 0);
    const iy0 = Math.max(sy, 0);
    const ix1 = Math.min(sx + sw, img.naturalWidth);
    const iy1 = Math.min(sy + sh, img.naturalHeight);
    if (ix1 <= ix0 || iy1 <= iy0) return;
    ctx.drawImage(
      img,
      ix0,
      iy0,
      ix1 - ix0,
      iy1 - iy0,
      (ix0 - r.x) * scale,
      (iy0 - r.y) * scale,
      (ix1 - ix0) * scale,
      (iy1 - iy0) * scale,
    );
  };
  draw(r.x, r.y, r.size, r.size);

  // wipe neighbouring icons that leak into this square, then restore our own area
  ctx.fillStyle = bgCss;
  for (const o of allBoxes) {
    if (o === box) continue;
    ctx.fillRect((o.x - r.x) * scale, (o.y - r.y) * scale, o.w * scale, o.h * scale);
  }
  const m = 2;
  draw(box.x - m, box.y - m, box.w + m * 2, box.h + m * 2);

  if (opts.transparent) {
    const id = ctx.getImageData(0, 0, out, out);
    const d = id.data;
    const full = an.inkDiff * 0.92;
    for (let i = 0; i < d.length; i += 4) {
      const df = Math.max(
        Math.abs(d[i] - an.bg[0]),
        Math.abs(d[i + 1] - an.bg[1]),
        Math.abs(d[i + 2] - an.bg[2]),
      );
      let al = df / full;
      if (al < 0.04) al = 0;
      if (al > 1) al = 1;
      d[i] = an.ink[0];
      d[i + 1] = an.ink[1];
      d[i + 2] = an.ink[2];
      d[i + 3] = Math.round(al * 255);
    }
    ctx.putImageData(id, 0, 0);
  }
  return c;
}

export function canvasToBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error("Could not encode image"))), "image/png"),
  );
}
