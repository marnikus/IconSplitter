// metaprompt.ts — the metadata rules of the SVG-to-upload tab (design §9, C1–C3).
// One policy, stated once and enforced the same way for every answer:
//   · title       — TWO sentences: the first 5–7 words of abstract concept, the
//                   second 3–5 words naming the two most relevant tags.
//   · description — 7–15 words.
//   · tags        — EXACTLY 40, highest to lowest relevance, comma separated,
//                   and these seven must be present:
//                   icon, pictogram, vector, stroke, line, editable, web.
// The illustrative example in the request is NOT the validator: word counting is
// defined here (a hyphenated phrase is ONE word) and the example never overrides
// it. Validation is structural — counts, required terms, duplicates, leftovers,
// truncation — and is never a claim of legal clearance (C3).

import { isRecord } from "../isrecord";

export const TAG_COUNT = 40;
export const REQUIRED_TAGS: readonly string[] = ["icon", "pictogram", "vector", "stroke", "line", "editable", "web"];
export const TITLE_WORDS = { min: 5, max: 7 } as const;
export const HOOK_WORDS = { min: 3, max: 5 } as const;
export const DESC_WORDS = { min: 7, max: 15 } as const;
export const POLICY_ID = "upload-meta-v1";

/** The seven mandatory keywords, for the prompt text and for the UI counter. */
export const REQUIRED_TAGS_TEXT = REQUIRED_TAGS.join(", ");

/** The prompt the tab sends unless the user edits it (design §9). */
export const DEFAULT_UPLOAD_PROMPT = [
  "You are naming and tagging a single vector icon for a stock marketplace listing.",
  "Look at the image, then answer with EXACTLY these three labelled blocks and nothing else:",
  "TITLE: <two sentences. First sentence: 5–7 words describing the abstract concept the icon conveys. Second sentence: 3–5 words naming the two most relevant keywords, in the pattern \"The Vector Icon of <keyword> and <keyword>\".>",
  `DESCRIPTION: <one sentence of ${DESC_WORDS.min}–${DESC_WORDS.max} words describing the icon and its best use.>`,
  `TAGS: <exactly ${TAG_COUNT} lowercase keywords, most relevant first, comma separated. All of these must appear: ${REQUIRED_TAGS_TEXT}.>`,
  "Rules: describe generic concepts only — no brand, company, product or character names, no people's names, no living artists and no \"in the style of\" phrasing.",
].join("\n");

export interface MetaText {
  title: string;
  description: string;
  tags: string[];
}

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

export interface ParseArgs {
  text: string;
  /** "length" when the provider stopped at the token ceiling (truncation). */
  finishReason?: string | null;
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

/**
 * The strict answer parser: labelled blocks, nothing else. Explanation mixed
 * into or around the fields is an error — the caller regenerates or lets the
 * user edit, but never silently accepts prose as metadata.
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

function partialOf(blocks: LabelledBlocks): Partial<MetaText> {
  const out: Partial<MetaText> = {};
  if (blocks.title !== "") out.title = blocks.title;
  if (blocks.description !== "") out.description = blocks.description;
  if (blocks.tags !== "") out.tags = splitTags(blocks.tags);
  return out;
}

function missingFieldErrors(blocks: LabelledBlocks): string[] {
  const out: string[] = [];
  if (blocks.title === "") out.push("The answer has no TITLE block.");
  if (blocks.description === "") out.push("The answer has no DESCRIPTION block.");
  if (blocks.tags === "") out.push("The answer has no TAGS block.");
  return out;
}

function completeMeta(partial: Partial<MetaText>): MetaText | null {
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

function validateTags(tags: readonly string[]): string[] {
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
  return {
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
  };
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

function statusOf(value: unknown): MetaRecord["status"] {
  return value === "rejected" || value === "interrupted" || value === "pending" ? value : "accepted";
}

function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
