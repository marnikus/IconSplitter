// RULE 8 — the metadata rules run for real: the exact default prompt states
// every enforced constraint, the labeled-text parser is deterministic, and
// validation applies the resolved rules (design §2.1–2.3: exactly 40 unique
// tags incl. the 7 mandatory; title = 5–7-word sentence + 3–5-word sentence
// naming ≥2 of the tags; description 7–15 words; restricted content warns).
import { describe, expect, it } from "vitest";
import {
  DEFAULT_METADATA_PROMPT,
  MANDATORY_TAGS,
  TAG_COUNT,
  countWords,
  metadataFingerprint,
  parseMetadata,
  splitTitleSentences,
  validateMetadata,
  type IconMetadata,
} from "../src/lib/uploadmeta";

/** 40 unique tags: the 7 mandatory + 33 concept keywords. */
const TAGS: string[] = [
  ...MANDATORY_TAGS,
  "speed", "growth", "chart", "arrow", "up", "business", "finance", "analytics", "data", "trend",
  "increase", "graph", "statistics", "report", "dashboard", "money", "coin", "dollar", "euro", "yen",
  "currency", "cash", "payment", "wallet", "bank", "investment", "profit", "success", "target", "goal",
  "idea", "creative", "design",
];

const VALID: IconMetadata = {
  title: "Minimal line icon of growth. Speed and growth pictogram",
  description: "Clean line icon showing growth and rising business trends",
  tags: TAGS,
};

function meta(over: Partial<IconMetadata> = {}): IconMetadata {
  return { ...VALID, ...over };
}

describe("the default prompt states every enforced constraint", () => {
  it("names all 7 mandatory tags and the exact tag count", () => {
    for (const tag of MANDATORY_TAGS) expect(DEFAULT_METADATA_PROMPT).toContain(tag);
    expect(DEFAULT_METADATA_PROMPT).toContain("40");
  });

  it("states the title, description and IP rules", () => {
    expect(DEFAULT_METADATA_PROMPT).toContain("5-7 words");
    expect(DEFAULT_METADATA_PROMPT).toContain("3-5 words");
    expect(DEFAULT_METADATA_PROMPT).toContain("7-15 words");
    expect(DEFAULT_METADATA_PROMPT).toContain("brand");
    expect(DEFAULT_METADATA_PROMPT).toContain("in the style of");
    expect(DEFAULT_METADATA_PROMPT).toContain("artist");
  });
});

describe("countWords / splitTitleSentences (design §2.3)", () => {
  it("counts whitespace-separated tokens", () => {
    expect(countWords("Speed and growth")).toBe(3);
    expect(countWords("  a   b  ")).toBe(2);
    expect(countWords("")).toBe(0);
  });

  it("counts a hyphenated compound as one word", () => {
    expect(countWords("line-art icon")).toBe(2);
  });

  it("splits the title on the first \". \" into two sentences", () => {
    expect(splitTitleSentences("Minimal line icon of growth. Speed and growth pictogram"))
      .toEqual(["Minimal line icon of growth", "Speed and growth pictogram"]);
  });

  it("tolerates a trailing period on the second sentence", () => {
    expect(splitTitleSentences("One two three four five. Speed growth pictogram."))
      .toEqual(["One two three four five", "Speed growth pictogram"]);
  });

  it("rejects one sentence or three", () => {
    expect(splitTitleSentences("only one sentence here")).toBeNull();
    expect(splitTitleSentences("One two three. Four five six. Seven eight nine.")).toBeNull();
  });
});

