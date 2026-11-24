// @vitest-environment happy-dom
// svg_builder_inkbox.test.ts — a sheet icon is fitted by its REAL drawn
// bounds, never by the generator's viewBox / artboard frame (2026-11-24).
import { beforeEach, describe, expect, it } from "vitest";
import { inkBoxOf, pathInkBox } from "../src/lib/svgBuilder/inkbox";
import { compilePreparedNodes } from "../src/lib/svgBuilder/svgAssetNodes";
import { cellGroupOf, clearSanitizedIcons } from "../src/lib/svgBuilder/svgAsset";
import { DEFAULT_CONFIG } from "../src/lib/svgBuilder/config";
import type { BuilderIconAsset, CellFrame } from "../src/lib/svgBuilder/types";

const nodesOf = (svg: string) => compilePreparedNodes(new DOMParser().parseFromString(svg, "image/svg+xml").documentElement);
const box = (svg: string) => inkBoxOf(nodesOf(svg))?.map((n) => Math.round(n * 1000) / 1000);
const wrap = (body: string, vb = "0 0 100 100") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${body}</svg>`;

describe("ink box", () => {
  it("shapes: rect, circle, ellipse, line, polygon, nested translate/scale groups", () => {
    expect(box(wrap('<rect x="10" y="20" width="30" height="40"/>'))).toEqual([10, 20, 30, 40]);
    expect(box(wrap('<circle cx="50" cy="50" r="10"/><line x1="0" y1="90" x2="5" y2="95"/>'))).toEqual([0, 40, 60, 55]);
    expect(box(wrap('<ellipse cx="50" cy="50" rx="20" ry="5"/>'))).toEqual([30, 45, 40, 10]);
    expect(box(wrap('<polygon points="10,10 30,15 20,40"/>'))).toEqual([10, 10, 20, 30]);
    expect(box(wrap('<g transform="translate(10 20) scale(2)"><rect x="1" y="1" width="5" height="5"/></g>'))).toEqual([12, 22, 10, 10]);
  });

  it("paths: tight curve extremes, not the control-point hull; relative, H/V, S/T reflection, Z", () => {
    // cubic bulging up: control points reach y=0 but the curve only y=7.5
    expect(pathInkBox("M10 10 C10 0 30 0 30 10")?.map((n) => Math.round(n * 1000) / 1000)).toEqual([10, 2.5, 20, 7.5]);
    expect(pathInkBox("M10 10 Q20 0 30 10")?.map((n) => Math.round(n * 1000) / 1000)).toEqual([10, 5, 20, 5]);
    expect(pathInkBox("m5 5 h10 v10 h-10 z m20 0 l5 5")).toEqual([5, 5, 25, 10]);
    expect(pathInkBox("M0 10 C0 0 10 0 10 10 S20 20 20 10")?.map((n) => Math.round(n * 1000) / 1000)).toEqual([0, 2.5, 20, 15]);
    expect(pathInkBox("M0 0 Q5 10 10 0 T20 0")?.map((n) => Math.round(n * 1000) / 1000)).toEqual([0, -5, 20, 10]);
  });

  it("arcs reach their true extremes", () => {
    const b = pathInkBox("M40 50 A10 10 0 0 1 60 50")!; // upper half circle, centre (50,50)
    expect(b.map((n) => Math.round(n * 1000) / 1000)).toEqual([40, 40, 20, 10]);
  });

  it("nothing drawable → null (the viewBox stays the fallback)", () => {
    expect(box(wrap("<g/>"))).toBeUndefined();
    expect(pathInkBox("")).toBeNull();
  });
});

describe("sheet cell fit", () => {
  beforeEach(() => clearSanitizedIcons());
  const asset = { id: "gear", title: "Gear" } as unknown as BuilderIconAsset;
  const frame: CellFrame = { index: 0, x: 100, y: 200, size: 60, glyph: 50, captionY: 0, captionSize: 0 };
  const style = DEFAULT_CONFIG.icons;

  it("an icon drawn in the middle of a big frame fills the glyph box, centred in the cell", () => {
    // 100×100 frame, ink 40×20 at (30,40): ink scaled to 50 wide, 25 tall, centred in the 60 px cell
    const cell = cellGroupOf({ code: wrap('<rect x="30" y="40" width="40" height="20"/>'), asset, frame, style });
    expect(cell.ok && cell.html).toContain('<rect x="105" y="217.5" width="50" height="25"');
  });

  it("an icon that already fills its viewBox is unchanged", () => {
    const cell = cellGroupOf({ code: wrap('<rect x="0" y="0" width="100" height="100"/>'), asset, frame, style });
    expect(cell.ok && cell.html).toContain('<rect x="105" y="205" width="50" height="50"');
  });

  it("a zero-width ink (one vertical line) is scaled by its height, never divided by zero", () => {
    const cell = cellGroupOf({ code: wrap('<line x1="50" y1="10" x2="50" y2="90"/>'), asset, frame, style });
    expect(cell.ok && cell.html).toContain('<line x1="130" y1="205" x2="130" y2="255"');
  });
});
