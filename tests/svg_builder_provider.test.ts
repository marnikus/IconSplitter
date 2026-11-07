// @vitest-environment happy-dom
// svg_builder_provider.test.ts — TDD for the ONE previewed sheet-metadata
// request. No live provider call: fetch is injected, and a retryable failure
// must never be resent automatically (RULE 20).
import { describe, expect, it, vi } from "vitest";
import { AUTH_HEADER, DEFAULT_GEMINI_CONFIG, generateContentUrl } from "../src/lib/upload/gemini";
import { DEFAULT_SHEET_PROMPT } from "../src/lib/svgBuilder/metadata";
import { sheetPreviewFor } from "../src/svgBuilder/preview";
import { generateSheetMetadata } from "../src/svgBuilder/runSheetMetadata";
import { minimalJpeg } from "./helpers/minijpeg";

const SHEET = '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="660" viewBox="0 0 1080 660"><rect width="1080" height="660" fill="#fff"/></svg>';
const ANSWER = JSON.stringify({ title: "Quiet line icons", subtitle: "Approved vector set", keywords: ["icon", "vector", "line"] });

function response(text: string, status = 200): Response {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] }), { status });
}

describe("sheet preview", () => {
  it("renders one bounded JPEG from the composed sheet and returns its exact data URL", async () => {
    const out = await sheetPreviewFor(SHEET, {
      render: async () => ({}) as HTMLCanvasElement,
      encode: async (_canvas, _quality) => minimalJpeg(768, 469),
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(out.width).toBe(768);
    expect(out.height).toBe(469);
    expect(out.mime).toBe("image/jpeg");
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
    expect(out.draft.title).toBe("Quiet line icons");
    expect(out.draft.state).toBe("draft");
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
