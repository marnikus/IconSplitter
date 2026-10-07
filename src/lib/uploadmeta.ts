// uploadmeta.ts — the "SVG to upload" metadata domain (RULE 3): the exact
// default prompt sent to Gemini, the deterministic labeled-text parser, the
// validation rules (design §2.1–2.3: exactly 40 unique tags including the 7
// mandatory terms; title = a 5–7-word sentence + a 3–5-word sentence naming
// at least two of the tags; description 7–15 words), restricted-content
// warnings, and the fingerprint selective re-export keys on.

import { fnv1a32 } from "./pairing";

export const TAG_COUNT = 40;
export const MANDATORY_TAGS = ["icon", "pictogram", "vector", "stroke", "line", "editable", "web"];
export const TITLE_MIN_WORDS = 5;
export const TITLE_MAX_WORDS = 7;
export const TITLE2_MIN_WORDS = 3;
export const TITLE2_MAX_WORDS = 5;
export const TITLE2_NAMED_TAGS = 2;
export const DESC_MIN_WORDS = 7;
export const DESC_MAX_WORDS = 15;

/**
 * The default metadata prompt (design §2.1–2.3). Every output constraint the
 * validator enforces is stated here; the example phrasing from the feature
 * notes is deliberately NOT mandated.
 */
export const DEFAULT_METADATA_PROMPT = `You write search metadata for a minimalist line icon being uploaded to a stock icon website. Study the icon image and describe the ABSTRACT IDEA it expresses — never a specific object, product, brand or place.

Answer with EXACTLY three lines and nothing else:

Title: <one sentence of 5-7 words naming the abstract idea>. <one sentence of 3-5 words that names the 2 most relevant tags from your own tag list>
Description: <one sentence of 7-15 words>
Tags: <exactly 40 unique keywords, comma-separated, all lowercase>

Hard rules:
- Title: the first sentence has 5-7 words; the second sentence has 3-5 words and must name at least two of your 40 tags.
- Description: 7-15 words.
- Tags: exactly 40 unique lowercase keywords, no duplicates, and the list MUST include these seven: icon, pictogram, vector, stroke, line, editable, web.
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
  const tags = tagsRaw.split(",").map((t) => t.trim()).filter((t) => t !== "");
  return { title: title.trim(), description: description.trim(), tags };
}

function labeled(text: string, label: string): string | null {
  const m = new RegExp(`^\\s*${label}\\s*:\\s*(.*)$`, "im").exec(text);
  return m === null ? null : m[1];
}

/** Whitespace-separated tokens; a hyphenated compound counts as one word. */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter((w) => w !== "").length;
}

/** The title split on the FIRST ". " into its two sentences; null if not two. */
export function splitTitleSentences(title: string): [string, string] | null {
  const at = title.indexOf(". ");
  if (at < 0) return null;
  const first = title.slice(0, at).trim();
  const second = title.slice(at + 2).trim().replace(/\.$/, "").trim();
  if (first === "" || second === "" || second.includes(". ")) return null;
  return [first, second];
}

/** Validates the metadata against every rule; warnings never block. */
export function validateMetadata(meta: IconMetadata): MetadataValidation {
  const errors: string[] = [];
  validateTitle(meta, errors);
  checkWords(errors, "description", countWords(meta.description), { min: DESC_MIN_WORDS, max: DESC_MAX_WORDS });
  validateTags(meta.tags, errors);
  return { ok: errors.length === 0, errors, warnings: restrictedWarnings(meta) };
}

function validateTitle(meta: IconMetadata, errors: string[]): void {
  const sentences = splitTitleSentences(meta.title);
  if (sentences === null) {
    errors.push("title must be two sentences separated by \". \"");
    return;
  }
  const [first, second] = sentences;
  checkWords(errors, "title sentence 1", countWords(first), { min: TITLE_MIN_WORDS, max: TITLE_MAX_WORDS });
  checkWords(errors, "title sentence 2", countWords(second), { min: TITLE2_MIN_WORDS, max: TITLE2_MAX_WORDS });
  if (namedTags(second, meta.tags) < TITLE2_NAMED_TAGS) {
    errors.push(`title sentence 2 must name at least ${TITLE2_NAMED_TAGS} of the tags`);
  }
}

function checkWords(errors: string[], what: string, count: number, limit: { min: number; max: number }): void {
  if (count < limit.min || count > limit.max) {
    errors.push(`${what} must be ${limit.min}-${limit.max} words (got ${count})`);
  }
}

function validateTags(tags: string[], errors: string[]): void {
  if (tags.length !== TAG_COUNT) errors.push(`tags must be exactly ${TAG_COUNT} (got ${tags.length})`);
  const dupes = duplicates(tags);
  if (dupes.length > 0) errors.push(`duplicate tags: ${dupes.join(", ")}`);
  const missing = MANDATORY_TAGS.filter((t) => !hasTag(tags, t));
  if (missing.length > 0) errors.push(`missing mandatory tags: ${missing.join(", ")}`);
}

/** How many DISTINCT tags the sentence names (a tag word it contains). */
function namedTags(sentence: string, tags: string[]): number {
  const set = new Set(tags.map(normalizeTag));
  const named = new Set<string>();
  for (const word of sentence.toLowerCase().split(/\s+/)) {
    const tag = normalizeTag(word);
    if (tag !== "" && set.has(tag)) named.add(tag);
  }
  return named.size;
}

function duplicates(tags: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const tag of tags) {
    const key = normalizeTag(tag);
    if (seen.has(key)) dupes.add(tag);
    seen.add(key);
  }
  return [...dupes];
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
