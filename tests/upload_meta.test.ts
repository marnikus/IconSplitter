// upload_meta.test.ts — the metadata policy the brief demanded be pinned down
// (RULE 8). The cases are the brief's own examples, including the two it
// contradicts itself about: 40 tags (not 50), and a title whose word counts are
// checked by count, not by the phrase the example happens to use.
import { describe, expect, it } from "vitest";
import {
  countWords, metadataFromJson, parseMetadataText, REQUIRED_TAGS, restrictedWarnings,
  splitTags, splitTitle, TAG_COUNT, tagsLine, validateMetadata, type MetadataRecord,
} from "../src/lib/uploadmeta";
import { DEFAULT_METADATA_PROMPT, finalPrompt, isDefaultMetadataPrompt, parseMetadataPrompt, requestPreview } from "../src/lib/uploadprompt";

/** A record that passes every rule, so a test can change exactly one thing. */
function good(over: Partial<MetadataRecord> = {}): MetadataRecord {
  const extra = Array.from({ length: TAG_COUNT - REQUIRED_TAGS.length }, (_, i) => `extra-${i}`);
  return {
    title: "Momentum Expressed Through Directional Flow. Speed and progress.",
    description: "Arrow shaped symbol expressing forward momentum and purposeful direction.",
    tags: [...REQUIRED_TAGS, ...extra],
    ...over,
  };
}

describe("countWords (the one counting rule)", () => {
  it("counts a hyphenated phrase as ONE word and ignores bare punctuation", () => {
    expect(countWords("line-art vector icon")).toBe(3);
    expect(countWords("speed, growth — success")).toBe(3);
    expect(countWords("")).toBe(0);
  });
});

describe("splitTitle", () => {
  it("splits at the first full stop", () => {
    expect(splitTitle("Quiet Momentum In Motion. Speed and progress.")).toEqual({
      main: "Quiet Momentum In Motion", subtitle: "Speed and progress",
    });
    expect(splitTitle("Only one sentence here")).toEqual({ main: "Only one sentence here", subtitle: "" });
  });
});

describe("validateMetadata", () => {
  it("accepts a record that follows the confirmed policy", () => {
    const check = validateMetadata(good());
    expect(check.errors).toEqual([]);
    expect(check.ok).toBe(true);
  });

  it("counts title words rather than requiring the example's phrase", () => {
    // "The Vector Icon of growth and speed" is 7 words — inside the 3–5 SUBTITLE
    // rule it is too long, and that is an error the brief itself created; the
    // validator reports the count, never silently accepting it.
    const tooLong = good({ title: "Forward Momentum Through Open Space. The Vector Icon of growth and speed." });
    expect(validateMetadata(tooLong).errors.join(" ")).toContain("Title's second sentence must be 3–5 words");
    const fine = good({ title: "Forward Momentum Through Open Space. Growth and speed." });
    expect(validateMetadata(fine).ok).toBe(true);
  });

  it("rejects a title without a second sentence and a too-short description", () => {
    expect(validateMetadata(good({ title: "Forward Momentum" })).errors).toContain("Title needs a second sentence (3–5 words)");
    expect(validateMetadata(good({ description: "A simple arrow" })).errors.join(" ")).toContain("Description must be 7–15 words (got 3)");
  });

  it("requires exactly 40 tags, with the seven technical terms, without repeats", () => {
    expect(validateMetadata(good({ tags: good().tags.slice(0, 39) })).errors.join(" ")).toContain("exactly 40 (got 39)");
    const withoutWeb = good({ tags: good().tags.filter((t) => t !== "web") });
    expect(validateMetadata(withoutWeb).errors.join(" ")).toContain("Tags must include: web");
    const repeated = good({ tags: [...good().tags.slice(0, 39), "ICON"] });
    expect(validateMetadata(repeated).errors.join(" ")).toContain("Tags repeat: icon");
  });
});

