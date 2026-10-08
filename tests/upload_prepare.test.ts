// RULE 8 — the export copy runs for real: fit the source into a fixed or
// content-sized artboard without distortion, center it, keep the source intact,
// avoid backgrounds on stroked artwork, and normalize only existing strokes.
import { describe, expect, it } from "vitest";
import { prepareExportSvg, type PrepareResult } from "../src/lib/upload/prepare";
import {
  DEFAULT_UPLOAD_SETTINGS,
  effectiveSettings,
  type SettingsOverrides,
  type UploadSettings,
} from "../src/lib/upload/settings";
import { visibleBounds } from "../src/lib/upload/geom";

const NS = `xmlns="http://www.w3.org/2000/svg"`;
const FIT = { preset: "fit" as const, width: 512, height: 512 };

function prepare(source: string, overrides: SettingsOverrides = {}): PrepareResult {
  const settings: UploadSettings = effectiveSettings(DEFAULT_UPLOAD_SETTINGS, overrides);
  return prepareExportSvg(source, settings);
}

/** The prepared document, asserted ok by the caller's expectations. */
function prepared(source: string, overrides: SettingsOverrides = {}) {
  const result = prepare(source, overrides);
  if (!result.ok) throw new Error(`prepare failed: ${result.code} ${result.detail}`);
  const doc = new DOMParser().parseFromString(result.svg, "image/svg+xml");
  return { result, doc, root: doc.documentElement };
}

const RECT_ICON = `<svg ${NS} viewBox="0 0 100 100" width="100" height="100" preserveAspectRatio="none"><rect x="10" y="10" width="80" height="80" fill="#000000"/></svg>`;

