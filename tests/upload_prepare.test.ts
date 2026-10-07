// RULE 8 — the export copy runs for real: parse the source, re-root the
// viewBox to the padded artboard, centre the artwork, paint the background,
// normalize strokes to the configured pt width (CTM-aware, non-scaling-stroke
// included), and fail honestly on content the geometry math cannot answer for.
// The source string is never modified.
import { describe, expect, it } from "vitest";
import { prepareExportSvg, type PrepareResult } from "../src/lib/uploadprepare";
import {
  DEFAULT_UPLOAD_SETTINGS,
  effectiveSettings,
  type SettingsOverrides,
  type UploadSettings,
} from "../src/lib/uploadsettings";
import { visibleBounds } from "../src/lib/uploadgeom";

const NS = `xmlns="http://www.w3.org/2000/svg"`;

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

const RECT_ICON = `<svg ${NS} viewBox="0 0 100 100" width="100" height="100"><rect x="10" y="10" width="80" height="80" fill="#000000"/></svg>`;

describe("prepareExportSvg — the re-rooted export copy", () => {
  it("re-roots the viewBox to the padded artboard and centres the artwork", () => {
    const { result, root } = prepared(RECT_ICON); // default padding 8%
    // bounds 80×80 at (10,10); pad = 6.4 → artboard 92.8; offset = 6.4 − 10 = −3.6
    expect(result.fit.viewBox).toBe("0 0 92.8 92.8");
    expect(root.getAttribute("viewBox")).toBe("0 0 92.8 92.8");
    expect(root.getAttribute("width")).toBe("92.8");
    expect(root.getAttribute("height")).toBe("92.8");
    const group = root.querySelector("g");
    expect(group?.getAttribute("transform")).toBe("translate(-3.6 -3.6)");
  });

  it("paints the configured background as the first rect, sized to the artboard", () => {
    const { root } = prepared(RECT_ICON, { background: "#ff0000" });
    const bg = root.querySelector("rect");
    expect(bg?.getAttribute("fill")).toBe("#ff0000");
    expect(bg?.getAttribute("width")).toBe("92.8");
    expect(bg?.getAttribute("height")).toBe("92.8");
    expect(bg?.getAttribute("x")).toBe("0");
    expect(bg?.getAttribute("y")).toBe("0");
    expect(root.firstElementChild).toBe(bg);
  });

  it("leaves the artwork itself untouched apart from the wrapper", () => {
    const { root } = prepared(RECT_ICON);
    const rect = root.querySelector("g > rect");
    expect(rect?.getAttribute("x")).toBe("10");
    expect(rect?.getAttribute("y")).toBe("10");
    expect(rect?.getAttribute("width")).toBe("80");
    expect(rect?.getAttribute("fill")).toBe("#000000");
  });

  it("padding 0 fits the bounds exactly", () => {
    const { result } = prepared(RECT_ICON, { paddingPct: 0 });
    expect(result.fit.viewBox).toBe("0 0 80 80");
    expect(result.fit.offsetX).toBe(-10);
    expect(result.fit.offsetY).toBe(-10);
  });

  it("pads non-square artwork uniformly (percent of the largest side)", () => {
    const src = `<svg ${NS} viewBox="0 0 200 100"><rect x="0" y="0" width="200" height="100" fill="#000"/></svg>`;
    const { result } = prepared(src, { paddingPct: 10 });
    // pad = 200·10% = 20 → artboard 240×140
    expect(result.fit.viewBox).toBe("0 0 240 140");
  });

  it("is deterministic and never modifies the source string", () => {
    const source = RECT_ICON;
    const first = prepare(source);
    const second = prepare(source);
    expect(first.ok && second.ok && first.svg).toBe(second.ok ? second.svg : "");
    expect(source).toBe(RECT_ICON);
  });

  it("the prepared document's own visible bounds are exactly the artboard", () => {
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

  it("sets every visible stroke to w·4/3 px (2.2 pt → 2.933)", () => {
    const { result, root } = prepared(STROKED, { strokePt: 2.2 });
    expect(result.strokesNormalized).toBe(1);
    expect(root.querySelector("g > rect")?.getAttribute("stroke-width")).toBe("2.933");
  });

  it("divides by the accumulated CTM scale so the device stroke is exact", () => {
    const src = `<svg ${NS} viewBox="0 0 48 48"><g transform="scale(2)"><rect x="2" y="2" width="20" height="20" fill="none" stroke="#000" stroke-width="1"/></g></svg>`;
    const { result, root } = prepared(src, { strokePt: 2.2 });
    expect(result.strokesNormalized).toBe(1);
    expect(root.querySelector("g rect")?.getAttribute("stroke-width")).toBe("1.467");
  });

  it("normalizes vector-effect=non-scaling-stroke to an explicit width", () => {
    const src = `<svg ${NS} viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" fill="none" stroke="#000" stroke-width="1" vector-effect="non-scaling-stroke"/></svg>`;
    const { result, root } = prepared(src, { strokePt: 3 });
    const rect = root.querySelector("g > rect");
    expect(rect?.getAttribute("vector-effect")).toBeNull();
    expect(rect?.getAttribute("stroke-width")).toBe("4"); // 3 pt = 4 px
    expect(result.strokesNormalized).toBe(1);
  });

  it("an inline style loses to the explicit width", () => {
    const src = `<svg ${NS} viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" fill="none" stroke="#000" style="stroke-width:5;fill:none"/></svg>`;
    const { root } = prepared(src, { strokePt: 1.5 });
    const rect = root.querySelector("g > rect");
    expect(rect?.getAttribute("stroke-width")).toBe("2"); // 1.5 pt = 2 px
    expect(rect?.getAttribute("style")).toBe("fill:none");
  });

  it("normalizes strokes inherited from a group onto each child", () => {
    const src = `<svg ${NS} viewBox="0 0 24 24"><g stroke="#000" stroke-width="1"><rect x="2" y="2" width="8" height="8" fill="none"/><circle cx="18" cy="18" r="4" fill="none"/></g></svg>`;
    const { result, root } = prepared(src, { strokePt: 0.75 });
    expect(result.strokesNormalized).toBe(2);
    expect(root.querySelector("g rect")?.getAttribute("stroke-width")).toBe("1");
    expect(root.querySelector("g circle")?.getAttribute("stroke-width")).toBe("1");
  });

  it("strokePt 0 leaves strokes and vector-effect untouched", () => {
    const src = `<svg ${NS} viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" fill="none" stroke="#000" stroke-width="1" vector-effect="non-scaling-stroke"/></svg>`;
    const { result, root } = prepared(src);
    expect(result.strokesNormalized).toBe(0);
    const rect = root.querySelector("g > rect");
    expect(rect?.getAttribute("stroke-width")).toBe("1");
    expect(rect?.getAttribute("vector-effect")).toBe("non-scaling-stroke");
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

  it("accepts a fill-only <style> block (it cannot move geometry)", () => {
    const result = prepare(`<svg ${NS} viewBox="0 0 24 24"><style>.a{fill:#123456}</style><rect class="a" x="1" y="1" width="10" height="10"/></svg>`);
    expect(result.ok).toBe(true);
  });

  it("rejects a transform on the root svg", () => {
    const result = prepare(`<svg ${NS} viewBox="0 0 24 24" transform="scale(2)"><rect x="1" y="1" width="10" height="10" fill="#000"/></svg>`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("unsupported");
  });
});
