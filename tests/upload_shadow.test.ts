// upload_shadow.test.ts — one template gradient in the prepared SVG, final artboard and live-export path.
import { describe, expect, it } from "vitest";
import { AS_IS_SETTINGS, isAsIs } from "../src/lib/upload/asis";
import { insideArtboard, shippedBounds } from "../src/lib/upload/place";
import { prepareExportSvg } from "../src/lib/upload/prepare";
import { enforceExportSvg } from "../src/lib/upload/clean";
import { optimizeSvg } from "../src/lib/upload/optimize";
import {
  DEFAULT_UPLOAD_SETTINGS, effectiveSettings, normalizeSettings, overridesEqual, parseOverrides,
  settingsFingerprint, type SettingsOverrides,
} from "../src/lib/upload/settings";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const ICON = `<svg ${NS} viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" fill="#111"/></svg>`;
const shadow = (overrides: SettingsOverrides = {}) => effectiveSettings(DEFAULT_UPLOAD_SETTINGS, {
  shadowEnabled: true, shadowWidthPct: 80, shadowGapPct: 5, paddingPct: 0, ...overrides,
});

function prepared(source = ICON, overrides: SettingsOverrides = {}) {
  const result = prepareExportSvg(source, shadow(overrides));
  if (!result.ok) throw new Error(`${result.code}: ${result.detail}`);
  const root = new DOMParser().parseFromString(result.svg, "image/svg+xml").documentElement;
  const icon = [...root.querySelectorAll("rect")].find((el) => el.getAttribute("fill") === "#111")!;
  const oval = root.querySelector("ellipse")!;
  return { root, icon, oval, result };
}

function boundsOf(el: Element) {
  const x = Number(el.getAttribute("x") ?? el.getAttribute("cx")) - Number(el.getAttribute("rx") ?? 0);
  const y = Number(el.getAttribute("y") ?? el.getAttribute("cy")) - Number(el.getAttribute("ry") ?? 0);
  const width = Number(el.getAttribute("width") ?? 2 * Number(el.getAttribute("rx")));
  const height = Number(el.getAttribute("height") ?? 2 * Number(el.getAttribute("ry")));
  return { x, y, width, height };
}

describe("shadow export settings", () => {
  it("starts off and leaves legacy as-is bytes and default fingerprint unchanged", () => {
    const source = `<svg ${NS} viewBox="0 0 100 100"><!-- keep --><rect width="100" height="100"/></svg>`;
    const defaults = normalizeSettings({ ...DEFAULT_UPLOAD_SETTINGS });
    expect(defaults.shadowEnabled).toBe(false);
    expect([defaults.shadowWidthPct, defaults.shadowGapPct]).toEqual([80, 5]);
    expect(settingsFingerprint(defaults)).toBe("36232c04");
    const asIs = effectiveSettings(defaults, AS_IS_SETTINGS);
    expect(isAsIs(asIs)).toBe(true);
    expect(prepareExportSvg(source, asIs)).toMatchObject({ ok: true, svg: source, asIs: true });
    expect(settingsFingerprint({ ...defaults, shadowWidthPct: 200, shadowGapPct: 100 })).toBe("36232c04");
    expect(settingsFingerprint(shadow())).not.toBe(settingsFingerprint(defaults));
    expect(isAsIs({ ...asIs, shadowEnabled: true })).toBe(false);
  });

  it("validates percentages and includes them in per-icon equality/history payloads", () => {
    expect(parseOverrides({ shadowEnabled: true, shadowWidthPct: 999, shadowGapPct: -3 }))
      .toMatchObject({ shadowEnabled: true, shadowWidthPct: 200, shadowGapPct: 0 });
    expect(parseOverrides({ shadowEnabled: "yes", shadowWidthPct: "bad", shadowGapPct: NaN })).toEqual({});
    expect(normalizeSettings({ shadowEnabled: true, shadowWidthPct: Infinity, shadowGapPct: -10 }))
      .toMatchObject({ shadowEnabled: false, shadowWidthPct: 80, shadowGapPct: 0 });
    expect(overridesEqual({ shadowEnabled: true }, { shadowEnabled: false })).toBe(false);
    expect(overridesEqual({ shadowWidthPct: 80 }, { shadowWidthPct: 90 })).toBe(false);
  });

  it("changes the fingerprint whenever a changed percentage changes the prepared gradient", () => {
    const wide = `<svg ${NS} viewBox="0 0 1200 120"><rect width="1000" height="100" fill="#111"/></svg>`;
    const before = shadow({ shadowWidthPct: 80 });
    const after = shadow({ shadowWidthPct: 80.0004 });
    const first = prepareExportSvg(wide, before);
    const second = prepareExportSvg(wide, after);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.svg).not.toBe(first.svg);
    expect(settingsFingerprint(after)).not.toBe(settingsFingerprint(before));
  });
});

