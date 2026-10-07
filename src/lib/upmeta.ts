// upmeta.ts — the conceptual metadata model and its ONE validation policy
// (prompt §9/§10). Owns: word counting (hyphenated compounds are one word),
// the two-segment title rule (5-7 words, then 3-5 words), the 7-15 word
// description, the exactly-40 unique tags including the 7 mandatory terms, the
// deterministic parsers (structured JSON first, labelled text second) and the
// advisory style-phrase warnings. Nothing here promises legal or IP clearance.

/** The policy identity this validator implements; stored with every record. */
export const META_POLICY_VERSION = "upload-meta-v2";

export const TAG_COUNT = 40;
export const MANDATORY_TAGS = ["icon", "pictogram", "vector", "stroke", "line", "editable", "web"] as const;

export interface IconMetadata {
  title: string;
  description: string;
  tags: string[];
}

export type MetaField = "title" | "description" | "tags";
export interface MetaIssue {
  field: MetaField;
  problem: string;
}

export type ParseResult = { ok: true; meta: IconMetadata } | { ok: false; issues: string[] };

/** Punctuation stripped from word edges; inner hyphens and slashes stay. */
const EDGE = ".,;:!?'\"“”‘’()[]{}«»…";

/** The ONE word counter every count rule uses. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => trimEdges(w) !== "").length;
}

function trimEdges(word: string): string {
  let start = 0;
  let end = word.length;
  while (start < end && EDGE.includes(word[start])) start += 1;
  while (end > start && EDGE.includes(word[end - 1])) end -= 1;
  return word.slice(start, end);
}

/**
 * A title is two period-separated segments ("concept sentence. tag phrase").
 * Exactly two non-empty segments, or null — a one-segment or three-segment
 * title is invalid, never guessed into shape.
 */
export function splitTitleSegments(title: string): [string, string] | null {
  const parts = title.trim().replace(/\.$/, "").split(".").map((p) => p.trim());
  if (parts.length !== 2 || parts[0] === "" || parts[1] === "") return null;
  return [parts[0], parts[1]];
}

/** All rules, fail-closed: an empty issue list is the only valid metadata. */
export function validateMetadata(m: IconMetadata): MetaIssue[] {
  const issues: MetaIssue[] = [];
  const segs = splitTitleSegments(m.title);
  if (segs === null) {
    issues.push({ field: "title", problem: "title must be two period-separated segments" });
  } else {
    issues.push(...segmentIssue({ field: "title", which: "first", text: segs[0], min: 5, max: 7 }));
    issues.push(...segmentIssue({ field: "title", which: "second", text: segs[1], min: 3, max: 5 }));
  }
  const dw = countWords(m.description);
  if (dw < 7 || dw > 15) issues.push({ field: "description", problem: `description must be 7-15 words (is ${dw})` });
  issues.push(...tagIssues(m.tags));
  return issues;
}

interface SegmentCheck {
  field: MetaField;
  which: string;
  text: string;
  min: number;
  max: number;
}

function segmentIssue(c: SegmentCheck): MetaIssue[] {
  const n = countWords(c.text);
  const within = n >= c.min && n <= c.max;
  return within ? [] : [{ field: c.field, problem: `${c.which} title segment must be ${c.min}-${c.max} words (is ${n})` }];
}

function tagIssues(tags: string[]): MetaIssue[] {
  const issues: MetaIssue[] = [];
  if (tags.length !== TAG_COUNT) {
    issues.push({ field: "tags", problem: `exactly ${TAG_COUNT} tags required (is ${tags.length})` });
    return issues;
  }
  const lower = tags.map((t) => t.trim().toLowerCase());
  if (new Set(lower).size !== lower.length) issues.push({ field: "tags", problem: "tags must be unique" });
  const missing = MANDATORY_TAGS.filter((t) => !lower.includes(t));
  if (missing.length > 0) issues.push({ field: "tags", problem: `missing mandatory terms: ${missing.join(", ")}` });
  return issues;
}

/** Splits the raw tags text on commas; trims and drops empties. */
export function normalizeTags(raw: string): string[] {
  return raw.split(",").map((t) => t.trim()).filter((t) => t !== "");
}

const LABEL_RE = /^\s*\**\s*(title|description|tags)\s*\**\s*:\s*\**\s*(.*)$/i;

/**
 * Deterministic labelled-text parser: every non-empty line must be one of the
 * three labelled fields (markdown bolding tolerated), each label exactly once,
 * and nothing else — a refused or chatty answer is null, never a guess.
 */
export function parseLabeledMetadata(text: string): IconMetadata | null {
  const found = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const m = LABEL_RE.exec(line);
    if (m === null || found.has(m[1].toLowerCase())) return null;
    found.set(m[1].toLowerCase(), m[2].trim());
  }
  if (found.size !== 3) return null;
  return {
    title: found.get("title") ?? "",
    description: found.get("description") ?? "",
    tags: normalizeTags(found.get("tags") ?? ""),
  };
}

/** The structured body the response schema asked for, or null on any wrong shape. */
export function parseJsonMetadata(text: string): IconMetadata | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecordShape(parsed)) return null;
  const { title, description, tags } = parsed;
  if (typeof title !== "string" || typeof description !== "string" || !Array.isArray(tags)) return null;
  if (tags.some((t) => typeof t !== "string")) return null;
  return {
    title: title.trim(),
    description: description.trim(),
    tags: (tags as string[]).map((t) => t.trim()).filter((t) => t !== ""),
  };
}

function isRecordShape(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** JSON first (requested via response_schema), labelled text as the fallback. */
export function parseMetadataResponse(text: string): ParseResult {
  const meta = parseJsonMetadata(text) ?? parseLabeledMetadata(text);
  if (meta === null) return { ok: false, issues: ["the answer carries no parseable Title/Description/Tags fields"] };
  const issues = validateMetadata(meta);
  if (issues.length > 0) return { ok: false, issues: issues.map((i) => `${i.field}: ${i.problem}`) };
  return { ok: true, meta };
}

const STYLE_PHRASES = ["in the style of", "inspired by", "à la"];

/**
 * The donor's two-named-tags rule (report §5): the title's second segment is
 * meant to name the two most relevant tags. It is a REVIEW rule, not a hard
 * failure — the model can word a valid title differently — so it is reported
 * next to the restricted-wording warnings and a human decides.
 */
export function titleTagRuleIssues(m: IconMetadata): string[] {
  const segs = splitTitleSegments(m.title);
  if (segs === null) return [];
  const named = m.tags.slice(0, 2).filter((t) => new RegExp(`(?<![\\w-])${escapeRegExp(t)}(?![\\w-])`, "i").test(segs[1]));
  if (named.length === 2) return [];
  const missing = m.tags.slice(0, 2).filter((t) => !named.includes(t));
  return [`the title's second segment does not name: ${missing.join(", ")}`];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Advisory warnings only — model output is never legal or IP clearance. */
export function styleWarnings(m: IconMetadata): string[] {
  const haystack = `${m.title} ${m.description} ${m.tags.join(" ")}`.toLowerCase();
  return STYLE_PHRASES.filter((p) => haystack.includes(p))
    .map((p) => `style reference detected ("${p}") — restricted-content rule; edit before accepting`);
}
