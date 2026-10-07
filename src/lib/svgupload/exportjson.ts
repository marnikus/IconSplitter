// exportjson.ts — the per-icon package record (design §15). One JSON per icon
// inside `<pair folder>/export/`, never a global file, and it only REFERENCES the
// pair (the pair file stays the authority for approval and version history). It
// carries everything the request names: schema version, the source and version
// it came from with fingerprints, the effective settings with where each value
// came from, the resolved padding/stroke numbers and the DPI, the JPEG's real
// dimensions and megapixels, the tools and their versions, the accepted metadata
// with the exact prompt/model/tokens/cost, every output with its bytes and hash,
// the stage timestamps, the status and the redacted error. A corrupt record is a
// warning on the row — it never deletes the outputs beside it.

import { isRecord } from "../isrecord";
import type { PreviewBackground } from "../svgbackground";
import type { LengthUnit } from "./units";

export const EXPORT_SCHEMA = 1;

export type OutputFormat = "svg" | "jpg" | "eps";
export type ExportStatus = "processed" | "partial" | "failed" | "cancelled" | "stale";

export const STAGES = ["preflight", "prepare", "metadata", "render", "optimize", "embed", "eps", "validate", "commit"] as const;
export type StageName = (typeof STAGES)[number];

export interface SourceRef {
  pairId: string;
  base: string;
  dirPath: string;
  /** The chosen version's file, relative to the picked root. */
  svgPath: string;
  version: number;
  approvedAt: string | null;
  /** size:mtime of the source SVG at export time. */
  fingerprint: string;
}

export interface SettingsSnapshot {
  defaults: {
    padding: { value: number; unit: LengthUnit };
    outputScale: number;
    background: PreviewBackground;
    stroke: { enabled: boolean; value: number; unit: LengthUnit };
    jpeg: { targetMp: number; quality: number; profile: string };
    optimizeSvg: boolean;
    includeEps: boolean;
  };
  /** Fields this icon overrode; everything else follows the defaults above. */
  overrides: string[];
  resolved: {
    /** The unit convention every length was converted with (design C4). */
    dpi: number;
    paddingPx: { top: number; right: number; bottom: number; left: number };
    artboard: { w: number; h: number };
    scale: number;
    strokWidth: { targetPx: number; docWidth: number; factor: number | null; measuredPx: number | null };
  };
}

export interface MetadataRecord {
  policy: string;
  title: string;
  description: string;
  tags: string[];
  prompt: string;
  provider: string;
  model: string;
  requestId: string | null;
  tokens: { input: number | null; output: number | null; total: number | null };
  cost: { actual: number | null; estimated: number | null; currency: string; estimatedOnly: boolean };
  generatedAt: string;
}

export interface OutputRecord {
  format: OutputFormat;
  /** Path INSIDE the export folder — the package stays relocatable. */
  path: string;
  bytes: number;
  hash: string;
  width?: number;
  height?: number;
  mp?: number;
  quality?: number;
}

export interface ToolRecord {
  name: string;
  version: string;
  /** The exact configuration, recorded so a result can be reproduced. */
  config?: unknown;
}

export interface StageRecord {
  stage: StageName;
  at: string;
  ms: number;
  status: "ok" | "skipped" | "failed";
  note?: string;
}

export interface ExportRecord {
  v: number;
  pair: SourceRef;
  settings: SettingsSnapshot;
  metadata: MetadataRecord | null;
  tools: ToolRecord[];
  outputs: OutputRecord[];
  stages: StageRecord[];
  status: ExportStatus;
  /** Fingerprints the selective re-export decision reads (§17). */
  fingerprints: { source: string; settings: string; svg: string | null; jpeg: string | null };
  validation: { ok: boolean; errors: string[]; warnings: string[] };
  /** Safe, redacted — never a key and never a raw body. */
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/** FNV-1a, 32-bit, hex — the same content always hashes the same. */
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function hashBytes(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** A stable fingerprint of the settings that decide an export's bytes. */
export function fingerprintSettings(settings: SettingsSnapshot): string {
  return hashText(JSON.stringify({
    defaults: settings.defaults, overrides: [...settings.overrides].sort(), resolved: settings.resolved,
  }));
}

/** The record as it is written: pretty-printed, so a diff is readable. */
export function serializeExportRecord(record: ExportRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

export type ParseRecord = { ok: true; record: ExportRecord } | { ok: false; errors: string[] };

/** Tolerant read: a broken record is REPORTED, never trusted and never fatal. */
export function parseExportRecord(raw: unknown): ParseRecord {
  const errors: string[] = [];
  if (!isRecord(raw)) return { ok: false, errors: ["The export record is not an object."] };
  if (raw.v !== EXPORT_SCHEMA) errors.push(`The export record has schema version ${String(raw.v)}; this build writes ${EXPORT_SCHEMA}.`);
  if (!isRecord(raw.pair)) errors.push("The export record has no pair section.");
  if (!isRecord(raw.settings)) errors.push("The export record has no settings section.");
  if (!Array.isArray(raw.outputs)) errors.push("The export record has no outputs list.");
  if (!Array.isArray(raw.stages)) errors.push("The export record has no stage list.");
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, record: raw as unknown as ExportRecord };
}

export function parseExportRecordText(text: string): ParseRecord {
  try {
    return parseExportRecord(JSON.parse(text));
  } catch {
    return { ok: false, errors: ["The export record is not valid JSON."] };
  }
}

/** Only a package whose every requested output validated is green (§16). */
export function isGreen(record: ExportRecord): boolean {
  return record.status === "processed" && record.validation.ok;
}

/** The one wording for a status, used by the row, the log and the tests. */
export const STATUS_TEXT: Record<ExportStatus, string> = {
  processed: "Processed",
  partial: "Partial",
  failed: "Failed",
  cancelled: "Cancelled",
  stale: "Stale — the source changed",
};
