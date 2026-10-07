// RULE 8 — geometry and units run for real: pt→px at the documented 96 DPI,
// visible bounds including stroke width/caps/joins and CTM transforms, the
// padded artboard fit, and the 15.1 MP integer target dimensions.
import { describe, expect, it } from "vitest";
import {
  fitArtboard,
  pinnedDimensions,
  parseSvgLength,
  ptToPx,
  pxToPt,
  targetDimensions,
  visibleBounds,
  type Bounds,
} from "../src/lib/upload/geom";

function docOf(inner: string, rootAttrs = `xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"`): Document {
  return new DOMParser().parseFromString(`<svg ${rootAttrs}>${inner}</svg>`, "image/svg+xml");
}

function rootOf(inner: string): Element {
  const doc = docOf(inner);
  return doc.documentElement;
}

const at = (b: Bounds) => [b.minX, b.minY, b.width, b.height];

describe("units — pt is never silently px", () => {
  it("converts pt at the documented 96 DPI (1 pt = 4/3 px)", () => {
    expect(ptToPx(72)).toBeCloseTo(96);
    expect(ptToPx(2.2)).toBeCloseTo(2.9333, 3);
    expect(pxToPt(ptToPx(2.2))).toBeCloseTo(2.2);
  });

  it("parses SVG lengths with units; % and junk are not lengths", () => {
    expect(parseSvgLength("12")).toBe(12);
    expect(parseSvgLength("12px")).toBe(12);
    expect(parseSvgLength("9pt")).toBeCloseTo(12);
    expect(parseSvgLength("0.5in")).toBeCloseTo(48);
    expect(parseSvgLength("25.4mm")).toBeCloseTo(96);
    expect(parseSvgLength("50%")).toBeNull();
    expect(parseSvgLength("auto")).toBeNull();
    expect(parseSvgLength(null)).toBeNull();
  });
});

describe("fitArtboard — a pinned artboard scales the artwork into it", () => {
  const bounds: Bounds = { minX: 10, minY: 10, width: 80, height: 80 };

  it("keeps today's behaviour when the artboard hugs the content (scale 1)", () => {
    const fit = fitArtboard(bounds, 8);
    expect(fit.artW).toBeCloseTo(92.8);
    expect(fit.scale).toBe(1);
    expect(fit.viewBox).toBe("0 0 92.8 92.8");
  });

  it("lands exactly on 512×512 with the padding as a share of the artboard", () => {
    const fit = fitArtboard(bounds, 8, { width: 512, height: 512 });
    expect(fit.viewBox).toBe("0 0 512 512");
    expect(fit.artW).toBe(512);
    expect(fit.pad).toBeCloseTo(40.96); // 8% of 512
    expect(fit.scale).toBeCloseTo((512 - 2 * 40.96) / 80);
    // centred: the scaled 80×80 artwork sits in the middle
    const scaled = 80 * fit.scale;
    expect(fit.offsetX + bounds.minX * fit.scale).toBeCloseTo((512 - scaled) / 2);
  });

  it("falls back to scale 1 when the artwork or the box is degenerate", () => {
    const empty: Bounds = { minX: 0, minY: 0, width: 0, height: 0 };
    const flat = fitArtboard(empty, 8, { width: 512, height: 512 });
    expect(flat.scale).toBe(1);
    expect(flat.viewBox).toBe("0 0 512 512");
  });

  it("never pins a zero or negative size — the smallest legal artboard wins", () => {
    expect(pinnedDimensions({ width: -4, height: 0 })).toMatchObject({ width: 1, height: 1 });
    expect(pinnedDimensions({ width: 12.6, height: 300.4 })).toMatchObject({ width: 13, height: 300 });
  });

  it("fits a non-square artboard by letterboxing, never by stretching", () => {
    const fit = fitArtboard(bounds, 0, { width: 512, height: 256 });
    expect(fit.viewBox).toBe("0 0 512 256");
    expect(fit.scale).toBeCloseTo(256 / 80); // the SHORT side decides
    expect(fit.offsetY + bounds.minY * fit.scale).toBeCloseTo(0);
    expect(fit.offsetX + bounds.minX * fit.scale).toBeCloseTo((512 - 80 * fit.scale) / 2);
  });
});

