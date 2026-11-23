// sheetpackage.ts — an artboard sheet's stock package (2026-11-14), built with
// the SVG to upload tab's parts: the SVG with its metadata embedded, an EPS from
// the Upload settings' converter (colours resolved first), and a PNG in place
// of the upload flow's JPEG (2026-11-23: the same switch and size rule) —
// recorded in the same export.json the stock upload tab discovers. A failing
// part is reported and left out; the rest still ships ("partial"). The renderer
// and the converter are injected for tests.
import { embedMetadataInSvg } from "../lib/upload/embed";
import { cleanSheetSvg } from "../lib/svgBuilder/cleansheet";
import { stripPreviewHooks } from "../lib/svgBuilder/striphooks";
import { solidPaint } from "../lib/upload/solidpaint";
import { embedXmpMetadataInEps } from "../lib/upload/epsmetadata";
import { expandStrokes } from "../lib/upload/expand";
import { expandTextToFills } from "../lib/upload/expandtext";
import { epsInputSvg, rescaleSvg } from "../lib/upload/rescale";
import { optimizeSvg, type OptimizeRecord } from "../lib/upload/optimize";
import { jpegTargetSize, rescaledArtboard } from "../lib/exportformats";
import { NO_OUTPUT_FORMATS, hasOutputFormats } from "../lib/upload/formats";
import { outlineForEps } from "../lib/svgBuilder/epsoutline";
import { metadataBlock, newExportRecord, serializeExportRecord, type ExportRecord, type OutputRecord } from "../lib/upload/export";
import { sha256Hex } from "../lib/upload/hash";
import type { IconMetadata } from "../lib/upload/meta";
import { flattenColor, type UploadSettings } from "../lib/upload/settings";
import { settingsFingerprint } from "../lib/upload/settingsfingerprint";
import type { ConvertResult, EpsConvertInput } from "../lib/upload/epsconv/types";
import type { SheetMetadata } from "../lib/svgBuilder/types";
import { sheetPngBlob } from "./exporter";
import { verifyEpsDocument } from "../lib/upload/eps";
import { cleanEpsDocument, stripEpsProducerLines } from "../lib/upload/epsclean";
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
  eps?: (input: EpsConvertInput) => Promise<ConvertResult>;
}

const text = (s: string) => new TextEncoder().encode(s);

/** `stroke`/`fill="currentColor"` → the concrete ink the sheet set (the EPS writers need real paint). */
export { solidPaint } from "../lib/upload/solidpaint";

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
 * then the clean copy — each refusal named before anything ships.
 */
export async function prepareSheetSvg(svg: string, settings: UploadSettings): Promise<{ ok: true; svg: string; svgo: OptimizeRecord; transform: SheetTransform } | { ok: false; reason: string }> {
  const transform: SheetTransform = { strokes: 0, textsOutlined: 0, rescale: null };
  // `stroke="currentColor"` → the group's own ink (the EPS writers need real
  // paint, and after that the `color` it named is dead paperwork), and the
  // composer's `data-*` preview hooks out in EVERY case (RULE 26): they are how
  // the editor finds a cell, never something a delivered file carries.
  const base = stripPreviewHooks(solidPaint(svg));
  const expanded = expandSheet(base, settings, transform);
  if (!expanded.ok) return expanded;
  const placed = rescaleSheet(expanded.svg, settings, transform);
  if (!placed.ok) return placed;
  const optimized = await optimizeSvg(placed.svg, settings.optimizeSvg);
  // Then the paperwork (2026-11-19): the saved SVG — and the EPS built from it —
  // carry the picture and its Title/description/tags, never the generator's
  // hooks, provenance block or float noise. A sheet keeps its px (the rasters
  // are sized from them); refused content is named, never guessed.
  if (!settings.cleanExport) return { ok: true, svg: optimized.svg, svgo: optimized.record, transform };
  const cleaned = cleanSheetSvg(optimized.svg);
  if (cleaned.refused !== null) return { ok: false, reason: `clean: ${cleaned.refused}` };
  return { ok: true, svg: cleaned.svg, svgo: optimized.record, transform };
}

type Step = { ok: true; svg: string } | { ok: false; reason: string };

/** Strokes → fills, then text → glyph outlines; what cannot be expanded is named. */
function expandSheet(svg: string, settings: UploadSettings, t: SheetTransform): Step {
  let out = svg;
  if (settings.expandStrokes) {
    const doc = new DOMParser().parseFromString(out, "image/svg+xml");
    const expanded = expandStrokes(doc.documentElement);
    if (expanded.refused !== null) return { ok: false, reason: `strokes: ${expanded.refused}` };
    out = new XMLSerializer().serializeToString(doc.documentElement);
    t.strokes = expanded.shapes;
  }
  if (!settings.expandText) return { ok: true, svg: out };
  const outlined = expandTextToFills(out);
  if (!outlined.ok) return { ok: false, reason: outlined.reason };
  t.textsOutlined = outlined.runs;
  return { ok: true, svg: outlined.svg };
}

/** The full-artboard rescale, recorded at the px it really reached. */
function rescaleSheet(svg: string, settings: UploadSettings, t: SheetTransform): Step {
  if (!settings.rescaleArtboard) return { ok: true, svg };
  const scaled = rescaleSvg(svg, settings);
  if (!scaled.ok) return { ok: false, reason: scaled.reason };
  const box = rescaledArtboard(...sizePairOf(scaled.svg), { rescaleArtboard: true, rescaleMegapixels: settings.rescaleMegapixels });
  t.rescale = { factor: scaled.factor, width: box.width, height: box.height };
  return { ok: true, svg: scaled.svg };
}

