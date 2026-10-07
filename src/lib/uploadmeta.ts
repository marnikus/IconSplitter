// uploadmeta.ts — the metadata policy, pinned down (RULE 8/9). Owns: THE word
// count, the title split, the tag rules, the validator, the restricted-content
// warnings and the deterministic parsers for both reply shapes.
//
// Two decisions the brief contradicts itself about are settled here, once:
//   * tags are exactly 40 (the "50 keywords" note is superseded), and
//   * the title's word counts are the authority — the example phrase
//     "The Vector Icon of …" is not required, and example text can never
//     override what the validator checks.
//
// Nothing here promises legal clearance: warnings flag language a human should
// look at, and that is all they claim.

import { isRecord } from "./isrecord";

export const TAG_COUNT = 40;
export const REQUIRED_TAGS: readonly string[] = ["icon", "pictogram", "vector", "stroke", "line", "editable", "web"];
export const TITLE_WORDS: readonly [number, number] = [5, 7];
export const SUBTITLE_WORDS: readonly [number, number] = [3, 5];
export const DESCRIPTION_WORDS: readonly [number, number] = [7, 15];

export interface MetadataRecord {
  /** Sentence 1 (5–7 words) and sentence 2 (3–5 words), as one stored string. */
  title: string;
  description: string;
  tags: string[];
}

export interface MetadataCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export const EMPTY_METADATA: MetadataRecord = { title: "", description: "", tags: [] };

/**
 * THE word count. Runs of letters and digits, with internal hyphens and
 * apostrophes kept — "line-art" is ONE word — and bare punctuation ignored.
 * The title, the subtitle and the description all count with this one rule, so
 * no two places can disagree about what a word is.
 */
