// sheetpackage.ts — an artboard sheet's stock package (2026-11-14), built with
// the SVG to upload tab's parts: the SVG with its metadata embedded, an EPS
// from the Upload settings' converter (colours resolved first), and a PNG in
// place of the upload flow's JPEG (2026-11-23: the same switch and size rule —
// the artboard itself, or the MP at its ratio; no JPEG is written) — recorded
// in the same export.json the stock upload tab discovers. A failing part is
// reported and left out; the rest still ships ("partial"). The browser renderers
// and the converter are injected for tests.
import { embedMetadataInSvg } from "../lib/upload/embed";
import { solidPaint, solidPaintDom } from "../lib/upload/solidpaint";
import { cleanSvgDom } from "../lib/upload/svgclean";
import { cleanEpsDocument, stripEpsProducerLines } from "../lib/upload/epsclean";
import { embedXmpMetadataInEps } from "../lib/upload/epsmetadata";
import { expandStrokes } from "../lib/upload/expand";
import { expandTextDom } from "../lib/upload/expandtext";
import { epsInputSvg, rescaleFactorOf, rescaleSvgDom } from "../lib/upload/rescale";
import { optimizeSheetSvg, type OptimizeRecord } from "../lib/upload/optimize";
import { jpegTargetSize } from "../lib/exportformats";
import { metadataBlock, newExportRecord, serializeExportRecord, type ExportRecord, type OutputRecord } from "../lib/upload/export";
import { sha256Hex } from "../lib/upload/hash";
import type { IconMetadata } from "../lib/upload/meta";
import { flattenColor, type UploadSettings } from "../lib/upload/settings";
import { settingsFingerprint } from "../lib/upload/settingsfingerprint";
import type { ConvertResult, EpsConvertInput } from "../lib/upload/epsconv/types";
import type { SheetMetadata } from "../lib/svgBuilder/types";
import * as exporter from "./exporter";

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
function stripPreviewHooksDom(root: Element): void {
  for (const el of [root, ...Array.from(root.getElementsByTagName("*"))]) {
    for (const a of Array.from(el.attributes)) {
      if (a.name.startsWith("data-")) el.removeAttribute(a.name);
    }
  }
}

function inlineExpandScale(root: Element, settings: UploadSettings): number {
  if (!settings.rescaleArtboard || !settings.rescaleStrokes) return 1;
  const vb = (root.getAttribute("viewBox") ?? "0 0 1 1").trim().split(/[\s,]+/).map(Number);
  if (vb[0] !== 0 || vb[1] !== 0) return 1;
  return rescaleFactorOf(root, settings.rescaleMegapixels) ?? 1;
}

let sharedDomParser: DOMParser | null = null;
let sharedXmlSerializer: XMLSerializer | null = null;

function runDomFormatPasses(root: Element, settings: UploadSettings, scaledElements: Set<Element>): string | null {
  if (settings.expandStrokes) {
    const scale = inlineExpandScale(root, settings);
    const expanded = expandStrokes(root, { decimals: settings.cleanExport || scale !== 1 ? 1 : 3, scale, scaledElements });
    if (expanded.refused !== null) return `strokes: ${expanded.refused}`;
  }
  if (settings.expandText) {
    const outlined = expandTextDom(root);
    if (!outlined.ok) return outlined.reason;
  }
  if (settings.rescaleArtboard) {
    const scaled = rescaleSvgDom(root, settings, scaledElements);
    if (!scaled.ok) return scaled.reason;
  }
  return null;
}

function cleanPreparedDom(root: Element, svg: string, scaledElements: ReadonlySet<Element>): string | null {
  const cleaned = cleanSvgDom(root, {
    keepSize: true, skipReport: true, skipElements: scaledElements,
    hasImage: /<image\b/i.test(svg), hasMetadata: /<metadata\b/i.test(svg), hasComments: svg.includes("<!--"),
  });
  return cleaned.refused === null ? null : `clean: ${cleaned.refused}`;
}

