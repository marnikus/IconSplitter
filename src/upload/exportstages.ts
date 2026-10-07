// exportstages.ts — the artifact-building stages of the export pipeline
// (design §3.2): prepare → optimize → embed → render → eps, driven by the
// planner's rebuild flags. The artifacts are built BEFORE any validation or
// commit, so a failed stage never touches the last valid package.

import { prepareExportSvg, type PrepareResult } from "../lib/uploadprepare";
import { targetDimensions } from "../lib/uploadgeom";
import { rasterizeJpeg, type RasterRecord } from "../lib/uploadraster";
import { optimizeSvg, type OptimizeRecord } from "../lib/uploadoptimize";
import { embedMetadataInSvg } from "../lib/uploadembed";
import { writeEps } from "../lib/uploadeps";
import type { UploadSettings } from "../lib/uploadsettings";
import type { IconMetadata } from "../lib/uploadmeta";
import type { DirHandleLike } from "../lib/fs";
import type { StagePlan } from "../lib/uploadexport";
import type { RasterDeps } from "../lib/uploadraster";
import { embedXmpMetadata } from "../lib/uploadjpeg";
import { readBytesAt } from "./runexport";

/** A stage failure carries its class, so the log names the failing stage. */
export class StageError extends Error {
  constructor(public klass: string, message: string) {
    super(message);
  }
}

export interface Artifacts {
  prepared: PrepareResult | null;
  optimizedSvg: string | null;
  optimizeRecord: OptimizeRecord | null;
  svgOut: string | null;
  jpeg: Uint8Array | null;
  jpegRecord: RasterRecord | null;
  epsText: string | null;
  epsFailure: string | null;
}

export interface StageContext {
  root: DirHandleLike;
  sourceText: string;
  exportDir: string;
  stem: string;
  settings: UploadSettings;
  metadata: IconMetadata | null;
  raster?: RasterDeps;
}

/** prepare → optimize → embed → render → eps, per the plan's rebuild flags. */
export async function buildArtifacts(plan: StagePlan, ctx: StageContext): Promise<Artifacts> {
  const art: Artifacts = {
    prepared: null, optimizedSvg: null, optimizeRecord: null,
    svgOut: null, jpeg: null, jpegRecord: null, epsText: null, epsFailure: null,
  };
  const needSvgText = plan.rebuild.svg || plan.rebuild.eps;
  const needRender = plan.rebuild.jpg && plan.stages.includes("render");
  if (needSvgText || needRender) await buildSvgText(art, ctx);
  if (plan.rebuild.svg) art.svgOut = embedSvg(art, ctx.metadata);
  if (plan.rebuild.jpg) await buildJpegArtifact(plan, ctx, art);
  if (plan.rebuild.eps) buildEps(art, ctx.settings);
  return art;
}

/** prepare + optimize: the export SVG text every later stage derives from. */
async function buildSvgText(art: Artifacts, ctx: StageContext): Promise<void> {
  const prepared = prepareExportSvg(ctx.sourceText, ctx.settings);
  if (!prepared.ok) throw new StageError("prepare", `${prepared.code}: ${prepared.detail}`);
  art.prepared = prepared;
  const optimized = await optimizeSvg(prepared.svg, ctx.settings.optimizeSvg);
  art.optimizedSvg = optimized.svg;
  art.optimizeRecord = optimized.record;
}

function embedSvg(art: Artifacts, metadata: IconMetadata | null): string | null {
  if (art.optimizedSvg === null) return null;
  return metadata === null ? art.optimizedSvg : embedMetadataInSvg(art.optimizedSvg, metadata);
}

async function buildJpegArtifact(plan: StagePlan, ctx: StageContext, art: Artifacts): Promise<void> {
  art.jpeg = await buildJpeg(plan, ctx, art);
  if (ctx.metadata !== null) art.jpeg = embedXmpMetadata(art.jpeg, ctx.metadata);
}

function buildEps(art: Artifacts, settings: UploadSettings): void {
  const eps = writeEps(art.optimizedSvg as string, settings.background);
  if (eps.ok) art.epsText = eps.eps;
  else art.epsFailure = eps.reason; // honest: the EPS stage failed → partial
}

/** A fresh render, or the committed JPEG re-embedded (metadata edit only). */
async function buildJpeg(plan: StagePlan, ctx: StageContext, art: Artifacts): Promise<Uint8Array> {
  if (plan.stages.includes("render")) {
    const fit = (art.prepared as PrepareResult & { ok: true }).fit;
    const target = targetDimensions(fit.artW, fit.artH, ctx.settings.jpegMegapixels);
    const raster = await rasterizeJpeg((art.prepared as PrepareResult & { ok: true }).svg, {
      width: target.width, height: target.height,
      quality: ctx.settings.jpegQuality, background: ctx.settings.background,
    }, ctx.raster);
    if (!raster.ok) throw new StageError("render", raster.reason);
    art.jpegRecord = raster.record;
    return raster.jpeg;
  }
  const existing = await readBytesAt(ctx.root, `${ctx.exportDir}/${ctx.stem}.jpg`);
  if (existing === null) throw new StageError("preflight", "the committed JPEG is missing");
  return existing;
}

