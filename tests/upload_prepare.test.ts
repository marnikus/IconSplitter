// RULE 8 — the export copy runs for real: parse the source, re-root the
// viewBox to the padded artboard, centre the artwork, paint the background,
// normalize strokes to the configured pt width (CTM-aware, non-scaling-stroke
// included), and fail honestly on content the geometry math cannot answer for.
// The source string is never modified.
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

describe("prepareExportSvg — a pinned artboard (the final px size)", () => {
  it("lands on exactly 512×512 in the viewBox, scales the artwork and centres it", () => {
    const { result, root } = prepared(RECT_ICON, { artboard: { mode: "preset", size: 512, width: 512, height: 512 } });
    expect(result.fit.viewBox).toBe("0 0 512 512");
    expect(root.getAttribute("width")).toBeNull();
    expect(root.getAttribute("height")).toBeNull();
    // pad 8% of 512 = 40.96; scale = (512 − 2·40.96)/80 = 5.376
    expect(result.fit.scale).toBeCloseTo(5.376);
    expect(root.querySelector("g")?.getAttribute("transform")).toBe("translate(-12.8 -12.8) scale(5.376)");
    expect(root.querySelector("rect")?.getAttribute("width")).toBe("512");
  });

  it("keeps a non-square artboard's aspect ratio: custom 512×256 letterboxes", () => {
    const { result, root } = prepared(RECT_ICON, { artboard: { mode: "custom", size: 512, width: 512, height: 256 } });
    expect(result.fit.viewBox).toBe("0 0 512 256");
    // pad 8% of 512 = 40.96 → usable 430.08 × 174.08; the SHORT side decides
    expect(result.fit.scale).toBeCloseTo((256 - 2 * 40.96) / 80);
    expect(root.querySelector("g")?.getAttribute("transform")).toContain("scale(2.176)");
  });

  it("rounds a configured stroke to the nearest whole output px", () => {
    const src = `<svg ${NS} viewBox="0 0 24 24"><path d="M4 4h16v16H4z" fill="none" stroke="#000"/></svg>`;
    const { root } = prepared(src, { strokePt: 2.2, artboard: { mode: "preset", size: 512, width: 512, height: 512 } });
    const path = root.querySelector("g path");
    expect(path?.getAttribute("stroke-width")).toBe("3");
    expect(path?.getAttribute("vector-effect")).toBe("non-scaling-stroke");
  });
});

