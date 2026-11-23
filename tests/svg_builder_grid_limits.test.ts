// svg_builder_grid_limits.test.ts — sheets up to 100 columns × 100 rows
// (2026-11-23): the range table, the placeholder ids for empty cells and every
// saved list follow; empty cells are filled in one pass however big the sheet.
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseSheetConfig } from "../src/lib/svgBuilder/config";
import { RANGES } from "../src/lib/svgBuilder/ranges";
import { MAX_SLOTS, isEmptySlot, padEmpty, withEmptyFor } from "../src/lib/svgBuilder/slots";
import { newTemplate } from "../src/lib/svgBuilder/templates";
import { newArtboard, parseArtboards } from "../src/lib/svgBuilder/artboards";
import { resolveIcons } from "../src/lib/svgBuilder/presetjson";

describe("grid up to 100 × 100 (2026-11-23)", () => {
  it("columns and rows go to 100 and clamp above", () => {
    expect([RANGES.columns.max, RANGES.rows.max]).toEqual([100, 100]);
    expect(parseSheetConfig({ grid: { columns: 100, rows: 100 } }).grid).toMatchObject({ columns: 100, rows: 100 });
    expect(parseSheetConfig({ grid: { columns: 250, rows: 101 } }).grid).toMatchObject({ columns: 100, rows: 100 });
    expect(MAX_SLOTS).toBe(10_000);
  });

  it("fills and empties cells in one pass, every placeholder unique", () => {
    const full = padEmpty(["a", "~empty:0", "b"], 10_000);
    expect(full).toHaveLength(10_000);
    expect(new Set(full).size).toBe(10_000);
    expect(full.slice(0, 3)).toEqual(["a", "~empty:0", "b"]);
    const emptied = withEmptyFor(["a", "b", "~empty:0", "c"], (id) => id === "b" || id === "c");
    expect(emptied[0]).toBe("a");
    expect([emptied[1], emptied[3]].every(isEmptySlot)).toBe(true);
    expect(new Set(emptied).size).toBe(4);
  });

  it("a big artboard keeps all its cells; a preset names thousands of icons", () => {
    const tpl = newTemplate(parseSheetConfig({ ...DEFAULT_CONFIG, grid: { ...DEFAULT_CONFIG.grid, columns: 50, rows: 50 } }), [], "t", "t1");
    const ids = Array.from({ length: 2500 }, (_, i) => `p${i}`);
    const art = { ...newArtboard(tpl, [], { now: "t", id: "a1", placedIds: ids }), lockedIds: ids.slice(0, 300) };
    const [read] = parseArtboards([art]);
    expect([read.placedIds.length, read.lockedIds.length]).toEqual([2500, 300]);
    const assets = ids.map((id) => ({ id, name: id, title: id, label: id, base: id, suffix: "" })) as never;
    const resolved = resolveIcons([...ids.map((id) => ({ id })), null, { id: "p0" }], assets);
    expect(resolved.ids).toHaveLength(2502);
    expect(resolved.ids.slice(2500).every(isEmptySlot)).toBe(true); // null and a repeat: empty cells
  });
});
