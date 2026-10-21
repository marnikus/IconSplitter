// tests/helpers/ghostpdl.ts — real Ghostscript WASM (`@okathira/ghostpdl-wasm`)
// runner for EPS → uncompressed PDF XObject audit (`pdfwrite`) AND EPS → 24-bit
// RGB pixel rasterization (`bmp16m`) + ground-truth JPEG pixel comparison.

import createGhostpdlModule from "@okathira/ghostpdl-wasm";
import jpeg from "jpeg-js";

export interface BmpImage {
  width: number;
  height: number;
  rgba: Uint8Array;
}

export async function epsToPdfBytes(eps: string): Promise<Uint8Array> {
  const gs = await createGhostpdlModule({ print: () => {}, printErr: () => {} });
  gs.FS.writeFile("/in.eps", new TextEncoder().encode(eps));
  const code = gs.callMain([
    "-q", "-dNOPAUSE", "-dBATCH", "-dSAFER", "-dEPSCrop",
    "-dCompressPages=false", "-dCompressStreams=false",
    "-sDEVICE=pdfwrite", "-sOutputFile=/out.pdf", "/in.eps",
  ]);
  if (code !== 0) throw new Error(`Ghostscript pdfwrite failed with exit code ${code}`);
  return gs.FS.readFile("/out.pdf") as Uint8Array;
}

export async function renderEpsToBmp(eps: string, widthPx: number, heightPx: number, dpi = 96): Promise<BmpImage> {
  const gs = await createGhostpdlModule({ print: () => {}, printErr: () => {} });
  gs.FS.writeFile("/in.eps", new TextEncoder().encode(eps));
  const code = gs.callMain([
    "-q", "-dNOPAUSE", "-dBATCH", "-dSAFER", "-dEPSCrop",
    "-dTextAlphaBits=4", "-dGraphicsAlphaBits=4",
    `-r${dpi}`, `-g${widthPx}x${heightPx}`,
    "-sDEVICE=bmp16m", "-sOutputFile=/out.bmp", "/in.eps",
  ]);
  if (code !== 0) throw new Error(`Ghostscript bmp16m failed with exit code ${code}`);
  return parseBmp24(gs.FS.readFile("/out.bmp") as Uint8Array);
}

export function decodeJpegRgba(jpgBytes: Uint8Array): BmpImage {
  const decoded = jpeg.decode(jpgBytes, { useTArray: true });
  return { width: decoded.width, height: decoded.height, rgba: decoded.data };
}

export function pixelAt(img: BmpImage, x: number, y: number): [number, number, number] {
  const idx = (y * img.width + x) * 4;
  return [img.rgba[idx], img.rgba[idx + 1], img.rgba[idx + 2]];
}

export function rgbRmse(
  a: BmpImage, b: BmpImage, roi?: { x: number; y: number; w: number; h: number },
): number {
  if (a.width !== b.width || a.height !== b.height) throw new Error("image dimension mismatch");
  const x0 = roi?.x ?? 0;
  const y0 = roi?.y ?? 0;
  const x1 = x0 + (roi?.w ?? a.width);
  const y1 = y0 + (roi?.h ?? a.height);
  let sumSq = 0;
  let count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = (y * a.width + x) * 4;
      const dr = a.rgba[idx] - b.rgba[idx];
      const dg = a.rgba[idx + 1] - b.rgba[idx + 1];
      const db = a.rgba[idx + 2] - b.rgba[idx + 2];
      sumSq += (dr * dr + dg * dg + db * db) / 3;
      count++;
    }
  }
  return Math.sqrt(sumSq / count);
}

function parseBmp24(raw: Uint8Array): BmpImage {
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const dataOffset = dv.getUint32(10, true);
  const width = dv.getInt32(18, true);
  const rawHeight = dv.getInt32(22, true);
  const bottomUp = rawHeight > 0;
  const height = Math.abs(rawHeight);
  const rowStride = ((width * 3 + 3) >> 2) << 2;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const srcRow = bottomUp ? height - 1 - y : y;
    const rowBase = dataOffset + srcRow * rowStride;
    for (let x = 0; x < width; x++) {
      const s = rowBase + x * 3;
      const d = (y * width + x) * 4;
      rgba[d] = raw[s + 2];
      rgba[d + 1] = raw[s + 1];
      rgba[d + 2] = raw[s];
      rgba[d + 3] = 255;
    }
  }
  return { width, height, rgba };
}
