import { hasOutputFormats, outputFormats } from "./formats";
// exportplan.ts — the STAGE PLANNER for selective re-export (design §4.4),
// split out of export.ts (2026-10-09, RULE 18). Decides which stages re-run
// and which output files rebuild from the record on disk and the run's input.

import type { ExportRecord } from "./export";
import type { EpsConverterId } from "./epsconv/types";
import { BUILTIN_WRITER } from "./epsconv/builtin";

export type Stage = "prepare" | "render" | "optimize" | "embed" | "eps" | "validate" | "commit";

const STAGE_ORDER: Stage[] = ["prepare", "render", "optimize", "embed", "eps", "validate", "commit"];

export interface PlanInput {
  /** sha256 of the source SVG bytes. */
  sourceHash: string;
  settingsFp: string;
  metadataFp: string;
  hasMetadata: boolean;
  optimize: boolean;
  includeSvg?: boolean;
  includeJpeg?: boolean;
  includeEps: boolean;
  /** The converter the run would use; a record written by another one rebuilds the EPS only (2026-10-09). */
  epsConverter: EpsConverterId;
  /** Which output file handles exist on disk right now. */
  outputs: { svg: boolean; jpg: boolean; eps: boolean };
  /** Whether every file reads back to accepted metadata in its required carriers. */
  metadataOutputs: { svg: boolean; jpg: boolean; eps: boolean };
}

/** The plan: which stages re-run, and which OUTPUT files rebuild. */
export interface StagePlan {
  stages: Stage[];
  rebuild: { svg: boolean; jpg: boolean; eps: boolean };
}

/**
 * Which stages must re-run. The rules (design §4.4): a source or settings
 * change rebuilds the geometry chain; a metadata edit re-embeds without AI or
 * raster render (and refreshes EPS when EPS is requested); an optimize toggle
 * re-optimizes (JPEG kept); an EPS toggle is EPS-only; a missing/corrupt
 * output rebuilds just that file, while absent accepted metadata rebuilds only
 * the affected file; no change means no work at all. `rebuild` disambiguates
 * the shared stages: `embed`
 * touches the SVG and the JPEG's XMP/IPTC on a metadata change, but
 * repairing an SVG/EPS readback never rewrites an intact JPEG.
 */
export function planStages(record: ExportRecord | null, input: PlanInput): StagePlan {
  const need = new Set<Stage>();
  const rebuild = { svg: false, jpg: false, eps: false };
  if (!hasOutputFormats(input)) return { stages: [], rebuild };
  const regeometry = record === null
    || record.source.fingerprint !== input.sourceHash
    || record.settings.fingerprint !== input.settingsFp;
  if (regeometry) {
    planGeometry(input, need, rebuild);
  } else {
    planDeltas(record as ExportRecord, input, need, rebuild);
  }
  if (record !== null && hasDisabledOutputs(record, input)) need.add("commit");
  if (need.size > 0) {
    need.add("validate");
    need.add("commit");
  }
  return { stages: STAGE_ORDER.filter((stage) => need.has(stage)), rebuild };
}

/** Geometry is shared, but rendering and delivered files follow requested formats. */
function planGeometry(input: PlanInput, need: Set<Stage>, rebuild: StagePlan["rebuild"]): void {
  Object.assign(rebuild, outputFormats(input));
  need.add("prepare");
  if (rebuild.jpg) need.add("render");
  if (input.optimize) need.add("optimize");
  if (input.hasMetadata) need.add("embed");
  if (rebuild.eps) need.add("eps");
}

/** Detaching old outputs is a record-only commit when enabled files need no work. */
function hasDisabledOutputs(record: ExportRecord, input: PlanInput): boolean {
  const enabled = outputFormats(input);
  return (["svg", "jpg", "eps"] as const).some((ext) => !enabled[ext] && record.outputs[ext] !== null);
}

function planDeltas(record: ExportRecord, input: PlanInput, need: Set<Stage>, rebuild: StagePlan["rebuild"]): void {
  planMetadataDelta(record, input, need, rebuild);
  planSvgOptimizeDelta(record, input, need, rebuild);
  planEpsToolDelta(record, input, need, rebuild);
  planMissingOutputs(input, need, rebuild);
}

function planMetadataDelta(record: ExportRecord, input: PlanInput, need: Set<Stage>, rebuild: StagePlan["rebuild"]): void {
  const metadataFp = input.hasMetadata ? input.metadataFp : "";
  if ((record.metadata?.fingerprint ?? "") === metadataFp) return;
  need.add("embed");
  rebuild.svg = input.includeSvg !== false;
  rebuild.jpg = input.includeJpeg !== false;
  // EPS is converted before its XMP is embedded, so a metadata edit must also
  // refresh it whenever EPS is part of this run (no raster render is added).
  if (input.includeEps) {
    need.add("eps");
    rebuild.eps = true;
  }
}

function planSvgOptimizeDelta(record: ExportRecord, input: PlanInput, need: Set<Stage>, rebuild: StagePlan["rebuild"]): void {
  if (input.includeSvg !== false && record.tools.svgo.enabled !== input.optimize) {
    need.add("optimize");
    if (input.hasMetadata) need.add("embed");
    rebuild.svg = true;
  }
}

/** EPS converter/writer changes and prior partial failures require only another EPS attempt. */
function planEpsToolDelta(record: ExportRecord, input: PlanInput, need: Set<Stage>, rebuild: StagePlan["rebuild"]): void {
  const writerChanged = input.epsConverter === "builtin" && record.tools.eps.writer !== BUILTIN_WRITER;
  const retryFailedEps = record.status === "partial" && record.error !== null;
  if (input.includeEps && (!record.tools.eps.enabled || recordConverter(record) !== input.epsConverter || writerChanged || retryFailedEps)) {
    need.add("eps");
    rebuild.eps = true;
  }
}

/** The converter a record's EPS came from; a record from before the field is the built-in. */
export function recordConverter(record: ExportRecord): EpsConverterId {
  return record.tools.eps.converter ?? "builtin";
}

function planMissingOutputs(input: PlanInput, need: Set<Stage>, rebuild: StagePlan["rebuild"]): void {
  if (input.includeSvg !== false && (!input.outputs.svg || (input.hasMetadata && !input.metadataOutputs.svg))) planSvgRebuild(input, need, rebuild);
  planJpegRepair(input, need, rebuild);
  const epsNeedsRebuild = !input.outputs.eps || (input.hasMetadata && !input.metadataOutputs.eps);
  if (epsNeedsRebuild && input.includeEps) {
    need.add("eps");
    rebuild.eps = true;
  }
}

function planSvgRebuild(input: PlanInput, need: Set<Stage>, rebuild: StagePlan["rebuild"]): void {
  need.add("prepare");
  if (input.optimize) need.add("optimize");
  if (input.hasMetadata) need.add("embed");
  rebuild.svg = true;
}

function planJpegRebuild(input: PlanInput, need: Set<Stage>, rebuild: StagePlan["rebuild"]): void {
  need.add("render");
  if (input.hasMetadata) need.add("embed");
  rebuild.jpg = true;
}

/** Missing pixels require render; stripped compatibility metadata requires only embed. */
function planJpegRepair(input: PlanInput, need: Set<Stage>, rebuild: StagePlan["rebuild"]): void {
  if (input.includeJpeg === false) return;
  if (!input.outputs.jpg) planJpegRebuild(input, need, rebuild);
  else if (input.hasMetadata && !input.metadataOutputs.jpg) {
    need.add("embed");
    rebuild.jpg = true;
  }
}
