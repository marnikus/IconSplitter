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
import { jpegTargetSize, rescaledArtboard } from "../lib/exportformats";
import { NO_OUTPUT_FORMATS, hasOutputFormats } from "../lib/upload/formats";
import { outlineForEps } from "../lib/svgBuilder/epsoutline";
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
import { cleanExportSvg } from "../lib/upload/svgclean";
import { cleanExportEps } from "../lib/upload/epsclean";
import { embedXmpMetadataInEps } from "../lib/upload/epsmetadata";
import { shippedMetadata } from "../upload/exportstages";

export interface SheetFile { name: string; bytes: Uint8Array }
export interface SheetPackage { files: SheetFile[]; record: ExportRecord; problems: string[] }

export interface SheetPackageArgs {
  svg: string; metadata: SheetMetadata | null; settings: UploadSettings;
  folder: string; stem: string; pairId: string; now: string; prompt: string; model: string;
}

/** What the shared format chain did to the composed sheet (recorded, so the file and the record agree). */
export interface SheetTransform {
  /** Strokes the shipped SVG lost to "Expand strokes to fills". */
  strokes: number;
  /** Live <text> runs the shipped SVG lost to "Expand text to fills". */
  textsOutlined: number;
  /** The rescale the artboard really got, when it ran. */
  rescale: { factor: number; width: number; height: number } | null;
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

/** The document's own px size, for the rescale block (a readable width/height first, else the viewBox). */
function sizePairOf(svg: string): [number, number] {
  const read = (name: string) => Number(new RegExp(`\\b${name}=["'](\\d+(?:\\.\\d+)?)(?:px)?["']`).exec(svg)?.[1] ?? NaN);
  const px = [read("width"), read("height")];
  if (px.every((n) => Number.isFinite(n) && n > 0)) return [px[0], px[1]];
  const vb = (/\bviewBox=["']([^"']+)["']/.exec(svg)?.[1] ?? "").trim().split(/[\s,]+/).map(Number);
  return vb.length === 4 && vb[2] > 0 && vb[3] > 0 ? [vb[2], vb[3]] : [1080, 660];
}

const SVGO_OFF: OptimizeRecord = { enabled: false, version: "none", config: "{}", beforeBytes: 0, afterBytes: 0, beforeHash: "", afterHash: "" };

/**
 * The shared format chain over the composed sheet (2026-11-17): expand strokes,
 * expand text, rescale the artboard, optimize the export copy — in this order,
 * each refusal named before anything ships.
 */
export async function prepareSheetSvg(svg: string, settings: UploadSettings): Promise<{ ok: true; svg: string; svgo: OptimizeRecord; transform: SheetTransform } | { ok: false; reason: string }> {
  const transform: SheetTransform = { strokes: 0, textsOutlined: 0, rescale: null };
  let out = svg;
  if (settings.expandStrokes) {
    const doc = new DOMParser().parseFromString(out, "image/svg+xml");
    const expanded = expandStrokes(doc.documentElement);
    if (expanded.refused !== null) return { ok: false, reason: `strokes: ${expanded.refused}` };
    out = new XMLSerializer().serializeToString(doc.documentElement);
    transform.strokes = expanded.shapes;
  }
  if (settings.expandText) {
    const outlined = expandTextToFills(out);
    if (!outlined.ok) return { ok: false, reason: outlined.reason };
    out = outlined.svg;
    transform.textsOutlined = outlined.runs;
  }
  if (settings.rescaleArtboard) {
    const scaled = rescaleSvg(out, settings);
    if (!scaled.ok) return { ok: false, reason: scaled.reason };
    out = scaled.svg;
    const box = rescaledArtboard(...sizePairOf(out), { rescaleArtboard: true, rescaleMegapixels: settings.rescaleMegapixels });
    transform.rescale = { factor: scaled.factor, width: box.width, height: box.height };
  }
  const optimized = await optimizeSvg(out, settings.optimizeSvg);
  return { ok: true, svg: optimized.svg, svgo: optimized.record, transform };
}

function acceptedOf(m: SheetMetadata | null): IconMetadata | null {
  return m !== null && m.state === "accepted" ? { title: m.title, description: m.description, tags: [...m.tags] } : null;
}

interface Part { name: string; bytes: Uint8Array | null; problem: string | null; fixes?: string[]; writer?: string }

async function renderJpegFile(a: SheetPackageArgs, d: SheetPackageDeps, meta: IconMetadata | null): Promise<Part> {
  const name = `${a.stem}.jpg`;
  if (!a.settings.includeJpeg) return { name, bytes: null, problem: null };
  const box = sizeOf(a.svg);
  const size = jpegTargetSize(box.width, box.height, a.settings);
  const out = await (d.rasterize ?? rasterizeJpeg)(a.svg, { ...size, quality: a.settings.jpegQuality, background: flattenColor(box.background) });
  if (!out.ok) return { name, bytes: null, problem: `JPG: ${out.reason}` };
  return { name, bytes: meta === null ? out.jpeg : embedXmpMetadata(out.jpeg, meta), problem: null };
}

/**
 * SVG → EPS for the composed sheet (2026-11-19): a sheet always carries live
 * <text>, which the built-in Level-3 subset cannot write, so `outlineForEps`
 * gives that converter an outlined COPY (reported as an auto-fix) while the
 * shipped SVG/JPEG keep their text. Any refusal leaves the document untouched
 * and fails only this stage — the rest of the package still ships.
 */
async function convertEpsFile(a: SheetPackageArgs, d: SheetPackageDeps, meta: IconMetadata | null): Promise<Part> {
  const name = `${a.stem}.eps`;
  if (!a.settings.includeEps) return { name, bytes: null, problem: null };
  const outlined = outlineForEps(solidPaint(a.svg), a.settings);
  if (!outlined.ok) return { name, bytes: null, problem: `EPS: ${outlined.reason} — ${outlined.fix}`, fixes: [] };
  const input = { svg: outlined.svg, background: flattenColor(sizeOf(a.svg).background), title: name, createdAt: a.now };
  const part = await runConverter(name, d.eps, input, outlined.fixes);
  return a.settings.cleanExport === false ? part : cleanedEps(part, meta);
}

/**
 * The delivered EPS (2026-11-19): title, description and tags only, one carrier,
 * no producer fingerprint. A file the clean pass cannot verify is reported and
 * left out — the rest of the package still ships (this stage's own rule).
 */
function cleanedEps(part: Part, meta: IconMetadata | null): Part {
  if (part.bytes === null) return part;
  const eps = new TextDecoder().decode(part.bytes);
  const carrier = meta === null ? eps : embedXmpMetadataInEps(eps, shippedMetadata(meta));
  const cleaned = cleanExportEps(carrier);
  if (!cleaned.ok) return { name: part.name, bytes: null, problem: `EPS: ${cleaned.reason}`, fixes: part.fixes };
  return { ...part, bytes: text(cleaned.eps) };
}

/** One converter call, its auto-fixes merged, and every failure named (never guessed at). */
async function runConverter(name: string, convert: SheetPackageDeps["eps"], input: EpsConvertInput, fixes: string[]): Promise<Part> {
  if (convert === undefined) return { name, bytes: null, problem: "EPS: no converter", fixes };
  try {
    const out = await convert(input);
    if (!out.ok) return { name, bytes: null, problem: `EPS: ${out.reason}${out.fix === undefined ? "" : ` — ${out.fix}`}`, fixes };
    return { name, bytes: text(out.eps), problem: null, fixes: [...out.fixes, ...fixes], writer: out.writer };
  } catch (error) {
    return { name, bytes: null, problem: `EPS: ${error instanceof Error ? error.message : "conversion failed"}`, fixes };
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

/** The tool blocks this run really produced — the converter's own writer (RULE 22), the expansion and the rescale. */
function toolBlocksOf(part: Part, t: SheetTransform, settings: UploadSettings, base: ExportRecord["tools"]["eps"]): Partial<ExportRecord["tools"]> {
  return {
    // The converter's own writer id (RULE 22) — the fixed built-in label only when nothing wrote a file.
    eps: { ...base, enabled: settings.includeEps, fixes: part.fixes ?? [], ...(part.writer === undefined ? {} : { writer: part.writer }) },
    expand: { enabled: t.strokes > 0, shapes: t.strokes },
    text: { enabled: t.textsOutlined > 0, runs: t.textsOutlined },
    ...(t.rescale === null ? {} : {
      rescale: {
        enabled: true, megapixels: Math.round((t.rescale.width * t.rescale.height) / 1000) / 1000,
        strokes: settings.rescaleStrokes, width: t.rescale.width, height: t.rescale.height,
      },
    }),
  };
}

async function recordOf(
  a: SheetPackageArgs, parts: { svg: Part; jpg: Part; eps: Part }, meta: IconMetadata | null,
  prepared: { transform: SheetTransform; svgo: OptimizeRecord },
): Promise<ExportRecord> {
  const s = a.settings;
  const svgo = prepared.svgo;
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
  const tools = { ...base.tools, ...toolBlocksOf(parts.eps, prepared.transform, s, base.tools.eps) };
  return { ...base, tools, metadata, outputs, stage: "committed", status: complete ? "processed" : "partial",
    validation: { svg: outputs.svg !== null, jpeg: outputs.jpg !== null, eps: outputs.eps !== null, json: true, readback: false },
    timestamps: { ...base.timestamps, committedAt: a.now } };
}

/** The shipped SVG: cleaned (fingerprints gone, title/description/tags only) unless the box is off. */
async function cleanedSvgFile(a: SheetPackageArgs, svg: string, meta: IconMetadata | null): Promise<Part> {
  const name = `${a.stem}.svg`;
  if (meta === null) {
    if (a.settings.cleanExport === false) return { name, bytes: text(svg), problem: null };
    const cleaned = cleanExportSvg(svg);
    return cleaned.ok ? { name, bytes: text(cleaned.svg), problem: null } : { name, bytes: null, problem: `SVG: ${cleaned.reason}` };
  }
  const embedded = embedMetadataInSvg(svg, meta);
  if (a.settings.cleanExport === false) return { name, bytes: text(embedded), problem: null };
  const cleaned = cleanExportSvg(embedded, shippedMetadata(meta));
  return cleaned.ok ? { name, bytes: text(cleaned.svg), problem: null } : { name, bytes: null, problem: `SVG: ${cleaned.reason}` };
}

const NOTHING_TRANSFORM: SheetTransform = { strokes: 0, textsOutlined: 0, rescale: null };

/** The named refusals that write no file at all: all formats off, or a refused preparation. */
async function refusedPackage(a: SheetPackageArgs, meta: IconMetadata | null, reason: string): Promise<SheetPackage> {
  const nothing = { svg: { name: `${a.stem}.svg`, bytes: null, problem: null }, jpg: { name: `${a.stem}.jpg`, bytes: null, problem: null }, eps: { name: `${a.stem}.eps`, bytes: null, problem: null } };
  const record = await recordOf(a, nothing, meta, { transform: NOTHING_TRANSFORM, svgo: SVGO_OFF });
  return { files: [], record: { ...record, status: "failed" }, problems: [reason] };
}

export async function buildSheetPackage(a: SheetPackageArgs, d: SheetPackageDeps = {}): Promise<SheetPackage> {
  const meta = acceptedOf(a.metadata);
  // Nothing ticked is not an empty success: say what to pick before any file work (the upload flow's own rule).
  if (!hasOutputFormats(a.settings)) return refusedPackage(a, meta, NO_OUTPUT_FORMATS);
  const prepared = await prepareSheetSvg(a.svg, a.settings);
  if (!prepared.ok) return refusedPackage(a, meta, prepared.reason);
  const worked: SheetPackageArgs = { ...a, svg: prepared.svg };
  const svg: Part = a.settings.includeSvg ? await cleanedSvgFile(a, prepared.svg, meta) : { name: `${a.stem}.svg`, bytes: null, problem: null };
  const [jpg, eps, png] = await Promise.all([renderJpegFile(worked, d, meta), convertEpsFile(worked, d, meta), renderPngFile(worked, d)]);
  const record = await recordOf(a, { svg, jpg, eps }, meta, prepared);
  const files = [svg, jpg, eps, png].filter((p): p is Part & { bytes: Uint8Array } => p.bytes !== null).map((p) => ({ name: p.name, bytes: p.bytes }));
  files.push({ name: "export.json", bytes: text(serializeExportRecord(record)) });
  return { files, record, problems: [jpg, eps, png].map((p) => p.problem).filter((p): p is string => p !== null) };
}
