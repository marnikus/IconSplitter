// upload_expand.test.ts — "Expand strokes to fills" through the REAL prepare
// pass (2026-10-09, design D4/D5): with the setting on, no stroke property
// survives anywhere, the new <path> carries the former stroke paint right
// after its original, `fill="none"` originals are gone, and the refusals are
// named. With the setting off the output is byte-identical to today.
import { describe, expect, it } from "vitest";
import { prepareExportSvg } from "../src/lib/upload/prepare";
import { DEFAULT_UPLOAD_SETTINGS, effectiveSettings, type SettingsOverrides } from "../src/lib/upload/settings";

const NS = `xmlns="http://www.w3.org/2000/svg"`;
const svg = (body: string) => `<svg ${NS} viewBox="0 0 100 100" width="100" height="100">${body}</svg>`;

function prepare(source: string, overrides: SettingsOverrides = {}) {
  return prepareExportSvg(source, effectiveSettings(DEFAULT_UPLOAD_SETTINGS, { strokePx: 2, expandStrokes: true, ...overrides }));
}
function prepared(source: string, overrides: SettingsOverrides = {}) {
  const result = prepare(source, overrides);
  if (!result.ok) throw new Error(`prepare failed: ${result.code} ${result.detail}`);
  const doc = new DOMParser().parseFromString(result.svg, "image/svg+xml");
  return { result, doc, root: doc.documentElement, shapes: Array.from(doc.querySelectorAll("path, rect, circle, ellipse, line, polyline, polygon")) };
}
const STROKE_PROPS = ["stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "stroke-opacity"];

describe("Expand strokes to fills — the prepare pass", () => {
  it("a stroked open path becomes one filled path: no stroke property anywhere, the fill is the former stroke paint", () => {
    const { result, root, shapes } = prepared(svg(`<path d="M10 50L90 50" stroke="#123456" stroke-linecap="round" fill="none"/>`));
    expect(result.strokesExpanded).toBe(1);
    expect(result.globalStroke).toEqual({ stroke: null, strokeWidth: null });
    for (const el of [root, ...shapes]) for (const prop of STROKE_PROPS) expect(el.getAttribute(prop), prop).toBeNull();
    expect(result.svg).not.toMatch(/stroke/);
    expect(shapes).toHaveLength(1); // the fill="none" original is gone
    expect(shapes[0].getAttribute("fill")).toBe("#000000"); // the stroke colour setting (default #000000) is what was expanded
    expect(shapes[0].getAttribute("fill-rule")).toBe("nonzero");
  });

  it("the expanded width is the stroke setting's px, after the artboard scale (the line is 2 px thick in the file)", () => {
    const { doc } = prepared(svg(`<path d="M10 50L90 50" stroke="#000" fill="none"/>`), { strokePx: 4 });
    const d = doc.querySelector("path")?.getAttribute("d") ?? "";
    const ys = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0])).filter((_, i) => i % 2 === 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(4, 3);
  });

  it("a filled AND stroked rect keeps its fill shape and gains the outline path right after it; stroke-opacity → fill-opacity", () => {
    const { shapes, result } = prepared(svg(`<rect x="20" y="20" width="60" height="60" fill="#ff0000" stroke="#000" stroke-opacity="0.5"/>`), { strokeColor: "artwork" });
    expect(shapes).toHaveLength(2);
    expect(shapes[0].nodeName).toBe("rect");
    expect(shapes[0].getAttribute("fill")).toBe("#ff0000");
    expect(shapes[0].getAttribute("fill-opacity")).toBeNull();
    expect(shapes[1].nodeName).toBe("path");
    expect(shapes[1].getAttribute("fill")).toBe("#000");
    expect(shapes[1].getAttribute("fill-opacity")).toBe("0.5");
    expect(result.strokesExpanded).toBe(1);
  });

  it("a stroke inherited from a group expands on the shape; the group loses its stroke properties too", () => {
    const { result, shapes } = prepared(svg(`<g stroke="#000" stroke-width="3" fill="none"><circle cx="50" cy="50" r="30"/><path d="M0 0h10"/></g>`));
    expect(result.strokesExpanded).toBe(2);
    expect(result.svg).not.toMatch(/stroke/);
    expect(shapes.every((s) => s.nodeName === "path" && s.getAttribute("fill") === "#000000")).toBe(true);
  });

  it("a dashed stroke expands into capped pieces (v1): the piece count follows the pattern", () => {
    const { shapes, result } = prepared(svg(`<path d="M10 50L90 50" stroke="#000" stroke-dasharray="20 20" fill="none"/>`));
    expect(result.strokesExpanded).toBe(1);
    expect(result.svg).not.toMatch(/dasharray/);
    const d = shapes[0].getAttribute("d") ?? "";
    expect((d.match(/M/g) ?? []).length).toBe(2); // 80 long: on 0–20, off, on 40–60, off
  });

  it("refuses by name what it cannot expand honestly: a url(#…) stroke paint, a negative dash", () => {
    const grad = `<defs><linearGradient id="g"><stop offset="0" stop-color="#000"/></linearGradient></defs>`;
    const byUrl = prepare(svg(`${grad}<path d="M10 50L90 50" stroke="url(#g)" fill="none"/>`), { strokeColor: "artwork" });
    expect(byUrl.ok).toBe(false);
    if (!byUrl.ok) expect(byUrl.detail).toBe("unsupported: a url(#…) stroke paint under Expand strokes on <path>");
    const negative = prepare(svg(`<path d="M10 50L90 50" stroke="#000" stroke-dasharray="4 -2" fill="none"/>`));
    expect(negative.ok).toBe(false);
    if (!negative.ok) expect(negative.detail).toBe("unsupported: a negative stroke-dasharray value (4 -2) under Expand strokes on <path>");
  });

  it("nothing stroked → nothing expanded, the document is untouched by the pass", () => {
    const { result, shapes } = prepared(svg(`<rect x="20" y="20" width="60" height="60" fill="#000"/>`));
    expect(result.strokesExpanded).toBe(0);
    expect(shapes).toHaveLength(1);
  });

  it("equivalence gate: expandStrokes:false is byte-identical to today's output", () => {
    const source = svg(`<path d="M10 50L90 50" stroke="#123456" stroke-linecap="round" fill="none"/><rect x="1" y="1" width="5" height="5"/>`);
    const off = prepareExportSvg(source, effectiveSettings(DEFAULT_UPLOAD_SETTINGS, { strokePx: 2 }));
    const explicitOff = prepareExportSvg(source, effectiveSettings(DEFAULT_UPLOAD_SETTINGS, { strokePx: 2, expandStrokes: false }));
    expect(explicitOff).toEqual(off);
    if (off.ok) expect(off.svg).toContain("stroke-width");
  });
});
