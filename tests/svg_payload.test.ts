// svg_payload.test.ts — the request the user confirms is the request that is
// sent (confirm-preview.md C-0..C-4). Pure module, so every case is a plain
// call (RULE 5/8). The two golden strings are today's wording, copied from the
// provider contract BEFORE the builder moved: composePrompt must not change
// what the provider is told, only where the text is built.
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, type SvgConfig } from "../src/lib/svgconfig";
import { DEFAULT_PARAMS, capsFor, type SamplingParams } from "../src/lib/modelcaps";
import type { BatchSource, ManifestItem } from "../src/lib/svgbatch";
import { composePrompt, joinBlocks } from "../src/lib/svgprompt";
import {
  IMAGE_SLOT, assertSendable, describeRequest, elideImage, fingerprintOf, prepareRun, withImage,
  type PrepareArgs,
} from "../src/lib/svgpayload";
import { wireHeaders, type ChatRequest } from "../src/lib/svgrequest";

const RULES = "  Make it crisp.  ";
const ITEMS: ManifestItem[] = [
  { position: 1, name: "fog_AI", relPath: "architecture/fog_AI.png" },
  { position: 2, name: "court_AI", relPath: "architecture/court_AI.png" },
];

const GOLDEN_BATCH = [
  "Here is a batch of icons arranged in numbered grid order:",
  "1 — fog_AI",
  "2 — court_AI",
  "",
  "Create one SVG icon for every position. Return the SVGs in the same numeric order, starting from 1. Use the exact same name in the SVG <title>.",
  "",
  "Make it crisp.",
].join("\n");

const GOLDEN_SINGLE = "Make it crisp.\n\nIcon name (use it as the SVG <title>): fog_AI";

const source = (name: string): BatchSource => ({
  sourceId: `pair_${name}`, name: `${name}_AI`, relPath: `architecture/${name}_AI.png`, fingerprint: `9:${name.length}`,
});
const sources = (n: number): BatchSource[] => Array.from({ length: n }, (_, i) => source(`icon${i + 1}`));

const config = (over: Partial<SvgConfig> = {}): SvgConfig => ({ ...DEFAULT_CONFIG, ...over });

function prep(over: Partial<PrepareArgs> = {}) {
  const cfg = over.config ?? config();
  return prepareRun({
    sources: sources(2), config: cfg, caps: capsFor(cfg.model), params: DEFAULT_PARAMS, rules: RULES, ...over,
  });
}

describe("composePrompt — what the provider is told (C-0)", () => {
  it("builds the batch text byte for byte as today's batch template", () => {
    expect(composePrompt(RULES, ITEMS).text).toBe(GOLDEN_BATCH);
  });

  it("builds the single text byte for byte as today's single template", () => {
    expect(composePrompt(RULES, ITEMS.slice(0, 1)).text).toBe(GOLDEN_SINGLE);
  });

  it("flips from the batch to the single template at exactly one item", () => {
    expect(composePrompt(RULES, ITEMS.slice(0, 1)).kind).toBe("single");
    expect(composePrompt(RULES, ITEMS).kind).toBe("batch");
  });

  it("names its blocks and makes only the rules editable", () => {
    const batch = composePrompt(RULES, ITEMS).blocks;
    expect(batch.map((b) => b.id)).toEqual(["summary", "positions", "protocol", "rules"]);
    expect(batch.filter((b) => b.editable).map((b) => b.id)).toEqual(["rules"]);
    const single = composePrompt(RULES, ITEMS.slice(0, 1)).blocks;
    expect(single.map((b) => b.id)).toEqual(["rules", "naming"]);
    expect(single.filter((b) => b.editable).map((b) => b.id)).toEqual(["rules"]);
  });

  it("holds the ordered positions, one per line, in one block", () => {
    const positions = composePrompt(RULES, ITEMS).blocks.find((b) => b.id === "positions");
    expect(positions?.text).toBe("1 — fog_AI\n2 — court_AI");
  });

  it("is exactly its blocks joined with the only two separators there are", () => {
    const parts = composePrompt(RULES, ITEMS);
    expect(parts.text).toBe(joinBlocks(parts.blocks));
    const [summary, positions, protocol, rules] = parts.blocks.map((b) => b.text);
    expect(parts.text).toBe(`${summary}\n${positions}\n\n${protocol}\n\n${rules}`);
  });

  it("trims the rules in the text and passes their characters through verbatim", () => {
    const tricky = "  keep $& and $1 and\nnewlines  ";
    const parts = composePrompt(tricky, ITEMS);
    expect(parts.blocks.find((b) => b.id === "rules")?.text).toBe("keep $& and $1 and\nnewlines");
    expect(parts.text.endsWith("keep $& and $1 and\nnewlines")).toBe(true);
  });
});

