// exporter.ts — atomic delivery of a composed sheet. The SVG/PNG/preset blob is
// built completely before one download; no partial file is ever offered.
import { svgDataUrl, validateSvg } from "../lib/svgvalidate";
import { cleanSheetSvg } from "../lib/svgBuilder/cleansheet";
import { presetFileName, sheetSlug, stringifySheetPreset } from "../lib/svgBuilder/preset";
import type { BuilderIconAsset, SheetDocument, SheetPreset } from "../lib/svgBuilder/types";
import { embedMetadataInSvg } from "../lib/upload/embed";
import { withIntrinsicSize } from "../lib/upload/raster";
import { solidPaint } from "../lib/upload/solidpaint";

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

/** Clean, solid-ink, attribution-free SVG markup for delivery or clipboard (RULE 26). */
export function exportSheetSvgText(doc: SheetDocument): string {
  if (typeof DOMParser === "undefined") return doc.svg;
  const cleaned = cleanSheetSvg(solidPaint(doc.svg)).svg;
  const meta = doc.metadata?.state === "accepted"
    ? { title: doc.metadata.title, description: doc.metadata.description, tags: [...doc.metadata.tags] }
    : null;
  return meta === null ? cleaned : embedMetadataInSvg(cleaned, meta);
}

export function downloadSheetSvg(doc: SheetDocument, title: string): void {
  downloadBlob(new Blob([exportSheetSvgText(doc)], { type: "image/svg+xml" }), sheetFileName(title, ".svg"));
}

export function downloadSheetPreset(preset: SheetPreset, title: string): void {
  downloadBlob(new Blob([stringifySheetPreset(preset)], { type: "application/json" }), presetFileName(title));
}

/** The preset JSON as typed or generated, as `{slug}-preset.json`. */
export function downloadJsonText(text: string, title: string): void {
  downloadBlob(new Blob([text], { type: "application/json" }), presetFileName(title));
}

export async function copySheetSvg(doc: SheetDocument): Promise<void> {
  await navigator.clipboard.writeText(exportSheetSvgText(doc));
}

export async function downloadSheetPng(doc: SheetDocument, title: string, scale = 2): Promise<void> {
  const cleanSvg = exportSheetSvgText(doc);
  const width = Math.round(artboardSize(cleanSvg, "width", 1080) * scale);
  const height = Math.round(artboardSize(cleanSvg, "height", 660) * scale);
  downloadBlob(await sheetPngBlob(cleanSvg, width, height), sheetFileName(title, `@${scale}x.png`));
}

/** The sheet SVG drawn at width × height as one PNG — the PNG export's renderer, shared with the metadata image. */
export async function sheetPngBlob(svg: string, width: number, height: number): Promise<Blob> {
  const image = new Image();
  image.src = svgDataUrl(withIntrinsicSize(svg, width, height));
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("No canvas context for PNG export");
  ctx.drawImage(image, 0, 0, width, height);
  return canvasBlob(canvas);
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
