// sheetpackage.ts — an artboard sheet's stock package (2026-11-14), built with
// the SVG to upload tab's parts: the SVG with its metadata embedded, a JPEG at
// the Upload settings' megapixels with XMP metadata, an EPS from the Upload
// settings' converter (colours resolved first), and a full 2× PNG — recorded
// in the same export.json the stock upload tab discovers. A failing part is
// reported and left out; the rest still ships ("partial"). The browser renderers
// and the converter are injected for tests.
import { embedMetadataInSvg } from "../lib/upload/embed";
import { expandStrokes } from "../lib/upload/expand";
import { expandTextToFills } from "../lib/upload/expandtext";
import { rescaleSvg } from "../lib/upload/rescale";
import { optimizeSvg, type OptimizeRecord } from "../lib/upload/optimize";
import { jpegTargetSize } from "../lib/exportformats";
import { metadataBlock, newExportRecord, serializeExportRecord, type ExportRecord, type OutputRecord } from "../lib/upload/export";
import { sha256Hex } from "../lib/upload/hash";
import { embedXmpMetadata } from "../lib/upload/jpeg";
import type { IconMetadata } from "../lib/upload/meta";
import { rasterizeJpeg } from "../lib/upload/raster";
import { flattenColor, type UploadSettings } from "../lib/upload/settings";
import { settingsFingerprint } from "../lib/upload/settingsfingerprint";
import type { ConvertResult, EpsConvertInput } from "../lib/upload/epsconv/types";
import type { SheetMetadata } from "../lib/svgBuilder/types";
import { sheetPngBlob } from "./exporter";

export interface SheetFile { name: string; bytes: Uint8Array }
export interface SheetPackage { files: SheetFile[]; record: ExportRecord; problems: string[] }

export interface SheetPackageArgs {
  svg: string; metadata: SheetMetadata | null; settings: UploadSettings;
  folder: string; stem: string; pairId: string; now: string; prompt: string; model: string;
}

export interface SheetPackageDeps {
  pngBlob?: (svg: string, width: number, height: number) => Promise<Blob>;
  rasterize?: (svg: string, target: { width: number; height: number; quality: number; background: string }) => Promise<{ ok: true; jpeg: Uint8Array } | { ok: false; reason: string }>;
  eps?: (input: EpsConvertInput) => Promise<ConvertResult>;
}

const text = (s: string) => new TextEncoder().encode(s);

/** `stroke`/`fill="currentColor"` → the nearest ancestor's `color` (the EPS writers need real paint). */
export function solidPaint(svg: string): string {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  for (const el of Array.from(doc.getElementsByTagName("*"))) {
    const colour = el.closest("[color]")?.getAttribute("color");
    if (colour == null) continue;
    for (const attr of ["stroke", "fill"]) if (el.getAttribute(attr) === "currentColor") el.setAttribute(attr, colour);
  }
  return new XMLSerializer().serializeToString(doc.documentElement);
}

