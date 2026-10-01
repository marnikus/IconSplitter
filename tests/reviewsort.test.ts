// reviewsort.test.ts — RULE 8: every sort mode + direction, status metadata
// and keyboard mapping (a11y §11: status is text-first, keys are testable).
import { describe, expect, it } from "vitest";
import { sortPairs, type SortState } from "../src/lib/reviewsort";
import { keyToAction, statusInfo } from "../src/lib/reviewmeta";
import type { ViewPair } from "../src/lib/reviewfilter";

function pair(id: string, dir: string, created: number, decision: ViewPair["decision"]): ViewPair {
  return {
    pairId: `pair_${id}`, base: id, relDir: dir,
    source: { relPath: `${dir}/${id}.png`, size: 1, mtime: created },
    ai: { relPath: `${dir}/${id}_AI.png`, size: 2, mtime: created + 1 },
    created, generated: created + 1, decision, reviewedAt: null,
  };
}

const A = pair("alpha", "zeta", 300, "pending");
const B = pair("beta", "alpha", 100, "approved");
const C = pair("gamma", "mid", 200, "declined");
const LIST = [A, B, C];

describe("sortPairs", () => {
  it("date asc/desc by creation time", () => {
    const asc: SortState = { by: "date", dir: "asc" };
    expect(sortPairs(LIST, asc).map((p) => p.base)).toEqual(["beta", "gamma", "alpha"]);
    const desc: SortState = { by: "date", dir: "desc" };
    expect(sortPairs(LIST, desc).map((p) => p.base)).toEqual(["alpha", "gamma", "beta"]);
  });

  it("status ranks pending < approved < declined, ties by date desc", () => {
    const s: SortState = { by: "status", dir: "asc" };
    expect(sortPairs(LIST, s).map((p) => p.decision)).toEqual(["pending", "approved", "declined"]);
    const tie = [pair("x", "d", 50, "pending"), pair("y", "d", 90, "pending")];
    expect(sortPairs(tie, s).map((p) => p.base)).toEqual(["y", "x"]);
  });

  it("name asc/desc case-insensitive on base", () => {
    const n: SortState = { by: "name", dir: "asc" };
    expect(sortPairs(LIST, n).map((p) => p.base)).toEqual(["alpha", "beta", "gamma"]);
    expect(sortPairs(LIST, { by: "name", dir: "desc" }).map((p) => p.base)).toEqual(["gamma", "beta", "alpha"]);
  });

  it("path asc uses dir/base, desc reverses, ties break on pairId", () => {
    const p: SortState = { by: "path", dir: "asc" };
    expect(sortPairs(LIST, p).map((p) => p.base)).toEqual(["beta", "gamma", "alpha"]);
    const same = [pair("b", "same", 1, "pending"), pair("a", "same", 1, "pending")];
    expect(sortPairs(same, p).map((x) => x.base)).toEqual(["a", "b"]);
  });
});

describe("statusInfo — text first, colour never alone (a11y)", () => {
  it("returns label + glyph for every decision", () => {
    expect(statusInfo("pending").label).toBe("Pending");
    expect(statusInfo("approved").label).toBe("Approved");
    expect(statusInfo("declined").label).toBe("Declined");
    expect(statusInfo("approved").glyph).not.toBe(statusInfo("declined").glyph);
  });
});

describe("keyToAction", () => {
  it("maps A/D/arrows/Space outside fields", () => {
    expect(keyToAction("a", false)).toBe("approve");
    expect(keyToAction("D", false)).toBe("decline");
    expect(keyToAction("ArrowDown", false)).toBe("next");
    expect(keyToAction("ArrowUp", false)).toBe("prev");
    expect(keyToAction(" ", false)).toBe("zoom");
  });

  it("is inert while typing in a field", () => {
    expect(keyToAction("a", true)).toBeNull();
    expect(keyToAction(" ", true)).toBeNull();
  });

  it("ignores unknown keys and modifier combos", () => {
    expect(keyToAction("x", false)).toBeNull();
  });
});
