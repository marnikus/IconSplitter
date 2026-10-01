// RULE 8 — path helpers run for real; deleting any of them fails here.
import { describe, expect, it } from "vitest";
import { dirOf, extOf, fileOf, isIgnoredDir, isImageExt, joinRel } from "../../src/batch/paths";

describe("joinRel / dirOf / fileOf / extOf", () => {
  it("joins segments, skipping empty ones", () => {
    expect(joinRel("2026-09", "batch", "Category-A", "icon_AI")).toBe("2026-09/batch/Category-A/icon_AI");
    expect(joinRel("", "a.png")).toBe("a.png");
    expect(joinRel("C-A", "", "f.png")).toBe("C-A/f.png");
  });

  it("splits directory and file parts", () => {
    expect(dirOf("Category-A/icon_AI.png")).toBe("Category-A");
    expect(dirOf("icon_AI.png")).toBe("");
    expect(fileOf("Category-A/icon_AI.png")).toBe("icon_AI.png");
  });

  it("reads the lowercase extension after the last dot", () => {
    expect(extOf("icon.PNG")).toBe("png");
    expect(extOf("my.icon.jpeg")).toBe("jpeg");
    expect(extOf("noext")).toBe("");
  });
});

describe("isImageExt", () => {
  it("matches configured extensions case-insensitively", () => {
    expect(isImageExt("a.png", ["png", "jpg"])).toBe(true);
    expect(isImageExt("a.JPG", ["png", "jpg"])).toBe(true);
    expect(isImageExt("a.json", ["png", "jpg"])).toBe(false);
    expect(isImageExt("a", ["png"])).toBe(false);
  });
});

describe("isIgnoredDir", () => {
  it("always ignores _split_output plus the configured output dir", () => {
    expect(isIgnoredDir("_split_output", "_split_output")).toBe(true);
    expect(isIgnoredDir("_split_output", "custom_out")).toBe(true);
    expect(isIgnoredDir("custom_out", "custom_out")).toBe(true);
    expect(isIgnoredDir("Category-A", "_split_output")).toBe(false);
  });
});
