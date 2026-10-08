// runexport.ts — the export pipeline for the "SVG to upload" tab (design §3.2).
// One icon: preflight → prepare → render → optimize → embed → eps → validate
// → commit, driven by the stage planner (selective re-export, §4.4). Every
// output is committed atomically (tmp → verify → overwrite → cleanup, RULE 23),
// `export.json` is written LAST (it is the commit marker), and a crash
// mid-commit leaves the last valid package in place. The approved source is
// never written. Failures are per-item and honest: EPS outside the subset →
// `partial` (SVG/JPEG stay committed), a validation failure → `failed` (the
// previous package stays), a cancel → `cancelled` (nothing new committed).

import { probePath, tryGetFile, type DirHandleLike } from "../lib/fs";
import { readJpegDimensions } from "../lib/upload/jpeg";
import type { RasterDeps } from "../lib/upload/raster";
import type { OptimizeRecord } from "../lib/upload/optimize";
import { buildArtifacts, StageError, type Artifacts } from "./exportstages";
import { validateArtifacts } from "./exportvalidate";
import { sha256HexText } from "../lib/upload/hash";
import { settingsFingerprint, type SettingsOverrides, type UploadSettings } from "../lib/upload/settings";
import { metadataFingerprint, type IconMetadata, type MetadataValidation } from "../lib/upload/meta";
import type { GeminiUsage } from "../lib/upload/gemini";
import { redact } from "../lib/svgsecret";
import {
  exportDirOf, metadataBlock, newExportRecord, planStages, stemOf,
  type ExportRecord, type Stage, type StagePlan,
} from "../lib/upload/export";

import { commitExport, type CommitExportInput, type CommitValidation } from "./exportcommit";
import type { UploadRowSource } from "./discovery";

export type ExportRunStatus = "processed" | "partial" | "failed" | "cancelled";

export interface ExportRunError { klass: string; detail: string }

export interface ExportRunResult {
  rowId: string;
  status: ExportRunStatus;
  stages: Stage[];
  /** The export/ relative paths of the committed outputs. */
  outputs: { svg: string | null; jpg: string | null; eps: string | null };
  record: ExportRecord | null;
  error: ExportRunError | null;
  /** What the run adjusted on its own and wants said (the EPS writer's fixes) — never a question. */
  notes: string[];
}

export interface ExportRunDeps {
  raster?: RasterDeps;
  now?: () => string;
}

export interface ExportRunArgs {
  root: DirHandleLike;
  row: UploadRowSource;
  /** Effective settings for this icon. */
  settings: UploadSettings;
  defaults: UploadSettings;
  overrides: SettingsOverrides;
  /** Accepted metadata (null = no embed stage). */
  metadata: IconMetadata | null;
  metadataInfo: {
    prompt: string; provider: string; model: string; requestId: string | null;
    usage: GeminiUsage; validation: MetadataValidation;
  } | null;
  /** The previous export.json, parsed (null = none/corrupt). */
  record: ExportRecord | null;
  signal?: AbortSignal;
  deps?: ExportRunDeps;
}

/** One icon's export run. */
export async function runExport(args: ExportRunArgs): Promise<ExportRunResult> {
  const plan = await planFor(args);
  if (plan.error !== null) {
    return { rowId: args.row.id, status: "failed", stages: [], outputs: outputsOf(args.record), record: args.record, error: plan.error, notes: [] };
  }
  if (plan.plan.stages.length === 0) {
    return {
      rowId: args.row.id, status: args.record?.status === "partial" ? "partial" : "processed", stages: [],
      outputs: outputsOf(args.record), record: args.record, error: null, notes: [],
    };
  }
  return runStages(args, plan);
}

// --- preflight + planner --------------------------------------------------------

interface PlanFor {
  plan: StagePlan;
  sourceText: string;
  sourceHash: string;
  exportDir: string;
  stem: string;
  error: ExportRunError | null;
}

