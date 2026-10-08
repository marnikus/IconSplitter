// meta.ts — the "SVG to upload" metadata domain (RULE 3): the exact
// default prompt sent to Gemini, the deterministic labeled-text parser, the
// validation rules, restricted-content warnings, and the fingerprint selective
// re-export keys on.
//
// The policy is a MINIMUM policy (2026-10-08): at least 10 unique tags
// including the 7 mandatory terms, a title of at least 5 words, a description
// of at least 7 words. Nothing is refused for being too long or too rich —
// a longer title, a fuller description and more tags always pass — because the
// only failure the field reported was a good answer being thrown away.
//
// The title has ONE shape rule that is normalized, never refused (stock
// review, 2026-10-08): it is ONE clean descriptive phrase — `cleanTitle`
// strips the trailing sentence punctuation AND cuts a second sentence, so
// "X. Icon of Y and Z" ships as "X" (the tags already carry Y and Z).

import { fnv1a32 } from "../pairing";

/** The minimum number of tags an answer must carry (more is always fine). */
export const TAGS_MIN = 10;
export const MANDATORY_TAGS = ["icon", "pictogram", "vector", "stroke", "line", "editable", "web"];
/** Minimum title length in words; there is no maximum. */
export const TITLE_MIN_WORDS = 5;
/** Minimum description length in words; there is no maximum. */
export const DESC_MIN_WORDS = 7;

/**
 * The default metadata prompt. Every output constraint the validator enforces
 * is stated here, and every minimum is stated as a minimum: the model is told
 * what it MUST have, never a ceiling it could trip over.
 */
export const DEFAULT_METADATA_PROMPT = `You write search metadata for a minimalist line icon being uploaded to a stock icon website. Study the icon image and describe the ABSTRACT IDEA it expresses — never a specific object, product, brand or place.

Answer with EXACTLY three lines and nothing else:

Title: <ONE phrase of at least 5 words naming the abstract idea — a single sentence, no second sentence, no trailing period>
Description: <a sentence of at least 7 words>
Tags: <at least 10 unique keywords, comma-separated, all lowercase>

Hard rules:
- Title: at least 5 words in ONE phrase — a single sentence, never two: a "." "!" "?" or "…" never ends it and never starts a second sentence after it, and there is no "Icon of X and Y" restatement of the tags (they already carry those words). Longer is fine.
- Description: at least 7 words — more is welcome; one or two sentences.
- Tags: at least 10 unique lowercase keywords, no duplicates, and the list MUST include these seven: icon, pictogram, vector, stroke, line, editable, web. More tags are welcome.
- Intellectual property: no brand names, no trademarks, no logos, no real people, no fictional characters, no artist names, and never "in the style of" anyone. Describe only the abstract idea.
- One line per field, no numbering, no extra commentary, no markdown.`;

export interface IconMetadata {
  title: string;
  description: string;
  tags: string[];
}

export interface MetadataValidation {
  ok: boolean;
  errors: string[];
  /** Restricted-content hits — warnings only, they never block (design §2). */
  warnings: string[];
}

/**
 * The model's answer → metadata. Deterministic: three labeled lines
 * (`Title:`, `Description:`, `Tags:` — label case-insensitive), tags split on
 * commas. Any missing label → null (the answer is rejected, never guessed).
 */
export function parseMetadata(text: string): IconMetadata | null {
  const title = labeled(text, "title");
  const description = labeled(text, "description");
  const tagsRaw = labeled(text, "tags");
  if (title === null || description === null || tagsRaw === null) return null;
  const tags = dedupeTags(tagsRaw.split(",").map((t) => t.trim()).filter((t) => t !== ""));
  return { title: cleanTitle(title), description: description.trim(), tags };
}

/** Trailing sentence punctuation stock sites flag (`.`, `!`, `,`, `;`, `:`, `…`) and whitespace, gone; a `?` stays. */
const TITLE_TAIL = /[\s.!,;:…]+$/u;

/** An end mark followed by more text — where a SECOND sentence starts inside a title. */
const SENTENCE_BREAK = /[.!?…]+(?=\s+\S)/u;

