// RULE 8 — the metadata rules run for real: the exact default prompt states
// every enforced constraint, the labeled-text parser is deterministic, and
// validation applies the relaxed floors (2026-10-07: title ≥5 words whole,
// description ≥7 words, tags ≥10 unique, no maxima, no mandatory list;
// restricted content warns).
import { describe, expect, it } from "vitest";
import {
  DEFAULT_METADATA_PROMPT,
  DESC_MIN_WORDS,
  TAG_MIN_COUNT,
  TITLE_MIN_WORDS,
  countWords,
  metadataFingerprint,
  parseMetadata,
  validateMetadata,
  type IconMetadata,
} from "../src/lib/upload/meta";

/** 12 unique tags, none from the old mandatory list (it is gone). */
const TAGS: string[] = [
  "speed", "growth", "chart", "arrow", "business", "finance",
  "analytics", "data", "trend", "increase", "graph", "statistics",
];

const VALID: IconMetadata = {
  title: "Minimal line icon showing steady growth",
  description: "Clean line icon showing growth and rising business trends today",
  tags: TAGS,
};

function meta(over: Partial<IconMetadata> = {}): IconMetadata {
  return { ...VALID, ...over };
}

describe("the default prompt states every enforced constraint", () => {
  it("states the tag floor and no mandatory list", () => {
    expect(DEFAULT_METADATA_PROMPT).toContain("10");
    expect(DEFAULT_METADATA_PROMPT).not.toContain("40");
    expect(DEFAULT_METADATA_PROMPT).not.toContain("mandatory");
  });

  it("states the title, description and IP rules", () => {
    expect(DEFAULT_METADATA_PROMPT).toContain("5 words");
    expect(DEFAULT_METADATA_PROMPT).toContain("7 words");
    expect(DEFAULT_METADATA_PROMPT).not.toContain("5-7 words");
    expect(DEFAULT_METADATA_PROMPT).not.toContain("7-15 words");
    expect(DEFAULT_METADATA_PROMPT).toContain("brand");
    expect(DEFAULT_METADATA_PROMPT).toContain("in the style of");
    expect(DEFAULT_METADATA_PROMPT).toContain("artist");
  });
});

describe("countWords", () => {
  it("counts whitespace-separated tokens", () => {
    expect(countWords("Speed and growth")).toBe(3);
    expect(countWords("  a   b  ")).toBe(2);
    expect(countWords("")).toBe(0);
  });

  it("counts a hyphenated compound as one word", () => {
    expect(countWords("line-art icon")).toBe(2);
  });
});

describe("parseMetadata — deterministic labeled-text parsing", () => {
  it("parses the three labeled lines", () => {
    const text = `Title: ${VALID.title}\nDescription: Clean line icon showing growth\nTags: ${TAGS.join(", ")}`;
    const parsed = parseMetadata(text);
    expect(parsed).not.toBeNull();
    expect(parsed?.title).toBe(VALID.title);
    expect(parsed?.description).toBe("Clean line icon showing growth");
    expect(parsed?.tags).toHaveLength(TAGS.length);
    expect(parsed?.tags[0]).toBe("speed");
  });

  it("is case-insensitive on labels and ignores extra lines", () => {
    const parsed = parseMetadata(`notes: hello\nTITLE: ${VALID.title}\ndescription: ${VALID.description}\nTAGS: ${TAGS.join(",")}\nbye`);
    expect(parsed?.title).toBe(VALID.title);
    expect(parsed?.tags).toHaveLength(TAGS.length);
  });

  it("returns null when any label is missing", () => {
    expect(parseMetadata(`Title: ${VALID.title}\nDescription: ${VALID.description}`)).toBeNull();
    expect(parseMetadata("no labels at all")).toBeNull();
  });

  it("drops empty tag entries", () => {
    const parsed = parseMetadata(`Title: ${VALID.title}\nDescription: ${VALID.description}\nTags: speed,, growth,`);
    expect(parsed?.tags).toEqual(["speed", "growth"]);
  });
});

describe("validateMetadata — the relaxed floors", () => {
  it("accepts the valid fixture with no errors and no warnings", () => {
    const v = validateMetadata(VALID);
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it(`requires at least ${TAG_MIN_COUNT} tags and no more`, () => {
    expect(TAG_MIN_COUNT).toBe(10);
    const nine = TAGS.slice(0, 9);
    expect(validateMetadata(meta({ tags: nine })).errors[0]).toContain("at least 10");
    expect(validateMetadata(meta({ tags: TAGS.slice(0, 10) })).ok).toBe(true);
    const forty = [...TAGS, ...Array.from({ length: 28 }, (_, i) => `extra${i}`)];
    expect(validateMetadata(meta({ tags: forty })).ok).toBe(true);
  });

  it("rejects duplicate tags case-insensitively", () => {
    const tags = [...TAGS.slice(0, 10), "Speed"]; // "speed" twice (case differs)
    const v = validateMetadata(meta({ tags }));
    expect(v.errors.some((e) => e.includes("duplicate"))).toBe(true);
  });

  it("needs no mandatory terms (the old list is gone)", () => {
    const v = validateMetadata(meta({ tags: TAGS }));
    expect(v.ok).toBe(true);
    expect(v.errors.join(" ")).not.toContain("mandatory");
  });

  it("requires the whole title to have at least 5 words (no max, no sentences)", () => {
    expect(TITLE_MIN_WORDS).toBe(5);
    expect(validateMetadata(meta({ title: "Too short here now" })).errors[0]).toContain("title");
    expect(validateMetadata(meta({ title: "Exactly five words here now" })).ok).toBe(true);
    const long = Array.from({ length: 25 }, (_, i) => `w${i}`).join(" ");
    expect(validateMetadata(meta({ title: long })).ok).toBe(true);
  });

  it("accepts a one-sentence title (the two-sentence rule is gone)", () => {
    expect(VALID.title.includes(". ")).toBe(false);
    expect(validateMetadata(VALID).ok).toBe(true);
  });

  it("requires the description to have at least 7 words (no max)", () => {
    expect(DESC_MIN_WORDS).toBe(7);
    expect(validateMetadata(meta({ description: "Too short to pass here" })).errors[0]).toContain("description");
    expect(validateMetadata(meta({ description: "Exactly seven words here pass now yes" })).ok).toBe(true);
    const long = Array.from({ length: 30 }, (_, i) => `w${i}`).join(" ");
    expect(validateMetadata(meta({ description: long })).ok).toBe(true);
  });

  it("warns on restricted content without blocking", () => {
    const v = validateMetadata(meta({ description: "Clean icon with a © mark and a logo of nothing here today" }));
    expect(v.ok).toBe(true);
    expect(v.warnings.some((w) => w.includes("©"))).toBe(true);
    expect(v.warnings.some((w) => w.includes("logo of"))).toBe(true);
  });

  it("warns on \"in the style of\" in the title", () => {
    const v = validateMetadata(meta({ title: "Minimal line icon in the style of growth today" }));
    expect(v.warnings.some((w) => w.includes("in the style of"))).toBe(true);
  });
});

describe("metadataFingerprint", () => {
  it("is stable and changes with the content", () => {
    expect(metadataFingerprint(VALID)).toBe(metadataFingerprint(meta()));
    expect(metadataFingerprint(meta({ title: "Another title here now ok today" }))).not.toBe(metadataFingerprint(VALID));
    expect(metadataFingerprint(meta({ tags: [...TAGS].reverse() }))).not.toBe(metadataFingerprint(VALID));
  });
});
