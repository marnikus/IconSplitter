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
import { insideArtboard, shippedBounds } from "../src/lib/upload/place";

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
/** The artwork's first shape of that kind — the artboard rect is always the first child (I-60). */
const artwork = (root: Element, tag: string) => Array.from(root.querySelectorAll(tag)).filter((el) => el !== root.firstElementChild)[0] ?? null;

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
    const art = artwork(root, "rect");
    expect(Number(art?.getAttribute("width"))).toBeCloseTo(174.08, 2);
    expect(Number(art?.getAttribute("y"))).toBeCloseTo(40.96, 2);
  });

  it("the configured stroke is the number in the file whatever the artboard scale: 2 → stroke-width=\"2\"", () => {
    const src = `<svg ${NS} viewBox="0 0 24 24"><g transform="scale(1.1)"><path d="M4 4h16v16H4z" fill="none" stroke="#000"/></g></svg>`;
    const { result, root } = prepared(src, { strokePx: 2, ...SQUARE_512 });
    expect(result.fit.scale).toBeGreaterThan(1);
    const path = root.querySelector("path");
    expect(root.getAttribute("stroke-width")).toBe("2"); // once, on the root
    expect(path?.getAttribute("stroke-width")).toBeNull();
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
    expect(attrs(artwork(root, "rect"), ["x", "y", "width", "height", "fill"])).toEqual(["6.4", "6.4", "80", "80", "#000000"]);
  });

  it("paints the configured background as the first rect, sized to the artboard", () => {
    const { root } = prepared(RECT_ICON, { background: "#ff0000" });
    const bg = root.querySelector("rect");
    expect(attrs(bg, ["fill", "width", "height", "x", "y"])).toEqual(["#ff0000", "92.8", "92.8", "0", "0"]);
    expect(root.firstElementChild).toBe(bg);
  });

  it("a transparent background — the default — still ships the artboard rect, invisible: fill none, stroke none (I-60, 2026-10-09)", () => {
    const { result, root } = prepared(RECT_ICON);
    expect(result.background).toBe("transparent");
    const [board, art] = Array.from(root.querySelectorAll("rect"));
    expect(root.firstElementChild).toBe(board);
    expect(attrs(board, ["x", "y", "width", "height", "fill", "stroke"])).toEqual(["0", "0", "92.8", "92.8", "none", null]); // nothing strokes, so no `stroke` anywhere
    expect(art.getAttribute("fill")).toBe("#000000"); // the artwork's own
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
    expect(root.querySelectorAll("rect")).toHaveLength(2); // the artboard + the straight one
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

/** The viewBox as numbers. */
function viewBoxOf(root: Element): number[] {
  return (root.getAttribute("viewBox") ?? "").split(" ").map(Number);
}

describe("prepareExportSvg — the artboard is the shipped artwork (I-60, 2026-10-09)", () => {
  // the F4 reproduction: a 1 px source stroke the setting widens to 8 px —
  // the artboard used to be fitted to the SOURCE strokes, so 3.5 px of every
  // edge lay outside the viewBox
  const THIN = `<svg ${NS} viewBox="0 0 100 100"><path d="M10 10h80v80H10z" fill="none" stroke="#000" stroke-width="1"/></svg>`;

  it("padding 0: the viewBox equals the bounds of the FINAL document — the 8 px strokes included", () => {
    const { result, root } = prepared(THIN, { strokePx: 8, paddingPct: 0 });
    const final = shippedBounds(root); // the strokes measured by their real outline
    expect(final?.minX).toBeCloseTo(0, 3);
    expect(final?.minY).toBeCloseTo(0, 3);
    expect(viewBoxOf(root)).toEqual([0, 0, 88, 88]); // 80 + 2 × 4: a mitered square corner reaches 4 on each axis, not the hull's 4·√2
    expect(final?.width).toBeCloseTo(88, 3);
    expect(insideArtboard(root)).toBe(true);
    expect(result.passes).toBeLessThanOrEqual(4);
    expect(root.getAttribute("stroke-width")).toBe("8");
  });

  it("the same with strokes expanded to fills — the outline is measured, not guessed", () => {
    const { root } = prepared(THIN, { strokePx: 8, paddingPct: 0, expandStrokes: true });
    expect(viewBoxOf(root)).toEqual([0, 0, 88, 88]);
    const final = visibleBounds(root)?.bounds; // all fills now: the analytic bounds are exact too
    expect(final?.width).toBeCloseTo(88, 3);
    expect(insideArtboard(root)).toBe(true);
  });

  it("padding 8 %: the artboard is the final bounds plus the pad on every side", () => {
    const { result, root } = prepared(THIN, { strokePx: 8, paddingPct: 8 });
    const pad = 88 * 0.08;
    expect(result.fit.artW).toBeCloseTo(88 + 2 * pad, 3);
    const final = shippedBounds(root);
    expect(final?.minX).toBeCloseTo(pad, 3);
    expect(final?.minY).toBeCloseTo(pad, 3);
    expect(insideArtboard(root)).toBe(true);
  });

  it("a pinned 512 artboard with scale < 1 and verbatim 6 px strokes: nothing outside, centred to 0.01 px", () => {
    const big = `<svg ${NS} viewBox="0 0 2000 1000"><path d="M100 100h1800v800H100z" fill="none" stroke="#000" stroke-width="20"/></svg>`;
    const { result, root } = prepared(big, { strokePx: 6, paddingPct: 8, ...SQUARE_512 });
    expect(result.fit.scale).toBeLessThan(1);
    expect(root.getAttribute("stroke-width")).toBe("6");
    expect(insideArtboard(root)).toBe(true);
    const final = shippedBounds(root)!;
    const right = 512 - (final.minX + final.width);
    const bottom = 512 - (final.minY + final.height);
    expect(Math.abs(final.minX - right)).toBeLessThan(0.01);
    expect(Math.abs(final.minY - bottom)).toBeLessThan(0.01);
    expect(final.minX).toBeCloseTo(40.96, 2); // the pad: 8 % of 512
    expect(result.passes).toBeLessThanOrEqual(4);
  });

  it("stroke width 0 and no expansion: the first pass is already exact", () => {
    const { result } = prepared(RECT_ICON, { strokePx: 0 });
    expect(result.passes).toBe(1);
    const { result: stroked } = prepared(THIN, { strokePx: 0, ...SQUARE_512 });
    expect(stroked.passes).toBe(1);
  });

  it("a coloured background is the same rect, filled", () => {
    const { root } = prepared(THIN, { strokePx: 8, background: "#ff0000" });
    const board = root.firstElementChild;
    expect(attrs(board, ["fill", "stroke", "x", "y"])).toEqual(["#ff0000", "none", "0", "0"]);
    expect(Number(board?.getAttribute("width"))).toBeCloseTo(88 + 2 * 88 * 0.08, 3);
  });
});

describe("prepareExportSvg — scale the artboard to N megapixels (I-62, 2026-10-09)", () => {
  const WIDE = `<svg ${NS} viewBox="0 0 200 100"><rect x="50" y="25" width="100" height="50" fill="none" stroke="#000" stroke-width="1"/></svg>`;
  const MP5: SettingsOverrides = { scaleToMegapixels: true, artboardMegapixels: 5 };

  it("all fills (strokes expanded), padding 0: the 100×50 outline scales to exactly 3162.278 × 1581.139", () => {
    const { result, root } = prepared(WIDE, { ...MP5, strokePx: 0, paddingPct: 0, expandStrokes: true });
    // the 1 px stroke expanded (own width, × the scale) makes the content 101×51 → the fit uses THAT box
    const final = shippedBounds(root)!;
    expect(final.minX).toBeCloseTo(0, 3);
    expect(Math.abs(result.fit.artW * result.fit.artH - 5e6) / 5e6).toBeLessThan(1e-4);
    expect(result.fit.artW / result.fit.artH).toBeCloseTo(101 / 51, 4);
    expect(insideArtboard(root)).toBe(true);
    const square = prepared(`<svg ${NS} viewBox="0 0 200 100"><rect x="50" y="25" width="100" height="50" fill="#000"/></svg>`, { ...MP5, paddingPct: 0 });
    expect(square.root.getAttribute("viewBox")).toBe("0 0 3162.278 1581.139");
    expect(square.result.passes).toBe(1);
  });

  it("verbatim 2 px strokes, expansion off: the area is 5 MP within 0.01 %, stroke-width=\"2\" is in the file, nothing outside, ≤ 4 passes", () => {
    const { result, root } = prepared(WIDE, { ...MP5, strokePx: 2, paddingPct: 8 });
    expect(Math.abs(result.fit.artW * result.fit.artH - 5e6) / 5e6).toBeLessThan(1e-4);
    expect(root.getAttribute("stroke-width")).toBe("2");
    expect(insideArtboard(root)).toBe(true);
    expect(result.passes).toBeLessThanOrEqual(4);
    const final = shippedBounds(root)!;
    expect(final.minX).toBeCloseTo(result.fit.pad, 2);
    expect(final.minX + final.width).toBeCloseTo(result.fit.artW - result.fit.pad, 2);
  });

  it("a pinned artboard wins: in preset mode the megapixel target is ignored", () => {
    const { result } = prepared(WIDE, { ...MP5, ...SQUARE_512 });
    expect(result.fit.viewBox).toBe("0 0 512 512");
  });

  it("the box off leaves the number dormant: the content fit hugs the artwork", () => {
    const { result } = prepared(WIDE, { artboardMegapixels: 10, paddingPct: 0, strokePx: 0 });
    expect(result.fit.scale).toBe(1);
  });
});

/** Every element carrying the attribute, as `tag=value`, sorted — where a property is defined, in one line. */
function where(root: Element, attr: string): string[] {
  return Array.from(root.querySelectorAll("*")).concat(root)
    .filter((el) => el.hasAttribute(attr))
    .map((el) => `${el.nodeName}=${el.getAttribute(attr)}`)
    .sort();
}

describe("prepareExportSvg — stroke colour: ONE global definition (2026-10-08)", () => {
  const TWO = `<svg ${NS} viewBox="0 0 24 24" stroke="#111"><g style="stroke:#222;fill:none"><rect x="2" y="2" width="8" height="8"/></g>`
    + `<circle cx="18" cy="18" r="4" fill="#0f0" stroke="currentColor" style="stroke:#333; stroke-width:2"/>`
    + `<path d="M1 1h2" stroke="none" fill="#f00"/></svg>`;

  it("the default is #000000: the root carries it once, the group and the shapes carry no colour, the unstroked path says none", () => {
    const { result, root } = prepared(TWO, { strokePx: 0 });
    expect(result.strokesRecolored).toBe(2);
    expect(result.strokesNormalized).toBe(0);
    expect(result.globalStroke).toEqual({ stroke: "#000000", strokeWidth: null }); // widths differ (1 inherited vs 2 inline)
    expect(where(root, "stroke")).toEqual(["path=none", "rect=none", "svg=#000000"]); // the unstroked path and the artboard rect say none
    expect(where(root, "stroke-width")).toEqual(["circle=2", "rect=1"]); // each stroked shape its own, nothing else
    expect(root.querySelector("circle")?.getAttribute("style")).toBeNull(); // the clean pass folded the style; the paint is ours now
    expect(root.querySelector("circle")?.getAttribute("fill")).toBe("#0f0");
    expect(root.querySelector("path")?.getAttribute("fill")).toBe("#f00");
  });

  it("`artwork` recolours nothing — mixed paints stay on the shapes that use them, and on nothing else", () => {
    const { result, root } = prepared(TWO, { strokeColor: "artwork" });
    expect(result.strokesRecolored).toBe(0);
    expect(result.globalStroke.stroke).toBeNull();
    expect(where(root, "stroke")).toEqual(["circle=#333", "rect=#222"]); // the root's #111 reached no shape: gone; no root paint → the unstroked path needs no `none`
  });

  it("`artwork` with ONE paint everywhere hoists that paint to the root", () => {
    const one = `<svg ${NS} viewBox="0 0 24 24" stroke="#123"><g stroke="#123"><rect x="2" y="2" width="8" height="8" fill="none"/></g><circle cx="18" cy="18" r="4" fill="none"/></svg>`;
    const { result, root } = prepared(one, { strokeColor: "artwork" });
    expect(result.globalStroke.stroke).toBe("#123");
    expect(where(root, "stroke")).toEqual(["rect=none", "svg=#123"]); // the artboard rect must not inherit the hoisted paint
  });

  it("colour and width are independent decisions, both global when set", () => {
    const { result, root } = prepared(TWO, { strokeColor: "#ff0000", strokePx: 3 });
    expect(result.strokesRecolored).toBe(2);
    expect(result.strokesNormalized).toBe(2);
    expect(result.globalStroke).toEqual({ stroke: "#ff0000", strokeWidth: "3" });
    expect(where(root, "stroke")).toEqual(["path=none", "rect=none", "svg=#ff0000"]);
    expect(where(root, "stroke-width")).toEqual(["svg=3"]);
  });

  it("the reviewer's document: root #111, group #000/.8, a width on every shape → one stroke, one width, both on <svg>", () => {
    const src = `<svg ${NS} viewBox="0 0 24 24" stroke="#111"><g stroke="#000" stroke-width=".8" fill="none"><path d="M4 4h16"/><path d="M4 12h16"/></g></svg>`;
    const { root } = prepared(src, { strokePx: 2, background: "#ffffff" });
    expect(where(root, "stroke")).toEqual(["rect=none", "svg=#000000"]); // the artboard rect is the one unstroked shape
    expect(where(root, "stroke-width")).toEqual(["svg=2"]);
  });

  it("a filled-only icon defines no stroke at all", () => {
    const { result, root } = prepared(RECT_ICON, { strokePx: 2 });
    expect(result.globalStroke).toEqual({ stroke: null, strokeWidth: null });
    expect(where(root, "stroke")).toEqual([]);
    expect(where(root, "stroke-width")).toEqual([]);
  });
});

describe("prepareExportSvg — the stroke width is the number in the file (px), defined once", () => {
  const STROKED = `<svg ${NS} viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" fill="none" stroke="#000" stroke-width="1"/></svg>`;

  it.each([[2, "2"], [2.2, "2.2"], [0.75, "0.75"], [1.5, "1.5"]])("strokePx %s → stroke-width=\"%s\" on the root, nowhere else", (px, written) => {
    const { result, root } = prepared(STROKED, { strokePx: px });
    expect(result.strokesNormalized).toBe(1);
    expect(where(root, "stroke-width")).toEqual([`svg=${written}`]);
  });

  it("the same number under an artwork transform AND a pinned artboard — the geometry absorbed both", () => {
    const src = `<svg ${NS} viewBox="0 0 48 48"><g transform="scale(2)"><rect x="2" y="2" width="20" height="20" fill="none" stroke="#000" stroke-width="1"/></g></svg>`;
    const { result, root } = prepared(src, { strokePx: 2.2, ...SQUARE_512 });
    expect(result.strokesNormalized).toBe(1);
    expect(root.getAttribute("stroke-width")).toBe("2.2");
    expect(Number(artwork(root, "rect")?.getAttribute("width"))).toBeCloseTo(40 * result.fit.scale, 2); // 20 × scale(2) user units, then the artboard's fit (mitered stroke corners included in the bounds)
  });

  it("width 0: the artwork's own width follows its geometry (× the baked scale, 3 decimals) and is hoisted when it is the only one", () => {
    const src = `<svg ${NS} viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" fill="none" stroke="#000" stroke-width="7.999906"/></svg>`;
    const content = prepared(src, { strokePx: 0 });
    expect(content.result.strokesNormalized).toBe(0);
    expect(where(content.root, "stroke-width")).toEqual(["svg=8"]); // scale 1, written to 3 decimals
    const scaled = prepared(`<svg ${NS} viewBox="0 0 24 24"><g transform="scale(1.1)"><path d="M0 0 L10 0" stroke="#000" stroke-width="1.5"/></g></svg>`, { strokePx: 0, paddingPct: 0, ...SQUARE_512 });
    const width = scaled.root.getAttribute("stroke-width") ?? "";
    expect(Number(width)).toBeCloseTo(1.65 * scaled.result.fit.scale, 2);
    expect(width).toMatch(/^\d+(\.\d{1,3})?$/);
  });

  it("vector-effect=non-scaling-stroke becomes an explicit width (the setting's, or its own px)", () => {
    const src = `<svg ${NS} viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" fill="none" stroke="#000" stroke-width="1" vector-effect="non-scaling-stroke"/></svg>`;
    const set = prepared(src, { strokePx: 3 });
    expect(artwork(set.root, "rect")?.getAttribute("vector-effect")).toBeNull();
    expect(where(set.root, "stroke-width")).toEqual(["svg=3"]);
    expect(set.result.strokesNormalized).toBe(1);
    const own = prepared(src, { strokePx: 0, ...SQUARE_512 });
    expect(where(own.root, "stroke-width")).toEqual(["svg=1"]); // already final px: not scaled
  });

  it("an inline style is folded into attributes, and the explicit width still wins", () => {
    const src = `<svg ${NS} viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" fill="none" stroke="#000" style="stroke-width:5;fill:none"/></svg>`;
    const { root } = prepared(src, { strokePx: 1.5 });
    expect(where(root, "stroke-width")).toEqual(["svg=1.5"]);
    // `style` is gone; its paint declarations are plain attributes now (2026-10-08)
    expect(artwork(root, "rect")?.getAttribute("style")).toBeNull();
    expect(artwork(root, "rect")?.getAttribute("fill")).toBe("none");
  });

  it("a stroked group's width and paint end up once on the root; the group carries neither", () => {
    const src = `<svg ${NS} viewBox="0 0 24 24"><g stroke="#000" stroke-width="1"><rect x="2" y="2" width="8" height="8" fill="none"/><circle cx="18" cy="18" r="4" fill="none"/></g></svg>`;
    const { result, root } = prepared(src, { strokePx: 0.75 });
    expect(result.strokesNormalized).toBe(2);
    expect(where(root, "stroke-width")).toEqual(["svg=0.75"]);
    expect(where(root, "stroke")).toEqual(["rect=none", "svg=#000000"]);
    expect(root.querySelector("g")?.attributes.length).toBe(0);
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
    const folded = prepare(`<svg ${NS} viewBox="0 0 24 24"><style>.a{stroke-width:9}</style><rect class="a" x="1" y="1" width="10" height="10" fill="none" stroke="#000"/></svg>`);
    expect(folded.ok).toBe(true);
    if (folded.ok) expect(folded.svg).toMatch(/<svg[^>]* stroke-width="9"/); // folded, then hoisted: the one definition

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
    const doc = new DOMParser().parseFromString(result.svg, "image/svg+xml");
    expect(artwork(doc.documentElement, "rect")?.getAttribute("style")).toBe("font-family:Arial");
    expect(where(doc.documentElement, "stroke-width")).toEqual(["svg=2.2"]); // the artboard scale lives in the geometry, not in the width
  });

  it("rejects a transform on the root svg", () => {
    const result = prepare(`<svg ${NS} viewBox="0 0 24 24" transform="scale(2)"><rect x="1" y="1" width="10" height="10" fill="#000"/></svg>`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("unsupported");
  });
});
