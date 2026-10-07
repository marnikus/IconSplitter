// up_meta.test.ts — the conceptual-metadata rules execute for real (RULE 8):
// the ONE word-counting rule, the 5-7/3-5 title, the 7-15 description, the
// exactly-40 unique tags with the 7 mandatory terms, and the two deterministic
// parsers (JSON and labelled text). Deleting the module fails every assertion.
import { describe, expect, it } from "vitest";
import {
  MANDATORY_TAGS, TAG_COUNT, countWords, normalizeTags, parseJsonMetadata, parseLabeledMetadata,
  parseMetadataResponse, splitTitleSegments, styleWarnings, validateMetadata, type IconMetadata,
} from "../src/lib/upmeta";
import { DEFAULT_META_PROMPT } from "../src/lib/upprompt";

/** A full, valid metadata record (the one rule, everywhere). */
const VALID: IconMetadata = {
  title: "Forward Motion and Accelerated Growth Direction. The Vector Icon of Speed",
  description: "Minimal arrow illustration symbolising upward movement and fast progress",
  tags: [...MANDATORY_TAGS, ...Array.from({ length: 33 }, (_, i) => `concept-${i}`)],
};

describe("upmeta — the one word-counting rule", () => {
  it("counts whitespace-separated words, hyphenated compounds as one", () => {
    expect(countWords("one two three")).toBe(3);
    expect(countWords("state-of-the-art design")).toBe(2);
    expect(countWords("  spaced   out  ")).toBe(2);
    expect(countWords("")).toBe(0);
  });

  it("strips surrounding punctuation but keeps inner hyphens and slashes", () => {
    expect(countWords("Hello, world!")).toBe(2);
    expect(countWords("(bracketed) words.")).toBe(2);
    expect(countWords("read/write access")).toBe(2);
    expect(countWords("e.g. etc.")).toBe(2);
  });

  it("is the rule the title and description validators use (no second counter)", () => {
    expect(countWords("one two three four five six seven eight")).toBe(8);
  });
});

describe("upmeta — title segments", () => {
  it("splits a two-segment title on the period", () => {
    expect(splitTitleSegments("Five word first segment. Four word tail")).toEqual([
      "Five word first segment", "Four word tail",
    ]);
  });

  it("tolerates one trailing period and rejects one or three segments", () => {
    expect(splitTitleSegments("Five words here now. Three word tail.")).toEqual([
      "Five words here now", "Three word tail",
    ]);
    expect(splitTitleSegments("Only one segment here")).toBeNull();
    expect(splitTitleSegments("A. B. C")).toBeNull();
    expect(splitTitleSegments("")).toBeNull();
  });
});

describe("upmeta — validation (fail-closed)", () => {
  it("accepts the valid record", () => {
    expect(validateMetadata(VALID)).toEqual([]);
  });

  it("rejects title segments outside 5-7 and 3-5 words", () => {
    expect(validateMetadata({ ...VALID, title: "Too short. Three word tail" })).not.toEqual([]);
    expect(validateMetadata({ ...VALID, title: "One two three four five six seven eight words here. Tail" })).not.toEqual([]);
    expect(validateMetadata({ ...VALID, title: "Five words here now. one" })).not.toEqual([]);
    expect(validateMetadata({ ...VALID, title: "Five words here now. one two three four five six" })).not.toEqual([]);
  });

  it("rejects a description outside 7-15 words", () => {
    expect(validateMetadata({ ...VALID, description: "too short" })).not.toEqual([]);
    expect(validateMetadata({ ...VALID, description: Array.from({ length: 16 }, (_, i) => `w${i}`).join(" ") })).not.toEqual([]);
    expect(validateMetadata({ ...VALID, description: Array.from({ length: 7 }, (_, i) => `w${i}`).join(" ") })).toEqual([]);
  });

  it("demands exactly 40 unique tags including the 7 mandatory terms", () => {
    expect(validateMetadata({ ...VALID, tags: VALID.tags.slice(0, 39) })).not.toEqual([]);
    expect(validateMetadata({ ...VALID, tags: [...VALID.tags, "extra"] })).not.toEqual([]);
    expect(validateMetadata({ ...VALID, tags: [...VALID.tags.slice(0, 39), "Icon"] })).not.toEqual([]); // duplicate, case-insensitive
    const withoutVector = VALID.tags.filter((t) => t.toLowerCase() !== "vector");
    expect(validateMetadata({ ...VALID, tags: [...withoutVector, "filler-tag"] })).not.toEqual([]);
    expect(TAG_COUNT).toBe(40);
  });

  it("checks the mandatory terms case-insensitively", () => {
    const tags = [...MANDATORY_TAGS.map((t) => t.toUpperCase()), ...VALID.tags.slice(7)];
    expect(validateMetadata({ ...VALID, tags })).toEqual([]);
  });

  it("reports which field failed, never a bare boolean", () => {
    const issues = validateMetadata({ ...VALID, title: "Bad. Tail" });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].field).toBe("title");
  });
});

