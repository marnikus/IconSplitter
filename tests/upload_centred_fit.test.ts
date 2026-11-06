import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { prepareExportSvg } from "../src/lib/upload/prepare";
import { DEFAULT_UPLOAD_SETTINGS, effectiveSettings } from "../src/lib/upload/settings";
import { insideArtboard, shippedBounds } from "../src/lib/upload/place";
import { writeEps, verifyEps } from "../src/lib/upload/eps";
import { optimizeSvg } from "../src/lib/upload/optimize";
import { enforceExportSvg } from "../src/lib/upload/clean";

const files = ["icon-lightbulb-idea_AI_5_02.svg", "icon-lightbulb-idea_AI_5_03.svg"];
const sourceOf = (file: string) => readFileSync(`tests/assets/bug with SVG export expl temp/${file}`, "utf8");
const settingsOf = (strokePx = 50, paddingPct = 8, height = 64, expandStrokes = false, shadowEnabled = false) =>
  effectiveSettings(DEFAULT_UPLOAD_SETTINGS, { strokePx, paddingPct, expandStrokes, shadowEnabled,
    artboard: { mode: "custom", size: 64, width: 64, height } });
const rootOf = (svg: string) => new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
const cases = [
  { stroke: 50, padding: 8, height: 64 }, { stroke: 49, padding: 8, height: 64 },
  { stroke: 50, padding: 4, height: 64 }, { stroke: 45, padding: 10, height: 64 },
  { stroke: 40, padding: 8, height: 64 }, { stroke: 50, padding: 8, height: 80 },
];

describe.each(files)("centred measured-fit regression %s", (file) => {
  it.each(cases)("automatically fits stroke=$stroke, padding=$padding, height=$height", ({ stroke, padding, height }) => {
    const source = sourceOf(file);
    const result = prepareExportSvg(source, settingsOf(stroke, padding, height));
    expect(result.ok, !result.ok ? result.detail : "").toBe(true);
    if (!result.ok) return;
    const root = rootOf(result.svg); const b = shippedBounds(root)!;
    expect(insideArtboard(root)).toBe(true);
    expect(root.getAttribute("viewBox")).toBe(`0 0 64 ${height}`);
    expect(root.getAttribute("stroke-width")).toBe(String(stroke));
    expect(b.minX).toBeGreaterThanOrEqual(result.fit.pad - 0.002);
    expect(b.minY).toBeGreaterThanOrEqual(result.fit.pad - 0.002);
    expect(b.minX + b.width).toBeLessThanOrEqual(64 - result.fit.pad + 0.002);
    expect(b.minY + b.height).toBeLessThanOrEqual(height - result.fit.pad + 0.002);
    expect(Math.abs(b.minX + b.width / 2 - 32)).toBeLessThanOrEqual(0.002);
    expect(Math.abs(b.minY + b.height / 2 - height / 2)).toBeLessThanOrEqual(0.002);
    expect(result.passes).toBeLessThanOrEqual(37);
    if (result.passes > 4) {
      expect(result.fit.offsetX * 1000).toBeCloseTo(Math.round(result.fit.offsetX * 1000), 8);
      expect(result.fit.offsetY * 1000).toBeCloseTo(Math.round(result.fit.offsetY * 1000), 8);
    }
    expect(sourceOf(file)).toBe(source);
  });
  it.each([false, true])("supports expansion=$0 through real vector EPS export", (expanded) => {
    const source = sourceOf(file);
    // Keep the circle radius representable; the failing leaf uses its exact 50px stroke.
    const stroke = file === files[0] ? 40 : 50;
    const result = prepareExportSvg(source, settingsOf(stroke, 8, 64, expanded));
    expect(result.ok, !result.ok ? result.detail : "").toBe(true);
    if (!result.ok) return;
    expect(insideArtboard(rootOf(result.svg))).toBe(true);
    expect(rootOf(result.svg).querySelector("[transform], image, filter")).toBeNull();
    const eps = writeEps(result.svg, "#ffffff");
    expect(eps.ok, !eps.ok ? eps.reason : "").toBe(true);
    if (eps.ok) { expect(verifyEps(eps.eps).ok).toBe(true); expect(eps.eps).not.toContain("colorimage"); }
    expect(sourceOf(file)).toBe(source);
  });
  it("also fits the composite shadow without painting outside the requested padding", () => {
    const result = prepareExportSvg(sourceOf(file), settingsOf(40, 8, 64, false, true));
    expect(result.ok, !result.ok ? result.detail : "").toBe(true);
    if (result.ok) expect(insideArtboard(rootOf(result.svg))).toBe(true);
  });
});

it("keeps the original failing leaf deterministic through optimization and cleaning", async () => {
  const source = sourceOf(files[1]); const settings = settingsOf();
  const first = prepareExportSvg(source, settings); const second = prepareExportSvg(source, settings);
  expect(first).toEqual(second); expect(first.ok).toBe(true);
  if (!first.ok) return;
  expect(first.passes).toBe(37);
  const optimized = await optimizeSvg(first.svg, true);
  const clean = enforceExportSvg(optimized.svg);
  expect(clean.violations).toEqual([]);
  expect(insideArtboard(rootOf(clean.svg))).toBe(true);
  expect(sourceOf(files[1])).toBe(source);
});

it("does not mislabel a genuinely impossible stroke and padded board as repaired", () => {
  const result = prepareExportSvg(sourceOf(files[1]), settingsOf(50, 8, 16));
  expect(result.ok).toBe(false);
});
