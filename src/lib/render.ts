import { sheetDims, type Analysis, type Box, type SheetSource } from "./detect";
import { yieldBudget } from "./yield";

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

function createOutCanvas(out: number, bgCss: string) {
  const c = document.createElement("canvas");
  c.width = out;
  c.height = out;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = bgCss;
  ctx.fillRect(0, 0, out, out);
  return { c, ctx };
}

/** One icon's pixels onto a fresh canvas — everything before transparency. */
function paintIcon(a: { img: SheetSource; an: Analysis; allBoxes: Box[]; box: Box; sq: SquareInfo; opts: ExportOpts; maxOut?: number }): HTMLCanvasElement {
  const { img, an, allBoxes, box, sq, opts, maxOut } = a;
  let out = opts.size > 0 ? opts.size : Math.round(sq.total);
  if (maxOut) out = Math.min(out, maxOut);
  out = Math.max(8, out);
  const scale = out / sq.total;
  const bgCss = `rgb(${an.bg[0]},${an.bg[1]},${an.bg[2]})`;
  const { c, ctx } = createOutCanvas(out, bgCss);
  const r = cropRect(box, sq.total);
  const { nw, nh } = sheetDims(img);
  const draw = (sx: number, sy: number, sw: number, sh: number) => {
    const ix0 = Math.max(sx, 0);
    const iy0 = Math.max(sy, 0);
    const ix1 = Math.min(sx + sw, nw);
    const iy1 = Math.min(sy + sh, nh);
    if (ix1 <= ix0 || iy1 <= iy0) return;
    ctx.drawImage(img, ix0, iy0, ix1 - ix0, iy1 - iy0, (ix0 - r.x) * scale, (iy0 - r.y) * scale, (ix1 - ix0) * scale, (iy1 - iy0) * scale);
  };
  draw(r.x, r.y, r.size, r.size);
  ctx.fillStyle = bgCss;
  for (const o of allBoxes) {
    if (o === box) continue;
    ctx.fillRect((o.x - r.x) * scale, (o.y - r.y) * scale, o.w * scale, o.h * scale);
  }
  const m = 2;
  draw(box.x - m, box.y - m, box.w + m * 2, box.h + m * 2);
  return c;
}

const ctxOf = (c: HTMLCanvasElement): CanvasRenderingContext2D => c.getContext("2d", { willReadFrequently: true })!;

export function renderIcon(img: SheetSource, an: Analysis, allBoxes: Box[], box: Box, sq: SquareInfo, opts: ExportOpts, maxOut?: number): HTMLCanvasElement {
  const c = paintIcon({ img, an, allBoxes, box, sq, opts, maxOut });
  if (opts.transparent) applyTransparencySync(ctxOf(c), an, c.width);
  return c;
}

export async function renderIconAsync(img: SheetSource, an: Analysis, allBoxes: Box[], box: Box, sq: SquareInfo, opts: ExportOpts, maxOut?: number): Promise<HTMLCanvasElement> {
  const c = paintIcon({ img, an, allBoxes, box, sq, opts, maxOut });
  if (opts.transparent) await applyTransparencyAsync(ctxOf(c), an, c.width);
  return c;
}

function applyTransparencySync(ctx: CanvasRenderingContext2D, an: Analysis, out: number) {
  const id = ctx.getImageData(0, 0, out, out);
  const d = id.data;
  const full = an.inkDiff * 0.92;
  for (let i = 0; i < d.length; i += 4) {
    const df = Math.max(Math.abs(d[i] - an.bg[0]), Math.abs(d[i + 1] - an.bg[1]), Math.abs(d[i + 2] - an.bg[2]));
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

async function applyTransparencyAsync(ctx: CanvasRenderingContext2D, an: Analysis, out: number) {
  const id = ctx.getImageData(0, 0, out, out);
  const d = id.data;
  const full = an.inkDiff * 0.92;
  const breathe = yieldBudget(); // yield by TIME, not per fixed chunk
  for (let i = 0; i < d.length; i += 4) {
    const df = Math.max(Math.abs(d[i] - an.bg[0]), Math.abs(d[i + 1] - an.bg[1]), Math.abs(d[i + 2] - an.bg[2]));
    let al = df / full;
    if (al < 0.04) al = 0;
    if (al > 1) al = 1;
    d[i] = an.ink[0];
    d[i + 1] = an.ink[1];
    d[i + 2] = an.ink[2];
    d[i + 3] = Math.round(al * 255);
    if ((i & 0xffff) === 0) await breathe();
  }
  ctx.putImageData(id, 0, 0);
}

export function canvasToBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error("Could not encode image"))), "image/png"),
  );
}