describe("prepareExportSvg — the re-rooted export copy", () => {
  it("re-roots the viewBox to the padded artboard and centres the artwork", () => {
    const { result, root } = prepared(RECT_ICON); // default padding 8%
    // bounds 80×80 at (10,10); pad = 6.4 → artboard 92.8; offset = 6.4 − 10 = −3.6
    expect(result.fit.viewBox).toBe("0 0 92.8 92.8");
    expect(root.getAttribute("viewBox")).toBe("0 0 92.8 92.8");
    expect(root.getAttribute("width")).toBeNull();
    expect(root.getAttribute("height")).toBeNull();
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

  it("keeps the prepared backplate for JPEG/EPS; final SVG transparency is a later stage", () => {
    const source = `<svg ${NS} viewBox="0 0 24 24"><rect x="1" y="1" width="10" height="10" fill="#ffffff"/>`
      + `<path d="M3 3h5v5H3z" fill="#000"/></svg>`;
    const { root } = prepared(source, { transparentSvgBackground: true });
    expect(root.querySelector(":scope > rect")?.getAttribute("fill")).toBe("#ffffff");
    expect(root.querySelector(":scope > rect")?.getAttribute("stroke")).toBe("none");
    expect(root.querySelectorAll("g > rect")).toHaveLength(1);
    expect(root.querySelector("g > rect")?.getAttribute("fill")).toBe("#ffffff");
    expect(root.querySelector("g > rect")?.getAttribute("width")).toBe("10");
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

  it("rounds configured points to integer px (2.2 pt → 3)", () => {
    const { result, root } = prepared(STROKED, { strokePt: 2.2 });
    expect(result.strokesNormalized).toBe(1);
    expect(root.querySelector("g > rect")?.getAttribute("stroke-width")).toBe("3");
    expect(root.querySelector("g > rect")?.getAttribute("vector-effect")).toBe("non-scaling-stroke");
  });

  it("keeps configured integer output width under nested artwork transforms", () => {
    const src = `<svg ${NS} viewBox="0 0 48 48"><g transform="scale(2)"><rect x="2" y="2" width="20" height="20" fill="none" stroke="#000" stroke-width="1"/></g></svg>`;
    const { result, root } = prepared(src, { strokePt: 2.2 });
    expect(result.strokesNormalized).toBe(1);
    expect(root.querySelector("g g rect")?.getAttribute("stroke-width")).toBe("3");
    expect(root.querySelector("g g rect")?.getAttribute("vector-effect")).toBe("non-scaling-stroke");
  });

  it("normalizes vector-effect=non-scaling-stroke to an explicit width", () => {
    const src = `<svg ${NS} viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" fill="none" stroke="#000" stroke-width="1" vector-effect="non-scaling-stroke"/></svg>`;
    const { result, root } = prepared(src, { strokePt: 3 });
    const rect = root.querySelector("g > rect");
    expect(rect?.getAttribute("vector-effect")).toBe("non-scaling-stroke");
    expect(rect?.getAttribute("stroke-width")).toBe("4"); // 3 pt = 4 px
    expect(result.strokesNormalized).toBe(1);
  });

  it("an inline style is folded into attributes, and the explicit width still wins", () => {
    const src = `<svg ${NS} viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" fill="none" stroke="#000" style="stroke-width:5;fill:none"/></svg>`;
    const { root } = prepared(src, { strokePt: 1.5 });
    const rect = root.querySelector("g > rect");
    expect(rect?.getAttribute("stroke-width")).toBe("2"); // 1.5 pt = 2 px
    // `style` is gone; its paint declarations are plain attributes now (2026-10-08)
    expect(rect?.getAttribute("style")).toBeNull();
    expect(rect?.getAttribute("fill")).toBe("none");
  });

  it("normalizes strokes inherited from a group onto each child", () => {
    const src = `<svg ${NS} viewBox="0 0 24 24"><g stroke="#000" stroke-width="1"><rect x="2" y="2" width="8" height="8" fill="none"/><circle cx="18" cy="18" r="4" fill="none"/></g></svg>`;
    const { result, root } = prepared(src, { strokePt: 0.75 });
    expect(result.strokesNormalized).toBe(2);
    expect(root.querySelector("g rect")?.getAttribute("stroke-width")).toBe("1");
    expect(root.querySelector("g circle")?.getAttribute("stroke-width")).toBe("1");
  });

  it("strokePt 0 keeps vector-effect and rounds source widths to whole numbers", () => {
    const src = `<svg ${NS} viewBox="0 0 24 24"><g stroke="#000" stroke-width="2.806" vector-effect="non-scaling-stroke">`
      + `<rect x="2" y="2" width="20" height="20" fill="none"/></g></svg>`;
    const { result, root } = prepared(src);
    expect(result.strokesNormalized).toBe(0);
    expect(root.querySelector("g g")?.getAttribute("stroke-width")).toBe("3");
    expect(root.querySelector("g g")?.getAttribute("vector-effect")).toBe("non-scaling-stroke");
  });

  it("rounds source stroke widths 2.806 → 3 and 7.999906 → 8", () => {
    const src = `<svg ${NS} viewBox="0 0 30 10"><path d="M1 1h10" fill="none" stroke="#123" stroke-width="2.806"/>`
      + `<path d="M15 1h10" fill="none" stroke="#456" stroke-width="7.999906"/></svg>`;
    const { root } = prepared(src);
    const paths = Array.from(root.querySelectorAll("g > path"));
    expect(paths.map((path) => path.getAttribute("stroke-width"))).toEqual(["3", "8"]);
  });

  it("changes only visible stroke paint, never fills or explicit stroke none", () => {
    const src = `<svg ${NS} viewBox="0 0 24 24">`
      + `<path d="M1 1h5" fill="#00ff00" stroke="#112233" stroke-width="2.806"/>`
      + `<path d="M8 1h5" fill="#abcdef" stroke="none" stroke-width="2.806"/>`
      + `<rect x="15" y="1" width="5" height="5" fill="#fedcba"/></svg>`;
    const { result, root } = prepared(src, { strokeColor: "#abC" });
    const paths = Array.from(root.querySelectorAll("g > path"));
    const rect = root.querySelector("g > rect");
    expect(result.strokesNormalized).toBe(1);
    expect(paths[0].getAttribute("stroke")).toBe("#aabbcc");
    expect(paths[0].getAttribute("stroke-width")).toBe("3");
    expect(paths[0].getAttribute("fill")).toBe("#00ff00");
    expect(paths[1].getAttribute("stroke")).toBe("none");
    expect(paths[1].getAttribute("fill")).toBe("#abcdef");
    expect(rect?.getAttribute("stroke")).toBeNull();
    expect(rect?.getAttribute("fill")).toBe("#fedcba");
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

  it("folds a stylesheet's stroke width into the element, and refuses what it cannot fold", () => {
    const folded = prepare(`<svg ${NS} viewBox="0 0 24 24"><style>.a{stroke-width:9}</style><rect class="a" x="1" y="1" width="10" height="10" fill="none"/></svg>`);
    expect(folded.ok).toBe(true);
    if (folded.ok) expect(folded.svg).toContain(`stroke-width="9"`);

    const hidden = prepare(`<svg ${NS} viewBox="0 0 24 24"><style>.a{display:none}</style><rect class="a" x="1" y="1" width="10" height="10" fill="none"/></svg>`);
    expect(hidden.ok).toBe(false);
    if (!hidden.ok) expect(hidden.detail).toContain("style");
  });

  it("folds a fill-only <style> block into the elements and drops the class names", () => {
    const result = prepare(`<svg ${NS} viewBox="0 0 24 24"><style>.a{fill:#123456}</style><rect class="a" x="1" y="1" width="10" height="10"/></svg>`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).not.toContain("<style");
    expect(result.svg).not.toContain("class");
    expect(result.svg).toContain(`fill="#123456"`);
  });

  it("refuses a stylesheet that could move or clip geometry", () => {
    const moved = prepare(`<svg ${NS} viewBox="0 0 24 24"><style>.a{transform:scale(2)}</style><rect class="a" x="1" y="1" width="10" height="10"/></svg>`);
    expect(moved.ok).toBe(false);
    if (!moved.ok) expect(moved.code).toBe("unsupported");
    const imported = prepare(`<svg ${NS} viewBox="0 0 24 24"><style>@import url(https://x/a.css);</style><rect x="1" y="1" width="10" height="10" fill="#000"/></svg>`);
    expect(imported.ok).toBe(false);
  });

  it("normalizes a stroke width that was set inline, and keeps the rest of the style", () => {
    const result = prepare(
      `<svg ${NS} viewBox="0 0 24 24"><rect x="1" y="1" width="10" height="10" fill="none" stroke="#000" style="stroke-width:7;font-family:Arial"/></svg>`,
      { strokePt: 2.2 },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // the FIRST <rect> is the background the prepare pass paints — the artwork
    // lives inside the transform group, and that is the one under test here.
    const rect = new DOMParser().parseFromString(result.svg, "image/svg+xml").querySelector("g rect");
    expect(rect?.getAttribute("style")).toBe("font-family:Arial");
    expect(rect?.getAttribute("stroke-width")).toBe("3");
    expect(rect?.getAttribute("vector-effect")).toBe("non-scaling-stroke");
  });

  it("rejects a transform on the root svg", () => {
    const result = prepare(`<svg ${NS} viewBox="0 0 24 24" transform="scale(2)"><rect x="1" y="1" width="10" height="10" fill="#000"/></svg>`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("unsupported");
  });
});