export function countWords(text: string): number {
  return text.match(/\p{L}[\p{N}\p{L}'’-]*/gu)?.length ?? 0;
}

/** The title's two sentences: the first ". " (or "!" / "?") ends sentence one. */
export function splitTitle(title: string): { main: string; subtitle: string } {
  const trimmed = title.trim();
  const match = /[.!?]\s+/.exec(trimmed);
  if (match === null) return { main: trimmed, subtitle: "" };
  const main = trimmed.slice(0, match.index + 1).replace(/\s*[.!?]$/, "").trim();
  const subtitle = trimmed.slice(match.index + match[0].length).replace(/\s*[.!?]$/, "").trim();
  return { main, subtitle };
}

export function validateMetadata(record: MetadataRecord): MetadataCheck {
  const errors: string[] = [];
  const { main, subtitle } = splitTitle(record.title);
  if (main === "") errors.push("Title is required");
  else if (countWords(main) < TITLE_WORDS[0] || countWords(main) > TITLE_WORDS[1]) {
    errors.push(`Title's first sentence must be ${TITLE_WORDS[0]}–${TITLE_WORDS[1]} words (got ${countWords(main)})`);
  }
  if (subtitle === "") errors.push(`Title needs a second sentence (${SUBTITLE_WORDS[0]}–${SUBTITLE_WORDS[1]} words)`);
  else if (countWords(subtitle) < SUBTITLE_WORDS[0] || countWords(subtitle) > SUBTITLE_WORDS[1]) {
    errors.push(`Title's second sentence must be ${SUBTITLE_WORDS[0]}–${SUBTITLE_WORDS[1]} words (got ${countWords(subtitle)})`);
  }
  if (record.description.trim() === "") errors.push("Description is required");
  else if (countWords(record.description) < DESCRIPTION_WORDS[0] || countWords(record.description) > DESCRIPTION_WORDS[1]) {
    errors.push(`Description must be ${DESCRIPTION_WORDS[0]}–${DESCRIPTION_WORDS[1]} words (got ${countWords(record.description)})`);
  }
  const tagErrors = tagProblems(record.tags);
  errors.push(...tagErrors);
  return { ok: errors.length === 0, errors, warnings: restrictedWarnings(record) };
}

function tagProblems(tags: readonly string[]): string[] {
  const errors: string[] = [];
  const cleaned = tags.map((tag) => tag.trim());
  if (cleaned.length !== TAG_COUNT) errors.push(`Tags must be exactly ${TAG_COUNT} (got ${cleaned.length})`);
  if (cleaned.some((tag) => tag === "")) errors.push("Tags must not contain empty entries");
  const seen = new Set<string>();
  const repeated: string[] = [];
  for (const tag of cleaned) {
    const key = tag.toLowerCase();
    if (seen.has(key) && !repeated.includes(key)) repeated.push(key);
    seen.add(key);
  }
  if (repeated.length > 0) errors.push(`Tags repeat: ${repeated.join(", ")}`);
  const missing = REQUIRED_TAGS.filter((required) => !seen.has(required));
  if (missing.length > 0) errors.push(`Tags must include: ${missing.join(", ")}`);
  return errors;
}

/**
 * Language that needs a human eye: style references, brand/logo wording, named
 * companies and named artists. A warning never blocks the export.
 */
export function restrictedWarnings(record: MetadataRecord): string[] {
  const text = `${record.title} ${record.description} ${record.tags.join(" ")}`;
  const found: string[] = [];
  for (const { label, pattern } of RESTRICTED) {
    const match = pattern.exec(text);
    if (match !== null) found.push(`${label}: "${match[0]}" (review required)`);
  }
  return found;
}

const RESTRICTED: readonly { label: string; pattern: RegExp }[] = [
  { label: "style reference", pattern: /in the style of|style of [a-z]/i },
  { label: "brand or logo wording", pattern: /\b(brand|branding|branded|logo|trademark|copyright)\b/i },
  { label: "named company", pattern: /\b(disney|nike|apple|google|microsoft|adidas|coca-cola)\b/i },
  { label: "named artist", pattern: /\b(van gogh|picasso|da vinci|monet|kandinsky)\b/i },
];

export interface ParsedMetadata {
  ok: boolean;
  record: MetadataRecord | null;
  errors: string[];
  /** True when at least one label was recognised (used to explain a refusal). */
  labelled: boolean;
}

/**
 * A non-structured reply, read line by line: a whole-answer regex cannot tell a
 * new label from a colon inside a value, and prose before the first label must
 * never be parsed as data. It is then run through the SAME validator, so a
 * parseable but invalid answer is reported as invalid.
 */
export function parseMetadataText(text: string): ParsedMetadata {
  const fields = labelledFields(text);
  const title = fields.title ?? "";
  const description = fields.description ?? "";
  const tags = fields.tags === undefined ? [] : splitTags(fields.tags);
  const missing: string[] = [];
  if (title === "") missing.push("no Title field");
  if (description === "") missing.push("no Description field");
  if (tags.length === 0) missing.push("no Tags field");
  const labelled = Object.keys(fields).length > 0;
  if (missing.length > 0) return { ok: false, record: null, errors: missing, labelled };
  const record: MetadataRecord = { title, description, tags };
  const errors = validateMetadata(record).errors;
  return { ok: errors.length === 0, record, errors, labelled };
}

/** label -> value, tolerating markdown decoration such as "**Title:**". */
function labelledFields(text: string): Partial<Record<"title" | "description" | "tags", string>> {
  const lines = text.split(/\r?\n/);
  const out: Partial<Record<"title" | "description" | "tags", string>> = {};
  for (const line of lines) {
    const label = /^\s*\*{0,2}\s*(title|description|tags)\s*\*{0,2}\s*:\s*(.*)$/i.exec(line);
    if (label === null) continue;
    const key = label[1].toLowerCase() as "title" | "description" | "tags";
    // Everything after the LABEL's colon, so a colon inside the value survives.
    const value = line.slice(line.indexOf(":") + 1).replace(/\*\*/g, "").trim();
    if (value !== "" && out[key] === undefined) out[key] = value;
  }
  return out;
}

export function metadataFromJson(raw: unknown): ParsedMetadata {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, record: null, errors: ["the answer was not an object"], labelled: false };
  }
  const value = raw as Record<string, unknown>;
  const record: MetadataRecord = { title: textOf(value.title), description: textOf(value.description), tags: tagsOf(value.tags) };
  const errors = missingFields(record);
  if (errors.length === 0) errors.push(...validateMetadata(record).errors);
  return { ok: errors.length === 0, record, errors, labelled: true };
}

/** A JSON string field: trimmed, and only when it really is a string. */
function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Tags arrive as an array (structured output) or as one comma-separated string. */
function tagsOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim());
  return typeof value === "string" ? splitTags(value) : [];
}

function missingFields(record: MetadataRecord): string[] {
  const errors: string[] = [];
  if (record.title === "") errors.push("no Title field");
  if (record.description === "") errors.push("no Description field");
  if (record.tags.length === 0) errors.push("no Tags field");
  return errors;
}

/** Tags from a comma-separated list; empty pieces are dropped. */
export function splitTags(value: string): string[] {
  return value.split(/[,;\n]/).map((tag) => tag.trim().replace(/^\*+|\*+$/g, "")).filter((tag) => tag !== "");
}

export function tagsLine(tags: readonly string[]): string {
  return tags.join(", ");
}

/** The copyable block shown next to a row. */
export function metadataText(record: MetadataRecord): string {
  return `Title: ${record.title}\nDescription: ${record.description}\nTags: ${tagsLine(record.tags)}`;
}

/** A defensive copy: nothing downstream may mutate an accepted record. */
export function copyMetadata(record: MetadataRecord): MetadataRecord {
  return { title: record.title, description: record.description, tags: [...record.tags] };
}

/** Stored payloads are untrusted: an unusable one reads as "no metadata yet". */
export function parseMetadataRecord(raw: unknown): MetadataRecord | null {
  if (!isRecord(raw) || typeof raw.title !== "string" || typeof raw.description !== "string") return null;
  const tags = Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === "string") : null;
  if (tags === null) return null;
  return { title: raw.title, description: raw.description, tags };
}