async function planFor(args: ExportRunArgs): Promise<PlanFor> {
  const stem = stemOf(args.row.svgName);
  const exportDir = exportDirOf(args.row.dirPath);
  const sourceText = await readTextAt(args.root, args.row.svgPath);
  if (sourceText === null) {
    return { plan: { stages: [], rebuild: { svg: false, jpg: false, eps: false } }, sourceText: "", sourceHash: "", exportDir, stem, error: { klass: "preflight", detail: "the source SVG could not be read" } };
  }
  const sourceHash = `sha256:${await sha256HexText(sourceText)}`;
  const outputs = {
    svg: await existsAt(args.root, `${exportDir}/${stem}.svg`),
    jpg: await existsAt(args.root, `${exportDir}/${stem}.jpg`),
    eps: await existsAt(args.root, `${exportDir}/${stem}.eps`),
  };
  const plan = planStages(args.record, {
    sourceHash,
    settingsFp: settingsFingerprint(args.settings),
    metadataFp: args.metadata === null ? "" : metadataFingerprint(args.metadata),
    hasMetadata: args.metadata !== null,
    optimize: args.settings.optimizeSvg,
    includeEps: args.settings.includeEps,
    outputs,
  });
  return { plan, sourceText, sourceHash, exportDir, stem, error: null };
}

// --- the stages -----------------------------------------------------------------

async function runStages(args: ExportRunArgs, plan: PlanFor): Promise<ExportRunResult> {
  const { row, metadata } = args;
  try {
    checkCancel(args.signal);
    const art = await buildArtifacts(plan.plan, {
      root: args.root, sourceText: plan.sourceText, exportDir: plan.exportDir, stem: plan.stem,
      settings: args.settings, metadata: args.metadata, raster: args.deps?.raster,
      now: args.deps?.now?.() ?? new Date().toISOString(),
    });
    checkCancel(args.signal);
    const validation = validateArtifacts(art, metadata);
    if (!validation.svg || !validation.jpeg) {
      return failedResult({ rowId: row.id, stages: plan.plan.stages, record: args.record, klass: "validate", detail: validation.errors.join("; ") });
    }
    return await commitAll(args, plan, {
      art,
      record: await assembleRecord(args, plan, art),
      partial: plan.plan.rebuild.eps && art.epsText === null,
      validation,
    });
  } catch (error) {
    if (isCancel(error)) {
      return { rowId: row.id, status: "cancelled", stages: plan.plan.stages, outputs: outputsOf(args.record), record: args.record, error: { klass: "cancel", detail: "cancelled" }, notes: [] };
    }
    const klass = error instanceof StageError ? error.klass : "pipeline";
    const detail = error instanceof Error ? redact(error.message) : "unknown error";
    return failedResult({ rowId: row.id, stages: plan.plan.stages, record: args.record, klass, detail });
  }
}


/**
 * The record for this run (outputs/status/timestamps are filled at commit).
 * It starts from the PREVIOUS record's artifact facts — the outputs and the
 * JPEG block name files this run may not have rewritten, and a selective
 * re-export (one JPEG, one SVG) must never blank what the package already
 * holds. The commit fills, replaces and prunes them from what it writes.
 */
async function assembleRecord(args: ExportRunArgs, plan: PlanFor, art: Artifacts): Promise<ExportRecord> {
  const record = newExportRecord({
    pair: { id: args.row.id, base: args.row.base, suffix: args.row.suffix, dir: args.row.dirPath },
    source: { svgPath: args.row.svgPath, version: args.row.version, approval: "approved", fingerprint: plan.sourceHash },
    settings: {
      defaults: args.defaults, overrides: args.overrides, effective: args.settings,
      fingerprint: settingsFingerprint(args.settings),
    },
    svgo: art.optimizeRecord ?? passthroughOptimize(),
    epsEnabled: args.settings.includeEps,
    now: args.deps?.now?.() ?? new Date().toISOString(),
  });
  record.outputs = args.record?.outputs ?? record.outputs;
  record.tools.eps.fixes = art.epsFixes;
  record.jpeg = jpegBlock(art, args.settings.jpegQuality, args.record?.jpeg);
  record.metadata = metadataBlockOf(args);
  return record;
}

function jpegBlock(
  art: Artifacts, quality: number, prev?: ExportRecord["jpeg"],
): ExportRecord["jpeg"] {
  const dims = art.jpegRecord ?? (art.jpeg === null ? null : readJpegDimensions(art.jpeg));
  if (dims === null) return prev ?? { width: 0, height: 0, megapixels: 0, quality, profile: "baseline" };
  return {
    width: dims.width,
    height: dims.height,
    megapixels: (dims.width * dims.height) / 1e6,
    quality,
    profile: "baseline",
  };
}

