// runupload.ts — the panel's bridge to the pipeline (design §7/§16). Everything
// the exporter needs is assembled HERE, once, so the UI stays composition and the
// pipeline stays testable:
//   · the source text is read from the chosen version (never the newest file);
//   · the effective settings and their origin come from the settings store;
//   · the accepted metadata comes from the metadata store (or is generated now);
//   · the four expensive seams are the REAL modules: the streaming provider call,
//     the canvas raster, SVGO and the EPS writer (local first, converter second);
//   · the package a row already has is read from its own export folder.
// A row that cannot be exported never reaches this file — `blocked` is checked by
// the caller, so a missing source can never be sent to a provider.

import type { DirHandleLike } from "../lib/fs";
import { probePath, writeFileOverwrite } from "../lib/fs";
import { readSvgText } from "../svg/svgfiles";
import { chatUrl, type SvgConfig } from "../lib/svgconfig";
import { capsFor, DEFAULT_PARAMS, type SamplingParams } from "../lib/modelcaps";
import { effectiveSettings, type UploadDefaults, type UploadSettings } from "../lib/svgupload/settings";
import { metaStateOf, promptFor, type MetaStore } from "../lib/svgupload/meta";
import { recordFor } from "../lib/svgupload/meta";
import type { ExportRecord, OutputFormat } from "../lib/svgupload/exportjson";
import { fingerprintSettings } from "../lib/svgupload/exportjson";
import { EXPORT_SCHEMA } from "../lib/svgupload/exportjson";
import type { MetaRecord } from "../lib/svgupload/metaprompt";
import { chooseModel, FLASH_LITE, type CatalogEntry, type ModelChoice } from "../lib/svgupload/provider";
import type { MetaText } from "../lib/svgupload/metaprompt";
import { epsBytes } from "./epsio";
import { generateMetadata, type MetadataArgs } from "./metadata";
import { rasterize, renderPixels, thumbnailDataUrl } from "./raster";
import { optimizeSvg } from "./optimizer";
import { exportIcon, readPublishedSvg, type ExportIo, type ExportItem, type ExportOut, type ExportValues, readPublishedJpegBytes } from "./exporter";
import { exportDirOf, readPackage, RECORD_NAME, type PackageRead } from "./package";
import type { UploadRow } from "../lib/svgupload/rows";
import { resolveBackground } from "../lib/svgbackground";

/** Everything the run needs that the panel already holds. */
export interface RunContext {
  root: DirHandleLike;
  row: UploadRow;
  settings: UploadSettings;
  metaStore: MetaStore;
  /** The stored metadata record for this icon, if any. */
  record: MetaRecord | null;
  /** Provider configuration (key, base URL, model catalog, timeouts). */
  config: SvgConfig;
  apiKey: string;
  /** The model catalog the provider advertises; the model is chosen from it. */
  catalog: readonly CatalogEntry[] | null;
  signal?: AbortSignal;
  /** Stage/progress reporting for the row. */
  onProgress?: (note: string) => void;
}

/** The values the geometry, the raster and the record all read (§5). */
export function exportValues(defaults: UploadDefaults): ExportValues {
  return {
    padding: defaults.padding,
    outputScale: defaults.outputScale,
    background: resolveBackground(defaults.background), // the one place a preset becomes a colour
    stroke: { ...defaults.stroke, unit: defaults.stroke.unit === "%" ? "pt" : defaults.stroke.unit },
    jpeg: defaults.jpeg,
    optimizeSvg: defaults.optimizeSvg,
    includeEps: defaults.includeEps,
    epsConverter: defaults.epsConverter === "" ? null : defaults.epsConverter,
  };
}

/**
 * The model used for metadata: the user's choice, else the verified default.
 * The verification is the point — an unlisted id is reported, never substituted.
 */
export function metadataModel(ctx: RunContext): ModelChoice {
  return providerCard({ config: ctx.config, catalog: ctx.catalog, model: ctx.metaStore.model }).choice;
}

/**
 * The minimum an icon needs to be NAMED: its identity. A metadata run happens
 * before any export, so no package and no published record is required — only the
 * source text, for the thumbnail the model looks at.
 */
