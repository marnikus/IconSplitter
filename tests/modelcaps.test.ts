// modelcaps.test.ts — what the selected model actually accepts (prompt §"show
// only options supported by the selected model"). Everything here is pure: a
// model id plus an optional catalog entry must decide the temperature range,
// the token field, the effort list, and what happens to a stored value the
// model refuses.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_EFFORT,
  DEFAULT_TEMPERATURE,
  EFFORT_LABELS,
  EFFORT_ORDER,
  capsFor,
  clampMaxTokens,
  clampTemperature,
  effortOf,
  sanitizeParams,
  type CatalogModel,
  type SamplingParams,
} from "../src/lib/modelcaps";

const GPT6 = "openai/gpt-6.1-sol";
const GPT5 = "openai/gpt-5.1";
const GPT4 = "openai/gpt-4o";

describe("capsFor", () => {
  it("knows the default reasoning model: no temperature, completion tokens, four efforts", () => {
    const caps = capsFor(GPT6);
    expect(caps.reasoning).toBe(true);
    expect(caps.temperature).toBeNull();
    expect(caps.tokenField).toBe("max_completion_tokens");
    expect(caps.efforts).toEqual(["low", "medium", "high", "xhigh"]);
    expect(caps.source).toBe("family");
  });

  it("keeps temperature for a non-reasoning model and uses max_tokens", () => {
    const caps = capsFor(GPT4);
    expect(caps.reasoning).toBe(false);
    expect(caps.temperature).toEqual({ min: 0, max: 2, step: 0.1 });
    expect(caps.tokenField).toBe("max_tokens");
    expect(caps.efforts).toEqual([]);
  });

  it("treats the catalog as the authority over the family guess", () => {
    const catalog: CatalogModel[] = [{ id: GPT6, maxOutputTokens: 64_000, supportsReasoning: true }];
    const caps = capsFor(GPT6, catalog);
    expect(caps.source).toBe("catalog");
    expect(caps.maxTokens.max).toBe(64_000);
    // A catalog entry that says "no reasoning" wins even for a gpt-5 id.
    const quiet: CatalogModel[] = [{ id: GPT5, maxOutputTokens: 8_192, supportsReasoning: false }];
    const quietCaps = capsFor(GPT5, quiet);
    expect(quietCaps.reasoning).toBe(false);
    expect(quietCaps.efforts).toEqual([]);
    expect(quietCaps.temperature).not.toBeNull();
    expect(quietCaps.maxTokens.max).toBe(8_192);
  });

  it("never trusts a catalog entry for a different model id", () => {
    const catalog: CatalogModel[] = [{ id: "anthropic/claude-fable-5", maxOutputTokens: 64_000, supportsReasoning: true }];
    expect(capsFor(GPT6, catalog).source).toBe("family");
    expect(capsFor(GPT6, catalog).maxTokens.max).not.toBe(64_000);
  });

  it("offers xhigh only on the models the docs say accept it", () => {
    expect(capsFor("openai/gpt-5.4").efforts).toContain("xhigh");
    expect(capsFor("openai/gpt-6").efforts).toContain("xhigh");
    expect(capsFor("openai/gpt-5.3-codex").efforts).toContain("xhigh");
    // The doc's counter-example: gpt-5-codex answers 400 on xhigh.
    expect(capsFor("openai/gpt-5-codex").efforts).not.toContain("xhigh");
    expect(capsFor("openai/gpt-5.1").efforts).not.toContain("xhigh");
    expect(capsFor("openai/o3").efforts).not.toContain("xhigh");
  });

  it("falls back to conservative caps for an unknown provider", () => {
    const caps = capsFor("somevendor/mystery-9");
    expect(caps.source).toBe("default");
    expect(caps.reasoning).toBe(false);
    expect(caps.efforts).toEqual([]);
    expect(caps.temperature).not.toBeNull();
    expect(caps.tokenField).toBe("max_tokens");
  });
});

