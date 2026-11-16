// @vitest-environment node
// Pure random-selection rules shared by SVG to upload and Upload (2026-11-08).
import { describe, expect, it } from "vitest";
import { drawRandomIds, normalizeRandomCount, randomSelectionMessage, randomSelectionPool } from "../src/lib/randomselect";
import { randomBatchOrder } from "../src/lib/randomorder";
import { randomBatchOrder as gettyExport } from "../src/lib/stockupload/gettyweb";

describe("normalizeRandomCount", () => {
  it("keeps whole numbers above 1 and floors fractions", () => {
    expect(normalizeRandomCount(2)).toBe(2);
    expect(normalizeRandomCount("17")).toBe(17);
    expect(normalizeRandomCount(5.9)).toBe(5);
  });
  it("rejects empty, non-finite and below-2 values to the default 2", () => {
    for (const raw of [null, undefined, "", "  ", NaN, Infinity, -3, 0, 1, 1.9, "abc", {}]) {
      expect(normalizeRandomCount(raw)).toBe(2);
    }
  });
  it("never returns an unsafe integer", () => {
    expect(normalizeRandomCount(1e30)).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("randomSelectionPool", () => {
  const all = ["a", "b", "c", "d"];
  it("uses the whole list when nothing is checked, deduplicated in list order", () => {
    expect(randomSelectionPool([...all, "a"], [])).toEqual(all);
  });
  it("narrows to existing checks, ignoring stale ids and keeping list order", () => {
    expect(randomSelectionPool(all, ["c", "gone", "a", "c"])).toEqual(["a", "c"]);
  });
  it("does not mutate its inputs", () => {
    const checked = ["b"];
    randomSelectionPool(all, checked);
    expect(all).toEqual(["a", "b", "c", "d"]);
    expect(checked).toEqual(["b"]);
  });
});

describe("drawRandomIds", () => {
  const pool = ["a", "b", "c", "d", "e"];
  it("draws exactly N distinct ids from the pool", () => {
    const drawn = drawRandomIds(pool, 3, () => 0.4);
    expect(drawn).toHaveLength(3);
    expect(new Set(drawn).size).toBe(3);
    for (const id of drawn) expect(pool).toContain(id);
  });
  it("caps N at the pool size instead of failing or repeating items", () => {
    expect(drawRandomIds(pool, 99, () => 0).sort()).toEqual([...pool].sort());
    expect(drawRandomIds(["only"], 50)).toEqual(["only"]);
    expect(drawRandomIds([], 5)).toEqual([]);
  });
  it("normalizes the requested count before drawing", () => {
    expect(drawRandomIds(pool, 1)).toHaveLength(2);
    expect(drawRandomIds(pool, "2.7")).toHaveLength(2);
  });
  it("actually shuffles rather than taking the first N", () => {
    expect(drawRandomIds(pool, 2, () => 0)).not.toEqual(["a", "b"]);
  });
});

describe("randomSelectionMessage", () => {
  it("names the drawn count with the right plural", () => {
    expect(randomSelectionMessage(1)).toBe("Selected 1 random item");
    expect(randomSelectionMessage(3)).toBe("Selected 3 random items");
  });
});

describe("randomBatchOrder extraction", () => {
  it("keeps the Getty re-export identical to the shared implementation", () => {
    expect(gettyExport).toBe(randomBatchOrder);
    expect(randomBatchOrder(4, () => 0.5)).toEqual([0, 3, 1, 2]);
    expect(randomBatchOrder(0)).toEqual([]);
  });
});