function metadataBlockOf(args: ExportRunArgs): ExportRecord["metadata"] {
  if (args.metadata === null || args.metadataInfo === null) return null;
  return metadataBlock(args.metadata, { ...args.metadataInfo, fingerprint: metadataFingerprint(args.metadata) });
}

// --- commit ---------------------------------------------------------------------

/** What the commit stage needs beyond the args: the artifacts and the record. */
interface CommitPayload {
  art: Artifacts;
  record: ExportRecord;
  partial: boolean;
  validation: CommitValidation;
}

async function commitAll(args: ExportRunArgs, plan: PlanFor, payload: CommitPayload): Promise<ExportRunResult> {
  const committed = await commitExport(commitInput(args, plan, payload));
  const { art, partial } = payload;
  return {
    rowId: args.row.id,
    status: partial ? "partial" : "processed",
    stages: plan.plan.stages,
    outputs: committed.outputs,
    record: committed.record,
    error: partial ? { klass: "eps", detail: art.epsFailure ?? "the EPS stage failed" } : null,
    notes: art.epsFixes,
  };
}

function commitInput(args: ExportRunArgs, plan: PlanFor, payload: CommitPayload): CommitExportInput {
  const dims = payload.art.jpegRecord ?? (payload.art.jpeg === null ? null : readJpegDimensions(payload.art.jpeg));
  return {
    root: args.root,
    exportDir: plan.exportDir,
    stem: plan.stem,
    svgOut: payload.art.svgOut,
    jpeg: payload.art.jpeg,
    epsText: payload.art.epsText,
    metadata: args.metadata,
    jpegExpected: dims === null ? { width: 0, height: 0 } : { width: dims.width, height: dims.height },
    record: payload.record,
    partial: payload.partial,
    epsFailure: payload.art.epsFailure,
    validation: payload.validation,
    now: args.deps?.now?.() ?? new Date().toISOString(),
  };
}

// --- small helpers ----------------------------------------------------------------

function isCancel(error: unknown): boolean {
  return error instanceof StageError && error.klass === "cancel";
}

function checkCancel(signal?: AbortSignal): void {
  if (signal?.aborted) throw new StageError("cancel", "cancelled");
}

function failedResult(fail: { rowId: string; stages: Stage[]; record: ExportRecord | null; klass: string; detail: string }): ExportRunResult {
  return { rowId: fail.rowId, status: "failed", stages: fail.stages, outputs: outputsOf(fail.record), record: fail.record, error: { klass: fail.klass, detail: fail.detail }, notes: [] };
}

function outputsOf(record: ExportRecord | null): ExportRunResult["outputs"] {
  return {
    svg: record?.outputs.svg?.path ?? null,
    jpg: record?.outputs.jpg?.path ?? null,
    eps: record?.outputs.eps?.path ?? null,
  };
}

function passthroughOptimize(): OptimizeRecord {
  return { enabled: false, version: "", config: "", beforeBytes: 0, afterBytes: 0, beforeHash: "", afterHash: "" };
}

async function readTextAt(root: DirHandleLike, relPath: string): Promise<string | null> {
  const bytes = await readBytesAt(root, relPath);
  return bytes === null ? null : new TextDecoder().decode(bytes);
}

export async function readBytesAt(root: DirHandleLike, relPath: string): Promise<Uint8Array | null> {
  const at = relPath.lastIndexOf("/");
  const dir = at < 0 ? root : await probePath(root, relPath.slice(0, at));
  if (dir === null) return null;
  const fh = await tryGetFile(dir, relPath.slice(at + 1));
  if (fh === null) return null;
  try {
    return new Uint8Array(await (await fh.getFile()).arrayBuffer());
  } catch {
    return null;
  }
}

async function existsAt(root: DirHandleLike, relPath: string): Promise<boolean> {
  const at = relPath.lastIndexOf("/");
  const dir = at < 0 ? root : await probePath(root, relPath.slice(0, at));
  if (dir === null) return false;
  return (await tryGetFile(dir, relPath.slice(at + 1))) !== null;
}
