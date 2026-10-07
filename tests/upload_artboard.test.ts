// upload_bounds.test.ts + upload_artboard.test.ts — the geometry the export
// promises (RULE 8). The real DOMParser (happy-dom) reads the real markup, and
// every number below is checked against the design doc: padding, centring, the
// 15.1 MP target, and the 300 DPI stroke conversion.
import { describe, expect, it } from "vitest";
import { documentBounds, viewBoxOf } from "../src/lib/uploadbounds";
import { artboardFromBounds, artboardFor, pixelSize, prepareSvg } from "../src/lib/uploadartboard";
import { DEFAULT_UPLOAD_SETTINGS, type UploadSettings } from "../src/lib/uploadsettings";

const svg = (inner: string, attrs = 'viewBox="0 0 100 100"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${inner}</svg>`;

const settings = (over: Partial<UploadSettings> = {}): UploadSettings => ({ ...DEFAULT_UPLOAD_SETTINGS, ...over });

/** The artwork's rect, never the background plate the export paints first. */
const strokedRect = (doc: Document): Element | null =>
  [...doc.querySelectorAll("rect")].find((el) => el.getAttribute("data-export-plate") === null) ?? null;

describe("documentBounds", () => {
  it("measures filled geometry", () => {
    const r = documentBounds(svg('<rect x="10" y="10" width="80" height="80" fill="#000"/>'));
    expect(r.ok).toBe(true);
    expect(r.bounds?.box).toEqual({ x: 10, y: 10, w: 80, h: 80 });
    expect(r.bounds?.measured).toBe(1);
  });

  it("adds a stroke's own reach and follows group transforms", () => {
    const r = documentBounds(svg('<g transform="translate(20 0)"><circle cx="10" cy="10" r="5" fill="none" stroke="#000" stroke-width="4" stroke-linejoin="round"/></g>'));
    expect(r.bounds?.box).toEqual({ x: 23, y: 3, w: 14, h: 14 });
  });

  it("respects the inline style, which wins over the attribute", () => {
    const r = documentBounds(svg('<rect width="10" height="10" stroke="none" style="stroke:#000;stroke-width:6;stroke-linejoin:round;fill:none"/>'));
    expect(r.bounds?.box).toEqual({ x: -3, y: -3, w: 16, h: 16 });
  });

  it("follows <use> to the element it names", () => {
    const r = documentBounds(svg('<defs><rect id="r" x="0" y="0" width="10" height="10" fill="#000"/></defs><use href="#r" x="40" y="5"/>', 'viewBox="0 0 80 80"'));
    expect(r.bounds?.box).toEqual({ x: 40, y: 5, w: 10, h: 10 });
    expect(r.bounds?.measured).toBe(1);
  });

  it("skips what nobody sees and reports what it could not measure", () => {
    const r = documentBounds(svg(
      '<rect x="1" y="1" width="4" height="4" fill="#000" display="none"/>'
      + '<text x="0" y="0">hi</text><image href="a.png" width="4" height="4"/>'
      + '<rect x="90" y="90" width="5" height="5" fill="#000"/>',
    ));
    expect(r.bounds?.box).toEqual({ x: 90, y: 90, w: 5, h: 5 });
    expect(r.bounds?.unmeasurable).toEqual(["image", "text"]);
  });

  it("says when the ink leaves the viewBox instead of cropping silently", () => {
    const r = documentBounds(svg('<rect x="-5" y="0" width="20" height="10" fill="#000"/>'));
    expect(r.bounds?.clipped).toBe(true);
    expect(r.bounds?.visible).toEqual({ x: 0, y: 0, w: 15, h: 10 });
  });

  it("reports a filter or a mask as an effect it cannot measure", () => {
    const r = documentBounds(svg('<rect width="10" height="10" fill="#000" filter="url(#f)"/>'));
    expect(r.bounds?.effects).toEqual(['filter="url(#f)"']);
  });

  it("refuses a document it cannot read, with the reason", () => {
    expect(documentBounds("<svg><").ok).toBe(false);
    expect(documentBounds(svg("", "")).bounds).toBeNull();
  });

  it("falls back to width/height when there is no viewBox", () => {
    const doc = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="12"><rect width="4" height="4" fill="#000"/></svg>', "image/svg+xml");
    expect(viewBoxOf(doc.documentElement)).toEqual({ x: 0, y: 0, w: 24, h: 12 });
  });
});

describe("pixelSize", () => {
  it("hits 15.1 MP at a square aspect with whole pixels", () => {
    const px = pixelSize(1, 15.1);
    expect(px).toEqual({ width: 3886, height: 3886, mp: 15.101 });
    expect(Number.isInteger(px.width) && Number.isInteger(px.height)).toBe(true);
  });

  it("keeps a 16:9 artwork's proportions without stretching it", () => {
    const px = pixelSize(16 / 9, 15.1);
    expect(px.width / px.height).toBeCloseTo(16 / 9, 2);
    expect(px.mp).toBeLessThanOrEqual(15.2);
  });

  it("never returns a zero side for a nonsense request", () => {
    expect(pixelSize(0, 15.1).height).toBeGreaterThan(0);
    expect(pixelSize(Number.NaN, 0).width).toBeGreaterThan(0);
  });

  it("caps the side at what a canvas accepts", () => {
    expect(pixelSize(1, 60).width).toBeLessThanOrEqual(16384);
  });
});

describe("artboardFor", () => {
  it("pads a square ink box symmetrically and centres it", () => {
    const a = artboardFor({ x: 20, y: 30, w: 100, h: 50 }, settings({ paddingPct: 10, square: true }));
    // side = longest 100 × 1.2 = 120, centred on the ink centre (70, 55)
    expect(a.viewBox).toMatchObject({ x: 10, y: -5, w: 120, h: 120 });
    expect(a.px).toEqual({ width: 3886, height: 3886, mp: 15.101 });
  });

  it("keeps a non-square artboard proportional when square is off", () => {
    const a = artboardFor({ x: 0, y: 0, w: 100, h: 50 }, settings({ paddingPct: 0, square: false, targetMP: 15.1 }));
    expect(a.viewBox.w / a.viewBox.h).toBeCloseTo(2, 3);
    expect(a.px.width / a.px.height).toBeCloseTo(2, 2);
  });

  it("turns an icon scale into a larger artboard, not a smaller icon", () => {
    const a = artboardFor({ x: 0, y: 0, w: 100, h: 100 }, settings({ paddingPct: 0, iconScalePct: 50 }));
    expect(a.viewBox.w).toBeCloseTo(200, 4);
  });

  it("converts the physical stroke width into pixels and user units", () => {
    const a = artboardFromBounds(documentBounds(svg('<rect x="0" y="0" width="100" height="100" fill="#000"/>')).bounds!, settings());
    expect(a.strokePx).toBeCloseTo(9.167, 3); // 2.2 pt at 300 DPI
    expect(a.strokeUnits).toBeCloseTo(9.167 * (120 / 3886), 3);
    expect(a.strokeUnits).toBeLessThan(a.strokePx);
  });
});

describe("prepareSvg", () => {
  const source = svg('<rect x="10" y="10" width="80" height="80" fill="#000" stroke="#111" stroke-width="1"/>');

  it("writes the artboard, the px size and the background plate into the copy", () => {
    const bounds = documentBounds(source).bounds!;
    const prepared = prepareSvg(source, bounds, settings({ backgroundInSvg: true, background: "#ff0000" }));
    expect(prepared.ok).toBe(true);
    const doc = new DOMParser().parseFromString(prepared.code, "image/svg+xml");
    const root = doc.documentElement;
    // The stroke allowance (miter default, capped at the SVG limit 4) pads the
    // ink by 2 on every side of an 80-unit square, then 10% padding is added.
    expect(root.getAttribute("viewBox")).toBe("-0.4 -0.4 100.8 100.8");
    expect(root.getAttribute("width")).toBe("3886");
    expect(root.getAttribute("height")).toBe("3886");
    const plate = doc.querySelector("[data-export-plate]");
    expect(plate?.getAttribute("fill")).toBe("#ff0000");
    expect(root.firstElementChild?.getAttribute("data-export-plate")).toBe("1");
  });

  it("normalises the stroke width of the copy and leaves the source text alone", () => {
    const bounds = documentBounds(source).bounds!;
    const prepared = prepareSvg(source, bounds, settings());
    const doc = new DOMParser().parseFromString(prepared.code, "image/svg+xml");
    expect(prepared.strokesNormalised).toBe(1);
    expect(strokedRect(doc)?.getAttribute("data-export-stroke")).toBe("units");
    expect(source).toContain('stroke-width="1"'); // the approved file is untouched
  });

  it("gives a non-scaling stroke the pixel width, not the user-unit width", () => {
    const src = svg('<path d="M0 0h10" fill="none" stroke="#000" stroke-width="1" vector-effect="non-scaling-stroke"/>');
    const prepared = prepareSvg(src, documentBounds(src).bounds!, settings());
    const doc = new DOMParser().parseFromString(prepared.code, "image/svg+xml");
    expect(doc.querySelector("path")?.getAttribute("stroke-width")).toBe(String(prepared.artboard?.strokePx));
    expect(doc.querySelector("path")?.getAttribute("data-export-stroke")).toBe("px");
  });

  it("omits the plate when the output policy says the SVG stays transparent", () => {
    const prepared = prepareSvg(source, documentBounds(source).bounds!, settings({ backgroundInSvg: false }));
    expect(prepared.code).not.toContain("data-export-plate");
    expect(prepared.warnings).toContain("background is not painted into the SVG (JPEG only)");
  });

  it("includes the preparation warnings on the result", () => {
    const src = svg('<text x="0" y="0">hi</text><rect x="-4" y="0" width="8" height="8" fill="#000"/>');
    const prepared = prepareSvg(src, documentBounds(src).bounds!, settings());
    expect(prepared.warnings.join(" | ")).toContain("outside the source viewBox");
    expect(prepared.warnings.join(" | ")).toContain("not measured: text");
  });

  it("refuses markup it cannot parse, without producing a document", () => {
    const prepared = prepareSvg("<svg><", documentBounds(svg("")).bounds!, settings());
    expect(prepared).toMatchObject({ ok: false, code: "", artboard: null });
  });
});
