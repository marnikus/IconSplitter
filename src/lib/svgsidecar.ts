// svgsidecar.ts — the per-file sidecar schema (design D4/D5). One JSON per AI
// source beside the image; missing = not generated, corrupt = warn but never
// delete SVGs (RULE 13). Versions are append-only; a record with an existing
// version number replaces it (a review change, not a regeneration).

export type SvgReview = "pending" | "approved" | "declined";
export type SvgStatus = "generated" | "failed" | "interrupted";

export interface SvgVersionRec {
  version: number;
  file: string;
  createdAt: string;
  prompt: string;
  provider: string;
  model: string;
  batchId: string | null;
  requestId: string | null;
  position: number | null;
  compositeHash: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  tokensTotal: number | null;
  cost: number | null;
  /** "estimated" cost is never shown as actual (spec §9) */
  costKind: "actual" | "estimated" | null;
  validationOk: boolean;
  validationWarnings: string[];
  review: SvgReview;
  status: SvgStatus;
  safeError: string | null;
}

export interface Sidecar {
  v: 1;
  sourceId: string;
  sourcePath: string;
  fingerprint: string;
  versions: SvgVersionRec[];
}

export function emptySidecar(sourceId: string, sourcePath: string, fingerprint: string): Sidecar {
  return { v: 1, sourceId, sourcePath, fingerprint, versions: [] };
}

export type SidecarParse = { ok: true; sidecar: Sidecar } | { ok: false };

export function parseSidecar(text: string): SidecarParse {
  try {
    const d: unknown = JSON.parse(text);
    if (typeof d !== "object" || d === null) return { ok: false };
    const x = d as Record<string, unknown>;
    if (!Array.isArray(x.versions)) return { ok: false };
    const versions = x.versions.map(toVersion).filter((v): v is SvgVersionRec => v !== null);
    const str = (v: unknown): string => (typeof v === "string" ? v : "");
    return { ok: true, sidecar: { v: 1, sourceId: str(x.sourceId), sourcePath: str(x.sourcePath), fingerprint: str(x.fingerprint), versions } };
  } catch {
    return { ok: false };
  }
}

function toVersion(r: unknown): SvgVersionRec | null {
  if (typeof r !== "object" || r === null) return null;
  const x = r as Record<string, unknown>;
  if (typeof x.version !== "number" || typeof x.file !== "string") return null;
  return {
    version: x.version, file: x.file, createdAt: strOf(x.createdAt), prompt: strOf(x.prompt),
    provider: strOf(x.provider), model: strOf(x.model),
    batchId: strOrNull(x.batchId), requestId: strOrNull(x.requestId),
    position: numOf(x.position), compositeHash: strOrNull(x.compositeHash),
    tokensIn: numOf(x.tokensIn), tokensOut: numOf(x.tokensOut), tokensTotal: numOf(x.tokensTotal),
    cost: numOf(x.cost), costKind: costKindOf(x.costKind),
    validationOk: x.validationOk !== false, validationWarnings: warningsOf(x.validationWarnings),
    review: reviewOfRaw(x.review), status: statusOfRaw(x.status), safeError: strOrNull(x.safeError),
  };
}

function strOf(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function numOf(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

function costKindOf(v: unknown): "actual" | "estimated" | null {
  return v === "actual" || v === "estimated" ? v : null;
}

function warningsOf(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((w): w is string => typeof w === "string") : [];
}

function reviewOfRaw(v: unknown): SvgReview {
  return v === "approved" || v === "declined" ? v : "pending";
}

function statusOfRaw(v: unknown): SvgStatus {
  return v === "failed" || v === "interrupted" ? v : "generated";
}

export function serializeSidecar(s: Sidecar): string {
  return JSON.stringify(s, null, 2);
}

export function addVersion(s: Sidecar, rec: SvgVersionRec): Sidecar {
  const rest = s.versions.filter((v) => v.version !== rec.version);
  return { ...s, versions: [...rest, rec].sort((a, b) => a.version - b.version) };
}

export function nextVersion(s: Sidecar): number {
  return s.versions.reduce((m, v) => Math.max(m, v.version), 0) + 1;
}

/** Newest version that validated and completed; invalid never previews. */
export function latestValid(s: Sidecar): SvgVersionRec | null {
  const valid = s.versions.filter((v) => v.status === "generated" && v.validationOk);
  return valid.length ? valid[valid.length - 1] : null;
}

export function reviewOf(s: Sidecar): SvgReview | null {
  return latestValid(s)?.review ?? null;
}
