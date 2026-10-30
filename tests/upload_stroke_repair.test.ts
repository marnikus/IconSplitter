import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bakeGeometry } from "../src/lib/upload/bake";
import { strokeHits, visibleBounds } from "../src/lib/upload/geom/bounds";
import { parseTransform, identity } from "../src/lib/upload/geom/matrix";
import { prepareExportSvg } from "../src/lib/upload/prepare";
import { DEFAULT_UPLOAD_SETTINGS, effectiveSettings } from "../src/lib/upload/settings";
import { insideArtboard } from "../src/lib/upload/place";
import { writeEps, verifyEps } from "../src/lib/upload/eps";
import { optimizeSvg } from "../src/lib/upload/optimize";
import { enforceExportSvg } from "../src/lib/upload/clean";
import { AS_IS_SETTINGS } from "../src/lib/upload/asis";

const file = "tests/assets/bug with SVG export expl temp/icon-snowflake_AI_9_03.svg";
const source = () => readFileSync(file, "utf8");
const rootOf = (svg: string) => new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
const parse = (body: string) => rootOf(`<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`);

// Compare against independently calculated painted extrema, not the repair itself.
describe("anisotropic stroke auto-repair — local outline before affine bake", () => {
  it.each([
    ["translate(10 20) scale(3 2)", { minX: 10, minY: 18, width: 12, height: 4 }],
    ["translate(10 20) scale(-3 2)", { minX: -2, minY: 18, width: 12, height: 4 }],
    ["matrix(1 0 1 1 10 20)", { minX: 9, minY: 19, width: 6, height: 2 }],
  ])("preserves a butt stroke under %s", (transform, bounds) => {
    const root = parse(`<g fill="none" stroke="#123456" stroke-width="2" transform="${transform}"><path d="M0 0H4"/></g>`);
    const result = bakeGeometry(root, identity());
    expect(result.unsupported).toEqual([]);
    expect(root.querySelector("[transform]")).toBeNull();
    expect(visibleBounds(root)?.bounds).toEqual(bounds);
    expect(strokeHits(root).filter((h) => h.el.nodeName === "path" && !h.stroke.none)).toHaveLength(0);
    expect(root.querySelector('path[fill="#123456"]')).not.toBeNull();
  });

  it("repairs the combined CTM, not only an individual element's transform", () => {
    const root = parse(`<g transform="scale(2 1)"><g transform="rotate(90)"><path d="M0 0H4" fill="none" stroke="red" stroke-width="2"/></g></g>`);
    expect(bakeGeometry(root, parseTransform("translate(10 10) scale(2)" )).unsupported).toEqual([]);
    expect(visibleBounds(root)?.bounds).toEqual({ minX: 6, minY: 10, width: 8, height: 8 });
  });

  it("preserves fill, inherited stroke opacity, dash placement and shape compositing", () => {
    const root = parse(`<g fill="#abcdef" fill-opacity=".3" stroke="#123456" stroke-opacity=".4" stroke-width="2" stroke-dasharray="2 2"><path d="M0 0H8V4Z" transform="scale(3 2)" style="opacity:.5;stroke-linecap:round"/></g>`);
    expect(bakeGeometry(root, identity()).unsupported).toEqual([]);
    const fills = Array.from(root.querySelectorAll("path"));
    expect(fills).toHaveLength(2);
    const stroke = root.querySelector('path[fill="#123456"]')!;
    expect(stroke.getAttribute("fill-opacity")).toBe(".4");
    const composed = stroke.parentElement!;
    expect(composed.getAttribute("opacity")).toBe(".5");
    expect(fills.every((el) => !el.hasAttribute("opacity") && !el.getAttribute("style")?.includes("opacity"))).toBe(true);
    expect(stroke.getAttribute("d")!.match(/M/g)!.length).toBeGreaterThan(2);
    expect(root.querySelector("[transform]")).toBeNull();
  });

  it("keeps normal strokes editable while outlining only the anisotropic one", () => {
    const root = parse(`<g stroke="red" stroke-width="2" fill="none"><path d="M0 0H4" transform="scale(3 2)"/><path d="M0 4H4" transform="scale(2)"/></g>`);
    expect(bakeGeometry(root, identity()).unsupported).toEqual([]);
    const stroked = strokeHits(root).filter((h) => h.el.nodeName === "path" && !h.stroke.none);
    expect(stroked).toHaveLength(1);
    expect(stroked[0].stroke.width).toBe(4);
  });

  it.each([
    ['stroke="url(#g)"', "url(#…) stroke paint"],
    ['stroke="red" stroke-dasharray="-1 2"', "negative stroke-dasharray"],
  ])("refuses an unrepresentable repair atomically: %s", (attrs, reason) => {
    const root = parse(`<path d="M0 0H4" stroke="blue" transform="scale(3 2)"/><path d="M0 4H4" transform="scale(3 2)" ${attrs}/>`);
    const before = root.outerHTML;
    const result = bakeGeometry(root, identity());
    expect(result.baked).toBe(0);
    expect(result.unsupported.join(", ")).toContain(reason);
    expect(root.outerHTML).toBe(before);
  });

  it("bakes a non-scaling stroke without expanding or scaling its pen and dashes", () => {
    const root = parse(`<path d="M0 0H4" fill="none" stroke="red" stroke-width="2" stroke-dasharray="1 2" stroke-dashoffset=".5" vector-effect="non-scaling-stroke" transform="scale(3 2)"/>`);
    expect(bakeGeometry(root, identity()).unsupported).toEqual([]);
    const hit = strokeHits(root).find((h) => h.el.nodeName === "path")!;
    expect(hit.stroke.width).toBe(2);
    expect(hit.el.getAttribute("d")).toBe("M0 0L12 0");
    expect(hit.el.getAttribute("stroke-dasharray")).toBe("1 2");
    expect(hit.el.getAttribute("stroke-dashoffset")).toBe("0.5");
    expect(hit.el.hasAttribute("vector-effect")).toBe(false);
  });
});