export async function emptyItem(ctx: RunContext): Promise<ExportItem> {
  const sourceText = ctx.row.svgPath === null ? "" : (await readSvgText(ctx.root, ctx.row.svgPath)) ?? "";
  const eff = effectiveSettings(ctx.settings, ctx.row.id);
  return {
    pair: { pairId: ctx.row.id, base: ctx.row.exportBase, dirPath: ctx.row.dirPath, svgPath: ctx.row.svgPath ?? "", version: ctx.row.version ?? 0, approvedAt: null, fingerprint: ctx.row.fingerprint },
    sourceText, settings: settingsSnapshot(eff.values, eff.inherited), values: exportValues(eff.values),
    requested: requestedOutputs(eff.values), record: null, present: { svg: false, jpg: false, eps: false },
    meta: recordFor(ctx.metaStore, ctx.row.id), metaFresh: false,
  };
}

/** Reads the package a row already has — the same rule as a fresh scan. */
export async function packageOf(ctx: RunContext): Promise<PackageRead> {
  return await readPackage(ctx.root, ctx.row.dirPath, ctx.row.exportBase);
}

/** Assembles the item + the real seams and runs one icon end to end. */
export async function runExport(ctx: RunContext): Promise<ExportOut> {
  const pkg = await packageOf(ctx);
  const record = ctx.record ?? recordFor(ctx.metaStore, ctx.row.id);
  const item = await itemFor(ctx, pkg, record);
  if (item === null) {
    return { status: "failed", record: null, note: "Failed: the chosen SVG could not be read. The previous package was left as it was.", folderPath: exportDirOf(ctx.row.dirPath), skipped: false, meta: record };
  }
  return await exportIcon(item, realIo(ctx));
}

async function itemFor(ctx: RunContext, pkg: PackageRead, record: MetaRecord | null): Promise<ExportItem | null> {
  const svgPath = ctx.row.svgPath;
  if (svgPath === null) return null;
  const sourceText = await readSvgText(ctx.root, svgPath);
  if (sourceText === null) return null;
  const eff = effectiveSettings(ctx.settings, ctx.row.id);
  const published = pkg.record;
  return {
    pair: {
      pairId: ctx.row.id, base: ctx.row.exportBase, dirPath: ctx.row.dirPath, svgPath,
      version: ctx.row.version ?? 0, approvedAt: published?.pair.approvedAt ?? null,
      fingerprint: ctx.row.fingerprint,
    },
    sourceText,
    settings: settingsSnapshot(eff.values, eff.inherited),
    values: exportValues(eff.values),
    requested: requestedOutputs(eff.values),
    record: published,
    present: pkg.present,
    meta: record,
    metaFresh: metaStateOf(record, ctx.row.fingerprint) === "accepted",
  };
}

/** The three outputs asked for: SVG and JPEG always, EPS only when configured. */
export function requestedOutputs(values: UploadDefaults): Record<OutputFormat, boolean> {
  return { svg: true, jpg: true, eps: values.includeEps };
}

/** The record's settings snapshot: the effective values + which were overridden. */
function settingsSnapshot(values: UploadDefaults, inherited: readonly string[]) {
  const overrides = (["padding", "outputScale", "background", "stroke", "jpeg", "optimizeSvg", "includeEps", "epsConverter"] as const)
    .filter((field) => !inherited.includes(field));
  return {
    defaults: { padding: values.padding, outputScale: values.outputScale, background: values.background, stroke: values.stroke, jpeg: values.jpeg, optimizeSvg: values.optimizeSvg, includeEps: values.includeEps },
    overrides: [...overrides],
    resolved: { dpi: 96, paddingPx: { top: 0, right: 0, bottom: 0, left: 0 }, artboard: { w: 0, h: 0 }, scale: 1, strokWidth: { targetPx: 0, docWidth: 0, factor: null, measuredPx: null } },
  };
}

/** The four real seams: provider, canvas, SVGO and the EPS writer/converter. */
export function realIo(ctx: RunContext): ExportIo {
  return {
    root: ctx.root,
    metadata: (item) => generate(ctx, item),
    raster: (args) => rasterize(args),
    optimize: (code, enabled) => optimizeSvg(code, enabled, (svg) => renderPixels(svg)),
    eps: (svg, plan, request) => epsBytes(svg, { plan, request, title: ctx.row.exportBase, fetchImpl: fetch, signal: ctx.signal }),
    publishedSvg: async () => await readPublishedSvg(ctx.root, ctx.row.dirPath, ctx.row.exportBase),
    publishedJpeg: async () => await readPublishedJpegBytes(ctx.root, ctx.row.dirPath, ctx.row.exportBase),
    now: () => new Date().toISOString(),
    // The SAME signal the queue aborts: a cancel reaches the export itself.
    signal: ctx.signal,
  };
}

