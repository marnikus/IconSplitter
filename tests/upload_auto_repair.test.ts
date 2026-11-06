import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { prepareExportSvg } from "../src/lib/upload/prepare";
import { DEFAULT_UPLOAD_SETTINGS, effectiveSettings, type SettingsOverrides } from "../src/lib/upload/settings";
import { AS_IS_SETTINGS } from "../src/lib/upload/asis";
import { insideArtboard } from "../src/lib/upload/place";
import { writeEps, verifyEps } from "../src/lib/upload/eps";

const files = ["icon-lightbulb-idea_AI_5_02.svg", "icon-lightbulb-idea_AI_5_03.svg"];
const sourceOf = (name: string) => readFileSync(`tests/assets/bug with SVG export expl temp/${name}`, "utf8");
const presets: [string, SettingsOverrides][] = [
  ["default", {}],
  ["shadow", { shadowEnabled: true }],
  ["source frame + shadow", { ...AS_IS_SETTINGS, shadowEnabled: true }],
  ["512 square", { artboard: { mode: "preset", size: 512, width: 512, height: 512 } }],
  ["512 shadow", { artboard: { mode: "preset", size: 512, width: 512, height: 512 }, shadowEnabled: true }],
  ["5MP", { scaleToMegapixels: true, artboardMegapixels: 5 }],
  ["64px heavy strokes", { strokePx: 50, paddingPct: 0, artboard: { mode: "custom", size: 64, width: 64, height: 64 } }],
  ["64px heavy source-frame shadow", { ...AS_IS_SETTINGS, strokePx: 50, shadowEnabled: true, artboard: { mode: "custom", size: 64, width: 64, height: 64 } }],
  ["expanded", { expandStrokes: true }],
  ["expanded shadow", { shadowEnabled: true, expandStrokes: true }],
];
describe.each(files)("supplied export regression %s", (file) => {
  it.each(presets)("automatically prepares %s without source edits or artboard overflow", (_label, override) => {
    const source = sourceOf(file);
    const settings = effectiveSettings(DEFAULT_UPLOAD_SETTINGS, override);
    const result = prepareExportSvg(source, settings);
    expect(result.ok, result.ok ? "" : result.detail).toBe(true);
    if (!result.ok) return;
    const root = new DOMParser().parseFromString(result.svg, "image/svg+xml").documentElement;
    expect(insideArtboard(root)).toBe(true);
    expect(result.svg).not.toMatch(/NaN|Infinity/);
    expect(root.querySelector("[transform], image, filter")).toBeNull();
    expect(sourceOf(file)).toBe(source);
    const eps = writeEps(result.svg, "#ffffff");
    expect(eps.ok, eps.ok ? "" : eps.reason).toBe(true);
    if (eps.ok) { expect(verifyEps(eps.eps).ok).toBe(true); expect(eps.eps).not.toContain("colorimage"); }
  });
  it("keeps all-default source export byte identical", () => {
    const source = sourceOf(file);
    const result = prepareExportSvg(source, effectiveSettings(DEFAULT_UPLOAD_SETTINGS, AS_IS_SETTINGS));
    expect(result.ok && result.svg).toBe(source);
  });
});

const combinations = files.flatMap((file) => [0, 0.1, 0.5, 1, 3, 8, 20, 50].flatMap((width) =>
  [0, 64, 128, 1024].map((px) => ({ file, width, px }))));
it.each(combinations)("automatically fits $file at stroke=$width and artboard=$px", ({ file, width, px }) => {
  const result = prepareExportSvg(sourceOf(file), effectiveSettings(DEFAULT_UPLOAD_SETTINGS, {
    strokePx: width, paddingPct: 0,
    artboard: px === 0 ? { mode: "content", size: 512, width: 512, height: 512 } : { mode: "custom", size: px, width: px, height: px },
  }));
  expect(result.ok, result.ok ? "" : result.detail).toBe(true);
  if (!result.ok) return;
  const root = new DOMParser().parseFromString(result.svg, "image/svg+xml").documentElement;
  expect(insideArtboard(root)).toBe(true);
  if (width > 0) expect(root.getAttribute("stroke-width")).toBe(String(width));
  if (px > 0) expect(root.getAttribute("viewBox")).toBe(`0 0 ${px} ${px}`);
  expect(result.passes).toBeLessThanOrEqual(37);
  if (width === 50 && px === 64) expect(result.passes).toBeGreaterThan(4);
});

it.each(files)("repairs %s deterministically without modifying the original", (file) => {
  const source = sourceOf(file);
  const settings = effectiveSettings(DEFAULT_UPLOAD_SETTINGS, { shadowEnabled: true });
  const first = prepareExportSvg(source, settings); const second = prepareExportSvg(source, settings);
  expect(first).toEqual(second);
  expect(sourceOf(file)).toBe(source);
});
