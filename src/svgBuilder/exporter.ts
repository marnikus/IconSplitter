// exporter.ts — atomic delivery of a composed sheet. The SVG/PNG/preset blob is
// built completely before one download; no partial file is ever offered.
import { svgDataUrl } from "../lib/svgvalidate";
import { withIntrinsicSize } from "../lib/upload/raster";
import { stringifySheetPreset, presetFileName } from "../lib/svgBuilder/preset";
import type { BuilderIconAsset, SheetDocument, SheetPreset } from "../lib/svgBuilder/types";

export interface SheetVerification { ok: boolean; errors: readonly string[] }

export function verifySheetDocument(doc: SheetDocument, assets: readonly BuilderIconAsset[]): SheetVerification {
  const errors: string[] = [];
  const known = new Set(assets.map((a) => a.id));
  if (doc.svg.trim() === "") errors.push("the composed SVG is empty");
  if (doc.placedIds.some((id) => !known.has(id))) errors.push("an unapproved asset is placed");
  if (doc.brokenIds.length > 0) errors.push(`${doc.brokenIds.length} approved SVG(s) could not be embedded`);
  return { ok: errors.length === 0, errors };
}

export function sheetFileName(doc: SheetDocument, extension: string): string {
  const title = doc.metadata?.state === "accepted" ? doc.metadata.title : "svg-builder-sheet";
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug === "" ? "svg-builder-sheet" : slug}.${extension}`;
}

export function downloadSheetSvg(doc: SheetDocument): void {
  downloadBlob(new Blob([doc.svg], { type: "image/svg+xml" }), sheetFileName(doc, "svg"));
}

export function downloadSheetPreset(preset: SheetPreset): void {
  const title = preset.metadata?.state === "accepted" ? preset.metadata.title : "svg-builder";
  downloadBlob(new Blob([stringifySheetPreset(preset)], { type: "application/json" }), presetFileName(title));
}

export async function copySheetSvg(doc: SheetDocument): Promise<void> {
  await navigator.clipboard.writeText(doc.svg);
}

export async function downloadSheetPng(doc: SheetDocument, scale = 2): Promise<void> {
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
  downloadBlob(blob, sheetFileName(doc, "png"));
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