describe("upmeta — normalizeTags", () => {
  it("splits on commas, trims and drops empties", () => {
    expect(normalizeTags("icon, vector , ,line, ")).toEqual(["icon", "vector", "line"]);
    expect(normalizeTags("")).toEqual([]);
  });
});

describe("upmeta — labelled-text parsing", () => {
  it("parses the documented template deterministically", () => {
    const text = [
      `Title: ${VALID.title}`,
      "Description: Minimal arrow illustration symbolising upward movement and fast progress",
      `Tags: ${VALID.tags.join(", ")}`,
    ].join("\n");
    expect(parseLabeledMetadata(text)).toEqual(VALID);
  });

  it("tolerates case, extra whitespace and markdown bolding around labels", () => {
    const text = `**TITLE:**  ${VALID.title}\n\n  description: ${VALID.description}\nTags:${VALID.tags.join(", ")}`;
    expect(parseLabeledMetadata(text)).toEqual(VALID);
  });

  it("refuses a body with a missing field, extra labels or mixed-in explanation", () => {
    expect(parseLabeledMetadata(`Title: ${VALID.title}\nTags: ${VALID.tags.join(", ")}`)).toBeNull();
    expect(parseLabeledMetadata("Description: something")).toBeNull();
    expect(parseLabeledMetadata("The icon shows: an arrow\nTitle: x. y")).toBeNull();
  });

  it("keeps commas inside the tags field as separators, everywhere", () => {
    const meta = parseLabeledMetadata(`Title: ${VALID.title}\nDescription: ${VALID.description}\nTags: ${VALID.tags.join(" ,  ")}`);
    expect(meta?.tags).toHaveLength(40);
  });
});

describe("upmeta — JSON parsing", () => {
  it("parses a structured response the schema asked for", () => {
    expect(parseJsonMetadata(JSON.stringify(VALID))).toEqual(VALID);
  });

  it("refuses wrong shapes instead of guessing", () => {
    expect(parseJsonMetadata("{nope")).toBeNull();
    expect(parseJsonMetadata(JSON.stringify({ title: "x" }))).toBeNull();
    expect(parseJsonMetadata(JSON.stringify({ ...VALID, tags: "icon,vector" }))).toBeNull();
    expect(parseJsonMetadata(JSON.stringify([VALID]))).toBeNull();
  });
});

describe("upmeta — the response parser (JSON first, labels second)", () => {
  it("accepts a valid JSON body", () => {
    const r = parseMetadataResponse(JSON.stringify(VALID));
    expect(r.ok).toBe(true);
  });

  it("accepts a valid labelled body", () => {
    const r = parseMetadataResponse(`Title: ${VALID.title}\nDescription: ${VALID.description}\nTags: ${VALID.tags.join(", ")}`);
    expect(r.ok).toBe(true);
  });

  it("rejects an invalid body with the validation issues named", () => {
    const bad = { ...VALID, tags: VALID.tags.slice(1) };
    const r = parseMetadataResponse(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.length).toBeGreaterThan(0);
  });

  it("rejects an empty or refused answer, never an empty success (RULE 4)", () => {
    expect(parseMetadataResponse("").ok).toBe(false);
    expect(parseMetadataResponse("I cannot help with that.").ok).toBe(false);
  });
});

describe("upmeta — style warnings (advisory, never a promise)", () => {
  it("flags style-reference phrases", () => {
    const w = styleWarnings({ ...VALID, tags: [...VALID.tags.slice(0, 39), "in the style of Picasso"] });
    expect(w.length).toBeGreaterThan(0);
    expect(styleWarnings(VALID)).toEqual([]);
  });
});

describe("upprompt — the default prompt", () => {
  it("carries the confirmed single policy: 40 tags and the 7 mandatory terms", () => {
    expect(DEFAULT_META_PROMPT).toContain("40 comma-separated");
    expect(DEFAULT_META_PROMPT).toContain("Exactly 7 to 15 words");
    for (const term of MANDATORY_TAGS) expect(DEFAULT_META_PROMPT).toContain(term);
    expect(DEFAULT_META_PROMPT).not.toContain("50");
  });

  it("asks for the two-segment title shape it will validate", () => {
    expect(DEFAULT_META_PROMPT).toContain("5-7 words");
    expect(DEFAULT_META_PROMPT).toContain("3-5 words");
  });
});
