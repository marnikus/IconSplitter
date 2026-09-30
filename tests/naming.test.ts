// TDD cycle 1 — naming: _AI parsing, references, split names, variations, batch path.
import { describe, expect, it } from "vitest";
import {
  batchPath, parseAiName, referenceName, splitFolderName, splitImageName, withVariation,
} from "../src/lib/naming";

describe("parseAiName — eligibility (spec §4)", () => {
  it("accepts plain _AI and numbered variants", () => {
    expect(parseAiName("icon-award-ribbon_AI.png")).toEqual({ base: "icon-award-ribbon", variant: null, ext: ".png" });
    expect(parseAiName("icon-award-ribbon_AI_7.png")).toEqual({ base: "icon-award-ribbon", variant: 7, ext: ".png" });
  });
  it("is case-insensitive on the suffix and keeps base text untouched", () => {
    expect(parseAiName("Logo_ai.JPG")).toEqual({ base: "Logo", variant: null, ext: ".JPG" });
    expect(parseAiName("x_AI_12.webp")?.base).toBe("x");
  });
  it("rejects references, non-numeric variants and non-AI names", () => {
    expect(parseAiName("icon-award-ribbon.png")).toBeNull();
    expect(parseAiName("icon_AI_x.png")).toBeNull();
    expect(parseAiName("icon-ai.png")).toBeNull(); // 'ai' inside the word is not the suffix
    expect(parseAiName("noext_AI")).toBeNull();
  });
});

describe("referenceName / split names (spec §4, §5)", () => {
  it("derives the reference file from the parsed AI name", () => {
    expect(referenceName({ base: "icon-award-ribbon", variant: 7, ext: ".png" })).toBe("icon-award-ribbon.png");
  });
  it("folder = source name without extension", () => {
    expect(splitFolderName("icon-award-ribbon_AI.png")).toBe("icon-award-ribbon_AI");
    expect(splitFolderName("icon-award-ribbon_AI_7.png")).toBe("icon-award-ribbon_AI_7");
  });
  it("split image = folder name + padded number, always .png", () => {
    expect(splitImageName("icon-award-ribbon_AI", 1)).toBe("icon-award-ribbon_AI_01.png");
    expect(splitImageName("icon-award-ribbon_AI_7", 12)).toBe("icon-award-ribbon_AI_7_12.png");
  });
  it("variation suffix is added, never replacing an existing variant", () => {
    expect(withVariation("icon-award-ribbon_AI", 1)).toBe("icon-award-ribbon_AI");
    expect(withVariation("icon-award-ribbon_AI", 2)).toBe("icon-award-ribbon_AI_v02");
    expect(withVariation("icon-award-ribbon_AI_7", 3)).toBe("icon-award-ribbon_AI_7_v03");
  });
});

describe("batchPath — month/timestamp layout (spec §5)", () => {
  it("builds YYYY-MM/YYYY-MM-DD_HH-mm-ss with zero padding", () => {
    const d = new Date(2026, 8, 30, 14, 32, 8); // 2026-09-30 14:32:08
    expect(batchPath(d)).toBe("2026-09/2026-09-30_14-32-08");
  });
});
