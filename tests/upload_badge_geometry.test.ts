// upload_badge_geometry.test.ts — the supplied 412×20 editable-stroke badge baked into final artboard coordinates.
import { describe, expect, it } from "vitest";
import { appendCornerBadge, type BadgeCorner } from "../src/lib/upload/cornerbadge";
import { insideArtboard } from "../src/lib/upload/place";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const SOURCE_W = 412;
const SOURCE_H = 20;
const badge = (corner: BadgeCorner = "bottom-right", widthPct = 40, offsetXPct = 3, offsetYPct = 3) =>
  ({ corner, widthPct, offsetXPct, offsetYPct });

function artboard(w = 512, h = 256, paint = "") {
  return new DOMParser().parseFromString(`<svg ${NS} viewBox="0 0 ${w} ${h}" ${paint}>
    <rect x="${w / 4}" y="${h / 4}" width="${w / 8}" height="${h / 4}" fill="#c00" stroke="none"/>
  </svg>`, "image/svg+xml").documentElement;
}

function placed(corner: BadgeCorner) {
  const root = artboard();
  const original = root.querySelector("rect")?.outerHTML;
  const result = appendCornerBadge(root, { width: 512, height: 256 }, badge(corner));
  if (!result.ok) throw new Error(result.detail);
  expect(root.querySelector("rect")?.outerHTML).toBe(original);
  expect(root.querySelectorAll("path")).toHaveLength(7);
  expect(root.querySelector("[transform], text, image")).toBeNull();
  expect(insideArtboard(root)).toBe(true);
  return { root, result };
}

describe("the fixed vector badge on the final artboard", () => {
  it.each([
    ["top-left", 15.36, 7.68], ["top-right", 291.84, 7.68],
    ["bottom-left", 15.36, 256 - 7.68 - 204.8 * SOURCE_H / SOURCE_W],
    ["bottom-right", 291.84, 256 - 7.68 - 204.8 * SOURCE_H / SOURCE_W],
  ] as [BadgeCorner, number, number][])(`anchors %s using exact 3%% horizontal/vertical insets`, (corner, x, y) => {
    const { result } = placed(corner);
    expect(result.bounds.x).toBeCloseTo(x, 2);
    expect(result.bounds.y).toBeCloseTo(y, 2);
    expect(result.bounds.width).toBeCloseTo(204.8, 3);
    expect(result.bounds.height).toBeCloseTo(204.8 * SOURCE_H / SOURCE_W, 3);
  });

  it("keeps the filled glyph and six opaque black outlines under inherited icon paint", () => {
    const root = artboard(512, 256, 'stroke="#f00" stroke-width="18" fill="#f0f" fill-opacity="0" stroke-opacity="0" stroke-linecap="round"');
    const result = appendCornerBadge(root, { width: 512, height: 256 }, badge());
    if (!result.ok) throw new Error(result.detail);
    expect(result.paths).toHaveLength(7);
    expect(result.expanded).toBe(0);
    const [glyph, ...handles] = result.paths;
    expect(glyph.getAttribute("fill")).toBe("#000000");
    expect(glyph.getAttribute("stroke")).toBe("none");
    expect(glyph.getAttribute("stroke-width")).toBeNull();
    for (const path of handles) {
      expect(path.getAttribute("fill")).toBe("none");
      expect(path.getAttribute("stroke")).toBe("#000000");
      expect(path.getAttribute("stroke-opacity")).toBe("1");
      expect(path.getAttribute("stroke-linecap")).toBe("butt");
      expect(path.getAttribute("stroke-linejoin")).toBe("miter");
      expect(path.getAttribute("stroke-dasharray")).toBe("none");
      expect(Number(path.getAttribute("stroke-width"))).toBeCloseTo(1.5 * 204.8 / SOURCE_W, 3);
    }
    expect(root.querySelector("[opacity], [transform]")).toBeNull();
    expect(insideArtboard(root)).toBe(true);
  });

  it("expands the six outlined handles when Expand strokes is on", () => {
    const root = artboard();
    const result = appendCornerBadge(root, { width: 512, height: 256 }, badge(), true);
    if (!result.ok) throw new Error(result.detail);
    expect(result.expanded).toBe(6);
    expect(result.paths).toHaveLength(7);
    for (const path of result.paths) {
      expect(path.getAttribute("fill")).toBe("#000000");
      expect(path.getAttribute("stroke")).toBe("none");
      expect(path.getAttribute("stroke-width")).toBeNull();
    }
    expect(root.querySelectorAll("path[stroke]:not([stroke='none'])")).toHaveLength(0);
    expect(insideArtboard(root)).toBe(true);
  });

  it("shrinks uniformly for a shallow artboard without moving either requested inset", () => {
    const root = artboard(411, 8);
    const result = appendCornerBadge(root, { width: 411, height: 8 }, badge("bottom-right", 100, 3, 3));
    if (!result.ok) throw new Error(result.detail);
    expect(result.bounds.width).toBeCloseTo((8 - 0.24) * SOURCE_W / SOURCE_H, 3);
    expect(result.bounds.height).toBeCloseTo(7.76, 3);
    expect(411 - result.bounds.x - result.bounds.width).toBeCloseTo(12.33, 3);
    expect(8 - result.bounds.y - result.bounds.height).toBeCloseTo(0.24, 3);
    expect(insideArtboard(root)).toBe(true);
  });

  it("keeps a large horizontal inset exact by shrinking the badge, not clamping the inset", () => {
    const root = artboard();
    const result = appendCornerBadge(root, { width: 512, height: 256 }, badge("top-left", 100, 90, 3));
    if (!result.ok) throw new Error(result.detail);
    expect(result.bounds.x).toBeCloseTo(460.8, 3);
    expect(result.bounds.width).toBeCloseTo(51.2, 3);
    expect(insideArtboard(root)).toBe(true);
  });

  it.each([badge("top-left", 40, 100), badge("top-left", 40, 3, 100)])(
    "refuses an inset with no room without appending partial badge paths", (settings) => {
      const root = artboard();
      const before = root.outerHTML;
      const result = appendCornerBadge(root, { width: 512, height: 256 }, settings);
      expect(result).toMatchObject({ ok: false, code: "no-fit" });
      expect(root.outerHTML).toBe(before);
    },
  );

  it("names a source artboard too small for a measurable badge", () => {
    const root = artboard(0.001, 0.001);
    const before = root.outerHTML;
    const result = appendCornerBadge(root, { width: 0.001, height: 0.001 }, badge());
    expect(result).toMatchObject({ ok: false, code: "no-fit" });
    expect(root.outerHTML).toBe(before);
  });
});
