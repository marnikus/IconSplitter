// RULE 8 — the metadata rules run for real: the default prompt states every
// enforced constraint, the labeled-text parser is deterministic, and validation
// accepts the relaxed minimums: 10 unique tags, a five-word title, and a
// seven-word description.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_METADATA_PROMPT,
  MANDATORY_TAGS,
  countWords,
  metadataFingerprint,
  parseMetadata,
  validateMetadata,
  type IconMetadata,
} from "../src/lib/upload/meta";

/** 40 unique tags: 7 mandatory terms + concept keywords; also covers larger responses. */
const TAGS: string[] = [
  ...MANDATORY_TAGS,
  "speed", "growth", "chart", "arrow", "up", "business", "finance", "analytics", "data", "trend",
  "increase", "graph", "statistics", "report", "dashboard", "money", "coin", "dollar", "euro", "yen",
  "currency", "cash", "payment", "wallet", "bank", "investment", "profit", "success", "target", "goal",
  "idea", "creative", "design",
];
const TEN_TAGS = [...MANDATORY_TAGS, "speed", "growth", "chart"];
const NINE_TAGS = [...MANDATORY_TAGS, "speed", "growth"];

const VALID: IconMetadata = {
  title: "Minimal line icon of growth",
  description: "Clean line icon showing growth and rising business trends",
  tags: TAGS,
};

function meta(over: Partial<IconMetadata> = {}): IconMetadata {
  return { ...VALID, ...over };
}

describe("the default prompt states every enforced constraint", () => {
  it("names the minimum tag count and all 7 mandatory tags", () => {
    for (const tag of MANDATORY_TAGS) expect(DEFAULT_METADATA_PROMPT).toContain(tag);
    expect(DEFAULT_METADATA_PROMPT).toContain("at least 10");
    expect(DEFAULT_METADATA_PROMPT).not.toContain("exactly 40");
  });

  it("states only the minimum title and description lengths plus IP rules", () => {
    expect(DEFAULT_METADATA_PROMPT).toContain("at least 5 words");
    expect(DEFAULT_METADATA_PROMPT).toContain("at least 7 words");
    expect(DEFAULT_METADATA_PROMPT).not.toContain("5-7 words");
    expect(DEFAULT_METADATA_PROMPT).not.toContain("7-15 words");
    expect(DEFAULT_METADATA_PROMPT).toContain("brand");
    expect(DEFAULT_METADATA_PROMPT).toContain("in the style of");
    expect(DEFAULT_METADATA_PROMPT).toContain("artist");
  });
});

describe("countWords", () => {
  it("counts whitespace-separated tokens, including hyphenated compounds as one", () => {
    expect(countWords("Speed and growth")).toBe(3);
    expect(countWords("  a   b  ")).toBe(2);
    expect(countWords("line-art icon")).toBe(2);
    expect(countWords("")).toBe(0);
  });
});

describe("parseMetadata — deterministic labeled-text parsing", () => {
  it("parses the three labeled lines", () => {
    const text = `Title: ${VALID.title}\nDescription: ${VALID.description}\nTags: ${TAGS.join(", ")}`;
    const parsed = parseMetadata(text);
    expect(parsed).not.toBeNull();
    expect(parsed?.title).toBe(VALID.title);
    expect(parsed?.description).toBe(VALID.description);
    expect(parsed?.tags).toEqual(TAGS);
  });

  it("is case-insensitive on labels and ignores extra lines", () => {
    const parsed = parseMetadata(`notes: hello\nTITLE: ${VALID.title}\ndescription: ${VALID.description}\nTAGS: ${TEN_TAGS.join(",")}\nbye`);
    expect(parsed?.title).toBe(VALID.title);
    expect(parsed?.tags).toEqual(TEN_TAGS);
  });

  it("returns null when any label is missing", () => {
    expect(parseMetadata(`Title: ${VALID.title}\nDescription: ${VALID.description}`)).toBeNull();
    expect(parseMetadata("no labels at all")).toBeNull();
  });

  it("drops empty tag entries", () => {
    const parsed = parseMetadata(`Title: ${VALID.title}\nDescription: ${VALID.description}\nTags: icon,, pictogram,`);
    expect(parsed?.tags).toEqual(["icon", "pictogram"]);
  });
});

describe("validateMetadata — the relaxed minimum rules", () => {
  it("accepts a valid result with at least ten unique tags", () => {
    const v = validateMetadata(meta({ tags: TEN_TAGS }));
    expect(v).toEqual({ ok: true, errors: [], warnings: [] });
  });

  it("rejects nine tags but accepts the former forty-tag response", () => {
    expect(validateMetadata(meta({ tags: NINE_TAGS })).errors).toContain("tags must be at least 10 (got 9)");
    expect(validateMetadata(meta({ tags: [...TEN_TAGS.slice(0, 9), " "] })).errors)
      .toContain("tags must be at least 10 (got 9)");
    expect(validateMetadata(VALID).ok).toBe(true);
  });

  it("rejects duplicate tags case-insensitively", () => {
    const tags = [...TEN_TAGS.slice(0, -1), "Icon"];
    const v = validateMetadata(meta({ tags }));
    expect(v.errors.some((e) => e.includes("duplicate"))).toBe(true);
  });

  it("requires all 7 mandatory tags", () => {
    const tags = [...MANDATORY_TAGS.filter((t) => t !== "web"), ...TEN_TAGS.slice(7)];
    const v = validateMetadata(meta({ tags }));
    expect(v.errors.some((e) => e.includes("missing mandatory tags: web"))).toBe(true);
  });

  it("checks the whole title only against a five-word minimum", () => {
    expect(validateMetadata(meta({ title: "Only four words here" })).errors).toContain("title must be at least 5 words (got 4)");
    expect(validateMetadata(meta({ title: "One two three four five" })).ok).toBe(true);
    expect(validateMetadata(meta({ title: "One two three four five six seven eight nine" })).ok).toBe(true);
  });

  it("checks the description only against a seven-word minimum", () => {
    expect(validateMetadata(meta({ description: "Only six words are written here" })).errors)
      .toContain("description must be at least 7 words (got 6)");
    expect(validateMetadata(meta({ description: "One two three four five six seven" })).ok).toBe(true);
    expect(validateMetadata(meta({ description: Array.from({ length: 24 }, (_, i) => `word${i}`).join(" ") })).ok).toBe(true);
  });

  it("warns on restricted content without blocking", () => {
    const v = validateMetadata(meta({ description: "Clean icon with a © mark and a logo of nothing" }));
    expect(v.ok).toBe(true);
    expect(v.warnings.some((w) => w.includes("©"))).toBe(true);
    expect(v.warnings.some((w) => w.includes("logo of"))).toBe(true);
  });

  it("warns on \"in the style of\" in the title", () => {
    const v = validateMetadata(meta({ title: "Minimal icon, in the style of growth pictogram art" }));
    expect(v.warnings.some((w) => w.includes("in the style of"))).toBe(true);
  });
});

describe("metadataFingerprint", () => {
  it("is stable and changes with the content", () => {
    expect(metadataFingerprint(VALID)).toBe(metadataFingerprint(meta()));
    expect(metadataFingerprint(meta({ title: "Another title with enough words" }))).not.toBe(metadataFingerprint(VALID));
    expect(metadataFingerprint(meta({ tags: [...TAGS].reverse() }))).not.toBe(metadataFingerprint(VALID));
  });
});
