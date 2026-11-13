// exporter.ts — atomic delivery of a composed sheet. The SVG/PNG/preset blob is
// built completely before one download; no partial file is ever offered.
import { svgDataUrl, validateSvg } from "../lib/svgvalidate";
import { withIntrinsicSize } from "../lib/upload/raster";
import { presetFileName, sheetSlug, stringifySheetPreset } from "../lib/svgBuilder/preset";
import type { BuilderIconAsset, SheetDocument, SheetPreset } from "../lib/svgBuilder/types";

export interface SheetVerification { ok: boolean; errors: readonly string[] }

export function verifySheetDocument(doc: SheetDocument, assets: readonly BuilderIconAsset[]): SheetVerification {
  const errors: string[] = [];
  const known = new Set(assets.map((a) => a.id));
  if (doc.svg.trim() === "") errors.push("the composed SVG is empty");
  if (doc.placedIds.some((id) => !known.has(id))) errors.push("an unapproved asset is placed");
  if (doc.brokenIds.length > 0) errors.push(`${doc.brokenIds.length} approved SVG(s) could not be embedded`);
  const current = new Map(assets.map((a) => [a.id, a.fingerprint]));
  if (doc.sourceFingerprints.some((s) => current.get(s.id) !== s.fingerprint)) errors.push("an approved SVG changed since it was placed — rescan first");
  // The parser-backed check needs a DOM (always present in the app; absent in the Node smoke lane).
  if (doc.svg.trim() !== "" && typeof DOMParser !== "undefined" && !validateSvg(doc.svg).ok) errors.push("the composed SVG did not validate");
  return { ok: errors.length === 0, errors };
}

/** Reference names: `{slug}.svg`, `{slug}@2x.png`, `{slug}-preset.json`. */
export function sheetFileName(title: string, suffix: string): string {
  return `${sheetSlug(title)}${suffix}`;
}

export function downloadSheetSvg(doc: SheetDocument, title: string): void {
  downloadBlob(new Blob([doc.svg], { type: "image/svg+xml" }), sheetFileName(title, ".svg"));
}

export function downloadSheetPreset(preset: SheetPreset, title: string): void {
  downloadBlob(new Blob([stringifySheetPreset(preset)], { type: "application/json" }), presetFileName(title));
}

/** The preset JSON as typed or generated, as `{slug}-preset.json`. */
export function downloadJsonText(text: string, title: string): void {
  downloadBlob(new Blob([text], { type: "application/json" }), presetFileName(title));
}

export async function copySheetSvg(doc: SheetDocument): Promise<void> {
  await navigator.clipboard.writeText(doc.svg);
}

export async function downloadSheetPng(doc: SheetDocument, title: string, scale = 2): Promise<void> {
  const width = Math.round(artboardSize(doc.svg, "width", 1080) * scale);
  const height = Math.round(artboardSize(doc.svg, "height", 660) * scale);
  const image = new Image();
  image.src = svgDataUrl(withIntrinsicSize(doc.svg, width, height));
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("No canvas context for PNG export");
  ctx.drawImage(image, 0, 0, width, height);
  const blob = await canvasBlob(canvas);
  downloadBlob(blob, sheetFileName(title, `@${scale}x.png`));
}

function artboardSize(svg: string, name: "width" | "height", fallback: number): number {
  const value = new RegExp(`\\b${name}=["'](\\d+(?:\\.\\d+)?)["']`, "i").exec(svg)?.[1];
  return value === undefined ? fallback : Number(value);
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob === null ? reject(new Error("PNG encode failed")) : resolve(blob), "image/png");
  });
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
