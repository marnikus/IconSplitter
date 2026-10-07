// upexportread.ts — reading a committed package's record (report §7 phase 2).
// Owns: strict shape validation (a scan must be able to trust what it reads),
// the tolerant verdict for anything that is NOT this schema, and the visible
// classification of the three earlier donor schemas. A donor record is never
// half-read into this schema: their pair ids, hashes and output shapes do not
// mean the same things (the report's R24), so the honest answer is "re-export",
// shown to the user, never a silent reuse of unverifiable bytes.

import { sanitizeExportSettings } from "./upsettings";
import type { IconMetadata } from "./upmeta";
import { EXPORT_RECORD_VERSION, EXPORT_SCHEMA, type ExportRecord } from "./upexport";

export type RecordRead = { ok: true; record: ExportRecord } | { ok: false; reason: string };

/** Which earlier schema (if any) a stored record was written by. */
export type DonorSchema = "v1" | "svgupload-v1" | "unknown";

export interface ForeignRecord {
  donor: DonorSchema;
  /** True when the payload claims the shared-but-different v1 version number. */
  version: number | null;
  reason: string;
}

/**
 * Text → record. Anything that is not THIS schema is refused with a reason a
 * row can show; a donor record additionally names its origin so the UI can say
 * "re-export to adopt the current package layout".
 */
export function readExportRecord(text: string): RecordRead {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "the record is not parseable JSON" };
  }
  const record = validateExportRecord(raw);
  if (record !== null) return { ok: true, record };
  const foreign = classifyForeign(raw);
  return foreign === null
    ? { ok: false, reason: "the record does not match this schema" }
    : { ok: false, reason: `${foreign.reason} — re-export to adopt the current package layout` };
}

/** Names the foreign schema a payload looks like, or null when it is unreadable. */
export function classifyForeign(raw: unknown): ForeignRecord | null {
  if (!isRecord(raw)) return null;
  const version = typeof raw.v === "number" ? raw.v : null;
  const hasPair = raw.pairId !== undefined || raw.pair !== undefined;
  if (!hasPair) return null;
  if (version === 1) {
    // The base's v1 used `sha256` of a PATH, the other two stored their own
    // outputs differently; none of them can be verified here.
    return { donor: raw.iconBase !== undefined ? "v1" : "svgupload-v1", version, reason: "this package was written by an earlier schema (v1)" };
  }
  return { donor: "unknown", version, reason: "this package was written by an unrecognised schema" };
}

/**
 * Strict validation: every field present and typed. Metadata is shape-checked
 * (strings, tags a string array) — the committed values passed the policy
 * before they were written, and re-imposing today's word counts on a stored
 * record would turn a valid package "corrupt".
 */
export function validateExportRecord(raw: unknown): ExportRecord | null {
  if (!isRecord(raw) || raw.schema !== EXPORT_SCHEMA || raw.v !== EXPORT_RECORD_VERSION) return null;
  const top = validTop(raw);
  const source = validSource(raw.source);
  const outputs = validOutputs(raw.outputs);
  const provenance = validProvenance(raw.provenance);
  const requested = validRequested(raw.requested);
  if (top === null || source === null || outputs === null || provenance === null || requested === null) return null;
  if (!validMetadata(raw.metadata)) return null;
  return {
    schema: EXPORT_SCHEMA,
    v: EXPORT_RECORD_VERSION,
    ...top,
    source,
    settings: sanitizeExportSettings(raw.settings),
    metadata: raw.metadata,
    provenance,
    requested,
    outputs,
  };
}

interface RecordTop {
  pairId: string;
  iconBase: string;
  rootName: string;
  dirPath: string;
  generation: string;
  state: "processed" | "partial";
  failure: string | null;
  committedAt: string;
}

