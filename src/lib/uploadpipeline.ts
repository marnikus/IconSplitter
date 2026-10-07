// uploadpipeline.ts — one icon's export, stage by stage (RULE 11/19). Owns: the
// order Prepare → Optimize → Render → Embed → EPS → Validate → Commit, the
// read-back that proves the embedded metadata equals what was accepted, and the
// rule that NOTHING is published until everything requested has validated.
//
// The record and the commit live in `uploadpublish.ts`. Every dependency is
// injected (`PipelineDeps`): fs, canvas, optimiser and EPS generator arrive from
// outside, so the whole pipeline is unit-tested with fakes — a disk that fills
// up, a raster that comes back the wrong size, a JPEG whose read-back disagrees
// — without a browser.
//
// Failure policy: a required SVG/JPEG failing is a FAILED package; a requested
// EPS failing (unsupported feature, unverified page) is PARTIAL, because the
// SVG and the JPEG are still complete and usable. A cancelled run publishes
// nothing and leaves the previous package in place.

import { documentBounds } from "./uploadbounds";
import { prepareSvg, type Artboard, type PreparedSvg } from "./uploadartboard";
import { optimizeSvg, SVGO_VERSION, type OptimizeResult } from "./svgoptimize";
import { embedSvgMetadata, svgMetadataMatches } from "./svgmeta";
import { embedJpegMetadata, jpegInfo, jpegMetadataMatches } from "./jpegmeta";
import { effectiveSettings } from "./uploadoverride";
import type { MetadataCheck } from "./uploadmeta";
import type { ExportRecord, OutputFile, OutputFormat } from "./uploadrecord";
import type { ExportPlan } from "./uploadplan";
import { throwIfAborted } from "./uploadjobs";
import {
  abandon, output, planRun, publish, StageError, type PipelineDeps, type PipelineInput,
  type PipelineRun, type PublishState, type RasterOutcome,
} from "./uploadpublish";

export { RECORD_NAME } from "./uploadpublish";
export type { PipelineDeps, PipelineInput, PipelineRun, PipelineSource, RasterOutcome } from "./uploadpublish";

interface Ctx extends PublishState {
  deps: PipelineDeps;
  /** Stages this run has to run; a stage outside it reuses what is on disk. */
  stages: Set<string>;
  exportCode: string;
  jpegSize: { width: number; height: number } | null;
}

export function planFor(input: PipelineInput): ExportPlan {
  return planRun(input);
}

/** The whole run for one icon. Data problems are reported, never thrown. */
export async function runPipeline(input: PipelineInput, deps: PipelineDeps): Promise<PipelineRun> {
  const ctx = createCtx(input, deps);
  if (ctx.plan.formats.length === 0) return upToDate(ctx);
  try {
    requireMetadata(ctx);
    ctx.exportCode = ctx.stages.has("prepare") ? prepareAndOptimize(ctx) : existingSvgText(ctx);
    await buildSvg(ctx);
    await buildJpeg(ctx);
    await buildEps(ctx);
    return await publish(ctx, deps);
  } catch (error) {
    return abandon(ctx, deps, error);
  }
}

function createCtx(input: PipelineInput, deps: PipelineDeps): Ctx {
  const plan = planFor(input);
  return {
    input,
    deps,
    plan,
    stages: new Set<string>(plan.stages),
    effective: effectiveSettings(input.settings, input.override),
    artboard: null,
    exportCode: "",
    svgo: null,
    jpeg: null,
    jpegSize: null,
    eps: null,
    outputs: [],
    reused: reusedOutputs(input, plan),
    warnings: [],
    partialReason: null,
  };
}

function reusedOutputs(input: PipelineInput, plan: ExportPlan): OutputFile[] {
  const reuse = plan.reuse;
  return (input.record?.outputs ?? []).filter((file) => reuse.includes(file.format));
}

/** Nothing to do: the existing package is already correct, so nothing is written. */
function upToDate(ctx: Ctx): PipelineRun {
  const record = ctx.input.record as ExportRecord;
  ctx.deps.log({ stage: "commit", message: "already up to date; nothing written" });
  return { status: "processed", record, published: [], reused: ctx.reused, warnings: [], error: null };
}

/** Invalid metadata can never reach a processed export (RULE 9). */
function requireMetadata(ctx: Ctx): void {
  const check: MetadataCheck | null = ctx.input.metadataCheck;
  if (check === null || !check.ok) {
    throw new StageError("metadata", `the metadata is not valid: ${metadataProblems(check)}`);
  }
}