describe("shadow in the prepared export", () => {
  it("uses the template's pure gradient, centred below the painted icon at icon-relative width and gap", () => {
    const { root, icon, oval, result } = prepared();
    const art = boundsOf(icon);
    const shade = boundsOf(oval);
    expect(result.asIs).toBe(false);
    expect(shade.width).toBeCloseTo(art.width * 0.8, 2);
    expect(shade.height / shade.width).toBeCloseTo(23.7338 / 203.122, 3);
    expect(shade.x + shade.width / 2).toBeCloseTo(art.x + art.width / 2, 2);
    expect(shade.y - art.y - art.height).toBeCloseTo(art.height * 0.05, 2);
    const gradient = root.querySelector("radialGradient");
    expect(gradient?.getAttribute("gradientUnits")).toBe("objectBoundingBox");
    expect(gradient?.querySelectorAll("stop")).toHaveLength(3);
    expect(oval.getAttribute("fill")).toBe(`url(#${gradient?.id})`);
    expect(oval.getAttribute("fill-opacity")).toBe("0.2");
    expect(oval.getAttribute("stroke")).toBe("none");
    expect(root.querySelector("image, filter, [transform]")).toBeNull();
    expect(insideArtboard(root)).toBe(true);
  });

  it("keeps source-viewBox margins if the shadow fits, and expands content bounds for overflow", () => {
    const fits = `<svg ${NS} viewBox="0 0 100 100"><rect x="30" y="20" width="40" height="40" fill="#111"/></svg>`;
    const within = prepared(fits, { ...AS_IS_SETTINGS, shadowEnabled: true });
    expect(within.root.getAttribute("viewBox")).toBe("0 0 100 100");
    expect(boundsOf(within.icon)).toMatchObject({ x: 30, y: 20, width: 40, height: 40 });
    const nearEdge = `<svg ${NS} viewBox="0 0 100 100"><rect x="30" y="60" width="40" height="40" fill="#111"/></svg>`;
    const extended = prepared(nearEdge, { ...AS_IS_SETTINGS, artboard: { mode: "content", size: 512, width: 512, height: 512 }, shadowEnabled: true });
    expect(extended.result.fit.artW).toBeCloseTo(100, 2);
    expect(extended.result.fit.artH).toBeGreaterThan(100);
    expect(insideArtboard(extended.root)).toBe(true);
    const sourceSize = prepared(nearEdge, { ...AS_IS_SETTINGS, shadowEnabled: true });
    expect(sourceSize.root.getAttribute("viewBox")).toBe("0 0 100 100");
    expect(Number(sourceSize.icon.getAttribute("width"))).toBeLessThan(40);
    expect(insideArtboard(sourceSize.root)).toBe(true);
  });

  it("fits the final stroked icon and shadow into a pinned artboard without inheriting a border", () => {
    const strokeIcon = `<svg ${NS} viewBox="0 0 100 100"><path d="M10 10h80v80H10z" fill="none" stroke="#111" stroke-width="1"/></svg>`;
    const result = prepareExportSvg(strokeIcon, shadow({ paddingPct: 0, strokePx: 8,
      background: "#ffffff", artboard: { mode: "custom", size: 512, width: 512, height: 256 } }));
    if (!result.ok) throw new Error(result.detail);
    const root = new DOMParser().parseFromString(result.svg, "image/svg+xml").documentElement;
    expect(root.getAttribute("viewBox")).toBe("0 0 512 256");
    expect(root.firstElementChild?.getAttribute("fill")).toBe("#ffffff");
    expect(root.firstElementChild?.getAttribute("stroke")).toBe("none");
    const oval = root.querySelector("ellipse")!;
    expect(oval.getAttribute("stroke")).toBe("none");
    expect(insideArtboard(root)).toBe(true);
    const all = shippedBounds(root)!;
    expect(all.minY + all.height).toBeLessThanOrEqual(256.002);
  });

  it("retains referenced gradient stops through optimization and clean SVG", async () => {
    const { result } = prepared();
    const optimized = await optimizeSvg(result.svg, true);
    const clean = enforceExportSvg(optimized.svg);
    expect(clean.violations).toEqual([]);
    const root = new DOMParser().parseFromString(clean.svg, "image/svg+xml").documentElement;
    const oval = root.querySelector("ellipse, path[fill^='url(']");
    const id = /url\(#([^)]*)\)/.exec(oval?.getAttribute("fill") ?? "")?.[1];
    expect(id).toBeTruthy();
    expect(root.querySelector(`[id='${id}']`)?.querySelectorAll("stop")).toHaveLength(3);
  });
});
