import { describe, expect, it } from "vitest";
import { outlineBounds } from "../src/lib/upload/geom/curvebounds";
import { pathOutline, transformOutline } from "../src/lib/upload/geom/outline";
import { tightGeometryBounds } from "../src/lib/upload/geom/tightbounds";
import { visibleBounds } from "../src/lib/upload/geom/bounds";
import { measureViewportBounds } from "../src/lib/upload/viewportbounds";
import { repairStrokeFrame } from "../src/lib/upload/viewrepair";
import { prepareExportSvg } from "../src/lib/upload/prepare";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";

const frame = { minX: 0, minY: 0, width: 100, height: 100 };
const root = (body: string) => new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`, "image/svg+xml").documentElement;
const bounds = (d: string) => outlineBounds(pathOutline(d)!);

describe("analytic bounds of represented outlines", () => {
  it("measures interior extrema, not cubic controls, and handles degenerate derivatives", () => {
    expect(bounds("M0 0C0 100 100 100 100 0")).toEqual({ bounds: { minX: 0, minY: 0, width: 100, height: 75 }, invalid: false });
    expect(bounds("M0 0C10 10 20 20 30 30").bounds).toEqual({ minX: 0, minY: 0, width: 30, height: 30 });
    expect(bounds("M0 0C0 0 0 0 0 0").bounds).toEqual({ minX: 0, minY: 0, width: 0, height: 0 });
    expect(bounds("M0 0C0 0 0 1 0 1").bounds).toEqual({ minX: 0, minY: 0, width: 0, height: 1 });
    expect(bounds("M0 0C0 1 0 -1 0 0").bounds!.height).toBeCloseTo(1 / Math.sqrt(3), 12);
    expect(bounds("M0 0C1 1 1 1 2 2").bounds).toEqual({ minX: 0, minY: 0, width: 2, height: 2 });
    expect(bounds("M0 0C0 1 0 0 0 1").bounds).toEqual({ minX: 0, minY: 0, width: 0, height: 1 });
  });
  it("includes lines and closing segments, resets at close, excludes unpainted moves", () => {
    expect(bounds("M-100 -100 M10 10L20 30ZM50 60L70 80ZL90 90 M999 999").bounds).toEqual({ minX: 10, minY: 10, width: 80, height: 80 });
    expect(bounds("M0 0")).toEqual({ bounds: null, invalid: false });
    expect(outlineBounds({ ops: [] })).toEqual({ bounds: null, invalid: false });
  });
  it("rejects non-finite controls and unrepresentable bounds instead of treating them as empty", () => {
    expect(outlineBounds({ ops: [{ op: "M", x: 0, y: 0 }, { op: "C", x1: Infinity, y1: 0, x2: 1, y2: 1, x: 2, y: 2 }] })).toEqual({ bounds: null, invalid: true });
    expect(outlineBounds({ ops: [{ op: "M", x: -1e308, y: 0 }, { op: "L", x: 1e308, y: 0 }] })).toEqual({ bounds: null, invalid: true });
    expect(bounds("M0 0C1e200 1e200 -1e200 -1e200 0 0").invalid).toBe(false);
  });
  it("transforms controls first under rotation, skew, reflection and nonuniform scale", () => {
    const outline = pathOutline("M0 0C0 100 100 100 100 0")!;
    const transformed = transformOutline(outline, { a: -2, b: 1, c: 1, d: 3, e: 500, f: 20 });
    const b = outlineBounds(transformed).bounds!;
    expect(b.minX).toBe(300); expect(b.minY).toBe(20);
    expect(b.width).toBeGreaterThan(200); expect(b.width).toBeLessThan(300);
    for (let i = 0; i <= 1000; i++) {
      const t = i / 1000, u = 1 - t;
      const x = 300 * u * t * t + 100 * t ** 3, y = 300 * u * t;
      const px = -2 * x + y + 500, py = x + 3 * y + 20;
      expect(px).toBeGreaterThanOrEqual(b.minX - 1e-9); expect(px).toBeLessThanOrEqual(b.minX + b.width + 1e-9);
      expect(py).toBeGreaterThanOrEqual(b.minY - 1e-9); expect(py).toBeLessThanOrEqual(b.minY + b.height + 1e-9);
    }
  });
  it("normalizes quadratics, smooth curves, arcs and primitive shapes through the same model", () => {
    expect(bounds("M0 0Q50 100 100 0").bounds!.height).toBeCloseTo(50);
    expect(bounds("M0 0Q50 100 100 0T200 0").bounds!.height).toBeCloseTo(100);
    const r = root('<g transform="translate(10 20)"><ellipse cx="30" cy="30" rx="10" ry="20"/><path d="M10 10A10 10 0 0 1 30 10"/></g>');
    const b = tightGeometryBounds(r);
    expect(b.unsupported).toEqual([]); expect(b.bounds).toMatchObject({ minX: 20, minY: 20, width: 30, height: 50 });
  });
});

describe("safe viewport paint classification and minor repair", () => {
  it("refines a general control-hull overflow and preserves the contained frame/source", () => {
    const r = root('<g transform="translate(10 10)"><path d="M0 20C10 -30 70 -30 80 20" fill="none" stroke="#000" stroke-width="1"/></g>');
    // This curve genuinely exits: y reaches -7.5, unlike its endpoints.
    const before = r.outerHTML, measured = measureViewportBounds(r, frame);
    expect(measured.method).toBe("outlined-tight"); expect(measured.geometry!.minY).toBeCloseTo(-7.5);
    expect(repairStrokeFrame(r, frame, measured)).toEqual(frame); expect(r.outerHTML).toBe(before);
    const contained = root('<path d="M10 50C20 -15 80 -15 90 50" fill="#000"/>');
    expect(visibleBounds(contained)!.bounds.minY).toBeLessThan(0);
    const m = measureViewportBounds(contained, frame);
    expect(m.method).toBe("outlined-tight"); expect(m.geometry!.minY).toBeCloseTo(1.25);
    expect(m.painted!.minY).toBeGreaterThan(0.7); expect(m.unsupported).toEqual([]);
    expect(repairStrokeFrame(contained, frame, m)).toEqual(frame);
  });
  it("repairs small actual stroke overshoot even if conservative geometry controls exit", () => {
    const r = root('<path d="M10 45C20 -15 80 -15 90 45" fill="none" stroke="#000" stroke-width="1" stroke-linecap="round"/>');
    expect(repairStrokeFrame(r, frame)!.minY).toBeCloseTo(-0.5, 2);
    expect(prepareExportSvg(r.outerHTML, { ...DEFAULT_UPLOAD_SETTINGS, shadowEnabled: true }).ok).toBe(true);
  });
  it.each([
    '<path d="M10 44C20 -16 80 -16 90 44" fill="none" stroke="#000"/>',
    '<path d="M10 45C20 -15 80 -15 90 45" fill="none" stroke="#000" stroke-width="10"/>',
    '<path d="M10 45C20 -15 80 -15 90 45" fill="none" stroke="url(#g)"/>',
  ])("refuses genuinely clipped geometry, wide stroke or unresolvable stroke: %s", (body) => {
    const r = root(body);
    expect(repairStrokeFrame(r, frame)).toEqual(frame);
    const result = prepareExportSvg(r.outerHTML, { ...DEFAULT_UPLOAD_SETTINGS, shadowEnabled: true });
    expect(result).toMatchObject({ ok: false, code: "unsupported" });
  });
  it("retains conservative contained compatibility for unsupported gradient stroke outlining", () => {
    const r = root('<path d="M20 20L80 80" fill="none" stroke="url(#g)"/>');
    expect(measureViewportBounds(r, frame)).toMatchObject({ method: "conservative-contained", unsupported: [] });
    const overflow = root('<path d="M0 0L80 80" fill="none" stroke="url(#g)"/>');
    expect(measureViewportBounds(overflow, frame).method).toBe("unavailable");
    expect(measureViewportBounds(overflow, frame).unsupported.length).toBeGreaterThan(0);
  });
  it("shares inherited visibility and rejects unsupported/non-finite measurable content", () => {
    const r = root('<g opacity="0"><rect x="-200" width="50" height="50"/></g><g visibility="hidden"><rect x="-100" width="50" height="50"/><rect visibility="visible" x="10" y="20" width="30" height="40"/></g><rect fill="none" stroke="red" stroke-opacity="0" x="-50" width="10" height="10"/>');
    expect(tightGeometryBounds(r)).toEqual({ bounds: { minX: 10, minY: 20, width: 30, height: 40 }, unsupported: [] });
    expect(tightGeometryBounds(root('<use href="#x"/>'))).toEqual({ bounds: null, unsupported: ["use"] });
    expect(tightGeometryBounds(root('<path d="M1e308 0L1e308 10" transform="scale(2)"/>')).unsupported).toEqual(["non-finite geometry"]);
    expect(measureViewportBounds(root('<use href="#x"/>'), frame).unsupported).toEqual(["use"]);
    expect(measureViewportBounds(root(""), frame)).toMatchObject({ geometry: null, painted: null, unsupported: [] });
  });
});