function metadataProblems(check: MetadataCheck | null): string {
  if (check === null) return "it was never accepted";
  const issues = [...check.errors, ...check.warnings];
  return issues.length === 0 ? "it did not pass validation" : issues.join("; ");
}

/** The existing SVG output, read back — the metadata-only path re-embeds over it. */
function existingSvgText(ctx: Ctx): string {
  const bytes = ctx.input.existing.svg;
  if (bytes === undefined) throw new StageError("prepare", "the previous SVG is missing, so it cannot be re-embedded");
  return new TextDecoder().decode(bytes);
}

/** Artboard + plate + strokes on a copy, then SVGO on that copy. */
function prepareAndOptimize(ctx: Ctx): string {
  const prepared = preparedCopy(ctx);
  const optimized = ctx.effective.optimizeSvg ? optimizeSvg(prepared.code) : null;
  if (optimized !== null && !optimized.ok) ctx.warnings.push(`optimisation was skipped: ${optimized.error ?? "unknown reason"}`);
  ctx.svgo = svgoRecord(ctx.effective.optimizeSvg, prepared.code, optimized);
  ctx.deps.log({ stage: "prepare", message: `artboard ${round3(ctx.artboard?.viewBox.w ?? 0)}×${round3(ctx.artboard?.viewBox.h ?? 0)} units, ${px(ctx)} px` });
  return optimized?.ok === true ? optimized.code : prepared.code;
}

function px(ctx: Ctx): string {
  const size = ctx.artboard?.px;
  return size === undefined ? "—" : `${size.width}×${size.height}`;
}

/** Measures the artwork, builds the export copy and remembers the artboard. */
function preparedCopy(ctx: Ctx): PreparedSvg {
  const bounds = documentBounds(ctx.input.source.code);
  if (!bounds.ok || bounds.bounds === null) throw new StageError("prepare", bounds.error ?? "the artwork's bounds cannot be measured");
  const prepared = prepareSvg(ctx.input.source.code, bounds.bounds, ctx.effective);
  if (!prepared.ok || prepared.artboard === null) throw new StageError("prepare", prepared.error ?? "the SVG could not be prepared");
  ctx.artboard = prepared.artboard;
  ctx.warnings.push(...prepared.warnings);
  return prepared;
}

/** What the optimiser did, including the honest case where it could not run. */
function svgoRecord(enabled: boolean, before: string, optimized: OptimizeResult | null): ExportRecord["svgo"] {
  const ok = optimized?.ok === true;
  return {
    enabled,
    version: SVGO_VERSION,
    beforeBytes: optimized?.beforeBytes ?? byteLength(before),
    afterBytes: ok ? optimized.afterBytes : byteLength(before),
    differences: ok ? [] : [optimized?.error ?? "not run"],
  };
}

/** The SVG output: metadata embedded after optimisation, then read back. */
async function buildSvg(ctx: Ctx): Promise<void> {
  if (!ctx.plan.formats.includes("svg")) return;
  const embedded = embedSvgMetadata(ctx.exportCode, ctx.input.metadata);
  if (!embedded.ok) throw new StageError("embed", embedded.error ?? "the SVG metadata could not be written");
  if (!svgMetadataMatches(embedded.code, ctx.input.metadata)) {
    throw new StageError("validate", "the SVG metadata read back differently from what was accepted");
  }
  const name = outputName(ctx, "svg");
  await ctx.deps.write(name, embedded.code);
  ctx.outputs.push(output("svg", name, embedded.code, { width: null, height: null }));
}

/** The JPEG: rendered from vectors (or re-embedded), then decoded back. */
async function buildJpeg(ctx: Ctx): Promise<void> {
  if (!ctx.plan.formats.includes("jpeg")) return;
  throwIfAborted(ctx.deps.signal);
  const rendered = ctx.stages.has("render") ? await renderRaster(ctx, requireArtboard(ctx)) : previousJpeg(ctx);
  const embedded = embedOrThrow(rendered.bytes, ctx.input.metadata);
  ctx.jpegSize = verifyJpeg(ctx, embedded, rendered);
  ctx.jpeg = {
    width: ctx.jpegSize.width, height: ctx.jpegSize.height,
    megapixels: round3((ctx.jpegSize.width * ctx.jpegSize.height) / 1e6),
    quality: ctx.effective.jpegQuality, profile: ctx.effective.colorProfile,
  };
  const name = outputName(ctx, "jpeg");
  await ctx.deps.write(name, embedded);
  ctx.outputs.push(output("jpeg", name, embedded, { width: ctx.jpegSize.width, height: ctx.jpegSize.height }));
  ctx.deps.log({ stage: "render", message: `rendered ${ctx.jpegSize.width}×${ctx.jpegSize.height} JPEG, ${ctx.jpeg.megapixels} MP` });
}