/** The metadata-only run the panel's "Generate metadata" action calls (§10). */
export async function generateMetadataFor(ctx: RunContext): Promise<{ record: MetaRecord; meta: MetaText | null; error: string | null }> {
  // A metadata run needs the icon's identity and its picture — no package yet.
  return await generate(ctx, await emptyItem(ctx));
}

/** The one paid call: the prompt, the model and the usage are all recorded. */
async function generate(ctx: RunContext, item: ExportItem): Promise<{ record: MetaRecord; meta: { title: string; description: string; tags: string[] } | null; error: string | null }> {
  const choice = metadataModel(ctx);
  if (!choice.ok) {
    // No model is ever substituted: the run stops with the reason the checker gave.
    const error = choice.reason;
    const prompt = promptFor(ctx.metaStore, `${item.pair.base}.svg`);
    return { record: failedRecord({ ctx, item, prompt, model: ctx.metaStore.model, why: error }), meta: null, error };
  }
  const model = choice.model;
  const prompt = promptFor(ctx.metaStore, `${item.pair.base}.svg`);
  const image = await thumbnailDataUrl(item.sourceText, item.values.background);
  if (image === null) {
    const why = "The preview could not be rendered for the vision request.";
    return { record: failedRecord({ ctx, item, prompt, model, why }), meta: null, error: why };
  }
  const args: MetadataArgs = {
    baseUrl: ctx.config.baseUrl, model, apiKey: ctx.apiKey, prompt, image,
    params: paramsFor(model), pairId: item.pair.pairId, sourceFingerprint: item.pair.fingerprint,
    provider: ctx.config.baseUrl, fetch, signal: ctx.signal, stallMs: ctx.config.timeoutMs,
    onProgress: (frames) => ctx.onProgress?.(`Receiving the answer… (${frames} frames)`),
  };
  const out = await generateMetadata(args);
  return { record: out.record, meta: out.meta, error: out.error };
}

function paramsFor(model: string): SamplingParams {
  return { ...DEFAULT_PARAMS, caps: capsFor(model) } as SamplingParams;
}

interface FailedArgs {
  ctx: RunContext;
  item: ExportItem;
  prompt: string;
  model: string;
  why: string;
}

/** Records a request that never left the app, so the UI has something to show. */
function failedRecord(args: FailedArgs): MetaRecord {
  return {
    pairId: args.item.pair.pairId, title: "", description: "", tags: [], at: new Date().toISOString(),
    prompt: args.prompt, provider: args.ctx.config.baseUrl, model: args.model, requestId: null,
    usage: { input: null, output: null, total: null }, cost: { actual: null, estimated: null, currency: "USD" },
    status: "rejected", errors: [args.why], warnings: [], sourceFingerprint: args.item.pair.fingerprint,
  };
}

/** The converter call; the answer is verified before a single byte is written. */
/** The provider/model card the panel shows before anything is sent (§8). */
export function providerCard(args: { config: SvgConfig; catalog: readonly CatalogEntry[] | null; model: string }): { choice: ModelChoice; url: string; fallback: string } {
  return { choice: chooseModel(args.catalog, args.model.trim() === "" ? FLASH_LITE : args.model), url: chatUrl(args.config.baseUrl), fallback: FLASH_LITE };
}

/** What a run returns: the status, the note and the metadata it used. */
export type RunOut = ExportOut;

export { EXPORT_SCHEMA, fingerprintSettings, RECORD_NAME };
export type { ExportRecord };

/** Writes a package record without touching any output — the repair path. */
export async function rewriteRecord(root: DirHandleLike, dirPath: string, record: ExportRecord): Promise<boolean> {
  const dir = await probePath(root, exportDirOf(dirPath));
  if (dir === null) return false;
  await writeFileOverwrite(dir, RECORD_NAME, new Blob([`${JSON.stringify(record, null, 2)}\n`]));
  return true;
}
