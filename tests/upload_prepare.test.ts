// RULE 8 — the export copy runs for real: parse the source, bake every
// transform (the artwork's own and the artboard's) into the geometry, re-root
// the viewBox to the padded artboard, paint the background, write the stroke
// width VERBATIM in px (2026-10-08: "2 in the setting is 2 in the SVG"), and
// fail honestly on content the geometry math cannot answer for. The source
// string is never modified.
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
const SQUARE_512: SettingsOverrides = { artboard: { mode: "preset", size: 512, width: 512, height: 512 } };

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

const attrs = (el: Element | null, names: string[]) => names.map((n) => el?.getAttribute(n) ?? null);

const RECT_ICON = `<svg ${NS} viewBox="0 0 100 100" width="100" height="100"><rect x="10" y="10" width="80" height="80" fill="#000000"/></svg>`;

describe("prepareExportSvg — a pinned artboard (the final px size)", () => {
  it("lands on exactly 512×512, scales the artwork INTO its coordinates and centres it", () => {
    const { result, root } = prepared(RECT_ICON, { background: "#ffffff", ...SQUARE_512 });
    expect(result.fit.viewBox).toBe("0 0 512 512");
    expect(root.getAttribute("width")).toBeNull(); // the viewBox is the size (stock review item 4)
    expect(root.getAttribute("height")).toBeNull();
    // pad 8% of 512 = 40.96; scale = (512 − 2·40.96)/80 = 5.376; the rect lands at 40.96, 430.08 wide
    expect(result.fit.scale).toBeCloseTo(5.376);
    expect(root.querySelector("[transform]")).toBeNull(); // nothing left for an optimizer to bake
    const [bg, art] = Array.from(root.querySelectorAll("rect"));
    expect(attrs(bg, ["width", "height"])).toEqual(["512", "512"]); // the coloured background rect
    expect(attrs(art, ["x", "y", "width", "height"])).toEqual(["40.96", "40.96", "430.08", "430.08"]);
    expect(result.shapesBaked).toBe(1);
  });

  it("keeps a non-square artboard's aspect ratio: custom 512×256 letterboxes", () => {
    const { result, root } = prepared(RECT_ICON, { artboard: { mode: "custom", size: 512, width: 512, height: 256 } });
    expect(result.fit.viewBox).toBe("0 0 512 256");
    // pad 8% of 512 = 40.96 → usable 430.08 × 174.08; the SHORT side decides
    expect(result.fit.scale).toBeCloseTo((256 - 2 * 40.96) / 80);
    const art = root.querySelector("rect");
    expect(Number(art?.getAttribute("width"))).toBeCloseTo(174.08, 2);
    expect(Number(art?.getAttribute("y"))).toBeCloseTo(40.96, 2);
  });

  it("the configured stroke is the number in the file whatever the artboard scale: 2 → stroke-width=\"2\"", () => {
    const src = `<svg ${NS} viewBox="0 0 24 24"><g transform="scale(1.1)"><path d="M4 4h16v16H4z" fill="none" stroke="#000"/></g></svg>`;
    const { result, root } = prepared(src, { strokePx: 2, ...SQUARE_512 });
    expect(result.fit.scale).toBeGreaterThan(1);
    const path = root.querySelector("path");
    expect(path?.getAttribute("stroke-width")).toBe("2");
    expect(root.querySelector("[transform]")).toBeNull();
    expect(path?.getAttribute("d")?.startsWith("M")).toBe(true); // baked data, artboard px
    expect(result.strokesNormalized).toBe(1);
  });
});