/**
 * The title as it is stored, shown and embedded (stock review, 2026-10-08):
 * ONE clean descriptive phrase. The trailing sentence punctuation goes, and so
 * does a second sentence — the reviewer's
 * "Collaborative Unity Promoting Collective Social Empathy. Icon of charity and
 * community." ships as "Collaborative Unity Promoting Collective Social
 * Empathy" (the second sentence only restated the tags). Applied wherever a
 * title enters — the model's answer, the user's edit at Accept, the
 * accepted-metadata cache on read and the record a reload reads back — so the
 * file, the XMP, export.json and the field always agree (RULE 24).
 */
export function cleanTitle(title: string): string {
  const flat = title.trim().replace(/\s+/gu, " ");
  const at = flat.search(SENTENCE_BREAK);
  return stripTail(at < 0 ? flat : flat.slice(0, at));
}

/** The one phrase's own trailing punctuation is never part of the title. */
function stripTail(text: string): string {
  return text.replace(TITLE_TAIL, "");
}

function labeled(text: string, label: string): string | null {
  const m = new RegExp(`^\\s*${label}\\s*:\\s*(.*)$`, "im").exec(text);
  return m === null ? null : m[1];
}

/** Whitespace-separated tokens; a hyphenated compound counts as one word. */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter((w) => w !== "").length;
}

/**
 * Validates the metadata against every rule; warnings never block. Duplicates
 * are REMOVED, never reported (2026-10-08, the user's rule): a repeated tag is
 * a noisy model, not a user mistake, so nothing is said about it anywhere — the
 * list is deduped (case-insensitively, first spelling wins) and the minimum
 * then counts what is really there.
 */
export function validateMetadata(meta: IconMetadata): MetadataValidation {
  const errors: string[] = [];
  checkMinWords(errors, "title", countWords(meta.title), TITLE_MIN_WORDS);
  checkMinWords(errors, "description", countWords(meta.description), DESC_MIN_WORDS);
  validateTags(dedupeTags(meta.tags), errors);
  return { ok: errors.length === 0, errors, warnings: restrictedWarnings(meta) };
}

/**
 * The tags as they will be stored and searched: case-insensitive duplicates
 * gone, the FIRST spelling of each kept, the order untouched. The same
 * normalization the mandatory-tag check uses.
 */
export function dedupeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const key = normalizeTag(tag);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(tag.trim());
  }
  return out;
}

/** A minimum, never a range: an answer richer than the minimum is accepted. */
function checkMinWords(errors: string[], what: string, count: number, min: number): void {
  if (count < min) errors.push(`${what} must be at least ${min} words (got ${count})`);
}

function validateTags(tags: string[], errors: string[]): void {
  if (tags.length < TAGS_MIN) errors.push(`tags must be at least ${TAGS_MIN} (got ${tags.length})`);
  const missing = MANDATORY_TAGS.filter((t) => !hasTag(tags, t));
  if (missing.length > 0) errors.push(`missing mandatory tags: ${missing.join(", ")}`);
}

function hasTag(tags: string[], tag: string): boolean {
  const key = normalizeTag(tag);
  return tags.some((t) => normalizeTag(t) === key);
}

/** Lowercase, punctuation-stripped at the edges; inner hyphens/spaces kept. */
function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
}

const RESTRICTED = ["™", "®", "©", "in the style of", "logo of"];

function restrictedWarnings(meta: IconMetadata): string[] {
  const haystack = `${meta.title} ${meta.description} ${meta.tags.join(" ")}`.toLowerCase();
  const hits = RESTRICTED.filter((needle) => haystack.includes(needle.toLowerCase()));
  return hits.map((needle) => `restricted content: "${needle}"`);
}

/** Stable fingerprint over the canonical field order — selective re-export keys on this. */
export function metadataFingerprint(meta: IconMetadata): string {
  const canonical = JSON.stringify([meta.title.trim(), meta.description.trim(), meta.tags.map(normalizeTag).join(",")]);
  return fnv1a32(canonical).toString(16).padStart(8, "0");
}
