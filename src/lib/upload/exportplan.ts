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
  includeEps: boolean;
  /** The converter the run would use; a record written by another one rebuilds the EPS only (2026-10-09). */
  epsConverter: EpsConverterId;
  /** Which output files exist and hash-verify on disk right now. */
  outputs: { svg: boolean; jpg: boolean; eps: boolean };
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
 * re-optimizes (JPEG kept); an EPS toggle is EPS-only; a missing/corrupt output
 * rebuilds just that output; no change means no work at all. `rebuild`
 * disambiguates the shared stages: `embed` touches the SVG and the JPEG's XMP,
 * but a missing JPEG re-embeds nothing into the SVG and an optimize toggle keeps
 * the JPEG.
 */
export function planStages(record: ExportRecord | null, input: PlanInput): StagePlan {
  const need = new Set<Stage>();
  const rebuild = { svg: false, jpg: false, eps: false };
  const regeometry = record === null
    || record.source.fingerprint !== input.sourceHash
    || record.settings.fingerprint !== input.settingsFp;
  if (regeometry) {
    need.add("prepare");
    need.add("render");
    if (input.optimize) need.add("optimize");
    if (input.hasMetadata) need.add("embed");
    if (input.includeEps) need.add("eps");
    rebuild.svg = true;
    rebuild.jpg = true;
    rebuild.eps = input.includeEps;
  } else {
    planDeltas(record as ExportRecord, input, need, rebuild);
  }
  if (need.size > 0) {
    need.add("validate");
    need.add("commit");
  }
  return { stages: STAGE_ORDER.filter((stage) => need.has(stage)), rebuild };
}

function planDeltas(record: ExportRecord, input: PlanInput, need: Set<Stage>, rebuild: StagePlan["rebuild"]): void {
  planMetadataDelta(record, input, need, rebuild);
  planToggleDeltas(record, input, need, rebuild);
  planMissingOutputs(input, need, rebuild);
}

function planMetadataDelta(record: ExportRecord, input: PlanInput, need: Set<Stage>, rebuild: StagePlan["rebuild"]): void {
  const metadataFp = input.hasMetadata ? input.metadataFp : "";
  if ((record.metadata?.fingerprint ?? "") === metadataFp) return;
  need.add("embed");
  rebuild.svg = true;
  rebuild.jpg = true;
  // EPS is converted before its XMP is embedded, so a metadata edit must also
  // refresh it whenever EPS is part of this run (no raster render is added).
  if (input.includeEps) {
    need.add("eps");
    rebuild.eps = true;
  }
}

function planToggleDeltas(record: ExportRecord, input: PlanInput, need: Set<Stage>, rebuild: StagePlan["rebuild"]): void {
  if (record.tools.svgo.enabled !== input.optimize) {
    need.add("optimize");
    if (input.hasMetadata) need.add("embed");
    rebuild.svg = true;
  }
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
  if (!input.outputs.svg) planSvgRebuild(input, need, rebuild);
  if (!input.outputs.jpg) planJpegRebuild(input, need, rebuild);
  if (!input.outputs.eps && input.includeEps) {
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
