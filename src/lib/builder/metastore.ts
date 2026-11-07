// metastore.ts — the sheet's metadata RECORD (design §4.4): what was generated,
// which sheet it describes, and whether it still describes the one on screen.
//
// Three things it deliberately does not hold: the request body (never stored), the
// sheet's SVG source (re-derivable, and a copy would go stale silently), and the
// API key (never leaves the keyvault, never seen here).
//
// `fingerprint` binds a record to its sheet. A record whose fingerprint no longer
// matches is STALE — shown as "describes an earlier sheet", never as current, and
// never silently re-sent (a re-send costs money and discloses the sheet again).

import { dedupeTags, type IconMetadata, type MetadataValidation } from "../upload/meta";

export const META_RECORD_VERSION = 1;

export type MetaState = "empty" | "generated" | "invalid" | "accepted" | "interrupted";

export interface SheetMetaRecord {
  version: number;
  state: MetaState;
  title: string;
  description: string;
  tags: string[];
  /** The exact effective prompt that produced this answer. */
  prompt: string;
  provider: string;
  model: string;
  usage: { input: number | null; output: number | null; total: number | null };
  validation: MetadataValidation;
  /** What was disclosed: the sheet's own source, or its digest. */
  disclosure: { mode: "svg" | "digest"; chars: number; icons: number };
  /** Binds the record to the exact sheet it describes. */
  fingerprint: string;
}

/** The record before anything was generated. */
export function emptyMetaRecord(): SheetMetaRecord {
  return {
    version: META_RECORD_VERSION,
    state: "empty",
    title: "",
    description: "",
    tags: [],
    prompt: "",
    provider: "Gemini",
    model: "",
    usage: { input: null, output: null, total: null },
    validation: { ok: false, errors: [], warnings: [] },
    disclosure: { mode: "svg", chars: 0, icons: 0 },
    fingerprint: "",
  };
}

/** A record built from a validated answer. */
export function recordOf(args: {
  meta: IconMetadata;
  validation: MetadataValidation;
  prompt: string;
  model: string;
  usage: { input: number | null; output: number | null; total: number | null };
  disclosure: { mode: "svg" | "digest"; chars: number; icons: number };
  fingerprint: string;
  state: "generated" | "invalid";
}): SheetMetaRecord {
  return {
    ...emptyMetaRecord(),
    state: args.state,
    title: args.meta.title,
    description: args.meta.description,
    tags: dedupeTags(args.meta.tags),
    prompt: args.prompt,
    model: args.model,
    usage: args.usage,
    validation: args.validation,
    disclosure: args.disclosure,
    fingerprint: args.fingerprint,
  };
}

/** Whether a stored record still describes the sheet in front of the user. */
export function staleOf(record: SheetMetaRecord | null, fingerprint: string): boolean {
  return record !== null && record.state !== "empty" && record.fingerprint !== fingerprint;
}

/** The stored payload: `{ v, record }` or `{ v, record: null }`. */
export function serializeMetaRecord(record: SheetMetaRecord | null): string {
  return JSON.stringify({ v: META_RECORD_VERSION, record });
}

/** Read-side validation: one bad field costs the record, never the app (RULE 13). */
export function parseMetaRecord(raw: unknown): SheetMetaRecord | null {
  const r = recordPayloadOf(raw);
  if (r === null) return null;
  return {
    version: META_RECORD_VERSION,
    state: r.state,
    title: r.title,
    description: r.description,
    tags: dedupeTags(r.tags),
    prompt: r.prompt,
    provider: r.provider,
    model: r.model,
    usage: usageOf(r.usage),
    validation: validationOf(r.validation),
    disclosure: disclosureOf(r.disclosure),
    fingerprint: r.fingerprint,
  };
}

/** The payload's plain fields, already narrowed — or null if any is not what it claims. */
interface PayloadText {
  state: MetaState;
  title: string;
  description: string;
  tags: string[];
  prompt: string;
  provider: string;
  model: string;
  fingerprint: string;
  usage: Record<string, unknown>;
  validation: Record<string, unknown>;
  disclosure: Record<string, unknown>;
}

function recordPayloadOf(raw: unknown): PayloadText | null {
  if (!isRecord(raw) || raw.v !== META_RECORD_VERSION || !isRecord(raw.record)) return null;
  const r = raw.record;
  if (!isState(r.state) || !isTexts([r.title, r.description, r.prompt, r.provider, r.model, r.fingerprint])) return null;
  if (!isTags(r.tags)) return null;
  if (!isRecord(r.usage) || !isRecord(r.validation) || !isRecord(r.disclosure)) return null;
  return {
    state: r.state, title: r.title as string, description: r.description as string, tags: r.tags,
    prompt: r.prompt as string, provider: r.provider as string, model: r.model as string,
    fingerprint: r.fingerprint as string, usage: r.usage, validation: r.validation, disclosure: r.disclosure,
  };
}

/** Every value is a string. */
function isTexts(values: unknown[]): boolean {
  return values.every((value) => typeof value === "string");
}

/** A string array. */
function isTags(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isState(value: unknown): value is MetaState {
  return value === "empty" || value === "generated" || value === "invalid" || value === "accepted" || value === "interrupted";
}

function usageOf(raw: Record<string, unknown>): SheetMetaRecord["usage"] {
  return { input: countOf(raw.input), output: countOf(raw.output), total: countOf(raw.total) };
}

function countOf(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function validationOf(raw: Record<string, unknown>): MetadataValidation {
  return {
    ok: raw.ok === true,
    errors: stringsOf(raw.errors),
    warnings: stringsOf(raw.warnings),
  };
}

function stringsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function disclosureOf(raw: Record<string, unknown>): SheetMetaRecord["disclosure"] {
  return {
    mode: raw.mode === "digest" ? "digest" : "svg",
    chars: countOf(raw.chars) ?? 0,
    icons: countOf(raw.icons) ?? 0,
  };
}
