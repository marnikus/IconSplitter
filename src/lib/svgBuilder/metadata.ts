// metadata.ts — the sheet-metadata answer contract. Generated answers stay
// drafts until explicitly accepted; editing the prompt never relaxes this
// validator (RULE 20). No key, image bytes or provider text is persisted.
import { fnv1a32 } from "../pairing";
import { isRecord } from "../isrecord";
import type { SheetMetadata, SheetMetadataFields, SheetMetadataValidation } from "./types";

export const DEFAULT_SHEET_PROMPT = [
  "Describe this icon sheet for a stock-ready vector collection.",
  "Return only one JSON object with exactly these fields:",
  '{"title":"5-12 words, specific and neutral","subtitle":"one short neutral phrase","keywords":["10-16 single-word or two-word tags"]}.',
  "Rules: no brand names, no URLs, no API keys, no claims about people, and no markdown after the JSON.",
  "The title, subtitle and keywords must describe the visible approved icons only.",
].join(" ");

const FORBIDDEN = /\b(shutterstock|adobe stock|getty|istock)\b/i;

export function isDefaultSheetPrompt(text: string): boolean {
  return text.trim() === DEFAULT_SHEET_PROMPT.trim();
}

export function emptySheetMetadata(): SheetMetadata {
  return { title: "", subtitle: "", keywords: [], state: "empty", validation: null, fingerprint: null };
}

export function parseSheetMetadata(answer: string): SheetMetadataFields {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(answer);
  const source = fenced?.[1] ?? answer;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON metadata object in the provider answer");
  const parsed: unknown = JSON.parse(source.slice(start, end + 1));
  if (!isRecord(parsed)) throw new Error("the provider answer is not a JSON object");
  return cleanSheetMetadata(parsed);
}

export function cleanSheetMetadata(raw: unknown): SheetMetadataFields {
  const source = isRecord(raw) ? raw : {};
  return {
    title: boundedText(source.title, 90),
    subtitle: boundedText(source.subtitle, 140),
    keywords: cleanKeywords(source.keywords),
  };
}

export function validateSheetMetadata(fields: SheetMetadataFields): SheetMetadataValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (fields.title.trim().length < 3 || fields.title.length > 90) errors.push("title must be 3–90 characters");
  if (fields.subtitle.length > 140) errors.push("subtitle must be at most 140 characters");
  if (fields.keywords.length > 20) errors.push("at most 20 keywords are allowed");
  for (const keyword of fields.keywords) {
    if (keyword.length < 2 || keyword.length > 32 || /[:/@]|\s{2,}/.test(keyword)) {
      errors.push(`keyword “${keyword}” must be 2–32 plain characters with no URL or e-mail`);
    }
  }
  const prose = `${fields.title} ${fields.subtitle} ${fields.keywords.join(" ")}`;
  if (FORBIDDEN.test(prose)) warnings.push("a stock-site brand name was removed from the accepted copy");
  return { ok: errors.length === 0, errors, warnings };
}

export function sheetMetadataFingerprint(fields: SheetMetadataFields): string {
  return fnv1a32(JSON.stringify(cleanSheetMetadata(fields))).toString(16);
}

export function draftSheetMetadata(fields: SheetMetadataFields): SheetMetadata {
  const clean = cleanSheetMetadata(fields);
  const validation = validateSheetMetadata(clean);
  return { ...clean, state: validation.ok ? "draft" : "invalid", validation,
    fingerprint: sheetMetadataFingerprint(clean) };
}

export function acceptSheetMetadata(fields: SheetMetadataFields): SheetMetadata {
  const clean = cleanSheetMetadata(fields);
  const validation = validateSheetMetadata(clean);
  return { ...clean, state: validation.ok ? "accepted" : "invalid", validation,
    fingerprint: sheetMetadataFingerprint(clean) };
}

function boundedText(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, limit) : "";
}

function cleanKeywords(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const words = raw.filter((word): word is string => typeof word === "string")
    .map((word) => word.trim().replace(/\s+/g, " ").slice(0, 32))
    .filter((word) => word !== "");
  return [...new Set(words)].slice(0, 20);
}