describe("supplied snowflake — shared preview and vector export preparation", () => {
  it.each([0, 2])("automatically prepares source/final stroke width %d on a pinned artboard", async (strokePx) => {
    const svg = source();
    const settings = effectiveSettings(DEFAULT_UPLOAD_SETTINGS, { strokePx, paddingPct: 8, strokeColor: "#245678", strokeLinecap: "round",
      artboard: { mode: "preset", size: 512, width: 512, height: 512 } });
    const result = prepareExportSvg(svg, settings);
    expect(result.ok, !result.ok ? result.detail : "").toBe(true);
    if (!result.ok) return;
    const root = rootOf(result.svg);
    expect(root.querySelector("[transform],image,filter")).toBeNull();
    expect(insideArtboard(root)).toBe(true);
    expect(root.querySelectorAll("path,circle")).toHaveLength(8);
    if (strokePx === 2) {
      expect(root.getAttribute("stroke-width")).toBe("2");
      expect(result.strokesNormalized).toBe(8);
      expect(result.strokesExpanded).toBe(0);
    } else {
      expect(result.strokesExpanded).toBe(1);
      expect(root.querySelector('path[fill="#245678"]')).not.toBeNull();
    }
    expect(result.strokesRecolored).toBe(8);
    expect(prepareExportSvg(svg, settings)).toEqual(result);
    const cleaned = enforceExportSvg((await optimizeSvg(result.svg, true)).svg);
    expect(cleaned.violations).toEqual([]);
    expect(insideArtboard(rootOf(cleaned.svg))).toBe(true);
    const eps = writeEps(cleaned.svg, "#ffffff");
    expect(eps.ok, !eps.ok ? eps.reason : "").toBe(true);
    if (eps.ok) { expect(verifyEps(eps.eps).ok).toBe(true); expect(eps.eps).not.toContain("colorimage"); }
    expect(source()).toBe(svg);
  });

  it.each([false, true])("keeps source frame and supports full expansion=%s with shadow", (expandStrokes) => {
    const result = prepareExportSvg(source(), effectiveSettings(DEFAULT_UPLOAD_SETTINGS, { expandStrokes, shadowEnabled: true }));
    expect(result.ok, !result.ok ? result.detail : "").toBe(true);
    if (result.ok) expect(insideArtboard(rootOf(result.svg))).toBe(true);
  });
});


it("does not rewrite the actual snowflake when all settings are as-is", () => {
  const svg = source();
  const result = prepareExportSvg(svg, effectiveSettings(DEFAULT_UPLOAD_SETTINGS, AS_IS_SETTINGS));
  expect(result).toMatchObject({ ok: true, svg, asIs: true, strokesExpanded: 0 });
  expect(source()).toBe(svg);
});

it("honours selected round endpoints/paint during automatic outlining without recolouring the original fill", () => {
  const root = parse(`<path d="M0 0H4" fill="#abcdef" stroke="red" stroke-width="2" transform="scale(3 2)"/>`);
  expect(bakeGeometry(root, identity(), { widthPx: null, color: "#123456", linecap: "round" }).unsupported).toEqual([]);
  expect(visibleBounds(root)?.bounds).toEqual({ minX: -3, minY: -2, width: 18, height: 4 });
  expect(root.querySelectorAll("path")).toHaveLength(2);
  expect(root.querySelector('path[fill="#123456"]')).not.toBeNull();
  expect(root.querySelector('path[fill="#abcdef"]')).not.toBeNull();
});

it("does not expand two anisotropic matrices whose combined CTM is uniform", () => {
  const root = parse(`<g transform="scale(3 2)"><path d="M0 0H4" fill="none" stroke="red" transform="scale(2 3)"/></g>`);
  expect(bakeGeometry(root, identity()).repaired).toBeUndefined();
  expect(strokeHits(root).find((h) => h.el.nodeName === "path")?.stroke.width).toBe(6);
});

it("keeps non-scaling stroke semantics supplied through inline style", () => {
  const root = parse(`<path d="M0 0H4" fill="none" stroke="red" stroke-width="2" style="vector-effect:non-scaling-stroke" transform="scale(3 2)"/>`);
  expect(bakeGeometry(root, identity()).unsupported).toEqual([]);
  expect(strokeHits(root).find((h) => h.el.nodeName === "path")?.stroke.width).toBe(2);
  expect(root.querySelector("[style],[vector-effect]")).toBeNull();
});

it("fails closed on non-uniform dashes with a new final width instead of guessing dash spacing", () => {
  const root = parse(`<path d="M0 0H4" fill="none" stroke="red" stroke-dasharray="1 2" transform="scale(3 2)"/>`);
  const before = root.outerHTML;
  const result = bakeGeometry(root, identity(), { widthPx: 2, color: null });
  expect(result.baked).toBe(0);
  expect(result.unsupported).toEqual(["a dashed stroke under a non-uniform transform with a configured final width"]);
  expect(root.outerHTML).toBe(before);
});


it("keeps inherited dash lengths in local space before stretching vertically", () => {
  const root = parse(`<g stroke="red" fill="none" stroke-width="2" stroke-dasharray="2 2"><path d="M0 0V8" transform="scale(3 2)"/></g>`);
  expect(bakeGeometry(root, identity()).unsupported).toEqual([]);
  expect(visibleBounds(root)?.bounds).toEqual({ minX: -3, minY: 0, width: 6, height: 12 });
  expect(root.querySelector("path")!.getAttribute("d")!.match(/M/g)).toHaveLength(2);
});