function embedOrThrow(bytes: Uint8Array | null, metadata: Ctx["input"]["metadata"]): Uint8Array {
  if (bytes === null) throw new StageError("render", "the raster came back empty");
  const embedded = embedJpegMetadata(bytes, metadata);
  if (!embedded.ok) throw new StageError("embed", embedded.error ?? "the JPEG metadata could not be written");
  return embedded.bytes;
}

/** Reads the produced bytes back: format, dimensions, no alpha, metadata equal. */
function verifyJpeg(ctx: Ctx, bytes: Uint8Array, rendered: RasterOutcome): { width: number; height: number } {
  const info = jpegInfo(bytes);
  if (info === null) throw new StageError("validate", "the JPEG cannot be read back after embedding");
  if (info.components === 4) throw new StageError("validate", "the JPEG came back with an alpha channel");
  if (info.width !== rendered.width || info.height !== rendered.height) {
    throw new StageError("validate", "the JPEG dimensions changed during embedding");
  }
  if (!jpegMetadataMatches(bytes, ctx.input.metadata)) {
    throw new StageError("validate", "the JPEG metadata read back differently from what was accepted");
  }
  return { width: info.width, height: info.height };
}

/** The raster stage: the vectors at the artboard's own pixel size. */
async function renderRaster(ctx: Ctx, artboard: Artboard): Promise<RasterOutcome> {
  const rendered = await ctx.deps.raster(ctx.exportCode, artboard);
  if (!rendered.ok || rendered.bytes === null) throw new StageError("render", rendered.error ?? "the raster came back empty");
  if (rendered.width !== artboard.px.width || rendered.height !== artboard.px.height) {
    throw new StageError("render", `the raster came back ${rendered.width}×${rendered.height}, not ${artboard.px.width}×${artboard.px.height}`);
  }
  return rendered;
}

/** The JPEG already on disk, with its real dimensions read from its own header. */
function previousJpeg(ctx: Ctx): RasterOutcome {
  const bytes = ctx.input.existing.jpeg;
  if (bytes === undefined) throw new StageError("render", "the previous JPEG is missing, so it cannot be re-embedded");
  const info = jpegInfo(bytes);
  if (info === null) throw new StageError("render", "the previous JPEG cannot be read back");
  return { ok: true, bytes, error: null, width: info.width, height: info.height };
}

/** EPS from the pre-embed copy; a failure here degrades the package, not the run. */
async function buildEps(ctx: Ctx): Promise<void> {
  if (!ctx.plan.formats.includes("eps")) return;
  throwIfAborted(ctx.deps.signal);
  const artboard = requireArtboard(ctx);
  const file = ctx.deps.eps(ctx.exportCode, artboard);
  const check = file.ok ? await ctx.deps.verifyEps(file) : null;
  if (!file.ok || check === null || !check.ok) {
    ctx.partialReason = `EPS: ${file.ok ? (check?.problems.join("; ") ?? "unverified") : (file.error ?? "conversion failed")}`;
    ctx.warnings.push(ctx.partialReason);
    ctx.deps.log({ stage: "eps", message: ctx.partialReason, level: "warn" });
    return;
  }
  const name = outputName(ctx, "eps");
  await ctx.deps.write(name, file.eps);
  ctx.eps = { enabled: true, widthPt: points(artboard.px.width, ctx.effective.dpi), heightPt: points(artboard.px.height, ctx.effective.dpi), features: file.features, verdict: check.label };
  ctx.outputs.push(output("eps", name, file.eps, { width: null, height: null }));
  ctx.deps.log({ stage: "eps", message: `EPS written: ${check.label}` });
}

function requireArtboard(ctx: Ctx): Artboard {
  if (ctx.artboard === null) throw new StageError("prepare", "the artboard was never computed");
  return ctx.artboard;
}

function outputName(ctx: Ctx, format: OutputFormat): string {
  return `${ctx.input.source.name}.${format === "jpeg" ? "jpg" : format}`;
}

/** The physical size of an output, in points, at the export's own DPI. */
function points(size: number, dpi: number): number {
  return round3((size * 72) / dpi);
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
