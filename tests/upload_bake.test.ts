// upload_bake.test.ts — the geometry bake (2026-10-08, exact stroke width):
// every transform — the artwork's own and the artboard's — resolved into the
// shapes' coordinates so the shipped file has NO transform and a stroke width
// can be written verbatim afterwards. Shapes keep their element when the maths
// allows; what a bake would distort is refused by name, never guessed.

import { describe, expect, it } from "vitest";
import { bakeGeometry } from "../src/lib/upload/bake";
import { parseTransform } from "../src/lib/upload/geom/matrix";

function parse(markup: string): Element {
  return new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${markup}</svg>`, "image/svg+xml").documentElement;
}

const attrs = (el: Element | null, names: string[]) => names.map((n) => el?.getAttribute(n) ?? null);
const noTransforms = (root: Element) => root.querySelectorAll("[transform]").length === 0;

describe("bakeGeometry — shapes keep their element under an axis-aligned matrix", () => {
  it("rect/ellipse/line/polyline/polygon rescale their own attributes; the artboard matrix applies to everything", () => {
    const root = parse(`<g transform="translate(5 0) scale(2 3)">`
      + `<rect x="1" y="2" width="4" height="3" rx="1" ry="1" fill="#000"/>`
      + `<ellipse cx="10" cy="10" rx="2" ry="1" fill="#000"/>`
      + `<line x1="0" y1="0" x2="1" y2="1"/>` // unstroked on purpose: a stroke under scale(2 3) is refused (see below)
      + `<polyline points="0,0 1,1" fill="#000"/>`
      + `<polygon points="0,0 1,1 2,0" fill="#000"/></g>`);
    const out = bakeGeometry(root, parseTransform("translate(10 20) scale(2)"));
    expect(out).toEqual({ baked: 5, unsupported: [] });
    expect(noTransforms(root)).toBe(true);
    // rect: x' = 10 + 2·(5 + 2·1) = 24, y' = 20 + 2·(3·2) = 32, w' = 2·2·4 = 16, h' = 2·3·3 = 18, rx' = 4, ry' = 6
    expect(attrs(root.querySelector("rect"), ["x", "y", "width", "height", "rx", "ry"])).toEqual(["24", "32", "16", "18", "4", "6"]);
    expect(attrs(root.querySelector("ellipse"), ["cx", "cy", "rx", "ry"])).toEqual(["60", "80", "8", "6"]);
    expect(attrs(root.querySelector("line"), ["x1", "y1", "x2", "y2"])).toEqual(["20", "20", "24", "26"]);
    expect(root.querySelector("polyline")?.getAttribute("points")).toBe("20 20 24 26");
    expect(root.querySelector("polygon")?.getAttribute("points")).toBe("20 20 24 26 28 20");
    expect(root.querySelector("g")?.hasAttribute("transform")).toBe(false); // the group stays (paint may live on it), its transform is spent
  });

  it("a circle keeps its element under a uniform matrix, becomes a path under a non-uniform one", () => {
    const root = parse(`<circle cx="10" cy="10" r="4" fill="#000"/><circle cx="1" cy="1" r="1" fill="#000" transform="scale(2 1)"/>`);
    const out = bakeGeometry(root, parseTransform("scale(3)"));
    expect(out).toEqual({ baked: 2, unsupported: [] });
    expect(attrs(root.querySelector("circle"), ["cx", "cy", "r"])).toEqual(["30", "30", "12"]);
    const path = root.querySelector("path");
    expect(path?.getAttribute("fill")).toBe("#000"); // presentation attributes travel
    expect(path?.getAttribute("d")?.startsWith("M12 3C12 ")).toBe(true); // (cx+r)·(6,3) = (12, 3)
    expect(root.querySelectorAll("circle")).toHaveLength(1);
  });
});

describe("bakeGeometry — rotation and skew bake into path data", () => {
  it("a rotated rect becomes a path with exact corners; its stroke survives (uniform matrix)", () => {
    const root = parse(`<rect x="0" y="0" width="10" height="10" fill="none" stroke="#000" transform="rotate(90)"/>`);
    const out = bakeGeometry(root, parseTransform("translate(50 0)"));
    expect(out).toEqual({ baked: 1, unsupported: [] });
    const path = root.querySelector("path");
    expect(path?.getAttribute("d")).toBe("M50 0L50 10L40 10L40 0Z");
    expect(path?.getAttribute("stroke")).toBe("#000");
    expect(root.querySelector("rect")).toBeNull();
  });

  it("a path's data is transformed in place; dash lengths follow the scale", () => {
    const root = parse(`<g transform="scale(2)"><path d="M0 0 L1 0" stroke="#000" stroke-dasharray="1 2" stroke-dashoffset="0.5"/></g>`);
    bakeGeometry(root, parseTransform("translate(1 1)"));
    const path = root.querySelector("path");
    expect(attrs(path, ["d", "stroke-dasharray", "stroke-dashoffset"])).toEqual(["M1 1L3 1", "2 4", "1"]);
  });
});

describe("bakeGeometry — the artwork's own stroke width follows its geometry", () => {
  it("writes width × the baked scale on every visibly stroked shape, 3 decimals, the inherited width resolved", () => {
    const root = parse(`<g stroke="#000" stroke-width="1.5" transform="scale(1.1)"><path d="M0 0 L1 0"/><path d="M0 0 L1 0" stroke="none"/></g>`);
    bakeGeometry(root, parseTransform("scale(4)"));
    const [stroked, unstroked] = Array.from(root.querySelectorAll("path"));
    expect(stroked.getAttribute("stroke-width")).toBe("6.6");
    expect(unstroked.getAttribute("stroke-width")).toBeNull();
    expect(root.querySelector("g")?.getAttribute("stroke-width")).toBeNull(); // spent: every shape carries its own now
  });

  it("a non-scaling stroke keeps its width (it was already in final px) and loses the attribute", () => {
    const root = parse(`<path d="M0 0 L1 0" stroke="#000" stroke-width="1.5" vector-effect="non-scaling-stroke" transform="scale(2)"/>`);
    bakeGeometry(root, parseTransform("scale(1)"));
    expect(attrs(root.querySelector("path"), ["stroke-width", "vector-effect"])).toEqual(["1.5", null]);
  });
});

describe("bakeGeometry — a rounded rect turns like any shape (2026-10-08)", () => {
  it("a rotated rounded rect becomes a <path> with its four corner arcs — no refusal, no distortion", () => {
    const root = parse(`<rect x="0" y="0" width="10" height="10" rx="2" fill="#000" transform="rotate(90 5 5)"/>`);
    const out = bakeGeometry(root, parseTransform("scale(1)"));
    expect(out.unsupported).toEqual([]);
    expect(root.querySelector("rect")).toBeNull();
    const d = root.querySelector("path")?.getAttribute("d") ?? "";
    expect(d.match(/C/g)).toHaveLength(4);
    expect(d).toContain("M10 2"); // (2,0) rotated 90° about the centre lands on (10,2)
    expect(root.querySelector("path")?.getAttribute("transform")).toBeNull();
  });
});

describe("bakeGeometry — refusals, named (never guessed)", () => {
  it.each([
    ["a stroked shape under a non-uniform scale", `<path d="M0 0 L1 0" stroke="#000" transform="scale(2 1)"/>`, "a stroked <path> under a non-uniform transform"],
    ["a stroked shape under a skew", `<rect x="0" y="0" width="1" height="1" stroke="#000" transform="skewX(10)"/>`, "a stroked <rect> under a non-uniform transform"],
    ["a pattern", `<pattern id="p"/><rect x="0" y="0" width="1" height="1"/>`, "a <pattern>"],
    ["a userSpaceOnUse gradient", `<defs><linearGradient id="g" gradientUnits="userSpaceOnUse"/></defs><rect x="0" y="0" width="1" height="1" fill="url(#g)"/>`, "a userSpaceOnUse <linearGradient>"],
    ["a clipPath", `<defs><clipPath id="c"><rect width="1" height="1"/></clipPath></defs><rect x="0" y="0" width="1" height="1" clip-path="url(#c)"/>`, "a <clipPath>"],
    ["a mask", `<mask id="m"/><rect x="0" y="0" width="1" height="1"/>`, "a <mask>"],
    ["a filter", `<filter id="f"/><rect x="0" y="0" width="1" height="1"/>`, "a <filter>"],
  ])("%s", (_name, markup, reason) => {
    const root = parse(markup);
    const before = root.outerHTML;
    const out = bakeGeometry(root, parseTransform("scale(2)"));
    expect(out.unsupported).toEqual([reason]);
    expect(root.outerHTML).toBe(before); // refused BEFORE touching the tree
  });

  it("an unstroked shape under a non-uniform scale is fine — only strokes are anisotropic", () => {
    const root = parse(`<path d="M0 0 L1 0" fill="#000" transform="scale(2 1)"/>`);
    expect(bakeGeometry(root, parseTransform("scale(1)"))).toEqual({ baked: 1, unsupported: [] });
    expect(root.querySelector("path")?.getAttribute("d")).toBe("M0 0L2 0");
  });
});
