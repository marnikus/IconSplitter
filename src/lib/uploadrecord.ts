// uploadrecord.ts — the per-icon `export.json` (RULE 11). Owns: the record
// shape, the fingerprints that decide what a re-export may reuse, the hash of
// an output and the tolerant reader that lets a corrupt record be rebuilt
// instead of taking valid files down with it.
//
// Fingerprints answer one question each: "did the thing this stage depends on
// change?" source = the approved file's bytes + version; settings = the
// effective settings; metadata = the accepted record; tools = the optimiser and
// EPS generator versions. Their composition is what makes selective re-export
// possible without ever reusing a stale output silently.

import type { MetadataRecord, MetadataCheck } from "./uploadmeta";
import type { UploadSettings, ColorProfile } from "./uploadsettings";
import type { OverridePatch } from "./uploadoverride";

export const RECORD_VERSION = 1;
export const RECORD_NAME = "export.json";

export type ExportStatus = "pending" | "processing" | "processed" | "partial" | "failed" | "cancelled" | "stale";

export type OutputFormat = "svg" | "jpeg" | "eps";

export interface OutputFile {
  format: OutputFormat;
  /** File name inside the icon's export folder — relative, never a full path. */
  name: string;
  bytes: number;
  hash: string;
  width: number | null;
  height: number | null;
}

export interface ExportFingerprints {
  source: string;
  settings: string;
  metadata: string;
  tools: string;
}

export interface ExportRecord {
  version: number;
  iconId: string;
  iconName: string;
  sourcePath: string;
  sourceHash: string;
  /** The approved version this package was built from (stable id, not a label). */
  sourceVersion: string;
  settings: UploadSettings;
  override: OverridePatch;
  effective: UploadSettings;
  /** Pixels per inch the JPEG was rasterised at, written out explicitly. */
  dpi: number;
  strokePx: number;
  jpeg: { width: number; height: number; megapixels: number; quality: number; profile: ColorProfile } | null;
  svgo: { enabled: boolean; version: string; beforeBytes: number; afterBytes: number; differences: string[] } | null;
  eps: { enabled: boolean; widthPt: number; heightPt: number; features: string[]; verdict: string } | null;
  metadata: MetadataRecord;
  metadataCheck: MetadataCheck | null;
  metadataAcceptedAt: string | null;
  prompt: { text: string; structured: boolean } | null;
  provider: { name: string; model: string; requestId: string | null } | null;
  tokens: { input: number; output: number; total: number } | null;
  cost: { amount: number | null; currency: string; basis: string; estimated: boolean } | null;
  outputs: OutputFile[];
  warnings: string[];
  /** Recovery state: a run that was cut short says so and is never auto-active. */
  interrupted: boolean;
  stage: string;
  status: ExportStatus;
  validation: { ok: boolean; problems: string[] };
  error: string | null;
  generatedAt: string;
  committedAt: string | null;
  fingerprints: ExportFingerprints;
}

/** FNV-1a over the bytes, plus the length — stable, fast, no dependencies. */
export function hashBytes(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${hash.toString(16).padStart(8, "0")}-${bytes.length.toString(16)}`;
}

export function hashText(text: string): string {
  return hashBytes(new TextEncoder().encode(text));
}

/** What the visuals were built from: the file's bytes AND its approved version. */
export function sourceFingerprint(input: { hash: string; version: string }): string {
  return `${input.hash}:${input.version}`;
}

export function settingsFingerprint(settings: UploadSettings, override: OverridePatch): string {
  return hashText(`${JSON.stringify(settings)}|${JSON.stringify(sorted(override))}`);
}

export function metadataFingerprint(record: MetadataRecord): string {
  return hashText(`${record.title}\u0000${record.description}\u0000${record.tags.join(",")}`);
}

export function toolsFingerprint(parts: { svgo: string | null; eps: string | null; dpi: number }): string {
  return hashText(`${parts.svgo ?? "-"}|${parts.eps ?? "-"}|${parts.dpi}`);
}

function sorted(patch: OverridePatch): OverridePatch {
  return Object.fromEntries(Object.entries(patch).sort(([a], [b]) => a.localeCompare(b))) as OverridePatch;
}

export function outputsOf(record: ExportRecord): Record<OutputFormat, OutputFile | null> {
  return {
    svg: record.outputs.find((o) => o.format === "svg") ?? null,
    jpeg: record.outputs.find((o) => o.format === "jpeg") ?? null,
    eps: record.outputs.find((o) => o.format === "eps") ?? null,
  };
}

/** A green package: every requested output is present and validated. */
export function isGreen(record: ExportRecord): boolean {
  return record.status === "processed" && record.validation.ok && !record.interrupted && record.outputs.length > 0;
}

/**
 * A record read from disk. Anything that cannot be trusted returns null — the
 * caller then rebuilds from scratch, which is slower but never wrong. A file
 * that is merely missing fields keeps the fields it does have: partial recovery
 * beats throwing away a package that is 90% intact.
 */
export function parseRecord(raw: unknown): ExportRecord | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.version !== "number" || typeof value.iconId !== "string") return null;
  const outputs = Array.isArray(value.outputs) ? value.outputs.filter(isOutput) : [];
  return { ...(raw as ExportRecord), version: value.version, outputs };
}

function isOutput(value: unknown): value is OutputFile {
  if (typeof value !== "object" || value === null) return false;
  const out = value as Record<string, unknown>;
  return typeof out.name === "string" && typeof out.hash === "string" && typeof out.bytes === "number"
    && (out.format === "svg" || out.format === "jpeg" || out.format === "eps");
}

/** One line for the row and the log: what this package is and whether it is complete. */
export function recordSummary(record: ExportRecord): string {
  const formats = record.outputs.map((o) => o.format.toUpperCase()).join("+");
  return `${record.status}${record.interrupted ? " (interrupted)" : ""} · ${formats} · ${record.stage}`;
}

/** The fields a re-export compares: an unknown field must not force a rebuild. */
export function changedFields(a: ExportFingerprints, b: ExportFingerprints): (keyof ExportFingerprints)[] {
  return (Object.keys(a) as (keyof ExportFingerprints)[]).filter((key) => a[key] !== b[key]);
}
