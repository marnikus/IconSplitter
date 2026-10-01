// svg_bg.test.ts — the SVG preview background rules execute for real (RULE 8):
// the five presets and the custom colour, hex validation on every read, the
// stored payload the tab restores, and the contrast rule that keeps black
// strokes visible on whatever background the user picks. Deleting the module
// fails every assertion here.
import { describe, expect, it } from "vitest";
import {
  BG_PRESETS, CONTRAST_MIN, DEFAULT_PREVIEW_BACKGROUND, backgroundLabel, contrastWithBlack,
  normalizeHex, parsePreviewBackground, previewFrame, relativeLuminance, resolveBackground,
  selectCustom, selectPreset,
} from "../src/lib/svgbackground";

describe("svgbackground", () => {
  it("offers the five documented presets, each with a real colour", () => {
    expect(BG_PRESETS.map((p) => p.id)).toEqual(["white", "black", "gray", "green", "red"]);
    expect(BG_PRESETS.map((p) => p.label)).toEqual(["White", "Black", "Gray", "Green", "Red"]);
    for (const preset of BG_PRESETS) expect(normalizeHex(preset.color)).toBe(preset.color);
    expect(BG_PRESETS.find((p) => p.id === "black")?.color).toBe("#000000");
    expect(BG_PRESETS.find((p) => p.id === "white")?.color).toBe("#ffffff");
  });

  it("normalises hex input and rejects anything that is not a colour", () => {
    expect(normalizeHex("#FFF")).toBe("#ffffff");
    expect(normalizeHex("abc")).toBe("#aabbcc");
    expect(normalizeHex("#A1b2C3")).toBe("#a1b2c3");
    expect(normalizeHex("  #123456  ")).toBe("#123456");
    expect(normalizeHex("red")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex("")).toBeNull();
    expect(normalizeHex("javascript:alert(1)")).toBeNull();
    expect(normalizeHex("url(#x)")).toBeNull();
  });

  it("validates the stored payload on read, defaulting to white (RULE 13)", () => {
    expect(parsePreviewBackground(null)).toEqual(DEFAULT_PREVIEW_BACKGROUND);
    expect(parsePreviewBackground("nope")).toEqual(DEFAULT_PREVIEW_BACKGROUND);
    expect(parsePreviewBackground({ preset: "neon" })).toEqual(DEFAULT_PREVIEW_BACKGROUND);
    expect(DEFAULT_PREVIEW_BACKGROUND.preset).toBe("white");
    expect(parsePreviewBackground({ preset: "green", custom: "#123456" }))
      .toEqual({ preset: "green", custom: "#123456" });
    expect(parsePreviewBackground({ preset: "custom", custom: "not a colour" }))
      .toEqual({ preset: "custom", custom: DEFAULT_PREVIEW_BACKGROUND.custom });
    expect(parsePreviewBackground({ preset: 7, custom: 7 })).toEqual(DEFAULT_PREVIEW_BACKGROUND);
  });

  it("resolves and labels the chosen colour, custom included", () => {
    expect(resolveBackground({ preset: "black", custom: "#123456" })).toBe("#000000");
    expect(resolveBackground({ preset: "custom", custom: "#123456" })).toBe("#123456");
    expect(backgroundLabel({ preset: "gray", custom: "#123456" })).toBe("Gray");
    expect(backgroundLabel({ preset: "custom", custom: "#123456" })).toContain("#123456");
    expect(selectPreset({ preset: "custom", custom: "#123456" }, "red"))
      .toEqual({ preset: "red", custom: "#123456" });
    expect(selectCustom({ preset: "white", custom: "#123456" }, "#0A0B0C"))
      .toEqual({ preset: "custom", custom: "#0a0b0c" });
    // a broken custom value keeps the previous colour instead of breaking the frame
    expect(selectCustom({ preset: "custom", custom: "#123456" }, "oops"))
      .toEqual({ preset: "custom", custom: "#123456" });
  });

  it("keeps black strokes visible: an outline only where black would disappear", () => {
    expect(contrastWithBlack("#ffffff")).toBeCloseTo(21, 5);
    expect(contrastWithBlack("#000000")).toBeCloseTo(1, 5);
    expect(CONTRAST_MIN).toBe(3);
    // dark frame -> black artwork needs the light outline; the valid presets do not
    expect(previewFrame({ preset: "black", custom: "#ffffff" }).outline).toBe(true);
    expect(previewFrame({ preset: "white", custom: "#ffffff" }).outline).toBe(false);
    expect(previewFrame({ preset: "gray", custom: "#ffffff" }).outline).toBe(false);
    expect(previewFrame({ preset: "green", custom: "#ffffff" }).outline).toBe(false);
    expect(previewFrame({ preset: "red", custom: "#ffffff" }).outline).toBe(false);
    expect(previewFrame({ preset: "custom", custom: "#101010" }).outline).toBe(true);
    expect(previewFrame({ preset: "custom", custom: "#eeeeee" }).outline).toBe(false);
    // An unreadable colour is treated as black (the worst case) — never NaN.
    expect(relativeLuminance("not a colour")).toBe(0);
  });

  it("frames the preview with a colour and nothing else — the SVG never changes", () => {
    const frame = previewFrame({ preset: "custom", custom: "#123456" });
    expect(Object.keys(frame).sort()).toEqual(["color", "outline"]);
    expect(frame.color).toBe("#123456");
    // No markup, no fill, no rect: the frame cannot modify a document.
    expect(JSON.stringify(frame)).not.toContain("svg");
    expect(backgroundLabel({ preset: "custom", custom: "#123456" }).toLowerCase()).not.toContain("svg");
  });
});
