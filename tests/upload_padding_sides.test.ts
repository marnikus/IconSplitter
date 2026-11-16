import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_UPLOAD_SETTINGS, effectiveSettings, normalizeSettings, overridesEqual, parseOverrides, settingsEqual, settingsFingerprint } from "../src/lib/upload/settings";
import { fitArtboard } from "../src/lib/upload/geom";
import { prepareExportSvg } from "../src/lib/upload/prepare";
import { AS_IS_SETTINGS, isAsIs } from "../src/lib/upload/asis";
import { recoverPinnedFit } from "../src/lib/upload/placefallback";

const sides = { left: 10, right: 20, top: 5, bottom: 15 };
const same = { left: 8, right: 8, top: 8, bottom: 8 };
const bounds = { minX: 10, minY: 20, width: 100, height: 50 };
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="10" y="20" width="100" height="50" fill="black"/></svg>';
const settings = (padding = sides) => ({ ...DEFAULT_UPLOAD_SETTINGS, paddingPct: padding, optimizeSvg: false });

describe("four-side padding settings and compatibility", () => {
  it("round-trips asymmetric defaults and overrides without changing the legacy scalar", () => {
    expect(normalizeSettings({ paddingPct: sides }).paddingPct).toEqual(sides);
    expect(parseOverrides({ paddingPct: sides, strokePx: 4 })).toEqual({ paddingPct: sides, strokePx: 4 });
    for (const old of [null, 0, 8, 12, 50]) {
      expect(normalizeSettings({ paddingPct: old }).paddingPct).toBe(old);
      expect(parseOverrides({ paddingPct: old })).toEqual({ paddingPct: old });
    }
    expect(normalizeSettings({ paddingPct: same }).paddingPct).toBe(8);
    expect(parseOverrides({ paddingPct: same })).toEqual({ paddingPct: 8 });
  });
  it("clamps each stored side independently and rejects invalid override objects", () => {
    expect(normalizeSettings({ paddingPct: { left: -5, right: 90, top: "junk", bottom: 2 } }).paddingPct)
      .toEqual({ left: 0, right: 50, top: 8, bottom: 2 });
    for (const bad of [{ left: 3 }, { ...sides, top: NaN }, { ...sides, left: "10" }, [], "bad", undefined]) {
      expect(parseOverrides({ paddingPct: bad, strokePx: 6 })).toEqual({ strokePx: 6 });
    }
  });
  it("compares all four padding sides for undo, while keeping uniform equivalents equal", () => {
    expect(overridesEqual({ paddingPct: sides }, { paddingPct: { ...sides, left: 11 } })).toBe(false);
    expect(overridesEqual({ paddingPct: sides }, { paddingPct: { ...sides } })).toBe(true);
    expect(overridesEqual({ paddingPct: same }, { paddingPct: 8 })).toBe(true);
    expect(overridesEqual({}, { paddingPct: sides })).toBe(false);
    expect(settingsEqual(settings(), settings({ ...sides, bottom: 16 }))).toBe(false);
  });
  it("inherits the group and resets it without changing unrelated overrides", () => {
    expect(effectiveSettings(settings(), { strokePx: 3 }).paddingPct).toEqual(sides);
    expect(effectiveSettings(settings(), { paddingPct: 12 }).paddingPct).toBe(12);
    expect(effectiveSettings(settings(), { paddingPct: null }).paddingPct).toBeNull();
  });
  it("preserves factory/legacy hashes and fingerprints every asymmetric side", () => {
    expect(settingsFingerprint(DEFAULT_UPLOAD_SETTINGS)).toBe("36232c04");
    expect(settingsFingerprint({ ...DEFAULT_UPLOAD_SETTINGS, paddingPct: same })).toBe(settingsFingerprint(DEFAULT_UPLOAD_SETTINGS));
    for (const side of Object.keys(sides) as (keyof typeof sides)[]) {
      expect(settingsFingerprint(settings({ ...sides, [side]: sides[side] + 1 }))).not.toBe(settingsFingerprint(settings()));
    }
  });
  it("keeps source-default as-is bytes, but never mistakes a sides object for as-is", () => {
    const original = { ...DEFAULT_UPLOAD_SETTINGS, ...AS_IS_SETTINGS };
    const result = prepareExportSvg(svg, original);
    expect(result.ok && result.svg).toBe(svg);
    expect(isAsIs({ ...original, paddingPct: sides })).toBe(false);
    const padded = prepareExportSvg(svg, { ...original, paddingPct: sides });
    expect(padded.ok && padded.asIs).toBe(false);
    expect(padded.ok && padded.fit.artW).toBe(200);
  });
});

describe("four-side artboard fitting", () => {
  it("hugs content using exact individual margins and preserves off-origin geometry", () => {
    const fit = fitArtboard(bounds, sides);
    expect(fit.artW).toBe(130); expect(fit.artH).toBe(70); expect(fit.scale).toBe(1);
    expect(fit.offsetX + bounds.minX).toBe(10);
    expect(fit.offsetY + bounds.minY).toBe(5);
  });
  it("centres in the inset rectangle of a pinned artboard, not the whole board", () => {
    const fit = fitArtboard(bounds, sides, { width: 1000, height: 500 });
    expect(fit.artW).toBe(1000); expect(fit.artH).toBe(500); expect(fit.scale).toBe(6);
    expect(fit.offsetX + bounds.minX * fit.scale).toBe(150); // 100 left + 50 letterbox
    expect(fit.offsetY + bounds.minY * fit.scale).toBe(50); // 50 top, 150 bottom
  });
  it("scales each content margin with the MP area target", () => {
    const fit = fitArtboard(bounds, sides, { megapixels: 5 });
    expect(fit.artW * fit.artH).toBeCloseTo(5e6, 5);
    expect(fit.artW / fit.artH).toBeCloseTo(130 / 70, 8);
    expect(fit.offsetX + bounds.minX * fit.scale).toBeCloseTo(10 * fit.scale, 8);
    expect(fit.offsetY + bounds.minY * fit.scale).toBeCloseTo(5 * fit.scale, 8);
  });
  it("preserves exact legacy numeric geometry for equal-sided padding", () => {
    for (const target of [null, { width: 5500, height: 3100 }, { megapixels: 5 }]) {
      expect(fitArtboard(bounds, same, target)).toEqual(fitArtboard(bounds, 8, target));
    }
  });
});

