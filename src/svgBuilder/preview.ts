// preview.ts — the ONE bounded JPEG shown in the Gemini confirmation and sent
// unchanged. It is rendered from the composed sheet, never from the whole
// folder and never from the source SVG files individually (RULE 20).
import { rasterizeJpeg, type RasterDeps } from "../lib/upload/raster";
import { normalizeHex } from "../lib/svgbackground";
import { megapixelSize } from "../lib/svgBuilder/metaimage";
import { sheetPngBlob } from "./exporter";

export const SHEET_PREVIEW_WIDTH = 768;
export const SHEET_PREVIEW_QUALITY = 0.82;

export interface SheetPreviewDeps {
  render?: RasterDeps["render"];
  encode?: RasterDeps["encode"];
  /** Test seam: skip the browser-only canvas/DOMParser path in Node lanes. */
  rasterize?: typeof rasterizeJpeg;
}

export type SheetPreviewResult =
  | { ok: true; dataUrl: string; width: number; height: number; mime: string; bytes: number }
  | { ok: false; reason: string };

export async function sheetPreviewFor(svgText: string, deps: SheetPreviewDeps = {}): Promise<SheetPreviewResult> {
  const box = dimensionsOf(svgText);
  if (box === null) return { ok: false, reason: "the composed sheet has no usable dimensions" };
  const width = SHEET_PREVIEW_WIDTH;
  const height = Math.max(1, Math.round(width * box.height / box.width));
  const rasterize = deps.rasterize ?? rasterizeJpeg;
  const out = await rasterize(svgText, {
    width, height, quality: SHEET_PREVIEW_QUALITY,
    background: normalizeHex(box.background) ?? "#FFFFFF",
  }, { render: deps.render, encode: deps.encode });
  if (!out.ok) return { ok: false, reason: out.reason };
  return { ok: true, dataUrl: jpegDataUrl(out.jpeg), width, height, mime: "image/jpeg", bytes: out.jpeg.length };
}

export interface SheetPngDeps {
  /** Test seam: the PNG renderer (the app's PNG export path by default). */
  pngBlob?: (svg: string, width: number, height: number) => Promise<Blob>;
}

/**
 * The metadata image (2026-11-14): the composed sheet (icons only — see
 * metaimage.ts) as ONE PNG of at most 1 megapixel, drawn by the PNG export's
 * renderer. Shown in the confirmation and sent unchanged.
 */
export async function sheetPngFor(svgText: string, deps: SheetPngDeps = {}): Promise<SheetPreviewResult> {
  const box = dimensionsOf(svgText);
  if (box === null) return { ok: false, reason: "the composed sheet has no usable dimensions" };
  const { width, height } = megapixelSize(box.width, box.height);
  try {
    const blob = await (deps.pngBlob ?? sheetPngBlob)(svgText, width, height);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { ok: true, dataUrl: dataUrlOf(bytes, "image/png"), width, height, mime: "image/png", bytes: bytes.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "the PNG could not be rendered" };
  }
}

interface Box { width: number; height: number; background: string }

function dimensionsOf(svgText: string): Box | null {
  const root = svgRoot(svgText);
  const width = dimension(root, "width", 2);
  const height = dimension(root, "height", 3);
  if (!positive(width) || !positive(height)) return null;
  return { width: width as number, height: height as number, background: backgroundOf(svgText) };
}

function svgRoot(svgText: string): string { return /<svg\b([^>]*)>/i.exec(svgText)?.[1] ?? ""; }
function dimension(root: string, name: string, index: number): number | null { return numberAttr(root, name) ?? viewBoxSize(root, index); }
function positive(value: number | null): boolean { return value !== null && value > 0; }
function backgroundOf(svgText: string): string { return /<rect\b[^>]*fill=["']([^"']+)["']/i.exec(svgText)?.[1] ?? "#FFFFFF"; }

function numberAttr(root: string, name: string): number | null {
  const value = new RegExp(`\\b${name}=["'](\\d+(?:\\.\\d+)?)["']`, "i").exec(root)?.[1];
  return value === undefined ? null : Number(value);
}

function viewBoxSize(root: string, index: number): number | null {
  const box = /\bviewBox=["']([^"']+)["']/i.exec(root)?.[1];
  if (box === undefined) return null;
  const parts = box.trim().split(/[\s,]+/).map(Number);
  return parts.length === 4 && Number.isFinite(parts[index]) ? parts[index] : null;
}

function jpegDataUrl(bytes: Uint8Array): string {
  return dataUrlOf(bytes, "image/jpeg");
}

function dataUrlOf(bytes: Uint8Array, mime: string): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + 8192)));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}
