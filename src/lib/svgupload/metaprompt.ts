// metaprompt.ts — the answer parser and the stored record (design §9/§10).
// One policy governs every answer, and it is composed of three modules that
// cannot drift apart: `metatags` (the seven mandatory keywords), `metaconst` (the
// counts and the prompt text that quotes them) and `metapolicy` (how the rules
// read text). This module is what makes the ANSWER pass through them: labelled
// blocks only — prose outside the blocks is an error, never merged into a field —
// plus the record shape a stored answer is read back as.

import { isRecord } from "../isrecord";
import { completeMeta, labelledBlocks, missingFieldErrors, partialOf, restrictedWarnings, validateMetadata, type MetaText } from "./metapolicy";

// The one public surface of the metadata vocabulary: the prompt the tab sends,
// the parser the answer goes through, the record that is stored — plus re-exports
// of the constants and rules, so a caller needs a single import.
export {
  DEFAULT_UPLOAD_PROMPT, DESC_WORDS, HOOK_WORDS, POLICY_ID, REQUIRED_TAGS_TEXT, TAG_COUNT, TITLE_WORDS,
} from "./metaconst";
export { REQUIRED_TAGS } from "./metatags";
export {
  restrictedWarnings, sentences, splitTags, tagsText, validateMetadata, wordCount, words, type MetaText,
} from "./metapolicy";

export interface ParseOk {
  ok: true;
  meta: MetaText;
  warnings: string[];
}

export interface ParseFail {
  ok: false;
  /** One sentence per problem, in the order the rules check them. */
  errors: string[];
  warnings: string[];
  /** Fields that were readable, so the UI can show what arrived. */
  partial: Partial<MetaText>;
  raw: string;
}

export type ParseOut = ParseOk | ParseFail;

/**
 * The strict answer parser: labelled blocks, nothing else. Explanation mixed into
 * or around the fields is an error — the caller regenerates or lets the user edit
 * the fields by hand, but no run may ever accept prose as metadata.
 */
export function parseMetadataAnswer(args: ParseArgs): ParseOut {
  const fields = labelledBlocks(args.text);
  const errors: string[] = [];
  const warnings: string[] = [];
  if (fields.leftover.trim() !== "") errors.push("The answer contains text outside the TITLE/DESCRIPTION/TAGS blocks.");
  const partial = partialOf(fields);
  errors.push(...missingFieldErrors(fields));
  if (args.finishReason === "length") errors.push("The answer was cut off at the token limit (truncated).");
  const meta = completeMeta(partial);
  if (meta !== null) errors.push(...validateMetadata(meta));
  warnings.push(...restrictedWarnings(meta ?? partial));
  if (errors.length > 0) return { ok: false, errors, warnings, partial, raw: args.text };
  return { ok: true, meta: meta as MetaText, warnings };
}

export interface ParseArgs {
  text: string;
  /** "length" when the provider stopped at the token ceiling (truncation). */
  finishReason?: string | null;
}

/** The exact request preview the user approves before anything is sent (§8). */
export function requestPreview(args: {
  prompt: string; model: string; baseUrl: string; image: { width: number; height: number; bytes: number };
}): string {
  return [
    `POST ${args.baseUrl.replace(/\/+$/, "")}/chat/completions`,
    `model: ${args.model}`,
    `image: ${args.image.width}×${args.image.height} px, ${args.image.bytes} bytes, image/jpeg (data URL)`,
    "",
    args.prompt,
  ].join("\n");
}

/** The record shape stored per icon; tolerant on read (RULE 13). */
export interface MetaRecord {
  pairId: string;
  title: string;
  description: string;
  tags: string[];
  /** ISO timestamp of the accepted answer. */
  at: string;
  prompt: string;
  provider: string;
  model: string;
  requestId: string | null;
  usage: { input: number | null; output: number | null; total: number | null };
  cost: { actual: number | null; estimated: number | null; currency: string };
  status: "accepted" | "rejected" | "interrupted" | "pending";
  errors: string[];
  warnings: string[];
  /** Source fingerprint the metadata was generated from (staleness, §17). */
  sourceFingerprint: string;
}

export function parseMetaRecord(raw: unknown): MetaRecord | null {
  if (!isRecord(raw) || typeof raw.pairId !== "string" || typeof raw.title !== "string") return null;
  return enforcePolicy({
    pairId: raw.pairId,
    title: raw.title,
    description: str(raw.description),
    tags: strList(raw.tags),
    at: str(raw.at),
    prompt: str(raw.prompt),
    provider: str(raw.provider),
    model: str(raw.model),
    requestId: strOrNull(raw.requestId),
    usage: usageOf(raw.usage),
    cost: costOf(raw.cost),
    status: statusOf(raw.status),
    errors: strList(raw.errors),
    warnings: strList(raw.warnings),
    sourceFingerprint: str(raw.sourceFingerprint),
  });
}

/**
 * A record that CLAIMS acceptance is still put through the policy before anyone
 * believes it: the same validator that refuses a provider answer must refuse a
 * hand-edited file too, or "invalid metadata can never produce an exported
 * package" would only hold for answers that arrived over the wire. A failure
 * DOWNGRADES the record — kept, visible, editable — and never deletes it.
 */
function enforcePolicy(record: MetaRecord): MetaRecord {
  if (record.status !== "accepted") return record;
  const errors = validateMetadata({ title: record.title, description: record.description, tags: record.tags });
  return errors.length === 0 ? record : { ...record, status: "rejected", errors };
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function usageOf(raw: unknown): MetaRecord["usage"] {
  const r = isRecord(raw) ? raw : {};
  return { input: numOrNull(r.input), output: numOrNull(r.output), total: numOrNull(r.total) };
}

function costOf(raw: unknown): MetaRecord["cost"] {
  const r = isRecord(raw) ? raw : {};
  return {
    actual: numOrNull(r.actual),
    estimated: numOrNull(r.estimated),
    currency: typeof r.currency === "string" && r.currency !== "" ? r.currency : "USD",
  };
}

/**
 * The status a reader trusts: one a writer actually wrote. A missing or unknown
 * status is NEVER a pass — it reads as "pending" (shown as "not generated yet"),
 * so a truncated file or a hand edit cannot turn itself into an exportable answer.
 */
function statusOf(value: unknown): MetaRecord["status"] {
  return value === "accepted" || value === "rejected" || value === "interrupted" || value === "pending"
    ? value
    : "pending";
}

function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
