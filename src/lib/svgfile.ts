// svgfile.ts — SVG naming, versioning and the per-file sidecar (prompt §12/§13).
// Owns: the versioned file names beside each AI image, the next-version rule
// (existing files + sidecar history), and the sidecar JSON model with tolerant
// parsing. There is deliberately NO global decision file: every AI image owns
// its own `<stem>.svg.json` history, and a missing sidecar simply means
// "not generated yet".

export const SIDECAR_VERSION = 1;
export const SVG_EXT = ".svg";

export type GenStatus = "generated" | "failed" | "interrupted";
export type ReviewStatus = "pending" | "approved" | "declined";

export interface TokenUsage {
  input: number | null;
  output: number | null;
  total: number | null;
}

/** Actual provider-reported cost wins; an estimate is labelled, never mixed. */
export interface CostInfo {
  actual: number | null;
  estimated: number | null;
  currency: string;
  /** Pricing note kept with an estimate so it can be reproduced later. */
  pricing: string | null;
}

export interface BatchRef {
  batchId: string;
  position: number;
  compositeHash: string;
  manifest: string;
}

export interface ValidationInfo {
  ok: boolean;
  errors: string[];
  warnings: string[];
  icons: number;
}

/** One generation attempt — one SVG version — with everything needed to audit it. */
export interface SvgVersion {
  version: number;
  svgPath: string;
  status: GenStatus;
  review: ReviewStatus;
  prompt: string;
  provider: string;
  model: string;
  requestedAt: string;
  completedAt: string | null;
  usage: TokenUsage;
  cost: CostInfo;
  validation: ValidationInfo;
  batch: BatchRef | null;
  /** Safe, redacted failure detail — never a key, never a raw dump. */
  error: string | null;
  requestId: string | null;
}

export interface SidecarSource {
  relPath: string;
  name: string;
  fingerprint: string;
}

export interface SvgSidecar {
  v: number;
  source: SidecarSource;
  versions: SvgVersion[];
}

export type ParseOut = { ok: true; sidecar: SvgSidecar } | { ok: false };

/** "fog_architecture_041_AI.png" -> "fog_architecture_041_AI". */
export function svgStem(aiName: string): string {
  const dot = aiName.lastIndexOf(".");
  return dot > 0 ? aiName.slice(0, dot) : aiName;
}

/** Sidecar file name that lives beside the AI image. */
export function sidecarName(stem: string): string {
  return `${stem}${SVG_EXT}.json`;
}

/** v1 keeps the plain name; v2+ are explicit (prompt §12 example). */
export function svgFileName(stem: string, version: number): string {
  return version <= 1 ? `${stem}${SVG_EXT}` : `${stem}_v${version}${SVG_EXT}`;
}

/** Version encoded in a file name, or null when it is not this stem's SVG. */
export function versionOfFileName(name: string, stem: string): number | null {
  if (name === `${stem}${SVG_EXT}`) return 1;
  const m = new RegExp(`^${escape(stem)}_v(\\d+)${escape(SVG_EXT)}$`).exec(name);
  return m ? Number(m[1]) : null;
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Next version to write: one past the highest version found on disk OR recorded
 * in the sidecar, so a regeneration can never overwrite an older SVG.
 */
export function nextVersion(stem: string, existingFiles: readonly string[], sidecar: SvgSidecar | null): number {
  const onDisk = existingFiles.map((n) => versionOfFileName(n, stem) ?? 0);
  const known = (sidecar?.versions ?? []).map((v) => v.version);
  return Math.max(0, ...onDisk, ...known) + 1;
}

export function newSidecar(source: SidecarSource): SvgSidecar {
  return { v: SIDECAR_VERSION, source, versions: [] };
}

/** Appends (or replaces) one version record; history order is preserved. */
export function withVersion(sidecar: SvgSidecar, rec: SvgVersion): SvgSidecar {
  const rest = sidecar.versions.filter((v) => v.version !== rec.version);
  return { ...sidecar, versions: [...rest, rec].sort((a, b) => a.version - b.version) };
}

/** Newest version that actually produced a valid SVG on disk. */
export function newestValid(sidecar: SvgSidecar | null): SvgVersion | null {
  const list = (sidecar?.versions ?? []).filter((v) => v.status === "generated" && v.validation.ok);
  return list.length > 0 ? list[list.length - 1] : null;
}

/** The version currently carrying an approval, if any. */
export function approvedVersion(sidecar: SvgSidecar | null): SvgVersion | null {
  const list = (sidecar?.versions ?? []).filter((v) => v.review === "approved");
  return list.length > 0 ? list[list.length - 1] : null;
}

export interface ReviewTally {
  pending: number;
  approved: number;
  declined: number;
}

export function tallyReviews(sidecar: SvgSidecar | null): ReviewTally {
  const out: ReviewTally = { pending: 0, approved: 0, declined: 0 };
  for (const v of sidecar?.versions ?? []) out[v.review]++;
  return out;
}

export function serializeSidecar(sidecar: SvgSidecar): string {
  return JSON.stringify(sidecar, null, 2);
}

/**
 * Reads a sidecar payload field by field: a wrong version, a bad record or a
 * half-damaged entry is dropped, never trusted and never fatal (RULE 13). The
 * SVG files on disk are untouched by a corrupt sidecar.
 */
export function parseSidecar(text: string): ParseOut {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false };
  }
  if (!isRecord(raw) || raw.v !== SIDECAR_VERSION || !isRecord(raw.source)) return { ok: false };
  if (!Array.isArray(raw.versions)) return { ok: false };
  const versions = raw.versions.flatMap((v) => (isVersion(v) ? [v] : []));
  return { ok: true, sidecar: { v: SIDECAR_VERSION, source: toSource(raw.source), versions } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toSource(raw: Record<string, unknown>): SidecarSource {
  return {
    relPath: str(raw.relPath),
    name: str(raw.name),
    fingerprint: str(raw.fingerprint),
  };
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isVersion(value: unknown): value is SvgVersion {
  if (!isRecord(value)) return false;
  return Number.isInteger(value.version) && (value.version as number) > 0
    && typeof value.svgPath === "string" && isGen(value.status) && isReview(value.review);
}

function isGen(value: unknown): boolean {
  return value === "generated" || value === "failed" || value === "interrupted";
}

function isReview(value: unknown): boolean {
  return value === "pending" || value === "approved" || value === "declined";
}