describe("prepareRun — one builder (C-1)", () => {
  it("plans nine sources at four per request as 4 / 4 / 1 and uses the single template for the last", () => {
    const run = prep({ sources: sources(9) });
    expect(run.batches.map((b) => b.plan.items.length)).toEqual([4, 4, 1]);
    expect(run.batches.map((b) => b.parts.kind)).toEqual(["batch", "batch", "single"]);
    expect(run.batches[2].parts.text).toContain("Icon name (use it as the SVG <title>): icon9_AI");
  });

  it("keeps the rules as typed and records the endpoint and model", () => {
    const run = prep();
    expect(run.rules).toBe(RULES);
    expect(run.model).toBe(DEFAULT_CONFIG.model);
    expect(run.endpoint).toBe("https://router.requesty.ai/v1/chat/completions");
    expect(run.v).toBe(1);
  });

  it("puts the batch text and the image slot into the request", () => {
    const [first] = prep().batches;
    const [text, image] = first.request.messages[0].content;
    expect(text).toEqual({ type: "text", text: first.parts.text });
    expect(image).toEqual({ type: "image_url", image_url: { url: IMAGE_SLOT } });
  });

  it("asks a reasoning model only for what it accepts", () => {
    const params: SamplingParams = { temperature: 0.7, maxTokens: 12_000, effort: "high" };
    const request = prep({ params }).batches[0].request;
    expect(request.max_completion_tokens).toBe(12_000);
    expect(request.reasoning_effort).toBe("high");
    expect("temperature" in request).toBe(false);
    expect("max_tokens" in request).toBe(false);
  });

  it("asks a classic model for temperature and max_tokens and never for an effort", () => {
    const cfg = config({ model: "openai/gpt-4o" });
    const request = prep({ config: cfg, params: { temperature: 0.4, maxTokens: 8_000, effort: "high" } }).batches[0].request;
    expect(request).toMatchObject({ temperature: 0.4, max_tokens: 8_000 });
    expect("reasoning_effort" in request).toBe(false);
    expect("max_completion_tokens" in request).toBe(false);
  });

  it("omits the effort when the user left it on the model default", () => {
    expect("reasoning_effort" in prep().batches[0].request).toBe(false);
  });
});

describe("the image slot (C-3, C-4)", () => {
  const request = (): ChatRequest => prep().batches[0].request;
  const DATA = "data:image/png;base64,AAAA";

  it("is not a data URL, so a request that leaks it is refused", () => {
    expect(IMAGE_SLOT.startsWith("data:")).toBe(false);
    expect(() => assertSendable(request())).toThrow(/data:image/);
  });

  it("is filled by withImage, which changes the image URL and nothing else", () => {
    const filled = withImage(request(), DATA);
    expect(filled.messages[0].content[1]).toEqual({ type: "image_url", image_url: { url: DATA } });
    expect(elideImage(filled)).toEqual(request());
    expect(() => assertSendable(filled)).not.toThrow();
  });

  it("refuses to fill a request that already holds an image or has no slot at all", () => {
    expect(() => withImage(withImage(request(), DATA), DATA)).toThrow(/exactly one image slot/);
    const noImage: ChatRequest = { model: "m", messages: [{ role: "user", content: [{ type: "text", text: "t" }] }] };
    expect(() => withImage(noImage, DATA)).toThrow(/exactly one image slot/);
  });

  it("refuses a request with two slots", () => {
    const r = request();
    const two: ChatRequest = { ...r, messages: [{ role: "user", content: [...r.messages[0].content, r.messages[0].content[1]] }] };
    expect(() => withImage(two, DATA)).toThrow(/exactly one image slot/);
  });

  it("never mutates what it is given", () => {
    const frozen = request();
    Object.freeze(frozen);
    Object.freeze(frozen.messages);
    Object.freeze(frozen.messages[0]);
    Object.freeze(frozen.messages[0].content);
    expect(() => withImage(frozen, DATA)).not.toThrow();
    expect(() => elideImage(withImage(frozen, DATA))).not.toThrow();
    expect(frozen.messages[0].content[1]).toEqual({ type: "image_url", image_url: { url: IMAGE_SLOT } });
  });

  it("is sendable only with a data:image URL — not http, not empty, not absent", () => {
    for (const url of ["https://example.com/a.png", "", "data:text/plain;base64,AAAA"]) {
      const r = request();
      const bad: ChatRequest = { ...r, messages: [{ role: "user", content: [r.messages[0].content[0], { type: "image_url", image_url: { url } }] }] };
      expect(() => assertSendable(bad)).toThrow(/data:image/);
    }
    const textOnly: ChatRequest = { model: "m", messages: [{ role: "user", content: [{ type: "text", text: "t" }] }] };
    expect(() => assertSendable(textOnly)).toThrow(/data:image/);
  });
});