describe("prepareExportSvg — fixed and fitted artboards", () => {
  it("defaults to a 512 px square and centers artwork without distorting it", () => {
    const { result, root } = prepared(RECT_ICON);
    expect(result.fit.viewBox).toBe("0 0 512 512");
    expect(root.getAttribute("viewBox")).toBe("0 0 512 512");
    expect(root.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
    expect(root.getAttribute("width")).toBe("512");
    expect(root.getAttribute("height")).toBe("512");
    expect(result.fit.scale).toBeCloseTo(5.376);
    expect(root.querySelector("g")?.getAttribute("transform")).toBe("translate(-12.8 -12.8) scale(5.376)");
    const rect = root.querySelector("g > rect");
    expect(rect?.getAttribute("width")).toBe("80");
    expect(rect?.getAttribute("height")).toBe("80");
  });

  it("uses custom width and height as the exact output ratio and fits content proportionally", () => {
    const src = `<svg ${NS} viewBox="0 0 200 100"><rect x="0" y="0" width="200" height="100" fill="#000"/></svg>`;
    const { result, root } = prepared(src, {
      artboard: { preset: "custom", width: 1200, height: 800 }, paddingPct: 8,
    });
    expect(root.getAttribute("width")).toBe("1200");
    expect(root.getAttribute("height")).toBe("800");
    expect(root.getAttribute("viewBox")).toBe("0 0 1200 800");
    expect(result.fit.scale).toBeCloseTo(5.04);
    expect(result.fit.offsetX).toBeCloseTo(96);
    expect(result.fit.offsetY).toBeCloseTo(148);
  });

  it("keeps the previous content-sized fit when Fit artwork is selected", () => {
    const { result, root } = prepared(RECT_ICON, { artboard: FIT });
    expect(result.fit.viewBox).toBe("0 0 92.8 92.8");
    expect(root.getAttribute("width")).toBe("92.8");
    expect(root.getAttribute("height")).toBe("92.8");
    expect(root.querySelector("g")?.getAttribute("transform")).toBe("translate(-3.6 -3.6)");
  });

  it("paints only a fill background for fill-only art, never a stroke", () => {
    const { root } = prepared(RECT_ICON, { background: "#ff0000" });
    const bg = root.firstElementChild;
    expect(bg?.localName).toBe("rect");
    expect(bg?.getAttribute("fill")).toBe("#ff0000");
    expect(bg?.getAttribute("stroke")).toBe("none");
    expect(bg?.getAttribute("width")).toBe("512");
    expect(bg?.getAttribute("height")).toBe("512");
    expect(bg?.getAttribute("x")).toBe("0");
    expect(bg?.getAttribute("y")).toBe("0");
  });

  it("does not add an SVG background rectangle behind stroke-based artwork", () => {
    const src = `<svg ${NS} viewBox="0 0 24 24"><path d="M2 2h20v20H2z" fill="none" stroke="#000"/></svg>`;
    const { root } = prepared(src, { background: "#ff0000" });
    expect(root.firstElementChild?.localName).toBe("g");
    expect(root.querySelector(":scope > rect")).toBeNull();
    expect(root.querySelector("g > path")?.getAttribute("stroke")).toBe("#000");
  });

  it("leaves artwork coordinates and source bytes unchanged apart from the wrapper", () => {
    const { root } = prepared(RECT_ICON);
    const rect = root.querySelector("g > rect");
    expect(rect?.getAttribute("x")).toBe("10");
    expect(rect?.getAttribute("y")).toBe("10");
    expect(rect?.getAttribute("width")).toBe("80");
    expect(rect?.getAttribute("fill")).toBe("#000000");
    expect(RECT_ICON).toContain("viewBox=\"0 0 100 100\"");
  });

  it("makes the artboard bounds exactly the selected board for fill artwork", () => {
    const { root, result } = prepared(RECT_ICON);
    const vb = visibleBounds(root);
    expect(vb).not.toBeNull();
    expect(vb?.bounds.minX).toBeCloseTo(0, 6);
    expect(vb?.bounds.minY).toBeCloseTo(0, 6);
    expect(vb?.bounds.width).toBeCloseTo(result.fit.artW, 6);
    expect(vb?.bounds.height).toBeCloseTo(result.fit.artH, 6);
    expect(vb?.unsupported).toEqual([]);
  });
});

describe("prepareExportSvg — stroke normalization (pt at 96 DPI)", () => {
  const STROKED = `<svg ${NS} viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" fill="none" stroke="#000" stroke-width="1"/></svg>`;

  it("sets every visible stroke to the configured final output px", () => {
    const { result, root } = prepared(STROKED, { strokePt: 2.2 });
    const rect = root.querySelector("g > rect");
    expect(result.strokesNormalized).toBe(1);
    expect(Number(rect?.getAttribute("stroke-width")) * result.fit.scale).toBeCloseTo(2.933, 3);
  });

  it("divides by the accumulated source CTM and artboard scale", () => {
    const src = `<svg ${NS} viewBox="0 0 48 48"><g transform="scale(2)"><rect x="2" y="2" width="20" height="20" fill="none" stroke="#000" stroke-width="1"/></g></svg>`;
    const { result, root } = prepared(src, { strokePt: 2.2 });
    const rect = root.querySelector("g g rect");
    expect(result.strokesNormalized).toBe(1);
    expect(Number(rect?.getAttribute("stroke-width")) * 2 * result.fit.scale).toBeCloseTo(2.933, 3);
  });

  it("normalizes non-scaling-stroke to the same final width", () => {
    const src = `<svg ${NS} viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" fill="none" stroke="#000" stroke-width="1" vector-effect="non-scaling-stroke"/></svg>`;
    const { result, root } = prepared(src, { strokePt: 3 });
    const rect = root.querySelector("g > rect");
    expect(rect?.getAttribute("vector-effect")).toBeNull();
    expect(Number(rect?.getAttribute("stroke-width")) * result.fit.scale).toBeCloseTo(4, 3);
    expect(result.strokesNormalized).toBe(1);
  });

  it("an inline style loses to the configured width", () => {
    const src = `<svg ${NS} viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" fill="none" stroke="#000" style="stroke-width:5;fill:none"/></svg>`;
    const { result, root } = prepared(src, { strokePt: 1.5 });
    const rect = root.querySelector("g > rect");
    expect(Number(rect?.getAttribute("stroke-width")) * result.fit.scale).toBeCloseTo(2, 3);
    expect(rect?.getAttribute("style")).toBe("fill:none");
  });

  it("normalizes strokes inherited from a group onto each child", () => {
    const src = `<svg ${NS} viewBox="0 0 24 24"><g stroke="#000" stroke-width="1"><rect x="2" y="2" width="8" height="8" fill="none"/><circle cx="18" cy="18" r="4" fill="none"/></g></svg>`;
    const { result, root } = prepared(src, { strokePt: 0.75 });
    expect(result.strokesNormalized).toBe(2);
    for (const el of Array.from(root.querySelectorAll("g g rect, g g circle"))) {
      expect(Number(el.getAttribute("stroke-width")) * result.fit.scale).toBeCloseTo(1, 3);
    }
  });

  it("strokePt 0 leaves existing strokes untouched except for fitting the artboard", () => {
    const { result, root } = prepared(STROKED);
    expect(result.strokesNormalized).toBe(0);
    const rect = root.querySelector("g > rect");
    expect(rect?.getAttribute("stroke-width")).toBe("1");
    expect(rect?.getAttribute("vector-effect")).toBeNull();
  });
});

describe("prepareExportSvg — honest failures", () => {
  it("rejects malformed XML", () => {
    const result = prepare("this is not < xml");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("parse");
  });

  it("rejects a non-svg root", () => {
    const result = prepare(`<html ${NS}><body/></html>`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("parse");
  });

  it("rejects a document with no visible geometry", () => {
    const result = prepare(`<svg ${NS} viewBox="0 0 24 24"/>`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("no-geometry");
  });

  it("names unsupported content instead of guessing (text)", () => {
    const result = prepare(`<svg ${NS} viewBox="0 0 24 24"><rect x="1" y="1" width="10" height="10" fill="#000"/><text x="2" y="12">hi</text></svg>`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unsupported");
      expect(result.detail).toContain("text");
    }
  });

  it("names a <style> block that could restyle geometry", () => {
    const result = prepare(`<svg ${NS} viewBox="0 0 24 24"><style>.a{stroke-width:9}</style><rect class="a" x="1" y="1" width="10" height="10" fill="none"/></svg>`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unsupported");
      expect(result.detail).toContain("style");
    }
  });

  it("accepts a fill-only <style> block", () => {
    const result = prepare(`<svg ${NS} viewBox="0 0 24 24"><style>.a{fill:#123456}</style><rect class="a" x="1" y="1" width="10" height="10"/></svg>`);
    expect(result.ok).toBe(true);
  });

  it("rejects a transform on the root svg", () => {
    const result = prepare(`<svg ${NS} viewBox="0 0 24 24" transform="scale(2)"><rect x="1" y="1" width="10" height="10" fill="#000"/></svg>`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("unsupported");
  });
});
