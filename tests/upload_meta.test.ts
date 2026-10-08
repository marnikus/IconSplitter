// RULE 8 — the metadata rules run for real: the exact default prompt states
// every enforced constraint, the labeled-text parser is deterministic, and
// validation applies the resolved rules. The policy is a MINIMUM policy (the
// user's 2026-10-08 change): at least 10 unique tags incl. the 7 mandatory,
// a title of at least 5 words, a description of at least 7 words — longer is
// always accepted, and nothing is refused for being too wordy.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_METADATA_PROMPT,
  MANDATORY_TAGS,
  TAGS_MIN,
  countWords,
  metadataFingerprint,
  dedupeTags,
  parseMetadata,
  validateMetadata,
  type IconMetadata,
} from "../src/lib/upload/meta";

/** The ideal answer: the 7 mandatory tags + 33 concept keywords (still valid). */
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
  it("names all 7 mandatory tags and the minimum tag count", () => {
    for (const tag of MANDATORY_TAGS) expect(DEFAULT_METADATA_PROMPT).toContain(tag);
    expect(DEFAULT_METADATA_PROMPT).toContain(`at least ${TAGS_MIN} unique`);
  });

  it("states the minimum title and description lengths, never a maximum", () => {
    expect(DEFAULT_METADATA_PROMPT).toContain("at least 5 words");
    expect(DEFAULT_METADATA_PROMPT).toContain("at least 7 words");
    expect(DEFAULT_METADATA_PROMPT).not.toContain("exactly 40");
  });

  it("states the IP rules", () => {
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
  it("parses duplicate tags away, keeping the first spelling in order", () => {
    const parsed = parseMetadata(
      `Title: ${VALID.title}\nDescription: ${VALID.description}\nTags: icon, Icon, web, web , vector, ICON`,
    );
    expect(parsed?.tags).toEqual(["icon", "web", "vector"]);
  });

  it("parses the three labeled lines", () => {
    const text = `Title: Minimal line icon of growth. Speed and growth pictogram\nDescription: Clean line icon showing growth\nTags: ${TAGS.join(", ")}`;
    const parsed = parseMetadata(text);
    expect(parsed).not.toBeNull();
    expect(parsed?.title).toBe(VALID.title);
    expect(parsed?.description).toBe("Clean line icon showing growth");
    expect(parsed?.tags).toHaveLength(TAGS.length);
    expect(parsed?.tags[0]).toBe("icon");
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

  it("requires at least 10 tags and accepts any number above that", () => {
    const nine = [...TAGS.slice(0, 9)];
    expect(validateMetadata(meta({ tags: nine })).errors[0]).toContain("at least 10");
    expect(validateMetadata(meta({ tags: TAGS })).errors).toEqual([]);
    expect(validateMetadata(meta({ tags: [...TAGS, "extra", "extra2"] })).errors).toEqual([]);
  });

  it("accepts exactly the minimum: 10 tags", () => {
    const ten = [...MANDATORY_TAGS, "growth", "speed", "arrow"];
    expect(ten).toHaveLength(TAGS_MIN);
    expect(validateMetadata(meta({ tags: ten })).errors).toEqual([]);
  });

  it("removes duplicate tags silently — no error, no warning (2026-10-08)", () => {
    const tags = [...TAGS.slice(0, -1), "Icon"]; // 40 tags, "icon" twice (case differs)
    const v = validateMetadata(meta({ tags }));
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
    // a duplicate is never mentioned anywhere the user can read it
    expect(JSON.stringify(v)).not.toContain("duplicate");
    // the FIRST spelling survives, and removal happens case-insensitively
    expect(dedupeTags(["Icon", "icon", "Icons", "icons"])).toEqual(["Icon", "Icons"]);
    expect(dedupeTags(["  web ", "web", "WEB"])).toEqual(["web"]);
    // the minimum counts the DEDUPED list: 9 unique + 1 repeat is still 9
    const nine = [...MANDATORY_TAGS, "growth", "speed"];  // 9 unique
    expect(validateMetadata(meta({ tags: [...nine, "growth"] })).errors)
      .toEqual(["tags must be at least 10 (got 9)"]);
    expect(validateMetadata(meta({ tags: [...nine, "arrow"] })).errors).toEqual([]);
  });

  it("requires all 7 mandatory tags", () => {
    const tags = TAGS.filter((t) => t !== "web");
    const v = validateMetadata(meta({ tags: [...tags, "filler"] }));
    expect(v.errors.some((e) => e.includes("missing mandatory tags: web"))).toBe(true);
  });

  it("requires at least 5 title words and no upper limit", () => {
    expect(validateMetadata(meta({ title: "Too short" })).errors[0]).toContain("at least 5 words");
    expect(validateMetadata(meta({ title: "One two three four" })).errors[0]).toContain("at least 5 words");
    expect(validateMetadata(meta({ title: "Five words are the minimum here" })).errors).toEqual([]);
  });

  it("accepts a single-sentence title and a very long one (no structure rule)", () => {
    expect(validateMetadata(meta({ title: "Minimal line icon of steady business growth" })).errors).toEqual([]);
    const long = Array.from({ length: 14 }, (_, i) => `w${i}`).join(" ");
    expect(validateMetadata(meta({ title: long })).errors).toEqual([]);
  });

  it("requires at least 7 description words and no upper limit", () => {
    expect(validateMetadata(meta({ description: "Too short" })).errors[0]).toContain("at least 7 words");
    expect(validateMetadata(meta({ description: "Seven words is the minimum for this" })).errors).toEqual([]);
    const long = Array.from({ length: 24 }, (_, i) => `w${i}`).join(" ");
    expect(validateMetadata(meta({ description: long })).errors).toEqual([]);
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