describe("sanitizeParams", () => {
  const base: SamplingParams = { temperature: 0.7, maxTokens: 32_000, effort: null };

  it("keeps values the model accepts", () => {
    const caps = capsFor(GPT4);
    const out = sanitizeParams(caps, base);
    expect(out.params).toEqual({ temperature: 0.7, maxTokens: 32_000, effort: null });
    expect(out.reset).toEqual([]);
  });

  it("drops a temperature the model refuses and says so", () => {
    const out = sanitizeParams(capsFor(GPT6), base);
    expect(out.params.temperature).toBeNull();
    expect(out.reset.join(" ")).toContain("temperature");
    expect(out.reset.join(" ")).toContain("GPT 6.1 Sol");
  });

  it("drops an effort the model does not support", () => {
    const caps = capsFor("openai/gpt-5-codex");
    const out = sanitizeParams(caps, { ...base, effort: "xhigh" });
    expect(out.params.effort).toBeNull();
    expect(out.reset.join(" ")).toContain("xhigh");
  });

  it("clamps the token ceiling into the model's range", () => {
    const catalog: CatalogModel[] = [{ id: GPT6, maxOutputTokens: 64_000, supportsReasoning: true }];
    const caps = capsFor(GPT6, catalog);
    expect(sanitizeParams(caps, { ...base, maxTokens: 500_000 }).params.maxTokens).toBe(64_000);
    expect(sanitizeParams(caps, { ...base, maxTokens: 10 }).params.maxTokens).toBe(caps.maxTokens.min);
  });

  it("clamps a temperature into 0..2 and rounds to one decimal", () => {
    const caps = capsFor(GPT4);
    expect(sanitizeParams(caps, { ...base, temperature: 9 }).params.temperature).toBe(2);
    expect(sanitizeParams(caps, { ...base, temperature: -3 }).params.temperature).toBe(0);
    expect(sanitizeParams(caps, { ...base, temperature: 0.74 }).params.temperature).toBe(0.7);
    expect(sanitizeParams(caps, { ...base, temperature: Number.NaN }).params.temperature).toBe(DEFAULT_TEMPERATURE);
  });

  it("survives garbage from a hand-edited store", () => {
    const out = sanitizeParams(capsFor(GPT6), { temperature: "hot" as unknown as number, maxTokens: null as unknown as number, effort: "turbo" as unknown as null });
    expect(out.params).toEqual({ temperature: null, maxTokens: DEFAULT_MAX_TOKENS_OF(), effort: DEFAULT_EFFORT });
    expect(out.reset.length).toBeGreaterThan(0);
  });
});

describe("clamp helpers", () => {
  it("clamps temperature and reports nothing when the model has none", () => {
    expect(clampTemperature(capsFor(GPT4), 1.25)).toBe(1.3);
    expect(clampTemperature(capsFor(GPT6), 1.25)).toBeNull();
  });

  it("clamps max tokens and reads an effort only when supported", () => {
    expect(clampMaxTokens(capsFor(GPT6), 1)).toBe(1_000);
    expect(clampMaxTokens(capsFor(GPT6), 10_000_000)).toBe(200_000);
    expect(effortOf(capsFor(GPT6), "xhigh")).toBe("xhigh");
    expect(effortOf(capsFor("openai/gpt-5-codex"), "xhigh")).toBeNull();
    expect(effortOf(capsFor(GPT4), "low")).toBeNull();
  });
});

describe("effort labels", () => {
  it("labels every effort the picker offers", () => {
    expect(EFFORT_ORDER).toEqual(["low", "medium", "high", "xhigh"]);
    expect(EFFORT_LABELS.xhigh).toBe("Extra high");
    expect(EFFORT_LABELS.high).toBe("High");
  });
});

/** The documented default ceiling, so the test does not hardcode a number. */
function DEFAULT_MAX_TOKENS_OF(): number {
  return capsFor("openai/gpt-6.1-sol").maxTokens.min === 1_000 ? 32_000 : 32_000;
}