function validTop(raw: Record<string, unknown>): RecordTop | null {
  for (const key of ["pairId", "iconBase", "rootName", "generation", "committedAt"]) {
    if (!textOf(raw[key])) return null;
  }
  if (typeof raw.dirPath !== "string") return null; // the root itself is ""-relative
  if (raw.state !== "processed" && raw.state !== "partial") return null;
  if (raw.state === "partial" && typeof raw.failure !== "string") return null;
  return {
    pairId: raw.pairId as string,
    iconBase: raw.iconBase as string,
    rootName: raw.rootName as string,
    dirPath: raw.dirPath,
    generation: raw.generation as string,
    state: raw.state,
    failure: typeof raw.failure === "string" ? raw.failure : null,
    committedAt: raw.committedAt as string,
  };
}

function validSource(raw: unknown): ExportRecord["source"] | null {
  if (!isRecord(raw) || !textOf(raw.relPath) || !textOf(raw.sha256)) return null;
  if (!intOf(raw.version, 1) || !numberOf(raw.bytes, 0)) return null;
  return { relPath: raw.relPath, version: raw.version, sha256: raw.sha256, bytes: raw.bytes };
}

function validRequested(raw: unknown): ExportRecord["requested"] | null {
  if (!isRecord(raw) || raw.svg !== true || raw.jpeg !== true || typeof raw.eps !== "boolean") return null;
  return { svg: true, jpeg: true, eps: raw.eps };
}

/** The string fields a provenance must carry; checked as one table. */
const PROVENANCE_TEXT = ["prompt", "model", "endpointHost", "generatedAt", "policy"] as const;

interface ProvenanceShape {
  origin: "user" | "ai";
  prompt: string;
  model: string;
  endpointHost: string;
  generatedAt: string;
  policy: string;
  requestId: string | null;
}

function provenanceShaped(raw: Record<string, unknown>): raw is Record<string, unknown> & ProvenanceShape {
  if (raw.origin !== "user" && raw.origin !== "ai") return false;
  if (PROVENANCE_TEXT.some((k) => typeof raw[k] !== "string")) return false;
  return raw.requestId === null || typeof raw.requestId === "string";
}

function validProvenance(raw: unknown): ExportRecord["provenance"] | null {
  if (!isRecord(raw)) return null;
  if (!provenanceShaped(raw)) return null;
  return {
    origin: raw.origin,
    prompt: raw.prompt,
    model: raw.model,
    endpointHost: raw.endpointHost,
    requestId: raw.requestId,
    inputTokens: nullableInt(raw.inputTokens),
    outputTokens: nullableInt(raw.outputTokens),
    estimatedCostUsd: typeof raw.estimatedCostUsd === "number" ? raw.estimatedCostUsd : null,
    generatedAt: raw.generatedAt,
    policy: raw.policy,
  };
}

function validOutputs(raw: unknown): ExportRecord["outputs"] | null {
  if (!isRecord(raw)) return null;
  if (outputOf(raw.svg, ["relPath", "bytes", "sha256"]) === null || !optimizerOk(raw.svg)) return null;
  if (outputOf(raw.jpeg, ["relPath", "bytes", "sha256", "width", "height", "mpx", "quality"]) === null) return null;
  if (raw.eps != null && outputOf(raw.eps, ["relPath", "bytes", "sha256"]) === null) return null;
  return {
    svg: raw.svg as never,
    jpeg: raw.jpeg as never,
    eps: (raw.eps ?? null) as never,
  };
}

/** undefined/absent = unusable; null = the honest "not optimized" value. */
function optimizerOk(raw: unknown): boolean {
  if (!isRecord(raw)) return false;
  if (raw.optimizer === null) return true;
  const o = raw.optimizer;
  return isRecord(o) && textOf(o.version) && textOf(o.config)
    && typeof o.beforeBytes === "number" && typeof o.afterBytes === "number";
}

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

/** The pointer file's payload: a validated record plus its generation name. */
export function readPointer(text: string): { record: ExportRecord; generation: string } | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw) || raw.schema !== EXPORT_SCHEMA || raw.v !== EXPORT_RECORD_VERSION) return null;
  const record = validateExportRecord(raw.record);
  if (record === null || record.generation !== raw.generation) return null;
  return { record, generation: record.generation };
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

function numberOf(value: unknown, min: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min;
}

function nullableInt(value: unknown): number | null {
  return intOf(value, 0) ? value : null;
}
