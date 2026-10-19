// imgprompt.test.ts — default prompt, storage parse/serialize, single/batch
// prompt + manifest (mirrors svgprompt for images). Would fail if the default
// is empty, the order line vanishes, or batch manifests don't match positions.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_IMG_PRESETS, DEFAULT_IMG_PROMPT, batchPrompt, isDefaultPrompt,
  parseImgPrompt, serializeImgPrompt, singlePrompt,
} from "../src/lib/imgprompt";
import type { ManifestItem } from "../src/lib/svgbatch";

describe("DEFAULT_IMG_PROMPT — usable non-empty default", () => {
  it("is a non-empty line-art instruction", () => {
    expect(DEFAULT_IMG_PROMPT.trim().length).toBeGreaterThan(20);
    expect(DEFAULT_IMG_PROMPT).toMatch(/line-art|stroke|icon/i);
  });
});

describe("parseImgPrompt — empty/missing → default (RULE 13)", () => {
  it("returns the default for anything that isn't a non-empty string", () => {
    expect(parseImgPrompt(null)).toBe(DEFAULT_IMG_PROMPT);
    expect(parseImgPrompt("")).toBe(DEFAULT_IMG_PROMPT);
    expect(parseImgPrompt("   \n\t  ")).toBe(DEFAULT_IMG_PROMPT);
    expect(parseImgPrompt(42)).toBe(DEFAULT_IMG_PROMPT);
  });
  it("keeps a non-empty user prompt verbatim (not trimmed-to-empty)", () => {
    expect(parseImgPrompt("Make it red")).toBe("Make it red");
  });
});

describe("serializeImgPrompt / parseImgPrompt roundtrip", () => {
  it("re-reads what it wrote", () => {
    const raw = serializeImgPrompt("hello");
    expect(parseImgPrompt(JSON.parse(raw).prompt)).toBe("hello");
  });
});

describe("isDefaultPrompt", () => {
  it("matches only the default text (trimmed)", () => {
    expect(isDefaultPrompt(DEFAULT_IMG_PROMPT)).toBe(true);
    expect(isDefaultPrompt("   " + DEFAULT_IMG_PROMPT + "  ")).toBe(true);
    expect(isDefaultPrompt("something else")).toBe(false);
  });
});

describe("singlePrompt — single-image request text", () => {
  it("carries the prompt and the icon-name line, in that order", () => {
    const text = singlePrompt("Redraw it.", "icon_AI");
    expect(text.startsWith("Redraw it.")).toBe(true);
    expect(text).toContain("Icon name: icon_AI");
    expect(text.indexOf("Icon name: icon_AI")).toBeGreaterThan("Redraw it.".length);
  });
});

describe("batchPrompt — multi-image contact sheet text", () => {
  const items: ManifestItem[] = [
    { position: 1, name: "a_AI", relPath: "a/a_AI.png" },
    { position: 2, name: "b_AI", relPath: "b/b_AI.png" },
  ];
  it("leads with the numbered manifest, then the response contract, then the user prompt", () => {
    const text = batchPrompt("Do the thing.", items);
    const a = text.indexOf("1 — a_AI");
    const b = text.indexOf("2 — b_AI");
    const order = text.indexOf("Create one image for every position");
    const body = text.indexOf("Do the thing.");
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThan(a);
    expect(order).toBeGreaterThan(b);
    expect(body).toBeGreaterThan(order);
  });
  it("lists positions in numeric order", () => {
    const text = batchPrompt("x", items);
    expect(text).toMatch(/1 — a_AI[\s\S]*2 — b_AI/);
  });
});

describe("DEFAULT_IMG_PRESETS — three starter presets", () => {
  it("ships three non-empty, distinct presets with safe names", () => {
    expect(DEFAULT_IMG_PRESETS.length).toBe(3);
    for (const p of DEFAULT_IMG_PRESETS) {
      expect(p.name.trim().length).toBeGreaterThan(0);
      expect(p.text.trim().length).toBeGreaterThan(20);
    }
    const names = DEFAULT_IMG_PRESETS.map((p) => p.name);
    expect(new Set(names).size).toBe(3);
  });
});