function prepareSheetDom(svg: string, settings: UploadSettings, cleanInPlace = false): { ok: true; svg: string; root?: Element } | { ok: false; reason: string } {
  const doc = (sharedDomParser ??= new DOMParser()).parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  if (root === null || root.nodeName.toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length > 0) {
    return cleanInPlace ? { ok: false, reason: "clean: the document does not parse as an SVG" } : { ok: true, svg };
  }
  solidPaintDom(root);
  if (!settings.cleanExport) stripPreviewHooksDom(root);
  const scaledElements = new Set<Element>();
  const formatErr = runDomFormatPasses(root, settings, scaledElements);
  if (formatErr !== null) return { ok: false, reason: formatErr };
  const cleanErr = cleanInPlace ? cleanPreparedDom(root, svg, scaledElements) : null;
  if (cleanErr !== null) return { ok: false, reason: cleanErr };
  return { ok: true, svg: (sharedXmlSerializer ??= new XMLSerializer()).serializeToString(root), root };
}

type PreparedSheet = { ok: true; svg: string; svgo: OptimizeRecord; sourceHash?: string; svgRoot?: Element } | { ok: false; reason: string };

async function prepareSheetInternal(svg: string, settings: UploadSettings): Promise<PreparedSheet> {
  if (settings.cleanExport) {
    const optimized = await optimizeSheetSvg(svg, settings.optimizeSvg, true);
    const prepared = prepareSheetDom(optimized.svg, settings, true);
    if (!prepared.ok) return prepared;
    return { ok: true, svg: prepared.svg, svgo: optimized.record, sourceHash: optimized.record.beforeHash, svgRoot: prepared.root };
  }
  const pre = prepareSheetDom(svg, settings, false);
  if (!pre.ok) return pre;
  const optimized = await optimizeSheetSvg(pre.svg, settings.optimizeSvg, false);
  return { ok: true, svg: optimized.svg, svgo: optimized.record, svgRoot: settings.optimizeSvg ? undefined : pre.root };
}

export async function prepareSheetSvg(svg: string, settings: UploadSettings): Promise<{ ok: true; svg: string; svgo: OptimizeRecord; sourceHash?: string } | { ok: false; reason: string }> {
  const res = await prepareSheetInternal(svg, settings);
  if (!res.ok) return res;
  const { svgRoot: _unused, ...pub } = res;
  return pub;
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

function scaleRootForEps(root: Element | undefined, svg: string, rescaled: boolean): Element | undefined {
  if (root === undefined || /currentcolor/i.test(svg)) return undefined;
  if (!rescaled) return root;
  const w = Number((root.getAttribute("width") ?? "").trim().replace(/px$/i, ""));
  const h = Number((root.getAttribute("height") ?? "").trim().replace(/px$/i, ""));
  if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) return undefined;
  root.setAttribute("width", String(Number((w / 0.75).toFixed(3))));
  root.setAttribute("height", String(Number((h / 0.75).toFixed(3))));
  return root;
}

async function convertEpsFile(a: SheetPackageArgs, d: SheetPackageDeps, meta: IconMetadata | null, svgRoot?: Element): Promise<Part> {
  const name = `${a.stem}.eps`;
  const docTitle = `${a.workName ?? a.stem}.eps`;
  if (!a.settings.includeEps || d.eps === undefined) return { name, bytes: null, problem: a.settings.includeEps ? "EPS: no converter" : null };
  try {
    // a rescaled page is the target in POINTS — what Illustrator and the stocks count as px (2026-11-23)
    const epsRoot = scaleRootForEps(svgRoot, a.svg, a.settings.rescaleArtboard);
    const out = await d.eps({
      svg: epsInputSvg(solidPaint(a.svg), a.settings.rescaleArtboard),
      ...(epsRoot === undefined ? {} : { svgRoot: epsRoot }),
      background: flattenColor(sizeOf(a.svg).background), title: docTitle, createdAt: a.now,
    });
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
    const blob = await (d.pngBlob ?? exporter.sheetPngBlob)(a.svg, size.width, size.height);
    return { name, bytes: new Uint8Array(await blob.arrayBuffer()), problem: null };
  } catch (error) {
    return { name, bytes: null, problem: `PNG: ${error instanceof Error ? error.message : "render failed"}` };
  }
}

async function output(part: Part): Promise<OutputRecord | null> {
  return part.bytes === null ? null : { path: part.name, bytes: part.bytes.length, hash: await sha256Hex(part.bytes) };
}

