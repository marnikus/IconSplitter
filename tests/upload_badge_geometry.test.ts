// upload_badge_geometry.test.ts — the supplied 412×20 seven-path badge baked into final artboard coordinates.
import { describe, expect, it } from "vitest";
import { appendCornerBadge, type BadgeCorner } from "../src/lib/upload/cornerbadge";
import { insideArtboard } from "../src/lib/upload/place";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
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
    ["bottom-left", 15.36, 256 - 7.68 - 204.8 * 20 / 412],
    ["bottom-right", 291.84, 256 - 7.68 - 204.8 * 20 / 412],
  ] as [BadgeCorner, number, number][])("anchors %s using exact 3%% horizontal/vertical insets", (corner, x, y) => {
    const { result } = placed(corner);
    expect(result.bounds.x).toBeCloseTo(x, 2);
    expect(result.bounds.y).toBeCloseTo(y, 2);
    expect(result.bounds.width).toBeCloseTo(204.8, 3);
    expect(result.bounds.height).toBeCloseTo(204.8 * 20 / 412, 3);
  });

  it("keeps the glyph filled and the six handles stroked under inherited icon paint", () => {
    const root = artboard(512, 256, 'stroke="#f00" stroke-width="18" fill="#f0f" fill-opacity="0" stroke-opacity="0" stroke-linecap="round"');
    const result = appendCornerBadge(root, { width: 512, height: 256 }, badge());
    if (!result.ok) throw new Error(result.detail);
    expect(result.paths).toHaveLength(7);
    const filled = result.paths.filter((path) => path.getAttribute("stroke") === "none");
    const stroked = result.paths.filter((path) => path.getAttribute("stroke") === "#000000");
    expect(filled).toHaveLength(1);
    expect(stroked).toHaveLength(6);
    for (const path of filled) {
      expect(path.nodeName).toBe("path");
      expect(path.getAttribute("fill")).toBe("#000000");
      expect(path.getAttribute("fill-opacity")).toBe("1");
      expect(path.getAttribute("stroke-width")).toBeNull();
    }
    for (const path of stroked) {
      expect(path.nodeName).toBe("path");
      expect(path.getAttribute("fill")).toBe("none");
      expect(path.getAttribute("stroke-opacity")).toBe("1");
      expect(Number(path.getAttribute("stroke-width"))).toBeGreaterThan(0);
      expect(path.getAttribute("stroke-linecap")).toBe("butt"); // no inherited round cap
    }
    expect(root.querySelector("[opacity], [transform]")).toBeNull();
    expect(insideArtboard(root)).toBe(true);
  });

  it("shrinks uniformly for a shallow artboard without moving either requested inset", () => {
    const root = artboard(411, 8);
    const result = appendCornerBadge(root, { width: 411, height: 8 }, badge("bottom-right", 100, 3, 3));
    if (!result.ok) throw new Error(result.detail);
    expect(result.bounds.width).toBeCloseTo((8 - 0.24) * 412 / 20, 3);
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
