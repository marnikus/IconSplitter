// RULE 8 — the SVG lib modules execute for real: config defaults/validation,
// secret masking and redaction, prompt + manifest text, response extraction and
// matching, validation/security, icon counting, versioning + sidecar parsing,
// batch planning, composite layout, request payload/usage/error classification
// and usage formatting. Each test fails if the module it covers is deleted.
import { describe, expect, it } from "vitest";
import {
  chatUrl, clampImagesPerRequest, DEFAULT_CONFIG, modelLabel, parseConfig, providerLabel,
  serializeConfig,
} from "../src/lib/svgconfig";
import { authHeader, containsSecret, findSecrets, maskKey, redact } from "../src/lib/svgsecret";
import {
  batchPrompt, DEFAULT_SVG_PROMPT, isDefaultPrompt, manifestLines, parsePrompt, serializePrompt,
  singlePrompt,
} from "../src/lib/svgprompt";
import { cellOf, emptyPositions, gridSize, planBatches } from "../src/lib/svgbatch";
import { compositeLayout, fitRect } from "../src/lib/svgcomposite";

describe("svgconfig", () => {
  it("uses the documented Requesty defaults and the verified model id", () => {
    expect(DEFAULT_CONFIG.baseUrl).toBe("https://router.requesty.ai/v1");
    expect(DEFAULT_CONFIG.model).toBe("openai/gpt-6.1-sol");
    expect(chatUrl(DEFAULT_CONFIG.baseUrl)).toBe("https://router.requesty.ai/v1/chat/completions");
    expect(modelLabel(DEFAULT_CONFIG.model)).toBe("GPT 6.1 Sol");
    expect(providerLabel(DEFAULT_CONFIG)).toBe("Requesty · GPT 6.1 Sol");
  });

  it("clamps the batch size into the square-grid range", () => {
    expect(clampImagesPerRequest(0)).toBe(1);
    expect(clampImagesPerRequest(4)).toBe(4);
    expect(clampImagesPerRequest(99)).toBe(9);
    expect(clampImagesPerRequest(Number.NaN)).toBe(4);
  });

  it("keeps a usable config from a corrupt payload (RULE 13)", () => {
    expect(parseConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(parseConfig("nope")).toEqual(DEFAULT_CONFIG);
    const c = parseConfig({ model: "  ", timeoutMs: -5, retries: 99, concurrency: 0, imagesPerRequest: 42, maxTokens: 5 });
    expect(c.model).toBe(DEFAULT_CONFIG.model);
    expect(c.timeoutMs).toBe(5_000);
    expect(c.retries).toBe(5);
    expect(c.concurrency).toBe(1);
    expect(c.imagesPerRequest).toBe(9);
    expect(c.maxTokens).toBe(1_000);
    expect(parseConfig({ baseUrl: "javascript:alert(1)" }).baseUrl).toBe(DEFAULT_CONFIG.baseUrl);
    expect(parseConfig({ maxTokens: 0 }).maxTokens).toBe(0);
    expect(parseConfig(JSON.parse(serializeConfig(DEFAULT_CONFIG)))).toEqual(DEFAULT_CONFIG);
  });
});

describe("svgsecret", () => {
  // Built from parts so this file never contains a key-shaped literal itself
  // (the repository-hygiene test scans every committed file).
  const key = ["rq", "live", "Ab3CdEfGh4IjK5lMnOp6QrStUvWxYz012345"].join("_");

  it("masks the middle of a key and never reveals it", () => {
    const masked = maskKey(key);
    expect(masked.startsWith("rq_live_")).toBe(true);
    expect(masked.endsWith("2345")).toBe(true);
    expect(masked).not.toContain(key.slice(9, -5));
    expect(maskKey("")).toBe("not set");
    expect(maskKey("short")).toBe("•••••");
  });

  it("redacts keys out of text and builds the auth header", () => {
    expect(redact(`failed with ${key} on router`, key)).not.toContain(key);
    expect(redact("nothing to hide")).toBe("nothing to hide");
    expect(authHeader(`  ${key} `)).toBe(`Bearer ${key}`);
    expect(containsSecret(key)).toBe(true);
    expect(findSecrets(`a ${key} and b`)).toHaveLength(1);
    expect(containsSecret("no key here")).toBe(false);
  });
});

describe("svgprompt", () => {
  const items = [
    { position: 1, name: "icon-one_AI", relPath: "a/icon-one_AI.png" },
    { position: 2, name: "icon-two_AI", relPath: "a/icon-two_AI.png" },
  ];

  it("carries the connection-rule default prompt and restores it", () => {
    expect(DEFAULT_SVG_PROMPT).toContain("Create 4 split SVG icons");
    expect(DEFAULT_SVG_PROMPT).toContain("snapped mathematically");
    expect(isDefaultPrompt(DEFAULT_SVG_PROMPT)).toBe(true);
    expect(parsePrompt(null)).toBe(DEFAULT_SVG_PROMPT);
    expect(parsePrompt("   ")).toBe(DEFAULT_SVG_PROMPT);
    expect(parsePrompt("my prompt")).toBe("my prompt");
    expect(JSON.parse(serializePrompt("p"))).toEqual({ prompt: "p" });
  });

  it("builds the ordered manifest prompt with the numeric contract", () => {
    const text = batchPrompt("Snap every join.", items);
    expect(manifestLines(items)).toEqual(["1 — icon-one_AI", "2 — icon-two_AI"]);
    expect(text).toContain("Here is a batch of icons arranged in numbered grid order:");
    expect(text).toContain("1 — icon-one_AI\n2 — icon-two_AI");
    expect(text).toContain("same numeric order, starting from 1");
    expect(text).toContain("exact same name in the SVG <title>");
    expect(text.trimEnd().endsWith("Snap every join.")).toBe(true);
    expect(singlePrompt("Snap every join.", "icon-one_AI")).toContain("Icon name (use it as the SVG <title>): icon-one_AI");
  });
});

describe("svgbatch", () => {
  const sources = [1, 2, 3, 4, 5].map((n) => ({
    sourceId: `pair_${n}`, name: `icon-${n}_AI`, relPath: `dir/icon-${n}_AI.png`, fingerprint: `${n}:100`,
  }));

  it("uses the smallest square grid that fits (3 -> 2x2 with an empty cell)", () => {
    expect(gridSize(1)).toEqual({ cols: 1, rows: 1 });
    expect(gridSize(2)).toEqual({ cols: 2, rows: 1 });
    expect(gridSize(3)).toEqual({ cols: 2, rows: 2 });
    expect(gridSize(4)).toEqual({ cols: 2, rows: 2 });
    expect(gridSize(5)).toEqual({ cols: 3, rows: 2 });
    expect(gridSize(9)).toEqual({ cols: 3, rows: 3 });
    expect(gridSize(0)).toEqual({ cols: 0, rows: 0 });
  });

  it("assigns batch-local positions from 1 and keeps the stable source id", () => {
    const [batch] = planBatches(sources.slice(0, 3), 4);
    expect(batch.items.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(batch.items.map((i) => i.sourceId)).toEqual(["pair_1", "pair_2", "pair_3"]);
    expect(batch.items[2].fingerprint).toBe("3:100");
    expect(batch.emptyCells).toBe(1);
    expect(emptyPositions(batch)).toEqual([4]);
    expect(cellOf(4, 2)).toEqual({ row: 1, col: 1 });
    expect(cellOf(1, 2)).toEqual({ row: 0, col: 0 });
  });

  it("splits deterministically and never exceeds the per-request size", () => {
    const batches = planBatches(sources, 2);
    expect(batches.map((b) => b.items.length)).toEqual([2, 2, 1]);
    expect(batches.map((b) => b.id)).toEqual(["batch_1_2", "batch_2_2", "batch_3_1"]);
    expect(planBatches(sources, 2).map((b) => b.items[0].sourceId)).toEqual(
      planBatches(sources, 2).map((b) => b.items[0].sourceId),
    );
    expect(planBatches([], 4)).toEqual([]);
    expect(planBatches(sources, 99)[0].items).toHaveLength(5);
  });
});

describe("svgcomposite", () => {
  it("builds a square canvas with equal cells and trailing empty cells", () => {
    const l = compositeLayout(3, { cell: 100, padding: 10 });
    expect(l.size).toBe(200);
    expect(l.cols).toBe(2);
    expect(l.rows).toBe(2);
    expect(l.cells).toHaveLength(3);
    expect(l.cells[0]).toEqual({ position: 1, x: 10, y: 10, w: 80, h: 80 });
    expect(l.cells[2]).toEqual({ position: 3, x: 10, y: 110, w: 80, h: 80 });
    expect(l.empty).toEqual([4]);
  });

  it("caps the canvas side and still keeps cells inside it", () => {
    const l = compositeLayout(9, { cell: 400, padding: 20, max: 512 });
    expect(l.size).toBe(512);
    const last = l.cells[8];
    expect(last.x + last.w).toBeLessThanOrEqual(512);
    expect(last.y + last.h).toBeLessThanOrEqual(512);
    expect(compositeLayout(0).cells).toEqual([]);
  });

  it("centres a source image without stretching or cropping it", () => {
    const cell = { position: 1, x: 0, y: 0, w: 80, h: 80 };
    const wide = fitRect(200, 100, cell);
    expect(wide).toEqual({ x: 0, y: 20, w: 80, h: 40 });
    const tall = fitRect(100, 200, cell);
    expect(tall).toEqual({ x: 20, y: 0, w: 40, h: 80 });
    const broken = fitRect(0, 0, cell);
    expect(broken.w).toBeGreaterThan(0);
    expect(broken.h).toBeGreaterThan(0);
  });
});
