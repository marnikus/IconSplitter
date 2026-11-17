// @vitest-environment node
// svg_builder_provider.test.ts — TDD for the ONE previewed sheet-metadata
// request. No live provider call: fetch and the browser rasterizer are injected,
// and a retryable failure must never be resent automatically (RULE 20).
import { describe, expect, it, vi } from "vitest";
import { AUTH_HEADER, DEFAULT_GEMINI_CONFIG, generateContentUrl } from "../src/lib/upload/gemini";
import type { RasterDeps, RasterResult, RasterTarget } from "../src/lib/upload/raster";
import { DEFAULT_SHEET_PROMPT } from "../src/lib/svgBuilder/metadata";
import { sheetPngFor, sheetPreviewFor } from "../src/svgBuilder/preview";
import { DEFAULT_CONFIG, parseSheetConfig } from "../src/lib/svgBuilder/config";
import { computeLayout } from "../src/lib/svgBuilder/layout";
import { iconsOnlyConfig } from "../src/lib/svgBuilder/metaimage";
import { iconsImageFor } from "../src/svgBuilder/metaimagefor";
import { generateSheetMetadata } from "../src/svgBuilder/runSheetMetadata";
import { minimalJpeg } from "./helpers/minijpeg";

const SHEET = '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="660" viewBox="0 0 1080 660"><rect width="1080" height="660" fill="#fff"/></svg>';
const ANSWER = `Title 1: Domestic household routines and grocery shopping concepts
Title 2: Pot bag ice cream seasoning
Title: Domestic household routines and grocery shopping concepts
Description: Domestic household routines and grocery shopping concepts. Pot bag ice cream seasoning.
Tags: icon, pictogram, vector, stroke, line, editable, web, domestic, household, routine, shopping, cooking, convenience, lifestyle, nourishment, task, utility, daily, pot, bag, ice, cream, seasoning, bottle, food, preparation, kitchen, store, purchase, dessert, salt, container
Title-Artboard: household and food icons`;

function response(text: string, status = 200): Response {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] }), { status });
}

function fakeRasterize(_svg: string, target: RasterTarget, _deps?: RasterDeps): Promise<RasterResult> {
  const jpeg = minimalJpeg(target.width, target.height);
  const record = { width: target.width, height: target.height, quality: target.quality,
    bytes: jpeg.length, hash: "test", profile: "baseline" };
  return Promise.resolve({ ok: true, jpeg, record } as unknown as RasterResult);
}

describe("sheet preview", () => {
  it("renders one bounded JPEG from the composed sheet and returns its exact data URL", async () => {
    const seen: { target: RasterTarget | null } = { target: null };
    const out = await sheetPreviewFor(SHEET, {
      rasterize: async (svg, box, deps) => { seen.target = box; return fakeRasterize(svg, box, deps); },
    });
    expect(seen.target).not.toBeNull();
    expect(seen.target?.width).toBe(768);
    expect(seen.target?.height).toBe(469);
    expect(seen.target?.quality).toBe(0.82);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(out.width).toBe(768);
    expect(out.height).toBe(469);
    expect(out.mime).toBe("image/jpeg");
  });
});

describe("icons-only PNG for metadata (2026-11-14)", () => {
  it("drops the banner and keeps the icon area exactly as laid out", () => {
    const config = parseSheetConfig({ ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, position: "left", size: 242 } });
    const only = iconsOnlyConfig(config);
    expect(only.banner.position).toBe("none");
    expect(only.artboard).toMatchObject({ width: config.artboard.width - 242, height: config.artboard.height });
    const a = computeLayout(config).cells[0], b = computeLayout(only).cells[0];
    expect(b.x).toBeCloseTo(a.x - 242, 3);
    expect(b.y).toBeCloseTo(a.y, 3);
    const top = parseSheetConfig({ ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, position: "top", size: 100 } });
    expect(iconsOnlyConfig(top).artboard.height).toBe(top.artboard.height - 100);
  });

  it("the request image is the sheet without its banner", async () => {
    const config = parseSheetConfig({ ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, position: "left", size: 242, title: "VISIBLE TITLE" } });
    let drawn = "";
    const out = await iconsImageFor({ config, assets: [], placedIds: [], svgTexts: {} },
      { pngBlob: async (svg) => { drawn = svg; return new Blob([new Uint8Array([1])], { type: "image/png" }); } });
    expect(out.ok).toBe(true);
    expect(drawn).not.toContain("data-banner");
    expect(drawn).not.toMatch(/<text[^>]*>VISIBLE TITLE/); // never drawn (only the hidden <title> names the sheet)
    expect(drawn).toContain(`width="${config.artboard.width - 242}"`);
  });

  it("renders a PNG of at most one megapixel through the app's PNG export path", async () => {
    const seen: { w: number; h: number } = { w: 0, h: 0 };
    const out = await sheetPngFor(SHEET, { pngBlob: async (_svg, w, h) => { seen.w = w; seen.h = h; return new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }); } });
    expect(seen.w * seen.h).toBeLessThanOrEqual(1_000_000);
    expect(seen.w * seen.h).toBeGreaterThan(990_000);
    expect(Math.abs(seen.w / seen.h - 1080 / 660)).toBeLessThan(0.01);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });
});

describe("generateSheetMetadata", () => {
  it("sends exactly the shown prompt and JPEG preview to the configured Gemini model", async () => {
    const fetch = vi.fn(async () => response(ANSWER));
    const preview = "data:image/jpeg;base64,QUJD";
    const out = await generateSheetMetadata({
      config: DEFAULT_GEMINI_CONFIG, apiKey: "test-key", prompt: DEFAULT_SHEET_PROMPT, preview, fetch,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(generateContentUrl(DEFAULT_GEMINI_CONFIG.baseUrl, DEFAULT_GEMINI_CONFIG.model));
    expect((init.headers as Record<string, string>)[AUTH_HEADER]).toBe("test-key");
    const body = JSON.parse(String(init.body));
    expect(body.contents[0].parts[0].text).toBe(DEFAULT_SHEET_PROMPT);
    expect(body.contents[0].parts[1].inlineData).toEqual({ mimeType: "image/jpeg", data: "QUJD" });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.draft.title).toBe("Domestic household routines and grocery shopping concepts");
    expect(out.draft.state).toBe("draft");
    expect(out.artboardTitle).toBe("household and food icons");
  });

  it("never auto-resends a retryable failure or an unknown outcome", async () => {
    const fetch = vi.fn(async () => new Response("rate limited", { status: 429 }));
    const out = await generateSheetMetadata({
      config: DEFAULT_GEMINI_CONFIG, apiKey: "test-key", prompt: DEFAULT_SHEET_PROMPT,
      preview: "data:image/jpeg;base64,QUJD", fetch,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.failure.kind).toMatch(/rate|http|transport/);
  });

  it("refuses to send without a key or without a preview", async () => {
    const fetch = vi.fn(async () => response(ANSWER));
    const noKey = await generateSheetMetadata({ config: DEFAULT_GEMINI_CONFIG, apiKey: "", prompt: DEFAULT_SHEET_PROMPT, preview: "data:image/jpeg;base64,QUJD", fetch });
    const noPreview = await generateSheetMetadata({ config: DEFAULT_GEMINI_CONFIG, apiKey: "test-key", prompt: DEFAULT_SHEET_PROMPT, preview: "", fetch });
    expect(fetch).not.toHaveBeenCalled();
    expect(noKey.ok).toBe(false);
    expect(noPreview.ok).toBe(false);
  });
});
