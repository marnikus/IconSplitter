import { expect, it } from "vitest";
import type { Box } from "../src/lib/detect";
import { exportSheets, exportTotal, fracToPercent, includedBoxes, mergeTargets, percentToFrac, toggleIndex } from "../src/lib/sheetsel";

const box = (x: number): Box => ({ x, y: 0, w: 10, h: 10, ink: 50 });
const sheet = (id: string, n: number, excluded: number[] = []) => ({ id, boxes: Array.from({ length: n }, (_, i) => box(i * 20)), excluded });
const a = sheet("a", 3, [1]), b = sheet("b", 2), c = sheet("c", 4, [0, 3]);

it("includedBoxes keeps detection indices of the included icons", () => {
  expect(includedBoxes(a).map((x) => x.i)).toEqual([0, 2]);
  expect(includedBoxes(sheet("e", 0))).toEqual([]);
});

it("exportSheets and exportTotal count only checked sheets, in list order", () => {
  expect(exportSheets([a, b, c], ["c", "a"]).map((s) => s.id)).toEqual(["a", "c"]);
  expect(exportTotal([a, b, c], ["a", "c"])).toBe(4);
  expect(exportTotal([a, b, c], [])).toBe(0);
});

it("mergeTargets reaches all checked sheets only when the active one is checked", () => {
  expect(mergeTargets([a, b, c], ["a", "c"], "c")).toEqual(["a", "c"]);
  expect(mergeTargets([a, b, c], ["a", "c"], "b")).toEqual(["b"]);
  expect(mergeTargets([a, b, c], ["a"], null)).toEqual([]);
  expect(mergeTargets([a, b, c], ["a"], "gone")).toEqual([]);
});

it("toggleIndex adds and removes one index", () => {
  expect(toggleIndex([1, 3], 3)).toEqual([1]);
  expect(toggleIndex([1], 2)).toEqual([1, 2]);
});

it("merge distance converts between fraction and a clamped percent", () => {
  expect(fracToPercent(0.0325)).toBe(3.25);
  expect(fracToPercent(0.123456)).toBe(12.35);
  expect(percentToFrac(2.5)).toBe(0.025);
  expect(percentToFrac(60)).toBe(0.15);
  expect(percentToFrac(-4)).toBe(0);
  expect(percentToFrac(Number.NaN)).toBeNull();
});
