// svgmodel.ts — one SVG version record (prompt §12/§13).
// Owns: the version shape (generation status, review status, prompt, provider
// and model, timestamps, tokens, cost with its basis and pricing version, the
// validation result, the batch reference and the redacted error) plus its
// tolerant parser. It is the INNER half of a pair file (`lib/pairmeta`): it
// knows nothing about files, folders or storage.

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

export function isGen(value: unknown): value is GenStatus {
  return value === "generated" || value === "failed" || value === "interrupted";
}

export function isReview(value: unknown): value is ReviewStatus {
  return value === "pending" || value === "approved" || value === "declined";
}

/**
 * One version record built field by field: a hand-edited or older file can
 * therefore never crash a row, and a missing cost reads back as "unknown"
 * instead of failing the whole file (RULE 13). A record without a version
 * number, status or review is dropped by the caller.
 */
export function parseVersion(raw: unknown): SvgVersion | null {
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

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function isBasis(value: unknown): value is CostBasis {
  return value === "provider" || value === "batch-split" || value === "rate-card" || value === "none";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