describe("restricted-content warnings", () => {
  it("warns about a style reference without blocking the record", () => {
    const record = good({ description: "An icon in the style of a famous painter, done quickly." });
    expect(restrictedWarnings(record).join(" ")).toContain("in the style of");
    const check = validateMetadata(record);
    expect(check.warnings.length).toBeGreaterThan(0);
    expect(check.errors).toEqual([]); // a warning is a review prompt, not a block
  });

  it("warns about brand wording in the tags", () => {
    const tags = [...good().tags.slice(0, 39), "brand-logo"];
    expect(restrictedWarnings(good({ tags })).join(" ")).toContain("review required");
  });
});

describe("parseMetadataText", () => {
  const answer = [
    "**Title:** Forward Momentum Through Open Space. Growth and speed.",
    "**Description:** Arrow shaped symbol expressing forward momentum and purposeful direction.",
    `**Tags:** ${[...REQUIRED_TAGS, ...Array.from({ length: 33 }, (_, i) => `tag-${i}`)].join(", ")}`,
  ].join("\n");

  it("parses the labelled template the prompt asks for", () => {
    const parsed = parseMetadataText(answer);
    expect(parsed.ok).toBe(true);
    expect(parsed.record?.title).toContain("Forward Momentum");
    expect(parsed.record?.tags).toHaveLength(40);
  });

  it("refuses an answer with a missing label instead of filling it in", () => {
    const parsed = parseMetadataText("Title: Forward Momentum Through Open Space. Growth and speed.");
    expect(parsed.ok).toBe(false);
    expect(parsed.errors.join(" ")).toContain("no Description field");
    expect(parsed.record).toBeNull();
  });

  it("reports the validation errors of a parsed-but-invalid answer", () => {
    const parsed = parseMetadataText("Title: Momentum\nDescription: short one\nTags: icon, web");
    expect(parsed.ok).toBe(false);
    expect(parsed.errors.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps a description that happens to contain a colon", () => {
    const parsed = parseMetadataText(`Title: Forward Momentum Through Open Space. Growth and speed.\nDescription: Motion idea: forward path expressed as clean geometry.\nTags: ${good().tags.join(", ")}`);
    expect(parsed.record?.description).toBe("Motion idea: forward path expressed as clean geometry.");
  });
});

describe("metadataFromJson", () => {
  it("accepts the structured shape, tags as an array or a comma string", () => {
    const record = good();
    expect(metadataFromJson(record).ok).toBe(true);
    expect(metadataFromJson({ ...record, tags: record.tags.join(", ") }).record?.tags).toHaveLength(40);
  });

  it("refuses a shape that is missing fields", () => {
    expect(metadataFromJson({ title: "x" }).errors.join(" ")).toContain("no Description field");
    expect(metadataFromJson("nope").errors[0]).toBe("the answer was not an object");
  });
});

describe("helpers", () => {
  it("splits and re-joins the keyword list, dropping empty entries", () => {
    expect(splitTags(" a, b ,, c ")).toEqual(["a", "b", "c"]);
    expect(tagsLine(["a", "b"])).toBe("a, b");
  });
});

describe("uploadprompt", () => {
  it("ships the confirmed default and falls back to it", () => {
    expect(isDefaultMetadataPrompt(DEFAULT_METADATA_PROMPT)).toBe(true);
    expect(parseMetadataPrompt("   ")).toBe(DEFAULT_METADATA_PROMPT);
    expect(DEFAULT_METADATA_PROMPT).toContain("Exactly 40 comma-separated keywords");
    expect(DEFAULT_METADATA_PROMPT).toContain("icon, pictogram, vector, stroke, line, editable, web");
  });

  it("adds the JSON contract only for structured output", () => {
    expect(finalPrompt("do it", true)).toContain('"tags"');
    expect(finalPrompt("do it", false)).toBe("do it");
  });

  it("previews the exact request without any key", () => {
    const text = requestPreview({
      prompt: "do it", model: "gemini-3.1-flash-lite", endpoint: "https://example.test/v1beta/models/x:generateContent",
      image: "image/jpeg · 1024×1024 · 210 KB", structured: true, temperature: 0.4,
    });
    expect(text).toContain("POST https://example.test/v1beta/models/x:generateContent");
    expect(text).toContain("model: gemini-3.1-flash-lite");
    expect(text).toContain("image: image/jpeg · 1024×1024 · 210 KB");
    expect(text).toContain("do it");
    expect(text).not.toMatch(/key/i);
  });
});
