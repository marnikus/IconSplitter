// svgconnections.test.ts — connection profiles of the Generate SVG tab: the
// quick-switch list, the Requesty image connection (GPT-Image-2.5 Sunburst),
// and the exact images/generations wire body (research 2026-10-16, archive doc).
import { describe, expect, it } from "vitest";
import {
  DEFAULT_IMAGE_CONNECTION, IMAGE_N_MAX, IMAGE_N_MIN, SUNBURST_MODEL,
  buildImageBody, clampCustomDim, clampImageN, connectionLabel, defaultConnections,
  imageUrl, parseConnectionsStore, resolveSize, sanitizeImage, seedConnections, serializeConnectionsStore,
  type Connection,
} from "../src/lib/svgconnections";

describe("defaults — the two shipped setups", () => {
  it("ships the text connection and the Sunburst image connection", () => {
    const list = defaultConnections("openai/gpt-6.1-sol", "https://router.requesty.ai/v1");
    expect(list).toHaveLength(2);
    expect(list[0].kind).toBe("text");
    expect(list[0].model).toBe("openai/gpt-6.1-sol");
    expect(list[1].kind).toBe("image");
    expect(list[1].model).toBe(SUNBURST_MODEL);
    expect(list[1].model).toBe("openai/gpt-image-2.5-sunburst");
  });

  it("the image connection's defaults are the documented request values", () => {
    expect(DEFAULT_IMAGE_CONNECTION.image).toEqual({
      sizePreset: "1024x1024", customW: 1024, customH: 1024,
      quality: "auto", n: 1, background: "auto", outputFormat: "png", responseFormat: "b64_json",
    });
  });

  it("migration seeds the text connection from the user's LIVE config, never clobbering it", () => {
    const list = seedConnections({ baseUrl: "https://router.eu.requesty.ai/v1", model: "openai/gpt-6.1-mini" });
    expect(list[0].baseUrl).toBe("https://router.eu.requesty.ai/v1");
    expect(list[0].model).toBe("openai/gpt-6.1-mini");
    expect(list[1].model).toBe(SUNBURST_MODEL);
  });
});

describe("storage parse — RULE 13: junk costs one ignored load, never the tab", () => {
  it("a stored store round-trips exactly", () => {
    const list = defaultConnections("openai/gpt-6.1-sol", "https://router.requesty.ai/v1");
    const parsed = parseConnectionsStore(JSON.parse(serializeConnectionsStore({ list, activeId: list[1].id })));
    expect(parsed.list).toEqual(list);
    expect(parsed.activeId).toBe(list[1].id);
  });

  it("null, junk JSON shapes and an empty list fall back to the defaults", () => {
    for (const junk of [null, 42, {}, { list: "nope" }, { list: [] }]) {
      expect(parseConnectionsStore(junk).list.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("an unknown activeId falls back to the first connection", () => {
    const list = defaultConnections("openai/gpt-6.1-sol", "https://router.requesty.ai/v1");
    expect(parseConnectionsStore({ activeId: "ghost", list }).activeId).toBe(list[0].id);
  });

  it("a partial connection record is repaired field by field (kind junk -> text)", () => {
    const parsed = parseConnectionsStore({ activeId: "a", list: [{ id: "a", name: "X", kind: "video" }] });
    expect(parsed.list[0].kind).toBe("text");
    expect(parsed.list[0].model.length).toBeGreaterThan(0);
    expect(parsed.list[0].image.n).toBe(1);
  });

  it("a missing list member id gets one generated", () => {
    const parsed = parseConnectionsStore({ list: [{ name: "no id", kind: "text" }] });
    expect(parsed.list[0].id.length).toBeGreaterThan(0);
  });
});

describe("clamps and resolution — every image parameter", () => {
  it("n stays inside the documented 1..10", () => {
    expect(IMAGE_N_MIN).toBe(1);
    expect(IMAGE_N_MAX).toBe(10);
    expect(clampImageN(0)).toBe(1);
    expect(clampImageN(11)).toBe(10);
    expect(clampImageN(3.7)).toBe(4);
    expect(clampImageN(Number.NaN)).toBe(1);
  });

  it("custom dimensions clamp to 256..4096", () => {
    expect(clampCustomDim(100)).toBe(256);
    expect(clampCustomDim(9999)).toBe(4096);
    expect(clampCustomDim(1536.9)).toBe(1537);
  });

  it("unknown size presets and qualities snap back to auto", () => {
    const fixed = sanitizeImage({ sizePreset: "9999x1", quality: "ultra", background: "neon", outputFormat: "gif", responseFormat: "carrier-pigeon", n: "4" });
    expect(fixed.sizePreset).toBe("auto");
    expect(fixed.quality).toBe("auto");
    expect(fixed.background).toBe("auto");
    expect(fixed.outputFormat).toBe("png");
    expect(fixed.responseFormat).toBe("b64_json");
    expect(fixed.n).toBe(4);
  });

  it("resolveSize: preset passthrough, custom WxH, and auto", () => {
    expect(resolveSize({ ...DEFAULT_IMAGE_CONNECTION.image, sizePreset: "2048x1152" })).toBe("2048x1152");
    expect(resolveSize({ ...DEFAULT_IMAGE_CONNECTION.image, sizePreset: "custom", customW: 1536, customH: 640 })).toBe("1536x640");
    expect(resolveSize({ ...DEFAULT_IMAGE_CONNECTION.image, sizePreset: "auto" })).toBe("auto");
  });
});

describe("the wire — images/generations request", () => {
  it("imageUrl joins without a trailing-slash dupe", () => {
    expect(imageUrl("https://router.requesty.ai/v1")).toBe("https://router.requesty.ai/v1/images/generations");
    expect(imageUrl("https://router.requesty.ai/v1/")).toBe("https://router.requesty.ai/v1/images/generations");
  });

  it("buildImageBody sends the exact documented shape (snake_case)", () => {
    const conn: Connection = { ...DEFAULT_IMAGE_CONNECTION, image: { ...DEFAULT_IMAGE_CONNECTION.image, sizePreset: "custom", customW: 1536, customH: 640, quality: "xhigh", n: 3, background: "transparent", outputFormat: "webp" } };
    expect(buildImageBody(conn, "a Japanese garden")).toEqual({
      model: SUNBURST_MODEL,
      prompt: "a Japanese garden",
      n: 3,
      size: "1536x640",
      quality: "xhigh",
      response_format: "b64_json",
      background: "transparent",
      output_format: "webp",
    });
  });

  it("the label names the provider, the model and the kind", () => {
    expect(connectionLabel(DEFAULT_IMAGE_CONNECTION)).toBe("GPT Image 2.5 Sunburst (image)");
  });
});
