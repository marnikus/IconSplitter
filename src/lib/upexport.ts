// upexport.ts — export.json schema v1 (design §9): the per-icon record that
// IS the commit. Owns: building the record from the stage outputs, the strict
// shape validation a scan relies on, and the tolerant read (a corrupt record
// is reported as such — never silently treated as "no export", never used to
// delete output files). The effective settings and accepted metadata are
// persisted here, so the record alone can decide "stale" later (upfinger).

import { sanitizeExportSettings, type ExportSettings } from "./upsettings";
import type { IconMetadata } from "./upmeta";

export const EXPORT_RECORD_VERSION = 1;

export interface OptimizerRecord {
  version: string;
  config: string;
  beforeBytes: number;
  afterBytes: number;
}

export interface SvgOutputRecord {
  relPath: string;
  bytes: number;
  sha256: string;
  optimizer: OptimizerRecord | null;
}

export interface JpegOutputRecord {
  relPath: string;
  bytes: number;
  sha256: string;
  width: number;
  height: number;
  mpx: number;
  quality: number;
}

export interface EpsOutputRecord {
  relPath: string;
  bytes: number;
}

export interface ExportRecord {
  v: typeof EXPORT_RECORD_VERSION;
  pairId: string;
  /** The pair's base name (the AI stem without `_AI`) — every output shares it. */
  iconBase: string;
  source: { relPath: string; version: number; sha256: string };
  settings: ExportSettings;
  metadata: IconMetadata;
  outputs: { svg: SvgOutputRecord; jpeg: JpegOutputRecord; eps: EpsOutputRecord | null };
  /** processed = every requested output committed; partial names the failure. */
  state: "processed" | "partial";
  failure: string | null;
  committedAt: string;
}

export interface BuildRecordArgs {
  pairId: string;
  iconBase: string;
  source: ExportRecord["source"];
  settings: ExportSettings;
  metadata: IconMetadata;
  outputs: ExportRecord["outputs"];
  state: ExportRecord["state"];
  failure: string | null;
  committedAt: string;
}

export function buildExportRecord(a: BuildRecordArgs): ExportRecord {
  return {
    v: EXPORT_RECORD_VERSION,
    pairId: a.pairId,
    iconBase: a.iconBase,
    source: a.source,
    settings: sanitizeExportSettings(a.settings),
    metadata: a.metadata,
    outputs: a.outputs,
    state: a.state,
    failure: a.state === "partial" ? a.failure : null,
    committedAt: a.committedAt,
  };
}

export function serializeExportRecord(r: ExportRecord): string {
  return JSON.stringify(r);
}

export type RecordRead = { ok: true; record: ExportRecord } | { ok: false; reason: string };

/** Text → record; anything off-spec is an honest failure with a reason. */
export function readExportRecord(text: string): RecordRead {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "export.json is not parseable JSON" };
  }
  const record = validateExportRecord(raw);
  return record === null ? { ok: false, reason: "export.json does not match schema v1" } : { ok: true, record };
}

/**
 * Strict shape validation (RULE 4): every field must be present and typed.
 * Metadata is shape-checked (strings, tags a string array) — the committed
 * values were rule-validated before they were written; re-imposing today's
 * word counts on a stored record would turn a valid package "corrupt".
 */
export function validateExportRecord(raw: unknown): ExportRecord | null {
  if (!isRecord(raw) || raw.v !== EXPORT_RECORD_VERSION) return null;
  const source = validSource(raw.source);
  const outputs = validOutputs(raw.outputs);
  const top = validTop(raw);
  if (source === null || outputs === null || top === null) return null;
  if (!validMetadata(raw.metadata)) return null;
  return {
    v: EXPORT_RECORD_VERSION,
    ...top,
    source,
    settings: sanitizeExportSettings(raw.settings),
    metadata: raw.metadata,
    outputs,
  };
}

interface RecordTop {
  pairId: string;
  iconBase: string;
  state: "processed" | "partial";
  failure: string | null;
  committedAt: string;
}

/** Identity, state and timestamp — everything except source/metadata/outputs. */
function validTop(raw: Record<string, unknown>): RecordTop | null {
  if (!textOf(raw.pairId) || !textOf(raw.iconBase) || !textOf(raw.committedAt)) return null;
  if (raw.state !== "processed" && raw.state !== "partial") return null;
  if (raw.state === "partial" && typeof raw.failure !== "string") return null;
  return {
    pairId: raw.pairId,
    iconBase: raw.iconBase,
    state: raw.state,
    failure: typeof raw.failure === "string" ? raw.failure : null,
    committedAt: raw.committedAt,
  };
}

function validSource(raw: unknown): ExportRecord["source"] | null {
  if (!isRecord(raw) || !textOf(raw.relPath) || !textOf(raw.sha256)) return null;
  return intOf(raw.version, 1) ? { relPath: raw.relPath, version: raw.version, sha256: raw.sha256 } : null;
}

function validOutputs(raw: unknown): ExportRecord["outputs"] | null {
  if (!isRecord(raw)) return null;
  const svgOk = outputOf(raw.svg, ["relPath", "bytes", "sha256"]) !== null
    && optimizerOf(raw.svg) !== undefined;
  const jpegOk = outputOf(raw.jpeg, ["relPath", "bytes", "sha256", "width", "height", "mpx", "quality"]) !== null;
  const epsOk = raw.eps == null || outputOf(raw.eps, ["relPath", "bytes"]) !== null;
  if (!svgOk || !jpegOk || !epsOk) return null;
  return {
    svg: raw.svg as unknown as SvgOutputRecord,
    jpeg: raw.jpeg as unknown as JpegOutputRecord,
    eps: (raw.eps ?? null) as unknown as EpsOutputRecord | null,
  };
}

/** undefined = svg record unusable; null = no optimizer (the honest no-op). */
function optimizerOf(raw: unknown): OptimizerRecord | null | undefined {
  if (!isRecord(raw)) return undefined;
  if (raw.optimizer === null) return null;
  return validOptimizer(raw.optimizer) ? raw.optimizer : undefined;
}

function validOptimizer(raw: unknown): raw is OptimizerRecord {
  return isRecord(raw) && textOf(raw.version) && textOf(raw.config)
    && typeof raw.beforeBytes === "number" && typeof raw.afterBytes === "number";
}

/** Output fields that are text, not numbers (relPath, sha256). */
const TEXT_FIELDS = new Set(["relPath", "sha256"]);

function outputOf(raw: unknown, fields: string[]): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;
  for (const f of fields) {
    const v = raw[f];
    if (TEXT_FIELDS.has(f)) {
      if (typeof v !== "string" || v.trim() === "") return null;
    } else if (typeof v !== "number" || !Number.isFinite(v)) {
      return null;
    }
  }
  return raw;
}

function validMetadata(raw: unknown): raw is IconMetadata {
  if (!isRecord(raw)) return false;
  if (!textOf(raw.title) || !textOf(raw.description)) return false;
  return Array.isArray(raw.tags) && raw.tags.length > 0 && raw.tags.every((t) => typeof t === "string" && t.trim() !== "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function intOf(value: unknown, min: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min;
}