describe("visibleBounds — geometry including strokes, caps, joins, transforms", () => {
  it("covers plain shapes without stroke", () => {
    const r = visibleBounds(rootOf(`<rect x="2" y="4" width="10" height="6"/>`));
    expect(r?.bounds && at(r.bounds)).toEqual([2, 4, 10, 6]);
  });

  it("expands by the miter join reach at each corner (sw/2·√2 at a 90° corner)", () => {
    const r = visibleBounds(rootOf(`<rect x="2" y="2" width="20" height="20" fill="none" stroke="#000" stroke-width="2"/>`));
    const e = Math.SQRT2; // (sw/2)/cos(45°) with sw=2
    expect(r?.bounds?.minX).toBeCloseTo(2 - e);
    expect(r?.bounds?.minY).toBeCloseTo(2 - e);
    expect(r?.bounds?.width).toBeCloseTo(20 + 2 * e);
    expect(r?.bounds?.height).toBeCloseTo(20 + 2 * e);
  });

  it("stroke-width inherits from a group and scales with the CTM", () => {
    const r = visibleBounds(rootOf(
      `<g stroke="#000" stroke-width="1" transform="scale(2)"><rect x="1" y="1" width="4" height="4" fill="none"/></g>`,
    ));
    // geometry 2..10 after scale(2); join reach √2·0.5 local = √2 device
    expect(r?.bounds?.minX).toBeCloseTo(2 - Math.SQRT2);
    expect(r?.bounds?.width).toBeCloseTo(8 + 2 * Math.SQRT2);
  });

  it("computes the miter join per corner and bevels past the miter limit", () => {
    const miter = visibleBounds(rootOf(
      `<path d="M2 12L12 2L22 12" fill="none" stroke="#000" stroke-width="2" stroke-linejoin="miter" stroke-miterlimit="4"/>`,
    ));
    // 90° turn at (12,2): reach (sw/2)/cos(45°) = √2 around the hull (2..22 x 2..12)
    expect(miter?.bounds?.minX).toBeCloseTo(2 - Math.SQRT2);
    expect(miter?.bounds?.minY).toBeCloseTo(2 - Math.SQRT2);
    expect(miter?.bounds?.width).toBeCloseTo(20 + 2 * Math.SQRT2);
    expect(miter?.bounds?.height).toBeCloseTo(10 + 2 * Math.SQRT2);
    const bevel = visibleBounds(rootOf(
      `<path d="M2 12L12 2L22 12" fill="none" stroke="#000" stroke-width="2" stroke-linejoin="bevel"/>`,
    ));
    expect(bevel?.bounds && at(bevel.bounds)).toEqual([1, 1, 22, 12]);
  });

  it("square caps reach sw/2·√2 past the endpoints; butt caps reach sw/2", () => {
    const square = visibleBounds(rootOf(
      `<line x1="2" y1="12" x2="22" y2="12" stroke="#000" stroke-width="2" stroke-linecap="square"/>`,
    ));
    expect(square?.bounds?.minX).toBeCloseTo(2 - Math.SQRT2);
    expect(square?.bounds?.minY).toBeCloseTo(12 - Math.SQRT2);
    expect(square?.bounds?.width).toBeCloseTo(20 + 2 * Math.SQRT2);
    expect(square?.bounds?.height).toBeCloseTo(2 * Math.SQRT2); // a line has zero height of its own
    const butt = visibleBounds(rootOf(
      `<line x1="2" y1="12" x2="22" y2="12" stroke="#000" stroke-width="2"/>`,
    ));
    expect(butt?.bounds && at(butt.bounds)).toEqual([1, 11, 22, 2]);
  });

  it("handles every path command, including arcs with cardinal extrema", () => {
    const circle = visibleBounds(rootOf(
      `<path d="M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0" fill="#000"/>`,
    ));
    expect(circle?.bounds && at(circle.bounds)).toEqual([2, 2, 20, 20]);
    const rel = visibleBounds(rootOf(
      `<path d="M2 2h20v20H2z M5 5c2 0 4 2 6 6s4 4 6 4q2 -2 4 0t4 0" fill="none"/>`,
    ));
    expect(rel?.bounds?.minX).toBeLessThanOrEqual(2);
    expect(rel?.bounds && rel.bounds.minX >= 0 && rel.bounds.minY >= 0 && rel.bounds.width <= 24 && rel.bounds.height <= 24).toBe(true);
  });

  it("applies translate/rotate/matrix transforms to the hull", () => {
    const r = visibleBounds(rootOf(
      `<g transform="translate(10,20)"><g transform="rotate(90)"><rect x="0" y="0" width="4" height="2"/></g></g>`,
    ));
    // rotate(90): (x,y)->(-y,x); rect 0..4 x 0..2 -> -2..0 x 0..4; +translate -> 8..10 x 20..24
    expect(r?.bounds && at(r.bounds)).toEqual([8, 20, 2, 4]);
    const m = visibleBounds(rootOf(`<rect x="1" y="1" width="2" height="2" transform="matrix(2 0 0 2 5 5)"/>`));
    expect(m?.bounds && at(m.bounds)).toEqual([7, 7, 4, 4]);
  });

  it("names text/image/use as unsupported instead of guessing their bounds", () => {
    const r = visibleBounds(rootOf(`<rect x="1" y="1" width="4" height="4"/><text x="2" y="2">hi</text>`));
    expect(r?.unsupported).toContain("text");
    const none = visibleBounds(rootOf(`<text x="2" y="2">hi</text>`));
    expect(none).toBeNull(); // no geometry at all
  });
});