function sizeOf(svg: string): { width: number; height: number; background: string } {
  const num = (name: string, fallback: number) => Number(new RegExp(`\\b${name}=["'](\\d+(?:\\.\\d+)?)["']`).exec(svg)?.[1] ?? fallback);
  return { width: num("width", 1080), height: num("height", 660), background: /<rect\b[^>]*fill=["'](#[0-9a-fA-F]{6})["']/.exec(svg)?.[1] ?? "#FFFFFF" };
}

const SVGO_OFF: OptimizeRecord = { enabled: false, version: "none", config: "{}", beforeBytes: 0, afterBytes: 0, beforeHash: "", afterHash: "" };

/**
 * The shared format chain over the composed sheet (2026-11-17): expand strokes,
 * expand text, rescale the artboard, optimize the export copy — in this order,
 * each refusal named before anything ships.
 */
export async function prepareSheetSvg(svg: string, settings: UploadSettings): Promise<{ ok: true; svg: string; svgo: OptimizeRecord } | { ok: false; reason: string }> {
  let out = svg;
  if (settings.expandStrokes) {
    const doc = new DOMParser().parseFromString(out, "image/svg+xml");
    const expanded = expandStrokes(doc.documentElement);
    if (expanded.refused !== null) return { ok: false, reason: `strokes: ${expanded.refused}` };
    out = new XMLSerializer().serializeToString(doc.documentElement);
  }
  if (settings.expandText) {
    const outlined = expandTextToFills(out);
    if (!outlined.ok) return { ok: false, reason: outlined.reason };
    out = outlined.svg;
  }
  if (settings.rescaleArtboard) {
    const scaled = rescaleSvg(out, settings);
    if (!scaled.ok) return { ok: false, reason: scaled.reason };
    out = scaled.svg;
  }
  const optimized = await optimizeSvg(out, settings.optimizeSvg);
  return { ok: true, svg: optimized.svg, svgo: optimized.record };
}

function acceptedOf(m: SheetMetadata | null): IconMetadata | null {
  return m !== null && m.state === "accepted" ? { title: m.title, description: m.description, tags: [...m.tags] } : null;
}

interface Part { name: string; bytes: Uint8Array | null; problem: string | null }

async function renderJpegFile(a: SheetPackageArgs, d: SheetPackageDeps, meta: IconMetadata | null): Promise<Part> {
  const name = `${a.stem}.jpg`;
  if (!a.settings.includeJpeg) return { name, bytes: null, problem: null };
  const box = sizeOf(a.svg);
  const size = jpegTargetSize(box.width, box.height, a.settings);
  const out = await (d.rasterize ?? rasterizeJpeg)(a.svg, { ...size, quality: a.settings.jpegQuality, background: flattenColor(box.background) });
  if (!out.ok) return { name, bytes: null, problem: `JPG: ${out.reason}` };
  return { name, bytes: meta === null ? out.jpeg : embedXmpMetadata(out.jpeg, meta), problem: null };
}

async function convertEpsFile(a: SheetPackageArgs, d: SheetPackageDeps): Promise<Part> {
  const name = `${a.stem}.eps`;
  if (!a.settings.includeEps || d.eps === undefined) return { name, bytes: null, problem: a.settings.includeEps ? "EPS: no converter" : null };
  try {
    const out = await d.eps({ svg: solidPaint(a.svg), background: flattenColor(sizeOf(a.svg).background), title: name, createdAt: a.now });
    return out.ok ? { name, bytes: text(out.eps), problem: null } : { name, bytes: null, problem: `EPS: ${out.reason}${out.fix === undefined ? "" : ` — ${out.fix}`}` };
  } catch (error) {
    return { name, bytes: null, problem: `EPS: ${error instanceof Error ? error.message : "conversion failed"}` };
  }
}

async function renderPngFile(a: SheetPackageArgs, d: SheetPackageDeps): Promise<Part> {
  const name = `${a.stem}.png`;
  try {
    const box = sizeOf(a.svg);
    const blob = await (d.pngBlob ?? sheetPngBlob)(a.svg, box.width * 2, box.height * 2);
    return { name, bytes: new Uint8Array(await blob.arrayBuffer()), problem: null };
  } catch (error) {
    return { name, bytes: null, problem: `PNG: ${error instanceof Error ? error.message : "render failed"}` };
  }
}

async function output(part: Part): Promise<OutputRecord | null> {
  return part.bytes === null ? null : { path: part.name, bytes: part.bytes.length, hash: await sha256Hex(part.bytes) };
}

async function recordOf(a: SheetPackageArgs, parts: { svg: Part; jpg: Part; eps: Part }, meta: IconMetadata | null, svgo: OptimizeRecord): Promise<ExportRecord> {
  const s = a.settings;
  const base = newExportRecord({
    pair: { id: a.pairId, base: a.stem, suffix: "", dir: a.folder },
    source: { svgPath: `${a.folder}/export/${a.stem}.svg`, version: 1, approval: "approved", fingerprint: await sha256Hex(text(a.svg)) },
    settings: { defaults: s, overrides: {}, effective: s, fingerprint: settingsFingerprint(s) },
    svgo,
    epsEnabled: s.includeEps, epsConverter: s.epsConverter, now: a.now,
  });
  const outputs = { svg: await output(parts.svg), jpg: await output(parts.jpg), eps: await output(parts.eps) };
  const wanted = [s.includeSvg, s.includeJpeg, s.includeEps];
  const complete = [outputs.svg, outputs.jpg, outputs.eps].every((o, i) => !wanted[i] || o !== null);
  const metadata = meta === null || a.metadata?.validation == null ? null : metadataBlock(meta, {
    prompt: a.prompt, provider: "gemini", model: a.model, requestId: null, usage: { input: null, output: null, total: null },
    fingerprint: a.metadata.fingerprint ?? "", validation: { ok: a.metadata.validation.ok, errors: [...a.metadata.validation.errors], warnings: [...a.metadata.validation.warnings] },
  });
  return { ...base, metadata, outputs, stage: "committed", status: complete ? "processed" : "partial",
    validation: { svg: outputs.svg !== null, jpeg: outputs.jpg !== null, eps: outputs.eps !== null, json: true, readback: false },
    timestamps: { ...base.timestamps, committedAt: a.now } };
}

export async function buildSheetPackage(a: SheetPackageArgs, d: SheetPackageDeps = {}): Promise<SheetPackage> {
  const meta = acceptedOf(a.metadata);
  const prepared = await prepareSheetSvg(a.svg, a.settings);
  if (!prepared.ok) {
    const nothing = { svg: { name: `${a.stem}.svg`, bytes: null, problem: null }, jpg: { name: `${a.stem}.jpg`, bytes: null, problem: null }, eps: { name: `${a.stem}.eps`, bytes: null, problem: null } };
    return { files: [], record: await recordOf(a, nothing, meta, SVGO_OFF), problems: [prepared.reason] };
  }
  const worked: SheetPackageArgs = { ...a, svg: prepared.svg };
  const svg: Part = a.settings.includeSvg
    ? { name: `${a.stem}.svg`, bytes: text(meta === null ? prepared.svg : embedMetadataInSvg(prepared.svg, meta)), problem: null }
    : { name: `${a.stem}.svg`, bytes: null, problem: null };
  const [jpg, eps, png] = await Promise.all([renderJpegFile(worked, d, meta), convertEpsFile(worked, d), renderPngFile(worked, d)]);
  const record = await recordOf(a, { svg, jpg, eps }, meta, prepared.svgo);
  const files = [svg, jpg, eps, png].filter((p): p is Part & { bytes: Uint8Array } => p.bytes !== null).map((p) => ({ name: p.name, bytes: p.bytes }));
  files.push({ name: "export.json", bytes: text(serializeExportRecord(record)) });
  return { files, record, problems: [jpg, eps, png].map((p) => p.problem).filter((p): p is string => p !== null) };
}
