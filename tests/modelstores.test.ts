// paramstore.test.ts + catalog.test.ts — the two stores the model controls need
// (RULE 13): per-model sampling settings in localStorage, and the Requesty
// model catalog that says what each model accepts.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { capsFor, DEFAULT_PARAMS, type SamplingParams } from "../src/lib/modelcaps";
import {
  loadParamMap,
  paramsFor,
  saveParamMap,
  withParams,
} from "../src/svg/paramstore";
import {
  catalogAge,
  fetchCatalog,
  isStale,
  loadCatalog,
  parseCatalog,
  refreshCatalog,
  saveCatalog,
} from "../src/svg/catalog";

const GPT4 = "openai/gpt-4o";
const GPT6 = "openai/gpt-6.1-sol";

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("paramstore", () => {
  it("keeps one entry per model and never mixes them up", () => {
    const gpt4: SamplingParams = { temperature: 0.2, maxTokens: 4_000, effort: null };
    const gpt6: SamplingParams = { temperature: null, maxTokens: 48_000, effort: "high" };
    saveParamMap(withParams(withParams({}, GPT4, gpt4), GPT6, gpt6));
    expect(paramsFor(loadParamMap(), GPT4)).toEqual(gpt4);
    expect(paramsFor(loadParamMap(), GPT6)).toEqual(gpt6);
    expect(paramsFor(loadParamMap(), "openai/o3")).toBeUndefined();
  });

  it("falls back to defaults for a model that was never saved", () => {
    expect(paramsFor(loadParamMap(), GPT6)).toBeUndefined();
    const caps = capsFor(GPT6);
    const stored = paramsFor(loadParamMap(), GPT6) ?? DEFAULT_PARAMS;
    expect(stored.maxTokens).toBe(DEFAULT_PARAMS.maxTokens);
    expect(caps.efforts).toContain("low");
  });

  it("survives a corrupt payload instead of breaking the tab (RULE 13)", () => {
    localStorage.setItem("iconSplitter.svg.modelParams.v1", "{not json");
    expect(loadParamMap()).toEqual({});
    localStorage.setItem("iconSplitter.svg.modelParams.v1", JSON.stringify({ v: 1, byModel: { [GPT4]: { temperature: "hot", maxTokens: null, effort: 7 } } }));
    const map = loadParamMap();
    // Kept as-is: sanitizing against the model is modelcaps' job, not the store's.
    expect(paramsFor(map, GPT4)).toEqual({ temperature: "hot", maxTokens: null, effort: 7 });
  });

  it("drops entries that are not objects", () => {
    localStorage.setItem("iconSplitter.svg.modelParams.v1", JSON.stringify({ v: 1, byModel: { [GPT4]: "nope", [GPT6]: { temperature: null, maxTokens: 1000, effort: null } } }));
    expect(paramsFor(loadParamMap(), GPT4)).toBeUndefined();
    expect(paramsFor(loadParamMap(), GPT6)).toEqual({ temperature: null, maxTokens: 1000, effort: null });
  });
});

describe("catalog", () => {
  const payload = {
    object: "list",
    data: [
      { id: GPT6, max_output_tokens: 64_000, context_window: 400_000, supports_reasoning: true },
      { id: GPT4, max_output_tokens: 16_384, context_window: 128_000, supports_reasoning: false },
      { id: "anthropic/claude-fable-5", supports_reasoning: true },
    ],
  };

  it("reads the fields the capability rules need", () => {
    expect(parseCatalog(payload)).toEqual([
      { id: GPT6, maxOutputTokens: 64_000, supportsReasoning: true },
      { id: GPT4, maxOutputTokens: 16_384, supportsReasoning: false },
      { id: "anthropic/claude-fable-5", maxOutputTokens: null, supportsReasoning: true },
    ]);
  });

  it("ignores rows without an id and any other shape", () => {
    expect(parseCatalog({ data: [{ object: "model" }, null, "x"] })).toEqual([]);
    expect(parseCatalog(null)).toEqual([]);
    expect(parseCatalog({ data: "nope" })).toEqual([]);
  });

  it("caches the catalog with its age and knows when it is stale", () => {
    expect(loadCatalog()).toBeNull();
    saveCatalog(parseCatalog(payload));
    const cached = loadCatalog();
    expect(cached?.models).toHaveLength(3);
    expect(catalogAge(cached)).toBeGreaterThanOrEqual(0);
    expect(isStale(cached)).toBe(false);
  });

  it("fetches the public list without a key and never sends one when absent", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const transport = async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(payload), { status: 200 });
    };
    const models = await fetchCatalog("https://router.requesty.ai/v1", null, transport);
    expect(models).toHaveLength(3);
    expect(calls[0].url).toBe("https://router.requesty.ai/v1/models");
    expect(calls[0].init.headers).not.toHaveProperty("Authorization");
  });

  it("sends the key when there is one, and reports a failure without leaking it", async () => {
    const key = ["rq", "live", "Zx9QwErTy7UiOpAsDfGh4JkLzXcVbNm2"].join("_");
    let seen = "";
    const transport = async (_url: string, init: RequestInit) => {
      seen = String((init.headers as Record<string, string>).Authorization);
      return new Response(JSON.stringify({ error: { message: `bad key ${key}` } }), { status: 403 });
    };
    await expect(fetchCatalog("https://router.requesty.ai/v1", key, transport)).rejects.toThrow(/model list unavailable/);
    expect(seen).toBe(`Bearer ${key}`);
    const failure = await fetchCatalog("https://router.requesty.ai/v1", key, transport).catch((e: Error) => e.message);
    expect(failure).not.toContain(key);
  });

  it("refreshCatalog stores what it fetched so the next boot is instant", async () => {
    const transport = async () => new Response(JSON.stringify(payload), { status: 200 });
    const models = await refreshCatalog("https://router.requesty.ai/v1", null, transport);
    expect(models).toHaveLength(3);
    expect(loadCatalog()?.models).toHaveLength(3);
  });
});
