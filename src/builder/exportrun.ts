// exportrun.ts — turning the sheet on screen into files the user keeps (design §5.5).
//
// Three outputs, and each one is the SAME sheet:
//   * the SVG itself (the editable document from lib/builder/serialize),
//   * a PNG at 1×/2×/3× of the artboard's own pixels,
//   * a ZIP with the SVG, the PNG and the preset JSON, so one file carries the
//     whole reproducible design.
//
// The PNG is rendered by the browser from the same SVG text (an <img> of the
// serialized document), and then its real dimensions are READ BACK: a raster that
// came out at the wrong size is a silent failure the user would only notice in
// their stock site, so it is checked here instead.

import type { DirHandleLike } from "../lib/fs";
import { commitSheet } from "./commit";
import { serializeSheet, sheetFileName, type Placement, type SerializeInput } from "../lib/builder/serialize";
import type { BuilderPreset } from "../lib/builder/preset";
import { buildSheetZip } from "./ziprun";

export type PngScale = 1 | 2 | 3;

export interface ExportResult {
  ok: boolean;
  /** What was written, in the order it happened (for the log and the toast). */
  written: string[];
  /** Why something failed, when it did — even when other files were written. */
  reason: string | null;
}

/** The sheet's SVG text — the one document every output is derived from. */
export function sheetSvgOf(input: SerializeInput): string {
  return serializeSheet(input);
}

/** A PNG of the sheet at `scale`, from the same SVG text. */
export async function sheetPngOf(svg: string, width: number, height: number, scale: PngScale): Promise<Blob> {
  const img = await loadSvgImage(svg);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("the canvas could not be created");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (blob === null) throw new Error("the PNG could not be encoded");
  return blob;
}

/** The raster's real pixel size — read back from the encoded bytes. */
export async function pngSizeOf(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

/** An <img> holding the SVG, decoded and ready to draw. */
function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("the sheet could not be rendered"));
    img.src = url;
  });
}

export interface ExportRequest {
  root: DirHandleLike;
  input: SerializeInput;
  /** The preset that describes this sheet, for the ZIP. */
  preset: BuilderPreset;
  /** Which PNG size to render (1×, 2×, 3×). */
  scale: PngScale;
  onStep?: (step: string) => void;
}

/**
 * Commits the sheet into the picked folder's `builder/`: the SVG, the PNG and the
 * ZIP. Every write is create-only (a collision gets a suffix), and a failure stops
 * the run with the reason rather than leaving a half-written set behind.
 */
export async function exportSheet(request: ExportRequest): Promise<ExportResult> {
  const written: string[] = [];
  try {
    const svg = serializeSheet(request.input);
    const name = sheetFileName(request.input.config);
    const step = request.onStep ?? (() => undefined);
    step("Writing the SVG…");
    const svgDone = await commitSheet(request.root, name, svg);
    if (!svgDone.ok) return { ok: false, written, reason: svgDone.reason };
    written.push(svgDone.name);
    // The SVG is the deliverable; the PNG and the ZIP are conveniences. A browser
    // that cannot render a canvas (or a disk that refuses the second write) must
    // not turn a saved sheet into "nothing happened" — so the rest is best-effort
    // and its failure is REPORTED beside the files that did land.
    step("Rendering the PNG…");
    const png = await renderPng(request, svg);
    if (!png.ok) return { ok: false, written, reason: png.reason };
    written.push(png.name);
    step("Packing the ZIP…");
    const zip = await writeZip(request);
    if (!zip.ok) return { ok: false, written, reason: zip.reason };
    written.push(zip.name);
    step("Done");
    return { ok: true, written, reason: null };
  } catch (error) {
    return { ok: false, written, reason: reasonOf(error) };
  }
}

/** The PNG, committed beside the SVG; its real size is asserted against the artboard. */
async function renderPng(
  request: ExportRequest, svg: string,
): Promise<{ ok: true; name: string; blob: Blob } | { ok: false; reason: string }> {
  const a = request.input.config.artboard;
  const blob = await sheetPngOf(svg, a.width, a.height, request.scale);
  const size = await pngSizeOf(blob);
  const want = { width: Math.round(a.width * request.scale), height: Math.round(a.height * request.scale) };
  if (size.width !== want.width || size.height !== want.height) {
    return { ok: false, reason: `the PNG came out ${size.width}×${size.height}, expected ${want.width}×${want.height}` };
  }
  const name = `${sheetFileName(request.input.config).replace(/\.svg$/, "")}@${request.scale}x.png`;
  const done = await commitBlob(request.root, name, blob);
  return done.ok ? { ok: true, name: done.name, blob } : { ok: false, reason: done.reason };
}

/** The ZIP: the same bytes the download offers (ziprun), committed beside the SVG. */
async function writeZip(request: ExportRequest): Promise<{ ok: true; name: string } | { ok: false; reason: string }> {
  const bytes = await buildSheetZip({ input: request.input, preset: request.preset, scale: request.scale });
  const name = sheetFileName(request.input.config).replace(/\.svg$/, ".zip");
  const done = await commitBlob(request.root, name, bytes);
  return done.ok ? { ok: true, name: done.name } : { ok: false, reason: done.reason };
}

/** A commit of raw bytes (the PNG and the ZIP are not text — they must not be read as one). */
async function commitBlob(root: DirHandleLike, name: string, blob: Blob): Promise<{ ok: true; name: string } | { ok: false; reason: string }> {
  const done = await commitSheet(root, name, blob);
  return done.ok ? { ok: true, name: done.name } : { ok: false, reason: done.reason };
}

/** A human reason for a thrown value. */
function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : "the export failed";
}

export type { Placement };
