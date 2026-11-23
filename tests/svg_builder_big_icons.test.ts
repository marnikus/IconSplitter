// svg_builder_big_icons.test.ts — big icons over 2 × 2 cells (2026-11-23): a
// merge (config.grid.merges) turns four cells of a 2 × 2 square into ONE cell
// as big as the four; its icon is the one of the cell marked first, it has its
// own stroke width (0 = the sheet's). The other three cells leave the cell list
// (slots), so every pick sees one cell; their icons wait in the stored grid
// positions and come back when the big icon is broken.
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseSheetConfig } from "../src/lib/svgBuilder/config";
import { computeLayout } from "../src/lib/svgBuilder/layout";
import { composeSheet } from "../src/lib/svgBuilder/compose";
import { gapStrips } from "../src/lib/svgBuilder/gapdrag";
import { activeMerges, mergeFromMarks, toFull, toSlots } from "../src/lib/svgBuilder/merges";
import type { SheetConfig } from "../src/lib/svgBuilder/types";

type Merge = SheetConfig["grid"]["merges"][number];
const cfg = (merges: Merge[], grid: Partial<SheetConfig["grid"]> = {}) =>
  parseSheetConfig({ ...DEFAULT_CONFIG, grid: { ...DEFAULT_CONFIG.grid, columns: 4, rows: 3, captions: false, ...grid, merges } });
const m = (col: number, row: number, pick = 0, strokeWidth = 0): Merge => ({ col, row, pick, strokeWidth });
const ids = (n: number) => Array.from({ length: n }, (_, i) => `i${i}`);

describe("big icons over 2 × 2 cells (2026-11-23)", () => {
  it("merges are validated: whole numbers in range, pick 0–3, an own stroke width or 0; junk drops", () => {
    expect(DEFAULT_CONFIG.grid.merges).toEqual([]);
    const g = parseSheetConfig({ grid: { merges: [{ col: 1, row: 2, pick: 3, strokeWidth: 2.2 }, { col: -1, row: 0 }, "x", { col: 0, row: 0, pick: 9, strokeWidth: 99 }] } }).grid;
    expect(g.merges).toEqual([{ col: 1, row: 2, pick: 3, strokeWidth: 2.2 }, { col: 0, row: 0, pick: 0, strokeWidth: 5 }]);
  });

  it("only merges inside the grid and not overlapping an earlier one are active", () => {
    const grid = cfg([m(0, 0), m(1, 1), m(3, 0), m(2, 1)]).grid; // (1,1) overlaps (0,0); (3,0) leaves the grid
    expect(activeMerges(grid).map((a) => [a.cells, a.source])).toEqual([[[0, 1, 4, 5], 0], [[6, 7, 10, 11], 6]]);
  });

  it("the big cell fills the 2 × 2 area; the three others leave the cell list; slots are renumbered", () => {
    const plain = computeLayout(cfg([]));
    const big = computeLayout(cfg([m(1, 0, 3, 2.5)]));
    expect(big.capacity).toBe(12 - 3);
    const cell = big.cells.find((c) => c.span === 2)!;
    const [a, b2] = [plain.cells[1], plain.cells[6]];
    const width = b2.x + b2.size - a.x, height = b2.y + b2.size - a.y;
    expect(cell.size).toBeCloseTo(Math.min(width, height));
    expect(cell.x + cell.size / 2).toBeCloseTo(a.x + width / 2);
    expect(cell).toMatchObject({ pos: 6, stroke: 2.5 }); // pick 3 = the bottom-right cell's icon
    expect(big.cells.map((c) => c.index)).toEqual([...Array(9).keys()]);
    expect(big.cells.map((c) => c.pos)).toEqual([0, 3, 4, 6, 7, 8, 9, 10, 11]);
  });

  it("slots ↔ grid positions: hidden cells keep their icons; a revealed duplicate becomes empty", () => {
    const grid = cfg([m(0, 0, 0)]).grid;
    const full = ids(12);
    const slots = toSlots(full, grid);
    expect(slots).toEqual(["i0", "i2", "i3", "i6", "i7", "i8", "i9", "i10", "i11"]);
    const back = toFull(["n0", ...slots.slice(1)], grid, full);
    expect(back.slice(0, 6)).toEqual(["n0", "i1", "i2", "i3", "i4", "i5"]); // the hidden 1, 4, 5 kept
    expect(toSlots(full, cfg([]).grid)).toBe(full); // no merge: the very same list
    const dup = toSlots(["a", "b", "c", "d", "b"], cfg([m(2, 1)]).grid);
    expect(dup.filter((id) => id === "b")).toHaveLength(1); // a repeat would shift every later cell
    expect(dup).toHaveLength(4); // the emptied repeat was the last: trailing holes go
  });

  it("four marked cells of a 2 × 2 square make a merge (the first marked gives the icon); anything else does not", () => {
    const grid = cfg([]).grid;
    expect(mergeFromMarks([5, 1, 0, 4], grid)).toEqual(m(0, 0, 3)); // 5 = bottom-right of the square
    expect(mergeFromMarks([0, 1, 2, 4], grid)).toBeNull();
    expect(mergeFromMarks([3, 4, 7, 8], grid)).toBeNull(); // wraps a row end
    expect(mergeFromMarks([0, 1, 4], grid)).toBeNull();
  });

  it("composes the big icon bigger, with its own stroke; gaps are only between plain neighbours", () => {
    const config = cfg([m(0, 0, 0, 3)]);
    const layout = computeLayout(config);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18v18H3z"/></svg>';
    const assets = ["a", "b"].map((id) => ({ id, base: id, suffix: "", label: id, category: "c", tags: [], svgPath: `${id}.svg`, svgName: `${id}.svg`,
      version: 1, fingerprint: id, metaPath: `${id}.json`, approved: true as const }));
    const doc = composeSheet({ config, layout, assets, placedIds: ["a", "b"], svgTexts: { a: svg, b: svg } });
    const spanOf = (id: string) => Number(new RegExp(`data-asset-id="${id}" data-approved="true" data-cell-index="[0-9]+"[^>]*><path d="M[\\d.]+ [\\d.]+h([\\d.]+)`).exec(doc.svg)![1]);
    const widthOf = (id: string) => Number(new RegExp(`data-asset-id="${id}" data-approved="true" data-cell-index="[0-9]+"[^>]*stroke-width="([\\d.]+)"`).exec(doc.svg)![1]);
    expect(spanOf("a")).toBeGreaterThan(spanOf("b") * 1.9);
    expect(widthOf("a")).toBeCloseTo(3, 1); // direct 3 artboard px (RULE 26)
    expect(widthOf("b")).toBeCloseTo(config.icons.strokeWidth, 1);
    expect(gapStrips(config, layout).every((s) => !["x-0", "y-0"].includes(s.id))).toBe(true);
  });
});
