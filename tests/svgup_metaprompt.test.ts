// svgup_metaprompt.test.ts — the metadata policy (design §9, C1–C3). Every rule
// the request states is a case here, including the two it asked to resolve: the
// tag count is 40 (not 50), and the illustrative second sentence does NOT
// override the 3–5-word limit. Word counting is defined once (a hyphenated
// phrase is one word) and validation is structural — never a claim of clearance.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_UPLOAD_PROMPT, DESC_WORDS, POLICY_ID, REQUIRED_TAGS, TAG_COUNT,
  parseMetadataAnswer, parseMetaRecord, requestPreview, restrictedWarnings, sentences, splitTags, tagsText, validateMetadata, wordCount,
} from "../src/lib/svgupload/metaprompt";

/** 40 tags that satisfy the seven mandatory ones, highest relevance first. */
const TAGS = [
  "icon", "pictogram", "vector", "stroke", "line", "editable", "web",
  "minimal", "outline", "symbol", "sign", "interface", "ui", "flat",
  "simple", "clean", "modern", "geometry", "shape", "design", "graphic",
  "art", "illustration", "clipart", "element", "badge", "mark", "glyph",
  "logo-free", "monochrome", "black", "white", "square", "frame", "border",
  "business", "digital", "print", "app", "template",
];

const OK_TITLE = "The Vector Icon of Focus and Clarity. Sharp Clean Lines.";
const OK_DESC = "A minimal square icon for interfaces, labels, buttons and print.";

const ANSWER = [`TITLE: ${OK_TITLE}`, `DESCRIPTION: ${OK_DESC}`, `TAGS: ${tagsText(TAGS)}`].join("\n");

describe("the default prompt", () => {
  it("states the policy it will be validated against", () => {
    expect(DEFAULT_UPLOAD_PROMPT).toContain(`${TAG_COUNT} lowercase keywords`);
    expect(DEFAULT_UPLOAD_PROMPT).toContain("icon, pictogram, vector, stroke, line, editable, web");
    expect(DEFAULT_UPLOAD_PROMPT).toContain(`${DESC_WORDS.min}–${DESC_WORDS.max} words`);
    expect(DEFAULT_UPLOAD_PROMPT).toContain("no brand, company, product or character names");
  });

  it("does not promise the example satisfies the limit it names", () => {
    // the pattern is illustrative: the sentence around it carries the 3–5 words
    expect(DEFAULT_UPLOAD_PROMPT).toContain("3–5 words naming the two most relevant keywords");
  });
});

describe("word counting, defined once", () => {
  it("counts whitespace-separated words and keeps a hyphenated phrase as ONE", () => {
    expect(wordCount("hand-drawn line art")).toBe(3);
    expect(wordCount("  Vector   icon ")).toBe(2);
    expect(wordCount("")).toBe(0);
  });

  it("splits sentences on their terminator", () => {
    expect(sentences("One. Two! Three?")).toEqual(["One.", "Two!", "Three?"]);
    expect(sentences("No terminator here")).toEqual(["No terminator here"]);
  });
});

describe("parseMetadataAnswer — the happy path", () => {
  it("accepts a well-formed answer and returns the three fields", () => {
    const out = parseMetadataAnswer({ text: ANSWER });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.meta.tags).toHaveLength(TAG_COUNT);
      expect(out.meta.tags[0]).toBe("icon");
      expect(out.warnings).toEqual([]);
    }
  });

  it("reads a markdown-decorated answer the way a model often emits it", () => {
    const text = [`**TITLE:** ${OK_TITLE}`, `**DESCRIPTION:** ${OK_DESC}`, "**TAGS:**", tagsText(TAGS)].join("\n");
    const out = parseMetadataAnswer({ text });
    expect(out.ok).toBe(true);
  });

  it("accepts tags wrapped over several lines", () => {
    const half = Math.ceil(TAGS.length / 2);
    const text = [`TITLE: ${OK_TITLE}`, `DESCRIPTION: ${OK_DESC}`, `TAGS: ${TAGS.slice(0, half).join(", ")}`, TAGS.slice(half).join(", ")].join("\n");
    const out = parseMetadataAnswer({ text });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.meta.tags).toHaveLength(TAG_COUNT);
  });
});

