// metadata.ts — the sheet / artboard metadata contract (2026-11-14: the SAME
// system as the SVG to upload tab — Title, Description, Tags, parsed from the
// labeled answer lines and validated by lib/upload/meta.ts). The answer also
// carries "Title-Artboard": 2–5 words for the artboard's VISIBLE banner title
// (it is not metadata). Generated answers stay drafts until accepted; editing
// the prompt never relaxes the validator (RULE 20). No key or image is kept.
import { isRecord } from "../isrecord";
import { cleanMetadata, dedupeTags, metadataFingerprint, parseMetadata, validateMetadata } from "../upload/meta";
import type { SheetMetadata, SheetMetadataFields, SheetMetadataValidation } from "./types";

export const DEFAULT_SHEET_PROMPT = `You write search metadata for Describe this icon sheet  being uploaded to a stock icon website. Study the icons sheet and each icon separately.
Generate exactly two titles:
Title 1 — Abstract: Describe the ABSTRACT IDEA the all icons expresses — never a specific object, product, brand or place. Use at list 5 words, sentence case, no period.
Title 2 — Concrete: Do the opposite. Split the image into its exact visible icons. Identify up to several  major icons meanings and pick the single most descriptive one-word name for each. Combine these up to 7 words into the shortest possible sentence describing the scene.
Answer with EXACTLY two lines and nothing else:
Title 1: <abstract idea phrase>
Title 2: <short concrete objects phrase>


Title: <ONE phrase of 5-7 words, sentence case, no period>

Description: <Title 1 - abstract idea phrase. at least 5 words naming the abstract idea>>. <Title 2 - short concrete objects phrase. at least 5 words naming the objects in scene>
Tags: <at least 15 unique lowercase keywords, comma-separated, combining abstract idea tags and visible object tags>

Title-Artboard: <use description and title and give 2-5 words that describe this icons sheet in the closest way. examples: (“food and drinks asset”, ”travel and holidays icons”)>

Output one comma-separated list only, all lowercase, no hashtags, no numbering, no markdown
Include at least 10 unique abstract idea keywords describing the concept, feeling, action, purpose, relationship, or meaning of the icon, not the objects themselves
Then split the image into exact visible objects and describe each object with 1–3 word tags
Add up to 30 object-description tags total
Combine the abstract idea tags and object-description tags into one final tag list
Remove duplicates and near-duplicates, including singular/plural duplicates
The final tag list must include these seven required metadata tags: icon, pictogram, vector, stroke, line, editable, web
Use only generic searchable words, no brand names, trademarks, logos, real people, fictional characters, artist names, or copyrighted terms
Do not include colors unless color is important to the icon meaning
Do not include style names connected to artists, brands, or platforms
In tags do not use two or more words: in final all words should be splitted to one word as one tag.
Keep tags useful for stock icon search buyers, with the most important tags first
overall tag words up must be between 35 and up to 45 words. Make sure it not less then 35 word if so add some more.
Make sure you sent all 4:Title, Description, Tags,Title-Artboard`;

/** The artboard's visible subtitle after a generated answer (2026-11-14). */
export const DEFAULT_ARTBOARD_SUBTITLE = "Editable stroke width";

export function isDefaultSheetPrompt(text: string): boolean {
  return text.trim() === DEFAULT_SHEET_PROMPT.trim();
}

/** The JSON prompt used before 2026-11-14 (title / subtitle / keywords); a saved copy of it is replaced. */
export function isLegacySheetPrompt(text: string): boolean {
  return /"subtitle"/.test(text) && /"keywords"/.test(text);
}

export function emptySheetMetadata(): SheetMetadata {
  return { title: "", description: "", tags: [], state: "empty", validation: null, fingerprint: null };
}

export interface SheetAnswer { fields: SheetMetadataFields; artboardTitle: string }

/** The provider answer: Title / Description / Tags (as the upload tab reads them) and Title-Artboard. */
export function parseSheetAnswer(answer: string): SheetAnswer {
  const parsed = parseMetadata(answer);
  if (parsed === null) throw new Error("the answer has no Title, Description and Tags lines");
  const line = /^\s*title[\s-]*artboard\s*:\s*(.*)$/im.exec(answer)?.[1] ?? "";
  return { fields: cleanSheetMetadata(parsed), artboardTitle: cleanArtboardTitle(line) };
}

/** 2–5 plain words for the banner: quotes, brackets and end punctuation go; at most 60 characters. */
export function cleanArtboardTitle(text: string): string {
  return text.replace(/[“”"«»()<>]/g, "").replace(/\s+/g, " ").replace(/[\s.!,;:…]+$/u, "").trim().slice(0, 60);
}

/** Stored or answered fields, the upload tab's cleaning (sentence case, no end period, tags deduped). Older saves map subtitle → description, keywords → tags. */
export function cleanSheetMetadata(raw: unknown): SheetMetadataFields {
  const source = isRecord(raw) ? raw : {};
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((t): t is string => typeof t === "string").map((t) => t.trim()).filter((t) => t !== "") : []);
  const tags = dedupeTags(list(source.tags ?? source.keywords)).slice(0, 80);
  const clean = cleanMetadata({ title: text(source.title).slice(0, 200), description: text(source.description ?? source.subtitle).slice(0, 400), tags });
  return { title: clean.title, description: clean.description, tags: clean.tags };
}

export function validateSheetMetadata(fields: SheetMetadataFields): SheetMetadataValidation {
  return validateMetadata({ title: fields.title, description: fields.description, tags: [...fields.tags] });
}

export function sheetMetadataFingerprint(fields: SheetMetadataFields): string {
  return metadataFingerprint({ title: fields.title, description: fields.description, tags: [...fields.tags] });
}

/** A generated or edited answer waiting for Accept: "draft", or "invalid" with the rule violations. */
export function draftSheetMetadata(fields: SheetMetadataFields): SheetMetadata {
  const clean = cleanSheetMetadata(fields);
  const validation = validateSheetMetadata(clean);
  return { ...clean, state: validation.ok ? "draft" : "invalid", validation, fingerprint: sheetMetadataFingerprint(clean) };
}

/** Editing the fields (the upload tab's way): an accepted answer turns "edited" until Accept re-validates it. */
export function editSheetMetadata(current: SheetMetadata | null, patch: Partial<SheetMetadataFields>): SheetMetadata {
  const base = current ?? emptySheetMetadata();
  const state = base.state === "accepted" || base.state === "edited" ? "edited" : base.state === "empty" ? "draft" : base.state;
  return { ...base, ...patch, state };
}

/** Accept: re-validated; "accepted", or "invalid" with the exact rule violations. */
export function acceptSheetMetadata(fields: SheetMetadataFields): SheetMetadata {
  const clean = cleanSheetMetadata(fields);
  const validation = validateSheetMetadata(clean);
  return { ...clean, state: validation.ok ? "accepted" : "invalid", validation, fingerprint: sheetMetadataFingerprint(clean) };
}
