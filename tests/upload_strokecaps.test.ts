// Real SVG preparation, settings lifecycle and strict vector EPS regression.
import { describe, expect, it } from "vitest";
import { AS_IS_SETTINGS, isAsIs } from "../src/lib/upload/asis";
import { writeEps, verifyEps } from "../src/lib/upload/eps";
import { isShape, strokeHits } from "../src/lib/upload/geom/bounds";
import { insideArtboard } from "../src/lib/upload/place";
import { prepareExportSvg } from "../src/lib/upload/prepare";
import {
  DEFAULT_UPLOAD_SETTINGS, normalizeSettings, parseOverrides, effectiveSettings,
  settingsEqual, settingsFingerprint, SETTINGS_FIELDS, overridesEqual,
} from "../src/lib/upload/settings";
import { discreteSettingsChange } from "../src/upload/settingsgestures";
import { parseUploadSettingsState, saveUploadSettings, loadUploadSettings } from "../src/upload/settingsstore";

const svg = (body: string, attrs = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="#000" stroke-width="6" ${attrs}>${body}</svg>`;
const PATH = '<path d="M20 30L70 30L70 70"/>';
const MIXED = svg(`<g stroke-linecap="round">${PATH}<path d="M20 50L60 50" stroke-linecap="square" style="stroke-linecap:butt"/></g><rect x="40" y="60" width="10" height="10" stroke="none" fill="#000"/>`);

function eps(source: string) {
  const r = writeEps(source, "#ffffff");
  if (!r.ok) throw new Error(r.reason);
  expect(verifyEps(r.eps)).toMatchObject({ ok: true, errors: [] });
  return r.eps;
}
const caps = (text: string) => [...text.matchAll(/(\d) setlinecap/g)].map((m) => Number(m[1]));
const joins = (text: string) => [...text.matchAll(/(\d) setlinejoin/g)].map((m) => Number(m[1]));

function prepared(source: string, settings = DEFAULT_UPLOAD_SETTINGS) {
  const r = prepareExportSvg(source, settings);
  if (!r.ok) throw new Error(`${r.code}: ${r.detail}`);
  const root = new DOMParser().parseFromString(r.svg, "image/svg+xml").documentElement;
  return { r, root };
}

describe("EPS retains inherited source caps and joins", () => {
  it.each([["butt", 0], ["round", 1], ["square", 2]] as const)("root/group/style %s cap survives intervening groups", (cap, n) => {
    for (const source of [
      svg(`<g><g>${PATH}</g></g>`, `stroke-linecap="${cap}"`),
      svg(`<g stroke-linecap="${cap}"><g>${PATH}</g></g>`),
      svg(`<g style="stroke-linecap:${cap}"><g>${PATH}</g></g>`),
    ]) expect(caps(eps(source))).toEqual([n]);
  });

  it.each([["miter", 0], ["round", 1], ["bevel", 2]] as const)("inherits %s joins alongside caps", (join, n) => {
    const source = svg(`<g style="stroke-linejoin:${join};stroke-linecap:round"><g>${PATH}</g></g>`);
    expect(joins(eps(source))).toEqual([n]);
    expect(caps(eps(source))).toEqual([1]);
  });

  it("local style wins; siblings revert to inherited source paint", () => {
    const source = svg(`<g>${PATH}<path d="M10 50h60" stroke-linecap="square" style="stroke-linecap:butt;stroke-linejoin:miter"/>${PATH}</g>`, 'stroke-linecap="round" stroke-linejoin="bevel"');
    expect(caps(eps(source))).toEqual([1, 0, 1]);
    expect(joins(eps(source))).toEqual([2, 0, 2]);
  });
});

describe("endpoint settings lifecycle", () => {
  it("old/malformed settings default to source and invalid pins disappear", () => {
    expect(DEFAULT_UPLOAD_SETTINGS.strokeLinecap).toBe("source");
    for (const value of [undefined, null, "square", "ROUND", 1, {}, ""]) {
      expect(normalizeSettings({ strokeLinecap: value }).strokeLinecap).toBe("source");
      expect(parseOverrides({ strokeLinecap: value })).toEqual({});
    }
    expect(SETTINGS_FIELDS).toContain("strokeLinecap");
  });

  it.each(["source", "butt", "round"] as const)("valid %s defaults/pins persist and participate in equality and fingerprints", (strokeLinecap) => {
    const defaults = { ...DEFAULT_UPLOAD_SETTINGS, strokeLinecap };
    expect(normalizeSettings(defaults)).toEqual(defaults);
    expect(parseOverrides({ strokeLinecap })).toEqual({ strokeLinecap });
    expect(effectiveSettings(defaults, { strokeLinecap: "round" }).strokeLinecap).toBe("round");
    saveUploadSettings({ defaults, overrides: { icon: { strokeLinecap } } });
    expect(loadUploadSettings()).toMatchObject({ defaults, overrides: { icon: { strokeLinecap } } });
    expect(settingsEqual(defaults, DEFAULT_UPLOAD_SETTINGS)).toBe(strokeLinecap === "source");
    expect(overridesEqual({ strokeLinecap }, {})).toBe(false);
    expect(discreteSettingsChange(null, { strokeLinecap })).toBe(true);
    expect(settingsFingerprint(defaults) === settingsFingerprint(DEFAULT_UPLOAD_SETTINGS)).toBe(strokeLinecap === "source");
  });

  it("legacy storage loads source and fingerprints distinguish all modes", () => {
    expect(parseUploadSettingsState({ v: 1, defaults: {}, overrides: {} }).defaults.strokeLinecap).toBe("source");
    expect(new Set(["source", "butt", "round"].map((strokeLinecap) => settingsFingerprint(normalizeSettings({ strokeLinecap })))).size).toBe(3);
  });
});

describe("one endpoint choice for preview and every export", () => {
  it("source mode preserves source bytes and mixed caps; All default restores source", () => {
    const s = { ...DEFAULT_UPLOAD_SETTINGS, ...AS_IS_SETTINGS };
    expect(AS_IS_SETTINGS.strokeLinecap).toBe("source");
    expect(isAsIs(s)).toBe(true);
    expect(prepared(MIXED, s).r.svg).toBe(MIXED);
    expect(caps(eps(MIXED))).toEqual([1, 0]);
    const forced = { ...s, strokeLinecap: "round" as const };
    expect(isAsIs(forced)).toBe(false);
    expect(isAsIs({ ...forced, ...AS_IS_SETTINGS })).toBe(true);
  });

  it.each([["butt", 0], ["round", 1]] as const)("%s overrides inherited and inline caps before fitting", (strokeLinecap, n) => {
    const { r, root } = prepared(MIXED, { ...DEFAULT_UPLOAD_SETTINGS, ...AS_IS_SETTINGS, strokeLinecap });
    expect(r.asIs).toBe(false);
    expect(root.getAttribute("viewBox")).toBe("0 0 100 100");
    const strokes = [...strokeHits(root)].filter((hit) => !hit.stroke.none && isShape(hit.el));
    expect(strokes.length).toBeGreaterThanOrEqual(2);
    expect(strokes.every((hit) => hit.stroke.cap === strokeLinecap)).toBe(true);
    expect(caps(eps(r.svg))).toEqual([n, n]);
    expect(MIXED).toContain('style="stroke-linecap:butt"');
    expect(root.querySelector("rect")!.getAttribute("stroke")).toBe("none");
    expect(insideArtboard(root)).toBe(true);
  });

  it.each(["butt", "round"] as const)("%s applies to badge handles and size-guide copies too", (strokeLinecap) => {
    const { r, root } = prepared(MIXED, { ...DEFAULT_UPLOAD_SETTINGS, strokeLinecap, badgeEnabled: true, sizeGuideEnabled: true });
    const strokes = [...strokeHits(root)].filter((hit) => !hit.stroke.none && isShape(hit.el));
    expect(strokes.length).toBeGreaterThan(8);
    expect(strokes.every((hit) => hit.stroke.cap === strokeLinecap)).toBe(true);
    expect(new Set(caps(eps(r.svg)))).toEqual(new Set([strokeLinecap === "round" ? 1 : 0]));
    expect(insideArtboard(root)).toBe(true);
  });

  it("expansion consumes the selected endpoints (including decorations), leaving vector fills only", () => {
    const versions = (["butt", "round"] as const).map((strokeLinecap) => prepared(MIXED, {
      ...DEFAULT_UPLOAD_SETTINGS, strokeLinecap, expandStrokes: true, badgeEnabled: true, sizeGuideEnabled: true,
    }));
    for (const { r, root } of versions) {
      expect(r.strokesExpanded).toBeGreaterThanOrEqual(8);
      expect([...strokeHits(root)].every((hit) => hit.stroke.none)).toBe(true);
      expect(caps(eps(r.svg))).toEqual([]);
      expect(insideArtboard(root)).toBe(true);
    }
    expect(versions[0].r.svg).not.toBe(versions[1].r.svg);
  });
});