describe("shipped export and measured recovery use all four margins", () => {
  it.each([false, true])("bakes content padding into the exported vectors, expand=%s", (expandStrokes) => {
    const result = prepareExportSvg(svg, { ...settings(), expandStrokes });
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.fit.artW).toBe(130); expect(result.fit.artH).toBe(70);
    expect(result.bounds.minX).toBe(10); expect(result.bounds.minY).toBe(5);
    expect(result.svg).not.toContain("transform=");
    expect(svg).toContain('x="10" y="20"');
  });
  it.each([false, true])("fits final painted strokes inside asymmetric pinned margins, expand=%s", (expandStrokes) => {
    const line = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path d="M10 10L90 50" stroke="black" fill="none" stroke-linecap="round"/></svg>';
    const result = prepareExportSvg(line, { ...settings(), strokePx: 20, expandStrokes,
      artboard: { mode: "custom", width: 1000, height: 500, size: 512 } });
    expect(result.ok).toBe(true); if (!result.ok) return;
    const b = result.bounds;
    expect(b.minX).toBeGreaterThanOrEqual(100 - 0.002); expect(b.minY).toBeGreaterThanOrEqual(50 - 0.002);
    expect(b.minX + b.width).toBeLessThanOrEqual(800 + 0.002);
    expect(b.minY + b.height).toBeLessThanOrEqual(350 + 0.002);
    expect(b.minY).toBeCloseTo(50, 2);
  });
  it("keeps the enabled shadow within the four content margins", () => {
    const result = prepareExportSvg(svg, { ...settings(), shadowEnabled: true });
    expect(result.ok).toBe(true); if (!result.ok) return;
    const b = result.bounds, base = Math.max(b.width, b.height);
    expect(b.minX).toBeCloseTo(base * .10, 2);
    expect(b.minY).toBeCloseTo(base * .05, 2);
    expect(result.fit.artW - b.minX - b.width).toBeCloseTo(base * .20, 2);
    expect(result.fit.artH - b.minY - b.height).toBeCloseTo(base * .15, 2);
  });
  it("fails honestly instead of clipping when the chosen insets consume a pinned board", () => {
    const result = prepareExportSvg(svg, { ...settings({ left: 50, right: 50, top: 5, bottom: 15 }),
      artboard: { mode: "custom", width: 5500, height: 3100, size: 512 } });
    expect(result.ok).toBe(false); if (result.ok) return;
    expect(result.code).toBe("no-fit");
  });
  it("uses asymmetric inset centre and bounds in the bounded measured fallback", () => {
    const initial = fitArtboard(bounds, sides, { width: 1000, height: 500 });
    const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
    const got = recoverPinnedFit({ paddingPct: sides, target: { width: 1000, height: 500 },
      style: { widthPx: null, color: null }, expand: false }, initial, (fit) => ({
      ok: true, root, bounds: { minX: fit.offsetX, minY: fit.offsetY, width: 100 * fit.scale, height: 50 * fit.scale },
      shapesBaked: 1, widths: 0, colors: 0, expanded: 0,
    }));
    expect(got?.ok).toBe(true); if (!got?.ok) return;
    expect(got.bounds.minX + got.bounds.width / 2).toBeCloseTo(450, 2);
    expect(got.bounds.minY + got.bounds.height / 2).toBeCloseTo(200, 2);
    expect(got.bounds.minY).toBeGreaterThanOrEqual(50 - .002);
    expect(got.bounds.minY + got.bounds.height).toBeLessThanOrEqual(350 + .002);
  });
});


it.each(["icon-lightbulb-idea_AI_5_02.svg", "icon-lightbulb-idea_AI_5_03.svg"])("keeps all four asymmetric insets through the actual wide-stroke fallback: %s", (name) => {
  const file = `tests/assets/bug with SVG export expl temp/${name}`;
  const source = readFileSync(file, "utf8");
  const result = prepareExportSvg(source, { ...DEFAULT_UPLOAD_SETTINGS, paddingPct: { left: 4, right: 12, top: 6, bottom: 10 },
    strokePx: 50, artboard: { mode: "custom", size: 64, width: 64, height: 64 } });
  expect(result.ok).toBe(true); if (!result.ok) return;
  const b = result.bounds;
  expect(b.minX).toBeGreaterThanOrEqual(64 * .04 - .002);
  expect(b.minY).toBeGreaterThanOrEqual(64 * .06 - .002);
  expect(b.minX + b.width).toBeLessThanOrEqual(64 * .88 + .002);
  expect(b.minY + b.height).toBeLessThanOrEqual(64 * .90 + .002);
  expect(b.minX + b.width / 2).toBeCloseTo((64 + 64 * (.04 - .12)) / 2, 2);
  expect(b.minY + b.height / 2).toBeCloseTo((64 + 64 * (.06 - .10)) / 2, 2);
  expect(readFileSync(file, "utf8")).toBe(source);
});
