// sheetpackage.ts — an artboard sheet's stock package (2026-11-14), built with
// the SVG to upload tab's parts: the SVG with its metadata embedded, an EPS
// from the Upload settings' converter (colours resolved first), and a PNG in
// place of the upload flow's JPEG (2026-11-23: the same switch and size rule —
// the artboard itself, or the MP at its ratio; no JPEG is written) — recorded
// in the same export.json the stock upload tab discovers. A failing part is
// reported and left out; the rest still ships ("partial"). The browser renderers
// and the converter are injected for tests.
import { embedMetadataInSvg } from "../lib/upload/embed";
import { solidPaint } from "../lib/upload/solidpaint";
import { cleanSheetSvg } from "../lib/svgBuilder/cleansheet";
import { cleanEpsDocument, stripEpsProducerLines } from "../lib/upload/epsclean";
import { embedXmpMetadataInEps } from "../lib/upload/epsmetadata";
import { expandStrokes } from "../lib/upload/expand";
import { expandTextToFills } from "../lib/upload/expandtext";
import { epsInputSvg, rescaleSvg } from "../lib/upload/rescale";
import { optimizeSvg, type OptimizeRecord } from "../lib/upload/optimize";
import { jpegTargetSize } from "../lib/exportformats";
import { metadataBlock, newExportRecord, serializeExportRecord, type ExportRecord, type OutputRecord } from "../lib/upload/export";
import { sha256Hex } from "../lib/upload/hash";
import type { IconMetadata } from "../lib/upload/meta";
import { flattenColor, type UploadSettings } from "../lib/upload/settings";
import { settingsFingerprint } from "../lib/upload/settingsfingerprint";
import type { ConvertResult, EpsConvertInput } from "../lib/upload/epsconv/types";
import type { SheetMetadata } from "../lib/svgBuilder/types";
import { sheetPngBlob } from "./exporter";

export interface SheetFile { name: string; bytes: Uint8Array }
export interface SheetPackage { files: SheetFile[]; record: ExportRecord; problems: string[] }

export interface SheetPackageArgs {
  svg: string; metadata: SheetMetadata | null; settings: UploadSettings;
  folder: string; workName?: string; stem: string; pairId: string; now: string; prompt: string; model: string;
}

export interface SheetPackageDeps {
  pngBlob?: (svg: string, width: number, height: number) => Promise<Blob>;
  eps?: (input: EpsConvertInput) => Promise<ConvertResult>;
}

const text = (s: string) => new TextEncoder().encode(s);

export { solidPaint } from "../lib/upload/solidpaint";

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
function stripPreviewHooks(svg: string): string {
  const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  if (root === null || root.getElementsByTagName("parsererror").length > 0) return svg;
  for (const el of [root, ...Array.from(root.getElementsByTagName("*"))]) {
    for (const a of Array.from(el.attributes)) {
      if (a.name.startsWith("data-")) el.removeAttribute(a.name);
    }
  }
  return new XMLSerializer().serializeToString(root);
}

export async function prepareSheetSvg(svg: string, settings: UploadSettings): Promise<{ ok: true; svg: string; svgo: OptimizeRecord } | { ok: false; reason: string }> {
  let out = stripPreviewHooks(solidPaint(svg));
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
  // Then the paperwork (2026-11-19): the saved SVG — and the EPS built from it —
  // carry the picture and its Title/description/tags, never the generator's
  // hooks, provenance block or float noise. Refused content is named, not guessed.
  if (!settings.cleanExport) return { ok: true, svg: optimized.svg, svgo: optimized.record };
  const cleaned = cleanSheetSvg(optimized.svg);
  if (cleaned.refused !== null) return { ok: false, reason: `clean: ${cleaned.refused}` };
  return { ok: true, svg: cleaned.svg, svgo: optimized.record };
}

function acceptedOf(m: SheetMetadata | null): IconMetadata | null {
  return m !== null && m.state === "accepted" ? { title: m.title, description: m.description, tags: [...m.tags] } : null;
}

interface Part { name: string; bytes: Uint8Array | null; problem: string | null }

function finalizeEpsText(eps: string, cleanExport: boolean, meta: IconMetadata | null): string {
  const producerFree = stripEpsProducerLines(eps);
  if (cleanExport) return cleanEpsDocument(producerFree, meta);
  return meta === null ? producerFree : embedXmpMetadataInEps(producerFree, meta);
}

async function convertEpsFile(a: SheetPackageArgs, d: SheetPackageDeps, meta: IconMetadata | null): Promise<Part> {
  const name = `${a.stem}.eps`;
  const docTitle = `${a.workName ?? a.stem}.eps`;
  if (!a.settings.includeEps || d.eps === undefined) return { name, bytes: null, problem: a.settings.includeEps ? "EPS: no converter" : null };
  try {
    // a rescaled page is the target in POINTS — what Illustrator and the stocks count as px (2026-11-23)
    const out = await d.eps({ svg: epsInputSvg(solidPaint(a.svg), a.settings.rescaleArtboard), background: flattenColor(sizeOf(a.svg).background), title: docTitle, createdAt: a.now });
    if (!out.ok) return { name, bytes: null, problem: `EPS: ${out.reason}${out.fix === undefined ? "" : ` — ${out.fix}`}` };
    return { name, bytes: text(finalizeEpsText(out.eps, a.settings.cleanExport, meta)), problem: null };
  } catch (error) {
    return { name, bytes: null, problem: `EPS: ${error instanceof Error ? error.message : "conversion failed"}` };
  }
}

/** The raster, a PNG (2026-11-23): on with the raster switch, sized like the JPEG was (the artboard after any rescale, or the MP). */
async function renderPngFile(a: SheetPackageArgs, d: SheetPackageDeps, wanted: boolean): Promise<Part> {
  const name = `${a.stem}.png`;
  if (!wanted) return { name, bytes: null, problem: null };
  try {
    const box = sizeOf(a.svg);
    const size = jpegTargetSize(box.width, box.height, a.settings);
    const blob = await (d.pngBlob ?? sheetPngBlob)(a.svg, size.width, size.height);
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
  const workName = a.workName ?? a.stem;
  const base = newExportRecord({
    pair: { id: a.pairId, base: workName, suffix: "", dir: a.folder },
    workName,
    uploadName: a.stem,
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

/** The builder writes a PNG instead of a JPEG (2026-11-23): the raster switch drives the PNG; the record says JPEG off. */
const NO_JPEG = (a: SheetPackageArgs): SheetPackageArgs => ({ ...a, settings: { ...a.settings, includeJpeg: false } });

export async function buildSheetPackage(given: SheetPackageArgs, d: SheetPackageDeps = {}): Promise<SheetPackage> {
  const a = NO_JPEG(given);
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
  const jpg: Part = { name: `${a.stem}.jpg`, bytes: null, problem: null };
  const [eps, png] = await Promise.all([convertEpsFile(worked, d, meta), renderPngFile(worked, d, given.settings.includeJpeg)]);
  const record = await recordOf(a, { svg, jpg, eps }, meta, prepared.svgo);
  const files = [svg, jpg, eps, png].filter((p): p is Part & { bytes: Uint8Array } => p.bytes !== null).map((p) => ({ name: p.name, bytes: p.bytes }));
  files.push({ name: "export.json", bytes: text(serializeExportRecord(record)) });
  return { files, record, problems: [eps, png].map((p) => p.problem).filter((p): p is string => p !== null) };
}
