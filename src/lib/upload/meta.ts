// meta.ts — the "SVG to upload" metadata domain (RULE 3): the exact
// default prompt sent to Gemini, the deterministic labeled-text parser, the
// minimum metadata rules, restricted-content warnings, and the fingerprint
// selective re-export keys on.

import { fnv1a32 } from "../pairing";

export const TAG_MIN_COUNT = 10;
export const MANDATORY_TAGS = ["icon", "pictogram", "vector", "stroke", "line", "editable", "web"];
export const TITLE_MIN_WORDS = 5;
export const DESC_MIN_WORDS = 7;

/**
 * The default metadata prompt. Every output constraint the validator enforces
 * is stated here; example phrasing from the feature notes is not mandated.
 */
export const DEFAULT_METADATA_PROMPT = `You write search metadata for a minimalist line icon being uploaded to a stock icon website. Study the icon image and describe the ABSTRACT IDEA it expresses — never a specific object, product, brand or place.

Answer with EXACTLY three lines and nothing else:

Title: <at least 5 words naming the abstract idea>
Description: <at least 7 words>
Tags: <at least 10 unique keywords, comma-separated, all lowercase>

Hard rules:
- Title: at least 5 words total. There is no sentence-count or maximum-length requirement.
- Description: at least 7 words; there is no maximum length.
- Tags: at least 10 unique lowercase keywords, no duplicates, and the list MUST include these seven: icon, pictogram, vector, stroke, line, editable, web.
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

/** Validates the metadata against every minimum rule; warnings never block. */
export function validateMetadata(meta: IconMetadata): MetadataValidation {
  const errors: string[] = [];
  checkMinimumWords(errors, "title", countWords(meta.title), TITLE_MIN_WORDS);
  checkMinimumWords(errors, "description", countWords(meta.description), DESC_MIN_WORDS);
  validateTags(meta.tags, errors);
  return { ok: errors.length === 0, errors, warnings: restrictedWarnings(meta) };
}

function checkMinimumWords(errors: string[], what: string, count: number, min: number): void {
  if (count < min) errors.push(`${what} must be at least ${min} words (got ${count})`);
}

function validateTags(tags: string[], errors: string[]): void {
  const unique = new Set(tags.map(normalizeTag).filter((tag) => tag !== ""));
  if (unique.size < TAG_MIN_COUNT) errors.push(`tags must be at least ${TAG_MIN_COUNT} (got ${unique.size})`);
  const dupes = duplicates(tags);
  if (dupes.length > 0) errors.push(`duplicate tags: ${dupes.join(", ")}`);
  const missing = MANDATORY_TAGS.filter((t) => !hasTag(tags, t));
  if (missing.length > 0) errors.push(`missing mandatory tags: ${missing.join(", ")}`);
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