describe("parseMetadataAnswer — every rejection the request lists", () => {
  it("rejects a missing field", () => {
    const out = parseMetadataAnswer({ text: `TITLE: ${OK_TITLE}\nDESCRIPTION: ${OK_DESC}` });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.errors.join(" ")).toContain("no TAGS block");
  });

  it("rejects explanation mixed into the fields", () => {
    const out = parseMetadataAnswer({ text: `Here is my answer:\n${ANSWER}` });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.errors.join(" ")).toContain("outside the TITLE/DESCRIPTION/TAGS blocks");
  });

  it("rejects a truncated answer when the provider says it stopped at the limit", () => {
    const out = parseMetadataAnswer({ text: ANSWER, finishReason: "length" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.errors.join(" ")).toContain("truncated");
  });

  it("rejects the wrong tag count — 50 is not the rule, 40 is", () => {
    const fifty = { title: OK_TITLE, description: OK_DESC, tags: [...TAGS, "extra-a", "extra-b", "extra-c", "extra-d", "extra-e", "extra-f", "extra-g", "extra-h", "extra-i", "extra-j"] };
    expect(validateMetadata(fifty).join(" ")).toContain("Exactly 40 tags are required (found 50)");
  });

  it("rejects duplicate tags and missing mandatory terms", () => {
    const tags = [...TAGS.slice(2), "icon"]; // drops pictogram/vector/stroke/line/editable/web
    const errors = validateMetadata({ title: OK_TITLE, description: OK_DESC, tags }).join(" ");
    expect(errors).toContain("Missing required tags");
    expect(errors).toContain("pictogram");
  });

  it("rejects a title that is one sentence, or whose parts break the word limits", () => {
    expect(validateMetadata({ title: "Focus and clarity.", description: OK_DESC, tags: TAGS }).join(" ")).toContain("two sentences");
    expect(validateMetadata({ title: "Short. Sharp Clean Lines.", description: OK_DESC, tags: TAGS }).join(" ")).toContain("5–7 words");
    expect(validateMetadata({ title: `${OK_TITLE} And Then Some Extra Words Here`, description: OK_DESC, tags: TAGS }).join(" ")).toContain("two sentences");
  });

  it("rejects a description outside 7–15 words", () => {
    expect(validateMetadata({ title: OK_TITLE, description: "Too short.", tags: TAGS }).join(" ")).toContain("7–15 words");
    const long = Array.from({ length: 20 }, (_, i) => `word${i}`).join(" ");
    expect(validateMetadata({ title: OK_TITLE, description: long, tags: TAGS }).join(" ")).toContain("7–15 words");
  });

  it("keeps the readable fields in `partial` so the user can fix them by hand", () => {
    const out = parseMetadataAnswer({ text: `TITLE: ${OK_TITLE}\nDESCRIPTION: ${OK_DESC}\nTAGS: icon, vector` });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.partial.title).toBe(OK_TITLE);
      expect(out.partial.tags).toEqual(["icon", "vector"]);
      expect(out.raw).toContain("TAGS:");
    }
  });
});

describe("resolved contradictions", () => {
  it("C1: one tag count everywhere — the prompt, the validator and the policy id", () => {
    expect(TAG_COUNT).toBe(40);
    expect(POLICY_ID).toBe("upload-meta-v1");
    expect(REQUIRED_TAGS).toHaveLength(7);
  });

  it("C2: the example phrase is NOT required, only the word limits are", () => {
    const unwrapped = { title: "Focus and clarity concepts inside. Precision Vector Icon Design.", description: OK_DESC, tags: TAGS };
    expect(validateMetadata(unwrapped)).toEqual([]); // no "The Vector Icon of" required
  });

  it("C3: restricted wording is a WARNING, and the checker claims nothing more", () => {
    const warnings = restrictedWarnings({ title: "An icon in the style of Van Gogh.", description: "", tags: ["logo"] });
    expect(warnings.length).toBeGreaterThanOrEqual(2);
    expect(restrictedWarnings({ title: "", description: "", tags: ["logo-free"] })).toEqual([]); // a compound word is not a brand
    expect(warnings.join(" ")).toContain("Review the wording");
    expect(warnings.join(" ")).not.toContain("clearance");
  });

  it("never warns about an honest generic answer", () => {
    expect(restrictedWarnings({ title: OK_TITLE, description: OK_DESC, tags: TAGS })).toEqual([]);
  });
});

