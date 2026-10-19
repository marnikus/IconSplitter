// imgmodel.ts — one AI-source image version record (2026-10-16).
// Owns the AiVersion shape (status, review, prompt, provider/model, timestamps,
// token+cost placeholders — image models usually report no tokens — the
// image-validation result, batch reference, redacted error) and its tolerant
// parser. Mirrors src/lib/svgmodel.ts for raster versions. Pure: no files, no
// storage (RULE 3).

import { isRecord } from "./isrecord";

export const AI_SIDECAR_VERSION = 1;

export type ImgGenStatus = "original" | "generated" | "failed" | "interrupted";
export type ImgReviewStatus = "pending" | "approved" | "declined" | "needs-review";

export interface ImageTokenUsage {
  input: number | null;
  output: number | null;
  total: number | null;
}

export type CostBasis = "provider" | "rate-card" | "none";

export interface CostInfo {
  actual: number | null;
  estimated: number | null;
  currency: string;
  pricing: string;
  basis: CostBasis;
}

export const NO_COST: CostInfo = {
  actual: null, estimated: null, currency: "USD", pricing: "", basis: "none",
};

export interface BatchRef {
  batchId: string;
  position: number;
  compositeHash: string;
  manifest: string;
}

export interface ImageValidationInfo {
  ok: boolean;
  errors: string[];
  warnings: string[];
  width: number;
  height: number;
  bytes: number;
}

export interface AiVersion {
  version: number;
  /** Relative path from root to the saved image file; "" for failures. */
  imagePath: string;
  status: ImgGenStatus;
  review: ImgReviewStatus;
  prompt: string;
  provider: string;
  model: string;
  requestedAt: string;
  completedAt: string | null;
  usage: ImageTokenUsage;
  cost: CostInfo;
  validation: ImageValidationInfo;
  batch: BatchRef | null;
  error: string | null;
  requestId: string | null;
  /** Version this was generated from (0 = generated from the original). */
  fromVersion: number;
}

export function isImgStatus(v: unknown): v is ImgGenStatus {
  return v === "original" || v === "generated" || v === "failed" || v === "interrupted";
}

export function isImgReview(v: unknown): v is ImgReviewStatus {
  return v === "pending" || v === "approved" || v === "declined" || v === "needs-review";
}

/** Tolerant parser: a broken record is dropped, never crashes the file. */
export function parseAiVersion(raw: unknown): AiVersion | null {
  if (!isRecord(raw) || !isImgStatus(raw.status) || !isImgReview(raw.review)) return null;
  if (!Number.isInteger(raw.version) || (raw.version as number) <= 0) return null;
  if (typeof raw.imagePath !== "string") return null;
  return {
    version: raw.version as number,
    imagePath: raw.imagePath,
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
    fromVersion: intOr(raw.fromVersion, 0),
  };
}

function intOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isInteger(v) ? v : fallback;
}

function toCost(raw: unknown): CostInfo {
  if (!isRecord(raw)) return { ...NO_COST };
  return {
    actual: num(raw.actual), estimated: num(raw.estimated),
    currency: typeof raw.currency === "string" && raw.currency !== "" ? raw.currency : "USD",
    pricing: typeof raw.pricing === "string" ? raw.pricing : "",
    basis: isBasis(raw.basis) ? raw.basis : "none",
  };
}

function isBasis(v: unknown): v is CostBasis {
  return v === "provider" || v === "rate-card" || v === "none";
}

function toUsage(raw: unknown): ImageTokenUsage {
  const r = isRecord(raw) ? raw : {};
  return { input: num(r.input), output: num(r.output), total: num(r.total) };
}

function toValidation(raw: unknown): ImageValidationInfo {
  const r = isRecord(raw) ? raw : {};
  return {
    ok: r.ok === true,
    errors: strList(r.errors),
    warnings: strList(r.warnings),
    width: intOr(r.width, 0),
    height: intOr(r.height, 0),
    bytes: intOr(r.bytes, 0),
  };
}

function toBatch(raw: unknown): BatchRef | null {
  if (!isRecord(raw)) return null;
  return {
    batchId: str(raw.batchId),
    position: intOr(raw.position, 0),
    compositeHash: str(raw.compositeHash),
    manifest: str(raw.manifest),
  };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function nullableStr(v: unknown): string | null { return typeof v === "string" ? v : null; }
function str(v: unknown): string { return typeof v === "string" ? v : ""; }
function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
