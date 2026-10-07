// uploadexport.ts — the per-icon export record (`export.json` schema v1,
// design §4.3) and the STAGE PLANNER for selective re-export (design §4.4).
// Parsing is tolerant (RULE 13): a corrupt or missing record is null and the
// pipeline rebuilds it — a bad record never destroys valid output files.
// One record per icon, in `<pair-folder>/export/`; no global multi-icon file.

import { isRecord } from "./isrecord";
import type { UploadSettings, SettingsOverrides } from "./uploadsettings";
import type { IconMetadata, MetadataValidation } from "./uploadmeta";
import type { GeminiUsage } from "./geminiclient";
import type { OptimizeRecord } from "./uploadoptimize";

export const EXPORT_RECORD_VERSION = 1;

export type ExportStatus = "processed" | "partial" | "failed" | "cancelled" | "stale" | "interrupted";
export type ExportStage =
  | "discovered" | "preflight" | "prepare" | "metadata" | "render"
  | "optimize" | "embed" | "eps" | "validate" | "commit" | "committed";

export interface OutputRecord {
  path: string;
  bytes: number;
  hash: string;
}

export interface ExportRecord {
  v: number;
  pair: { id: string; base: string; suffix: string; dir: string };
  source: { svgPath: string; version: number; approval: string; fingerprint: string };
  settings: { defaults: UploadSettings; overrides: SettingsOverrides; effective: UploadSettings; fingerprint: string };
  jpeg: { width: number; height: number; megapixels: number; quality: number; profile: string };
  tools: {
    svgo: OptimizeRecord;
    eps: { enabled: boolean; writer: string };
  };
  metadata: {
    state: "pending" | "generated" | "invalid" | "accepted";
    title: string;
    description: string;
    tags: string[];
    prompt: string;
    provider: string;
    model: string;
    requestId: string | null;
    usage: GeminiUsage;
    cost: number | null;
    costBasis: string;
    fingerprint: string;
    validation: MetadataValidation;
  } | null;
  outputs: { svg: OutputRecord | null; jpg: OutputRecord | null; eps: OutputRecord | null };
  stage: ExportStage;
  status: ExportStatus;
  validation: { svg: boolean; jpeg: boolean; eps: boolean; json: boolean; readback: boolean };
  error: string | null;
  recovery: string;
  timestamps: { preparedAt: string; committedAt: string | null };
}

export interface NewRecordArgs {
  pair: { id: string; base: string; suffix: string; dir: string };
  source: { svgPath: string; version: number; approval: string; fingerprint: string };
  settings: { defaults: UploadSettings; overrides: SettingsOverrides; effective: UploadSettings; fingerprint: string };
  svgo: OptimizeRecord;
  epsEnabled: boolean;
  now?: string;
}

/** A fresh record: discovered, nothing rendered, nothing committed. */
export function newExportRecord(args: NewRecordArgs): ExportRecord {
  return {
    v: EXPORT_RECORD_VERSION,
    pair: args.pair,
    source: args.source,
    settings: args.settings,
    jpeg: { width: 0, height: 0, megapixels: 0, quality: args.settings.effective.jpegQuality, profile: "baseline" },
    tools: { svgo: args.svgo, eps: { enabled: args.epsEnabled, writer: "builtin-subset-1" } },
    metadata: null,
    outputs: { svg: null, jpg: null, eps: null },
    stage: "discovered",
    status: "failed",
    validation: { svg: false, jpeg: false, eps: false, json: false, readback: false },
    error: null,
    recovery: "none",
    timestamps: { preparedAt: args.now ?? new Date().toISOString(), committedAt: null },
  };
}

export function serializeExportRecord(record: ExportRecord): string {
  return JSON.stringify(record, null, 2);
}

/** Stored JSON → record; null when corrupt (the pipeline rebuilds it). */
export function parseExportRecord(raw: unknown): ExportRecord | null {
  if (!isRecord(raw) || raw.v !== EXPORT_RECORD_VERSION) return null;
  const paths = ["pair", "source", "settings", "tools", "tools.svgo", "tools.eps", "outputs", "timestamps"];
  const blocks = paths.map((path) => recordAt(raw, path));
  if (blocks.some((block) => block === null)) return null;
  const [pair, source, settings] = blocks as [Record<string, unknown>, Record<string, unknown>, Record<string, unknown>];
  if (typeof pair.id !== "string") return null;
  if (typeof source.fingerprint !== "string") return null;
  if (typeof settings.fingerprint !== "string") return null;
  return raw as unknown as ExportRecord;
}

function recordAt(raw: Record<string, unknown>, path: string): Record<string, unknown> | null {
  let cur: unknown = raw;
  for (const key of path.split(".")) {
    if (!isRecord(cur)) return null;
    cur = cur[key];
  }
  return isRecord(cur) ? cur : null;
}

// --- the stage planner (design §4.4) -------------------------------------------

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
 * change rebuilds the geometry chain; a metadata edit re-embeds only (no AI,
 * no render); an optimize toggle re-optimizes (JPEG kept); an EPS toggle is
 * EPS-only; a missing/corrupt output rebuilds just that output; no change
 * means no work at all. `rebuild` disambiguates the shared stages: `embed`
 * touches the SVG and the JPEG's XMP, but a missing JPEG re-embeds nothing
 * into the SVG and an optimize toggle keeps the JPEG.
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
}

function planToggleDeltas(record: ExportRecord, input: PlanInput, need: Set<Stage>, rebuild: StagePlan["rebuild"]): void {
  if (record.tools.svgo.enabled !== input.optimize) {
    need.add("optimize");
    if (input.hasMetadata) need.add("embed");
    rebuild.svg = true;
  }
  if (input.includeEps && !record.tools.eps.enabled) {
    need.add("eps");
    rebuild.eps = true;
  }
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

/** The metadata block for a record (null until metadata is accepted). */
export function metadataBlock(meta: IconMetadata, args: {
  prompt: string;
  provider: string;
  model: string;
  requestId: string | null;
  usage: GeminiUsage;
  fingerprint: string;
  validation: MetadataValidation;
}): ExportRecord["metadata"] {
  return {
    state: args.validation.ok ? "accepted" : "invalid",
    title: meta.title,
    description: meta.description,
    tags: meta.tags,
    prompt: args.prompt,
    provider: args.provider,
    model: args.model,
    requestId: args.requestId,
    usage: args.usage,
    cost: null, // Gemini reports no cost — never invented (design §2.8)
    costBasis: "none",
    fingerprint: args.fingerprint,
    validation: args.validation,
  };
}