function acceptedOf(m: SheetMetadata | null): IconMetadata | null {
  return m !== null && m.state === "accepted" ? { title: m.title, description: m.description, tags: [...m.tags] } : null;
}

interface Part { name: string; bytes: Uint8Array | null; problem: string | null; fixes?: string[]; writer?: string }

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
  // A rescaled page is the target in POINTS — what Illustrator and the stock
  // sites count as px (2026-11-23); without a rescale the 0.75 px→pt stands.
  const input = {
    svg: epsInputSvg(outlined.svg, a.settings.rescaleArtboard),
    background: flattenColor(sizeOf(a.svg).background), title: name, createdAt: a.now,
  };
  const part = await runConverter(name, d.eps, input, outlined.fixes);
  return deliveredEps(part, meta, a.settings.cleanExport);
}

/**
 * The delivered EPS (2026-11-19). Producer and date lines go in EVERY case
 * (RULE 26: a delivered file names neither the tool nor the moment it ran).
 * With the clean box on, one carrier carries title/description/tags and the
 * second copy plus the `%ADO_*` flag are gone; off, the stock upload's legacy
 * two-carrier envelope is what ships — the same choice the upload flow makes.
 * A file that does not verify is reported and left out: the rest still ships.
 */
function deliveredEps(part: Part, meta: IconMetadata | null, clean: boolean): Part {
  if (part.bytes === null) return part;
  const producerFree = stripEpsProducerLines(new TextDecoder().decode(part.bytes));
  // What a cleaned file may carry: title, description and tags, nothing else.
  const shipped = meta === null ? null : shippedMetadata(meta);
  const eps = clean ? cleanEpsDocument(producerFree, shipped) : withEnvelope(producerFree, shipped);
  const verdict = verifyEpsDocument(eps);
  if (!verdict.ok) return { name: part.name, bytes: null, problem: `EPS: ${verdict.errors.join("; ")}`, fixes: part.fixes };
  return { ...part, bytes: text(eps) };
}

/** The clean box off: the legacy envelope (XMP stream + Photoshop/IPTC copy), no metadata when none was accepted. */
const withEnvelope = (eps: string, meta: IconMetadata | null): string => (meta === null ? eps : embedXmpMetadataInEps(eps, meta));

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

/**
 * The raster, a PNG (2026-11-23): the builder writes no JPEG — the same switch
 * and the same size rule drive a PNG instead (the artboard after any rescale,
 * or the MP at its ratio), so the file and the settings row agree.
 */
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

/**
 * The shipped SVG. The clean copy already ran inside `prepareSheetSvg` (with the
 * sheet's px kept — the rasters are sized from them), so this step only decides
 * WHAT metadata rides along: the three accepted fields, rebuilt into a fresh
 * Dublin Core block so nothing else can survive.
 */
async function cleanedSvgFile(a: SheetPackageArgs, svg: string, meta: IconMetadata | null): Promise<Part> {
  const name = `${a.stem}.svg`;
  if (meta === null) return { name, bytes: text(svg), problem: null };
  return { name, bytes: text(embedMetadataInSvg(svg, shippedMetadata(meta))), problem: null };
}

const NOTHING_TRANSFORM: SheetTransform = { strokes: 0, textsOutlined: 0, rescale: null };

/** The named refusals that write no file at all: all formats off, or a refused preparation. */
async function refusedPackage(a: SheetPackageArgs, meta: IconMetadata | null, reason: string): Promise<SheetPackage> {
  const nothing = { svg: { name: `${a.stem}.svg`, bytes: null, problem: null }, jpg: { name: `${a.stem}.jpg`, bytes: null, problem: null }, eps: { name: `${a.stem}.eps`, bytes: null, problem: null } };
  const record = await recordOf(a, nothing, meta, { transform: NOTHING_TRANSFORM, svgo: SVGO_OFF });
  return { files: [], record: { ...record, status: "failed" }, problems: [reason] };
}

/** The builder writes a PNG instead of a JPEG (2026-11-23): the record says JPEG off, the PNG switch is the raster's. */
const NO_JPEG = (a: SheetPackageArgs): SheetPackageArgs => ({ ...a, settings: { ...a.settings, includeJpeg: false } });


export async function buildSheetPackage(given: SheetPackageArgs, d: SheetPackageDeps = {}): Promise<SheetPackage> {
  const rasterWanted = given.settings.includeJpeg;
  const a = NO_JPEG(given);
  const meta = acceptedOf(a.metadata);
  // Nothing ticked is not an empty success: say what to pick before any file work (the upload flow's own rule).
  if (!hasOutputFormats(a.settings)) return refusedPackage(a, meta, NO_OUTPUT_FORMATS);
  const prepared = await prepareSheetSvg(a.svg, a.settings);
  if (!prepared.ok) return refusedPackage(a, meta, prepared.reason);
  const worked: SheetPackageArgs = { ...a, svg: prepared.svg };
  const svg: Part = a.settings.includeSvg ? await cleanedSvgFile(a, prepared.svg, meta) : { name: `${a.stem}.svg`, bytes: null, problem: null };
  const jpg: Part = { name: `${a.stem}.jpg`, bytes: null, problem: null };
  const [eps, png] = await Promise.all([convertEpsFile(worked, d, meta), renderPngFile(worked, d, rasterWanted)]);
  const record = await recordOf(a, { svg, jpg, eps }, meta, prepared);
  const files = [svg, jpg, eps, png].filter((p): p is Part & { bytes: Uint8Array } => p.bytes !== null).map((p) => ({ name: p.name, bytes: p.bytes }));
  files.push({ name: "export.json", bytes: text(serializeExportRecord(record)) });
  return { files, record, problems: [eps, png].map((p) => p.problem).filter((p): p is string => p !== null) };
}