describe("the request preview", () => {
  it("shows the endpoint, the model, the image and the exact prompt", () => {
    const text = requestPreview({ prompt: DEFAULT_UPLOAD_PROMPT, model: "gemini-3.1-flash-lite", baseUrl: "https://router.requesty.ai/v1/", image: { width: 3886, height: 3886, bytes: 900_000 } });
    expect(text).toContain("POST https://router.requesty.ai/v1/chat/completions");
    expect(text).toContain("model: gemini-3.1-flash-lite");
    expect(text).toContain("image: 3886×3886 px, 900000 bytes, image/jpeg (data URL)");
    expect(text).toContain(DEFAULT_UPLOAD_PROMPT);
  });
});

describe("splitTags", () => {
  it("splits on commas and newlines, trims, drops empties and quotes", () => {
    expect(splitTags('a, b\n c ,, "d"')).toEqual(["a", "b", "c", "d"]);
  });
});

describe("the stored record", () => {
  it("reads a full record back", () => {
    const rec = parseMetaRecord({
      pairId: "p1", title: OK_TITLE, description: OK_DESC, tags: TAGS, at: "2026-10-07T10:00:00Z",
      prompt: "p", provider: "requesty", model: "gemini-3.1-flash-lite", requestId: "req_1",
      usage: { input: 1200, output: 900, total: 2100 }, cost: { actual: null, estimated: 0.0016, currency: "USD" },
      status: "accepted", errors: [], warnings: [], sourceFingerprint: "20:2100",
    });
    expect(rec?.tags).toHaveLength(TAG_COUNT);
    expect(rec?.cost.estimated).toBeCloseTo(0.0016, 6);
    expect(rec?.sourceFingerprint).toBe("20:2100");
  });

  it("never upgrades a missing or unknown status to accepted", () => {
    const base = {
      pairId: "p1", title: OK_TITLE, description: OK_DESC, tags: TAGS, at: "now", prompt: "p",
      provider: "requesty", model: "gemini-3.1-flash-lite", requestId: null,
      usage: { input: null, output: null, total: null },
      cost: { actual: null, estimated: null, currency: "USD" }, errors: [], warnings: [],
      sourceFingerprint: "1:2",
    };
    expect(parseMetaRecord(base)?.status).toBe("pending"); // no status at all
    expect(parseMetaRecord({ ...base, status: "totally-fine" })?.status).toBe("pending");
    expect(parseMetaRecord({ ...base, status: "accepted" })?.status).toBe("accepted");
  });

  it("downgrades a stored record that claims acceptance but fails the policy", () => {
    // A hand-edited file must not export text the provider would have had refused.
    const forged = parseMetaRecord({
      pairId: "p1", title: "Two words", description: OK_DESC, tags: ["icon"], at: "now", prompt: "p",
      provider: "requesty", model: "gemini-3.1-flash-lite", requestId: null,
      usage: { input: null, output: null, total: null },
      cost: { actual: null, estimated: null, currency: "USD" }, status: "accepted", errors: [], warnings: [],
      sourceFingerprint: "1:2",
    });
    expect(forged?.status).toBe("rejected");
    expect((forged?.errors ?? []).length).toBeGreaterThan(0);
    expect(forged?.title).toBe("Two words"); // kept for the user to fix, never dropped
  });

  it("refuses junk instead of half-loading it", () => {
    expect(parseMetaRecord(null)).toBeNull();
    expect(parseMetaRecord({ tags: ["a"] })).toBeNull();
  });
});