describe("parseMetadata — deterministic labeled-text parsing", () => {
  it("parses the three labeled lines", () => {
    const text = `Title: Minimal line icon of growth. Speed and growth pictogram\nDescription: Clean line icon showing growth\nTags: ${TAGS.join(", ")}`;
    const parsed = parseMetadata(text);
    expect(parsed).not.toBeNull();
    expect(parsed?.title).toBe(VALID.title);
    expect(parsed?.description).toBe("Clean line icon showing growth");
    expect(parsed?.tags).toHaveLength(TAG_COUNT);
    expect(parsed?.tags[0]).toBe("icon");
  });

  it("is case-insensitive on labels and ignores extra lines", () => {
    const parsed = parseMetadata(`notes: hello\nTITLE: ${VALID.title}\ndescription: ${VALID.description}\nTAGS: ${TAGS.join(",")}\nbye`);
    expect(parsed?.title).toBe(VALID.title);
    expect(parsed?.tags).toHaveLength(TAG_COUNT);
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

describe("validateMetadata — the resolved rules", () => {
  it("accepts the valid fixture with no errors and no warnings", () => {
    const v = validateMetadata(VALID);
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it("enforces exactly 40 tags", () => {
    expect(validateMetadata(meta({ tags: TAGS.slice(1) })).errors[0]).toContain("exactly 40");
    expect(validateMetadata(meta({ tags: [...TAGS, "extra"] })).errors[0]).toContain("exactly 40");
  });

  it("rejects duplicate tags case-insensitively", () => {
    const tags = [...TAGS.slice(0, -1), "Icon"]; // 40 tags, "icon" twice (case differs)
    const v = validateMetadata(meta({ tags }));
    expect(v.errors.some((e) => e.includes("duplicate"))).toBe(true);
  });

  it("requires all 7 mandatory tags", () => {
    const tags = TAGS.filter((t) => t !== "web");
    const v = validateMetadata(meta({ tags: [...tags, "filler"] }));
    expect(v.errors.some((e) => e.includes("missing mandatory tags: web"))).toBe(true);
  });

  it("enforces the title sentence word counts", () => {
    expect(validateMetadata(meta({ title: "Too short. Speed growth pictogram" })).errors[0]).toContain("title sentence 1");
    expect(validateMetadata(meta({ title: "One two three four five six seven eight. Speed growth pictogram" })).errors[0]).toContain("title sentence 1");
    expect(validateMetadata(meta({ title: "Minimal line icon of growth. Speed pictogram" })).errors[0]).toContain("title sentence 2");
    expect(validateMetadata(meta({ title: "Minimal line icon of growth. One two three four five six" })).errors[0]).toContain("title sentence 2");
  });

  it("requires the second sentence to name at least two of the tags", () => {
    // names only "pictogram" (speed/growth removed from the tag list)
    const tags = TAGS.filter((t) => t !== "speed" && t !== "growth");
    const v = validateMetadata(meta({ tags: [...tags, "filler", "extra2"], title: "Minimal line icon of growth. Speed and growth pictogram" }));
    expect(v.errors.some((e) => e.includes("must name at least 2"))).toBe(true);
  });

  it("accepts a second sentence naming two tags as ordinary words", () => {
    const v = validateMetadata(meta({ title: "Minimal line icon of growth. Speed and growth pictogram" }));
    expect(v.errors).toEqual([]);
  });

  it("enforces the description word count", () => {
    expect(validateMetadata(meta({ description: "Too short" })).errors[0]).toContain("description");
    const long = Array.from({ length: 16 }, (_, i) => `w${i}`).join(" ");
    expect(validateMetadata(meta({ description: long })).errors[0]).toContain("description");
  });

  it("warns on restricted content without blocking", () => {
    const v = validateMetadata(meta({ description: "Clean icon with a © mark and a logo of nothing" }));
    expect(v.ok).toBe(true);
    expect(v.warnings.some((w) => w.includes("©"))).toBe(true);
    expect(v.warnings.some((w) => w.includes("logo of"))).toBe(true);
  });

  it("warns on \"in the style of\" in the title", () => {
    const v = validateMetadata(meta({ title: "Minimal line icon in the style of growth. Speed growth pictogram" }));
    expect(v.warnings.some((w) => w.includes("in the style of"))).toBe(true);
  });
});

describe("metadataFingerprint", () => {
  it("is stable and changes with the content", () => {
    expect(metadataFingerprint(VALID)).toBe(metadataFingerprint(meta()));
    expect(metadataFingerprint(meta({ title: "Another title here now ok. Speed growth pictogram" }))).not.toBe(metadataFingerprint(VALID));
    expect(metadataFingerprint(meta({ tags: [...TAGS].reverse() }))).not.toBe(metadataFingerprint(VALID));
  });
});
