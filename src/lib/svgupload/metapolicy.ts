// metapolicy.ts — how the rules READ text (design §9, C1–C3). Word counting is
// defined once, here: whitespace separated, and a hyphenated phrase is ONE word
// ("logo-free" is honest wording, not an artist reference). Validation is
// structural all the way down — counts, required terms, duplicates, leftovers,
// truncation — and never a claim of legal clearance: the restricted-wording
// patterns produce WARNINGS for a human to judge.
//
// Pure and provider-free on purpose, so the same rules judge a model answer, a
// hand edit and a record read back from storage.

import { DESC_WORDS, HOOK_WORDS, TAG_COUNT, TITLE_WORDS } from "./metaconst";
import { REQUIRED_TAGS } from "./metatags";

export interface MetaText {
  title: string;
  description: string;
  tags: string[];
}

/** Words as the rules count them: whitespace separated, hyphens are ONE word. */
export function words(text: string): string[] {
  return text.trim().split(/\s+/).filter((w) => w.length > 0);
}

export function wordCount(text: string): number {
  return words(text).length;
}

/** Sentences by their terminator; a title without one is a single sentence. */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export interface LabelledBlocks {
  title: string;
  description: string;
  tags: string;
  /** Everything that is not inside a labelled block. */
  leftover: string;
}

/** Reads the three labels; unknown text before/between them is leftover. */
export function labelledBlocks(text: string): LabelledBlocks {
  const out: LabelledBlocks = { title: "", description: "", tags: "", leftover: "" };
  let current: keyof Omit<LabelledBlocks, "leftover"> | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const hit = labelOf(raw);
    if (hit === null) {
      if (current === null) out.leftover = `${out.leftover}${raw}\n`;
      else out[current] = `${out[current]}${raw.trim()}\n`; // a wrapped line stays a separate tag
      continue;
    }
    current = hit.name;
    if (hit.value !== "") out[current] = `${out[current]}${hit.value}\n`;
  }
  return trimBlocks(out);
}

const LABEL_RE = /^[\s*#>\u2022-]*\**(TITLE|DESCRIPTION|TAGS)\**\s*:\s*(.*)$/i;

/** `TITLE: …`, `**TITLE:** …` and `# TAGS: …` all count; the colon is required. */
function labelOf(line: string): { name: "title" | "description" | "tags"; value: string } | null {
  const m = LABEL_RE.exec(line);
  if (m === null) return null;
  const name = m[1].toLowerCase() as "title" | "description" | "tags";
  // `**TITLE:** x` leaves the closing decoration in front of the value: strip
  // markdown marks and spaces at BOTH edges, and nothing from the middle.
  return { name, value: m[2].replace(/^[\s*]+|[\s*]+$/g, "") };
}

/** A label may carry its value on the same line; that line is not leftover. */
function trimBlocks(blocks: LabelledBlocks): LabelledBlocks {
  return {
    title: blocks.title.trim(),
    description: blocks.description.trim(),
    tags: blocks.tags.trim(),
    leftover: blocks.leftover.trim(),
  };
}

export function partialOf(blocks: LabelledBlocks): Partial<MetaText> {
  const out: Partial<MetaText> = {};
  if (blocks.title !== "") out.title = blocks.title;
  if (blocks.description !== "") out.description = blocks.description;
  if (blocks.tags !== "") out.tags = splitTags(blocks.tags);
  return out;
}

export function missingFieldErrors(blocks: LabelledBlocks): string[] {
  const out: string[] = [];
  if (blocks.title === "") out.push("The answer has no TITLE block.");
  if (blocks.description === "") out.push("The answer has no DESCRIPTION block.");
  if (blocks.tags === "") out.push("The answer has no TAGS block.");
  return out;
}

export function completeMeta(partial: Partial<MetaText>): MetaText | null {
  if (partial.title === undefined || partial.description === undefined || partial.tags === undefined) return null;
  return { title: partial.title, description: partial.description, tags: partial.tags };
}

/** Every structural rule, in one pass, each violation its own sentence. */
export function validateMetadata(meta: MetaText): string[] {
  return [
    ...validateTitle(meta.title),
    ...validateDescription(meta.description),
    ...validateTags(meta.tags),
  ];
}

function validateTitle(title: string): string[] {
  const parts = sentences(title);
  if (parts.length !== 2) return [`The title must be two sentences (found ${parts.length}).`];
  const out: string[] = [];
  const first = wordCount(parts[0]);
  const hook = wordCount(parts[1]);
  if (first < TITLE_WORDS.min || first > TITLE_WORDS.max) {
    out.push(`The first title sentence must be ${TITLE_WORDS.min}–${TITLE_WORDS.max} words (found ${first}).`);
  }
  if (hook < HOOK_WORDS.min || hook > HOOK_WORDS.max) {
    out.push(`The second title sentence must be ${HOOK_WORDS.min}–${HOOK_WORDS.max} words (found ${hook}).`);
  }
  return out;
}

function validateDescription(description: string): string[] {
  const n = wordCount(description);
  if (n < DESC_WORDS.min || n > DESC_WORDS.max) {
    return [`The description must be ${DESC_WORDS.min}–${DESC_WORDS.max} words (found ${n}).`];
  }
  return [];
}

export function validateTags(tags: readonly string[]): string[] {
  const out: string[] = [];
  if (tags.length !== TAG_COUNT) out.push(`Exactly ${TAG_COUNT} tags are required (found ${tags.length}).`);
  const lower = tags.map((t) => t.toLowerCase());
  const dupes = lower.filter((t, i) => lower.indexOf(t) !== i);
  if (dupes.length > 0) out.push(`Duplicate tags: ${[...new Set(dupes)].join(", ")}.`);
  const missing = REQUIRED_TAGS.filter((t) => !lower.includes(t));
  if (missing.length > 0) out.push(`Missing required tags: ${missing.join(", ")}.`);
  const bad = tags.filter((t) => t === "" || t.length > 40);
  if (bad.length > 0) out.push(`${bad.length} tag(s) are empty or longer than 40 characters.`);
  return out;
}

/** Comma separated, trimmed, empties dropped — the one tag splitter. */
export function splitTags(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((t) => t.trim().replace(/^["']|["']$/g, ""))
    .filter((t) => t.length > 0);
}

/** Serialises the 40 tags the way both the field and the prompt show them. */
export function tagsText(tags: readonly string[]): string {
  return tags.join(", ");
}

/** Matches a word only when it stands alone: "logo-free" is honest wording. */
function standalone(...words: string[]): RegExp {
  return new RegExp(`(?<![\\w-])(${words.join("|")})(?![\\w-])`, "i");
}

const RESTRICTED_PATTERNS: readonly { re: RegExp; why: string }[] = [
  { re: /in the style of/i, why: "names an artistic style by reference to an author" },
  { re: standalone("logo", "brand", "trademark", "copyrighted"), why: "refers to protected branding" },
  { re: standalone("van gogh", "picasso", "monet", "warhol", "banksy", "miyazaki", "ghibli", "disney", "marvel"), why: "names a person or studio" },
  { re: standalone("iphone", "android", "windows", "photoshop", "chrome"), why: "names a product" },
];

/** Warnings only: the checker lists what it noticed and claims nothing more. */
export function restrictedWarnings(meta: Partial<MetaText>): string[] {
  const haystack = [meta.title ?? "", meta.description ?? "", ...(meta.tags ?? [])].join(" \n ");
  return RESTRICTED_PATTERNS.filter((p) => p.re.test(haystack)).map((p) => `Review the wording: it ${p.why}.`);
}

