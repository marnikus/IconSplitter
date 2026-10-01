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

export type CostBasis = "provider" | "batch-split" | "rate-card" | "none";

/** Actual provider-reported cost wins; an estimate is labelled, never mixed. */
export interface CostInfo {
  actual: number | null;
  estimated: number | null;
  currency: string;
  /** Pricing-table version in force when the record was written; "" = unknown. */
  pricing: string;
  /** How the number was obtained — provider-reported is never an estimate. */
  basis: CostBasis;
}

export const NO_COST: CostInfo = { actual: null, estimated: null, currency: "USD", pricing: "", basis: "none" };

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
  const versions = raw.versions.flatMap((v) => toVersion(v) ?? []);
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

/**
 * One version record built field by field: a hand-edited or older sidecar can
 * therefore never crash a row, and a missing cost reads back as "unknown"
 * instead of failing the whole file (RULE 13).
 */
function toVersion(raw: unknown): SvgVersion | null {
  if (!isRecord(raw) || !isGen(raw.status) || !isReview(raw.review)) return null;
  if (!Number.isInteger(raw.version) || (raw.version as number) <= 0 || typeof raw.svgPath !== "string") return null;
  return {
    version: raw.version as number,
    svgPath: raw.svgPath,
    status: raw.status,
    review: raw.review,
    prompt: str(raw.prompt),
    provider: str(raw.provider),
    model: str(raw.model),
    requestedAt: str(raw.requestedAt),
    completedAt: nullableStr(raw.completedAt),
    usage: toUsage(raw.usage),
    cost: toCost(raw.cost),
    validation: toValidation(raw.validation),
    batch: toBatch(raw.batch),
    error: nullableStr(raw.error),
    requestId: nullableStr(raw.requestId),
  };
}

function toCost(raw: unknown): CostInfo {
  if (!isRecord(raw)) return { ...NO_COST };
  const actual = numOrNull(raw.actual);
  const estimated = numOrNull(raw.estimated);
  return {
    actual,
    estimated,
    currency: typeof raw.currency === "string" && raw.currency !== "" ? raw.currency : "USD",
    pricing: typeof raw.pricing === "string" ? raw.pricing : "",
    basis: isBasis(raw.basis) ? raw.basis : deriveBasis(actual, estimated),
  };
}

/** Old records carry no basis; the numbers they hold say where they came from. */
function deriveBasis(actual: number | null, estimated: number | null): CostBasis {
  if (actual !== null) return "provider";
  return estimated !== null ? "batch-split" : "none";
}

function toUsage(raw: unknown): TokenUsage {
  const r = isRecord(raw) ? raw : {};
  return { input: numOrNull(r.input), output: numOrNull(r.output), total: numOrNull(r.total) };
}

function toValidation(raw: unknown): ValidationInfo {
  const r = isRecord(raw) ? raw : {};
  return { ok: r.ok === true, errors: strList(r.errors), warnings: strList(r.warnings), icons: numOrNull(r.icons) ?? 0 };
}

function toBatch(raw: unknown): BatchRef | null {
  if (!isRecord(raw)) return null;
  return { batchId: str(raw.batchId), position: numOrNull(raw.position) ?? 0, compositeHash: str(raw.compositeHash), manifest: str(raw.manifest) };
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableStr(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function isBasis(value: unknown): value is CostBasis {
  return value === "provider" || value === "batch-split" || value === "rate-card" || value === "none";
}

function isGen(value: unknown): value is GenStatus {
  return value === "generated" || value === "failed" || value === "interrupted";
}

function isReview(value: unknown): value is ReviewStatus {
  return value === "pending" || value === "approved" || value === "declined";
}