describe("prepareExportSvg — the re-rooted export copy", () => {
  it("re-roots the viewBox to the padded artboard and moves the artwork into it", () => {
    const { result, root } = prepared(RECT_ICON); // default padding 8%
    // bounds 80×80 at (10,10); pad = 6.4 → artboard 92.8; the rect lands at 6.4
    expect(result.fit.viewBox).toBe("0 0 92.8 92.8");
    expect(root.getAttribute("viewBox")).toBe("0 0 92.8 92.8");
    expect(root.getAttribute("width")).toBeNull();
    expect(root.getAttribute("height")).toBeNull();
    expect(root.querySelector("g")).toBeNull(); // no wrapper group: the geometry itself moved
    expect(attrs(root.querySelector("rect"), ["x", "y", "width", "height", "fill"])).toEqual(["6.4", "6.4", "80", "80", "#000000"]);
  });

  it("paints the configured background as the first rect, sized to the artboard", () => {
    const { root } = prepared(RECT_ICON, { background: "#ff0000" });
    const bg = root.querySelector("rect");
    expect(attrs(bg, ["fill", "width", "height", "x", "y"])).toEqual(["#ff0000", "92.8", "92.8", "0", "0"]);
    expect(root.firstElementChild).toBe(bg);
  });

  it("paints NO background rect when the background is transparent — the default (stock review quick fix)", () => {
    const { result, root } = prepared(RECT_ICON);
    expect(result.background).toBe("transparent");
    expect(root.querySelectorAll("rect")).toHaveLength(1); // the artwork's own
    expect(root.querySelector("rect")?.getAttribute("fill")).toBe("#000000");
  });

  it("drops the source's own width/height from the root — the artboard is the viewBox", () => {
    const { result } = prepared(`<svg ${NS} viewBox="0 0 100 100" width="1400" height="800"><rect x="10" y="10" width="80" height="80" fill="#000"/></svg>`);
    expect(result.svg).not.toMatch(/<svg[^>]*\swidth=/);
    expect(result.svg).not.toMatch(/<svg[^>]*\sheight=/);
    expect(result.svg).toContain(`viewBox="0 0 92.8 92.8"`);
  });

  it("a group stays for its paint, its transform is spent; a rotated shape becomes a path", () => {
    const src = `<svg ${NS} viewBox="0 0 100 100"><g fill="#123" transform="translate(5 5)"><rect x="0" y="0" width="10" height="10"/>`
      + `<rect x="20" y="0" width="10" height="10" transform="rotate(45 25 5)"/></g></svg>`;
    const { result, root } = prepared(src, { paddingPct: 0 });
    expect(result.shapesBaked).toBe(2);
    expect(root.querySelector("g")?.getAttribute("fill")).toBe("#123");
    expect(root.querySelector("[transform]")).toBeNull();
    expect(root.querySelectorAll("rect")).toHaveLength(1);
    expect(root.querySelector("path")?.getAttribute("d")).toMatch(/^M[\d.-]+ [\d.-]+L/);
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

  it("the prepared document's own visible bounds are exactly the padded artwork — and the artboard with a painted background", () => {
    const bare = visibleBounds(prepared(RECT_ICON).root);
    expect(bare?.bounds.minX).toBeCloseTo(6.4, 6);
    expect(bare?.bounds.width).toBeCloseTo(80, 6);
    const { root, result } = prepared(RECT_ICON, { background: "#ffffff" });
    const vb = visibleBounds(root);
    expect(vb?.bounds.minX).toBeCloseTo(0, 6);
    expect(vb?.bounds.minY).toBeCloseTo(0, 6);
    expect(vb?.bounds.width).toBeCloseTo(result.fit.artW, 6);
    expect(vb?.bounds.height).toBeCloseTo(result.fit.artH, 6);
    expect(vb?.unsupported).toEqual([]);
  });
});

describe("prepareExportSvg — stroke colour (2026-10-08, the user's setting)", () => {
  const TWO = `<svg ${NS} viewBox="0 0 24 24" stroke="#111"><g style="stroke:#222;fill:none"><rect x="2" y="2" width="8" height="8"/></g>`
    + `<circle cx="18" cy="18" r="4" fill="#0f0" stroke="currentColor" style="stroke:#333; stroke-width:2"/>`
    + `<path d="M1 1h2" stroke="none" fill="#f00"/></svg>`;

  it("gives every visible stroke the configured hex and leaves fills alone — with the width untouched", () => {
    const { result, root } = prepared(TWO, { strokeColor: "#000000", strokePx: 0 });
    expect(result.strokesRecolored).toBe(2);
    expect(result.strokesNormalized).toBe(0);
    const rect = root.querySelector("g rect");
    const circle = root.querySelector("circle");
    expect(rect?.getAttribute("stroke")).toBe("#000000");
    expect(circle?.getAttribute("stroke")).toBe("#000000");
    expect(circle?.getAttribute("style")).toBeNull(); // the clean pass folded the style; the paint is ours now
    expect(circle?.getAttribute("stroke-width")).toBe("2"); // the inline width survived (content artboard: scale 1)
    expect(circle?.getAttribute("fill")).toBe("#0f0");
    expect(root.querySelector("path")?.getAttribute("stroke")).toBe("none"); // not a visible stroke
    expect(root.querySelector("path")?.getAttribute("fill")).toBe("#f00");
  });

  it("`artwork` (the default) recolours nothing", () => {
    const { result, root } = prepared(TWO);
    expect(result.strokesRecolored).toBe(0);
    expect(root.querySelector("circle")?.getAttribute("stroke")).toBe("#333"); // its own inline paint, folded
  });

  it("colour and width are independent decisions applied in one pass", () => {
    const { result, root } = prepared(TWO, { strokeColor: "#ff0000", strokePx: 3 });
    expect(result.strokesRecolored).toBe(2);
    expect(result.strokesNormalized).toBe(2);
    const circle = root.querySelector("circle");
    expect(circle?.getAttribute("stroke")).toBe("#ff0000");
    expect(circle?.getAttribute("stroke-width")).toBe("3");
  });
});

describe("prepareExportSvg — the stroke width is the number in the file (px)", () => {
  const STROKED = `<svg ${NS} viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" fill="none" stroke="#000" stroke-width="1"/></svg>`;

  it.each([[2, "2"], [2.2, "2.2"], [0.75, "0.75"], [1.5, "1.5"]])("strokePx %s → stroke-width=\"%s\"", (px, written) => {
    const { result, root } = prepared(STROKED, { strokePx: px });
    expect(result.strokesNormalized).toBe(1);
    expect(root.querySelector("rect")?.getAttribute("stroke-width")).toBe(written);
  });

  it("the same number under an artwork transform AND a pinned artboard — the geometry absorbed both", () => {
    const src = `<svg ${NS} viewBox="0 0 48 48"><g transform="scale(2)"><rect x="2" y="2" width="20" height="20" fill="none" stroke="#000" stroke-width="1"/></g></svg>`;
    const { result, root } = prepared(src, { strokePx: 2.2, ...SQUARE_512 });
    expect(result.strokesNormalized).toBe(1);
    const rect = root.querySelector("rect");
    expect(rect?.getAttribute("stroke-width")).toBe("2.2");
    expect(Number(rect?.getAttribute("width"))).toBeCloseTo(40 * result.fit.scale, 2); // 20 × scale(2) user units, then the artboard's fit (mitered stroke corners included in the bounds)
  });

  it("width 0: the artwork's own width follows its geometry (× the baked scale, 3 decimals)", () => {
    const src = `<svg ${NS} viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" fill="none" stroke="#000" stroke-width="7.999906"/></svg>`;
    const content = prepared(src, { strokePx: 0 });
    expect(content.result.strokesNormalized).toBe(0);
    expect(content.root.querySelector("rect")?.getAttribute("stroke-width")).toBe("8"); // scale 1, written to 3 decimals
    const scaled = prepared(`<svg ${NS} viewBox="0 0 24 24"><g transform="scale(1.1)"><path d="M0 0 L10 0" stroke="#000" stroke-width="1.5"/></g></svg>`, { strokePx: 0, paddingPct: 0, ...SQUARE_512 });
    // 1.5 × 1.1 × (512 / (11 + 1.5·1.1 stroke extent)) — whatever the fit, the width is the artwork's, scaled, with ≤ 3 decimals
    const width = scaled.root.querySelector("path")?.getAttribute("stroke-width") ?? "";
    expect(Number(width)).toBeCloseTo(1.65 * scaled.result.fit.scale, 2);
    expect(width).toMatch(/^\d+(\.\d{1,3})?$/);
  });

  it("vector-effect=non-scaling-stroke becomes an explicit width (the setting's, or its own px)", () => {
    const src = `<svg ${NS} viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" fill="none" stroke="#000" stroke-width="1" vector-effect="non-scaling-stroke"/></svg>`;
    const set = prepared(src, { strokePx: 3 });
    expect(attrs(set.root.querySelector("rect"), ["vector-effect", "stroke-width"])).toEqual([null, "3"]);
    expect(set.result.strokesNormalized).toBe(1);
    const own = prepared(src, { strokePx: 0, ...SQUARE_512 });
    expect(attrs(own.root.querySelector("rect"), ["vector-effect", "stroke-width"])).toEqual([null, "1"]); // already final px: not scaled
  });

  it("an inline style is folded into attributes, and the explicit width still wins", () => {
    const src = `<svg ${NS} viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" fill="none" stroke="#000" style="stroke-width:5;fill:none"/></svg>`;
    const { root } = prepared(src, { strokePx: 1.5 });
    const rect = root.querySelector("rect");
    expect(rect?.getAttribute("stroke-width")).toBe("1.5");
    // `style` is gone; its paint declarations are plain attributes now (2026-10-08)
    expect(rect?.getAttribute("style")).toBeNull();
    expect(rect?.getAttribute("fill")).toBe("none");
  });

  it("writes the width onto each child of a stroked group; the group's own width is spent", () => {
    const src = `<svg ${NS} viewBox="0 0 24 24"><g stroke="#000" stroke-width="1"><rect x="2" y="2" width="8" height="8" fill="none"/><circle cx="18" cy="18" r="4" fill="none"/></g></svg>`;
    const { result, root } = prepared(src, { strokePx: 0.75 });
    expect(result.strokesNormalized).toBe(2);
    expect(root.querySelector("g rect")?.getAttribute("stroke-width")).toBe("0.75");
    expect(root.querySelector("g circle")?.getAttribute("stroke-width")).toBe("0.75");
    expect(root.querySelector("g")?.getAttribute("stroke-width")).toBeNull();
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

  it("names what a bake would distort: a stroked shape under a non-uniform transform, a clipPath", () => {
    const skewed = prepare(`<svg ${NS} viewBox="0 0 24 24"><rect x="1" y="1" width="10" height="10" fill="none" stroke="#000" transform="scale(2 1)"/></svg>`);
    expect(skewed.ok).toBe(false);
    if (!skewed.ok) {
      expect(skewed.code).toBe("unsupported");
      expect(skewed.detail).toBe("unsupported content: a stroked <rect> under a non-uniform transform");
    }
    const clipped = prepare(`<svg ${NS} viewBox="0 0 24 24"><clipPath id="c"><rect width="5" height="5"/></clipPath><rect x="1" y="1" width="10" height="10" fill="#000" clip-path="url(#c)"/></svg>`);
    expect(clipped.ok).toBe(false);
    if (!clipped.ok) expect(clipped.detail).toContain("<clipPath>");
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
      { strokePx: 2.2, ...SQUARE_512 },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rect = new DOMParser().parseFromString(result.svg, "image/svg+xml").querySelector("rect");
    expect(rect?.getAttribute("style")).toBe("font-family:Arial");
    expect(rect?.getAttribute("stroke-width")).toBe("2.2"); // the artboard scale lives in the geometry, not in the width
  });

  it("rejects a transform on the root svg", () => {
    const result = prepare(`<svg ${NS} viewBox="0 0 24 24" transform="scale(2)"><rect x="1" y="1" width="10" height="10" fill="#000"/></svg>`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("unsupported");
  });
});
