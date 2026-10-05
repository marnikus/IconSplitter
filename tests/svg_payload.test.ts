// svg_payload.test.ts — ONE builder composes a request and its prompt text, so
// the confirmation dialog can show EXACTLY what will be sent (feature §1).
// Each test fails if the builder stops being the single owner: a single-image
// request must use the single-image text, a batch must list every position in
// order, and only the fields the model accepts may reach the wire.
import { describe, expect, it } from "vitest";
import type { ModelCaps, SamplingParams } from "../src/lib/modelcaps";
import type { ManifestItem } from "../src/lib/svgbatch";
import { batchPrompt, singlePrompt } from "../src/lib/svgprompt";
import { buildPayload, payloadLines } from "../src/lib/svgpayload";

const CLASSIC: ModelCaps = {
  model: "vendor/classic", reasoning: false,
  temperature: { min: 0, max: 2, step: 0.1 },
  tokenField: "max_tokens",
  maxTokens: { min: 1_000, max: 200_000, step: 1_000 },
  efforts: [], source: "family",
};

/** The same model but reasoning: no temperature, completion tokens, effort. */
const REASONING: ModelCaps = {
  ...CLASSIC, model: "vendor/reasoner", reasoning: true, temperature: null,
  tokenField: "max_completion_tokens", efforts: ["low", "medium", "high"], source: "catalog",
};

const PROMPT = "Create 4 split SVG icons.\nSnap every endpoint to the curve.";
const IMAGE = `data:image/png;base64,${"A".repeat(64)}`;

function manifest(count: number): ManifestItem[] {
  return Array.from({ length: count }, (_, i) => ({
    position: i + 1, name: `icon-${i + 1}_AI`, relPath: `arch/icon-${i + 1}_AI.png`,
  }));
}

function build(count: number, caps: ModelCaps, params: SamplingParams) {
  return buildPayload({
    model: caps.model, userPrompt: PROMPT, manifest: manifest(count),
    image: IMAGE, caps, params,
  });
}

const textOf = (count: number, caps = CLASSIC, params: SamplingParams = { temperature: 0.7, maxTokens: 8_000, effort: null }) => {
  const part = build(count, caps, params).request.messages[0].content[0];
  return part.type === "text" ? part.text : "";
};

describe("buildPayload — the one request builder", () => {
  it("lists every position and name in order for a batch, with the exact user prompt", () => {
    const text = textOf(3);
    expect(text).toBe(batchPrompt(PROMPT, manifest(3)));
    expect(text).toContain("1 — icon-1_AI");
    expect(text).toContain("3 — icon-3_AI");
    expect(text).toContain(PROMPT);
    expect(text.indexOf("1 — icon-1_AI")).toBeLessThan(text.indexOf("2 — icon-2_AI"));
  });

  it("uses the single-image text (no manifest) when a request carries one image", () => {
    const text = textOf(1);
    expect(text).toBe(singlePrompt(PROMPT, "icon-1_AI"));
    expect(text).not.toContain("1 — icon-1_AI");
    expect(text).toContain("icon-1_AI");
  });

  it("sends the image as the second content part, byte for byte", () => {
    const { request } = build(2, CLASSIC, { temperature: 0.7, maxTokens: 8_000, effort: null });
    expect(request.messages[0].content[1]).toEqual({ type: "image_url", image_url: { url: IMAGE } });
  });

  it("sends only the sampling fields the selected model accepts", () => {
    const classic = build(2, CLASSIC, { temperature: 0.7, maxTokens: 8_000, effort: "medium" }).request;
    expect(classic.temperature).toBe(0.7);
    expect(classic.max_tokens).toBe(8_000);
    expect(classic.max_completion_tokens).toBeUndefined();
    expect(classic.reasoning_effort).toBeUndefined(); // classic offers no efforts

    const reasoning = build(2, REASONING, { temperature: 0.7, maxTokens: 8_000, effort: "medium" }).request;
    expect(reasoning.temperature).toBeUndefined();
    expect(reasoning.max_tokens).toBeUndefined();
    expect(reasoning.max_completion_tokens).toBe(8_000);
    expect(reasoning.reasoning_effort).toBe("medium");
  });

  it("never carries the prompt twice or adds a second message", () => {
    const { request } = build(4, CLASSIC, { temperature: null, maxTokens: 4_000, effort: null });
    expect(request.messages).toHaveLength(1);
    expect(request.messages[0].role).toBe("user");
    expect(request.messages[0].content).toHaveLength(2);
    const text = textOf(4);
    expect(text.split(PROMPT)).toHaveLength(2); // appears exactly once
  });
});

describe("payloadLines — the wire preview is derived from the request", () => {
  it("names every field the request carries, in wire order", () => {
    const { request } = build(2, REASONING, { temperature: 0.7, maxTokens: 8_000, effort: "high" });
    const names = payloadLines(request).map((line) => line.slice(0, line.indexOf(":")));
    expect(names).toEqual([
      "model",
      "messages[0].content[0]",
      "messages[0].content[1]",
      ...Object.keys(request).filter((k) => k !== "model" && k !== "messages"),
    ]);
  });

  it("states the sizes of both content parts and never the image bytes", () => {
    const { request } = build(2, CLASSIC, { temperature: 0.7, maxTokens: 8_000, effort: null });
    const lines = payloadLines(request);
    const joined = lines.join("\n");
    expect(joined).toContain(`${textOf(2).length} chars`);
    expect(joined).toContain(`${IMAGE.length} chars`);
    expect(joined).not.toContain("AAAA");
  });
});