describe("fitArtboard — padded, centred, never stretched", () => {
  it("pads uniformly by % of the artwork's largest side and centres the content", () => {
    const fit = fitArtboard({ minX: 1, minY: 1, width: 22, height: 22 }, 8);
    expect(fit.pad).toBeCloseTo(1.76);
    expect(fit.artW).toBeCloseTo(25.52);
    expect(fit.artH).toBeCloseTo(25.52);
    expect(fit.offsetX).toBeCloseTo(0.76); // pad - minX
    expect(fit.offsetY).toBeCloseTo(0.76);
    expect(fit.viewBox).toBe("0 0 25.52 25.52");
  });

  it("zero padding keeps the artwork's own box; wide art gets a wide artboard", () => {
    const fit = fitArtboard({ minX: 5, minY: 5, width: 40, height: 10 }, 0);
    expect(fit.artW).toBe(40);
    expect(fit.artH).toBe(10);
    expect(fit.offsetX).toBe(-5); // translate the artwork's origin (5,5) to (0,0)
    expect(fit.offsetY).toBe(-5);
    expect(fit.viewBox).toBe("0 0 40 10");
  });
});

describe("targetDimensions — real 15.1 MP integers, aspect preserved", () => {
  it("square artboard at 15.1 MP lands on 3886×3886 (15.10 MP)", () => {
    const t = targetDimensions(100, 100, 15.1);
    expect(t.width).toBe(3886);
    expect(t.height).toBe(3886);
    expect(t.megapixels).toBeCloseTo(15.1, 2);
  });

  it("non-square artboards keep their ratio without distortion", () => {
    const t = targetDimensions(200, 100, 15.1);
    expect(t.width / t.height).toBeCloseTo(2, 2);
    expect(t.megapixels).toBeCloseTo(15.1, 1);
    expect(Number.isInteger(t.width)).toBe(true);
    expect(Number.isInteger(t.height)).toBe(true);
  });

  it("never returns a zero dimension", () => {
    const t = targetDimensions(0.0001, 0.0001, 1);
    expect(t.width).toBeGreaterThanOrEqual(1);
    expect(t.height).toBeGreaterThanOrEqual(1);
  });
});