describe("fingerprints (C-7)", () => {
  const fp = (over: Partial<PrepareArgs> = {}) => prep(over).batches[0].fingerprint;

  it("is eight hex digits, a dot and the JSON length in base 36 — and stable", () => {
    expect(fp()).toMatch(/^[0-9a-f]{8}\.[0-9a-z]+$/);
    expect(fp()).toBe(fp());
  });

  it("does not depend on the image, so the preview and the wire agree on it", () => {
    const r = prep().batches[0].request;
    expect(fingerprintOf(withImage(r, "data:image/png;base64,AAAA"))).toBe(fingerprintOf(r));
  });

  it("moves with one character of the rules", () => {
    expect(fp({ rules: `${RULES}.` })).not.toBe(fp());
  });

  it("moves with the model", () => {
    const cfg = config({ model: "openai/gpt-6.1-sol2" });
    expect(fp({ config: cfg })).not.toBe(fp());
  });

  it("moves with a file name and with a position", () => {
    const base = sources(2);
    const renamed = [base[0], { ...base[1], name: `${base[1].name}x` }];
    expect(fp({ sources: renamed })).not.toBe(fp({ sources: base }));
    expect(fp({ sources: [base[1], base[0]] })).not.toBe(fp({ sources: base }));
  });

  it("gives a run a fingerprint that moves when any one request changes", () => {
    const base = prep({ sources: sources(9) });
    const edited = sources(9);
    edited[8] = { ...edited[8], name: "other_AI" };
    expect(prep({ sources: edited }).fingerprint).not.toBe(base.fingerprint);
    expect(prep({ sources: sources(9) }).fingerprint).toBe(base.fingerprint);
  });
});

describe("describeRequest — read from the object, not from the settings", () => {
  const caps = capsFor(DEFAULT_CONFIG.model);

  it("says what a reasoning request carries", () => {
    expect(describeRequest(prep().batches[0].request, caps)).toBe("no temperature · 32 000 max tokens · effort default");
  });

  it("names the chosen effort", () => {
    const request = prep({ params: { ...DEFAULT_PARAMS, effort: "high" } }).batches[0].request;
    expect(describeRequest(request, caps)).toBe("no temperature · 32 000 max tokens · effort high");
  });

  it("says what a classic request carries and has no effort part", () => {
    const cfg = config({ model: "openai/gpt-4o" });
    const request = prep({ config: cfg }).batches[0].request;
    expect(describeRequest(request, capsFor(cfg.model))).toBe("temperature 0.7 · 32 000 max tokens");
  });

  it("names a chosen temperature of a classic model, and an unchosen effort of a reasoning one", () => {
    const classic = config({ model: "openai/gpt-4o" });
    const withTemperature = prep({ config: classic, params: { temperature: 0.4, maxTokens: 32_000, effort: null } }).batches[0].request;
    expect(describeRequest(withTemperature, capsFor(classic.model))).toBe("temperature 0.4 · 32 000 max tokens");
    const unchosen = prep({ params: { temperature: null, maxTokens: 32_000, effort: null } }).batches[0].request;
    expect(describeRequest(unchosen, caps)).toBe("no temperature · 32 000 max tokens · effort default");
  });

  it("says so when no output ceiling was asked for, instead of printing a zero", () => {
    const open = prep({ params: { temperature: null, maxTokens: 0, effort: null } }).batches[0].request;
    expect(describeRequest(open, caps)).toBe("no temperature · provider-default max tokens · effort default");
  });

  it("follows the object: change the request and the line changes", () => {
    const request = { ...prep().batches[0].request, max_completion_tokens: 5_000 };
    expect(describeRequest(request, caps)).toContain("5 000 max tokens");
  });
});

describe("wireHeaders", () => {
  it("lists Content-Type and Authorization and nothing else", () => {
    expect(Object.keys(wireHeaders("  abc123  ")).sort()).toEqual(["Authorization", "Content-Type"]);
    expect(wireHeaders("  abc123  ")).toEqual({ "Content-Type": "application/json", Authorization: "Bearer abc123" });
  });
});