function buildSheetMetaBlock(a: SheetPackageArgs, meta: IconMetadata | null): ReturnType<typeof metadataBlock> | null {
  if (meta === null || a.metadata?.validation == null) return null;
  const v = a.metadata.validation;
  return metadataBlock(meta, {
    prompt: a.prompt, provider: "gemini", model: a.model, requestId: null, usage: { input: null, output: null, total: null },
    fingerprint: a.metadata.fingerprint ?? "", validation: { ok: v.ok, errors: [...v.errors], warnings: [...v.warnings] },
  });
}

async function recordOf(
  a: SheetPackageArgs, parts: { svg: Part; jpg: Part; eps: Part }, meta: IconMetadata | null,
  svgo: OptimizeRecord & { sourceHash?: string },
): Promise<ExportRecord> {
  const s = a.settings;
  const workName = a.workName ?? a.stem;
  const [fingerprint, svgOut, jpgOut, epsOut] = await Promise.all([
    svgo.sourceHash !== undefined && svgo.sourceHash !== "" ? Promise.resolve(svgo.sourceHash) : sha256Hex(text(a.svg)),
    output(parts.svg), output(parts.jpg), output(parts.eps),
  ]);
  const { sourceHash: _unused, ...svgoClean } = svgo;
  const base = newExportRecord({
    pair: { id: a.pairId, base: workName, suffix: "", dir: a.folder }, workName, uploadName: a.stem,
    source: { svgPath: `${a.folder}/export/${a.stem}.svg`, version: 1, approval: "approved", fingerprint },
    settings: { defaults: s, overrides: {}, effective: s, fingerprint: settingsFingerprint(s) },
    svgo: svgoClean, epsEnabled: s.includeEps, epsConverter: s.epsConverter, now: a.now,
  });
  const outputs = { svg: svgOut, jpg: jpgOut, eps: epsOut };
  const wanted = [s.includeSvg, s.includeJpeg, s.includeEps];
  const complete = [outputs.svg, outputs.jpg, outputs.eps].every((o, i) => !wanted[i] || o !== null);
  return { ...base, metadata: buildSheetMetaBlock(a, meta), outputs, stage: "committed", status: complete ? "processed" : "partial",
    validation: { svg: outputs.svg !== null, jpeg: outputs.jpg !== null, eps: outputs.eps !== null, json: true, readback: false },
    timestamps: { ...base.timestamps, committedAt: a.now } };
}

/** The builder writes a PNG instead of a JPEG (2026-11-23): the raster switch drives the PNG; the record says JPEG off. */
const NO_JPEG = (a: SheetPackageArgs): SheetPackageArgs => ({ ...a, settings: { ...a.settings, includeJpeg: false } });

export async function buildSheetPackage(given: SheetPackageArgs, d: SheetPackageDeps = {}): Promise<SheetPackage> {
  const a = NO_JPEG(given);
  const meta = acceptedOf(a.metadata);
  const prepared = await prepareSheetInternal(a.svg, a.settings);
  if (!prepared.ok) {
    const nothing = { svg: { name: `${a.stem}.svg`, bytes: null, problem: null }, jpg: { name: `${a.stem}.jpg`, bytes: null, problem: null }, eps: { name: `${a.stem}.eps`, bytes: null, problem: null } };
    return { files: [], record: await recordOf(a, nothing, meta, SVGO_OFF), problems: [prepared.reason] };
  }
  const worked: SheetPackageArgs = { ...a, svg: prepared.svg };
  const svg: Part = a.settings.includeSvg
    ? { name: `${a.stem}.svg`, bytes: text(meta === null ? prepared.svg : embedMetadataInSvg(prepared.svg, meta)), problem: null }
    : { name: `${a.stem}.svg`, bytes: null, problem: null };
  const jpg: Part = { name: `${a.stem}.jpg`, bytes: null, problem: null };
  const [eps, png] = await Promise.all([convertEpsFile(worked, d, meta, prepared.svgRoot), renderPngFile(worked, d, given.settings.includeJpeg)]);
  const record = await recordOf(a, { svg, jpg, eps }, meta, { ...prepared.svgo, sourceHash: prepared.sourceHash });
  const files = [svg, jpg, eps, png].filter((p): p is Part & { bytes: Uint8Array } => p.bytes !== null).map((p) => ({ name: p.name, bytes: p.bytes }));
  files.push({ name: "export.json", bytes: text(serializeExportRecord(record)) });
  return { files, record, problems: [eps, png].map((p) => p.problem).filter((p): p is string => p !== null) };
}
