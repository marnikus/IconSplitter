// selection_nav.test.ts — RULE 8: navigation, bulk decisions, multi-select,
// active-row reconciliation and the All-decisions filter contract.
import { describe, expect, it } from "vitest";
import {
  applyScan, bulkDecide, initialSelState, moveActive, reconcileActive,
  selectVisible, toggleSelect, withDecision, type SelState,
} from "../src/selection/state";
import { applyFilters, ALL_FILTER, type ViewPair } from "../src/lib/reviewfilter";
import { keyToAction } from "../src/lib/reviewmeta";
import type { ReviewPair } from "../src/lib/pairing";

function pair(id: string, t: number): ReviewPair {
  return {
    pairId: id, base: id, relDir: "d",
    source: { relPath: `d/${id}.png`, size: 1, mtime: t },
    ai: { relPath: `d/${id}_AI.png`, size: 2, mtime: t + 1 },
    created: t, generated: t + 1,
  };
}

const THREE = [pair("a", 1), pair("b", 2), pair("c", 3)];

function base() {
  return applyScan(initialSelState(), THREE, { records: [], corrupt: false }, 1);
}

const ids = (l: { pairId: string }[]) => l.map((x) => x.pairId);

describe("moveActive — arrows/W/S order, reviewed rows included", () => {
  it("moves forward and backward through pending AND reviewed rows", () => {
    let s = withDecision(base(), "b", "approved", "t1");
    s = moveActive(s, ["a", "b", "c"], 1);
    expect(s.selectedId).toBe("b"); // reviewed rows are navigable
    s = moveActive(s, ["a", "b", "c"], 1);
    expect(s.selectedId).toBe("c");
    s = moveActive(s, ["a", "b", "c"], -1);
    expect(s.selectedId).toBe("b");
  });

  it("does not wrap at the ends by default", () => {
    let s = moveActive(base(), ["a", "b", "c"], -1); // at "a", back stays
    expect(s.selectedId).toBe("a");
    s = moveActive(s, ["a", "b", "c"], 1);
    s = moveActive(s, ["a", "b", "c"], 1);
    s = moveActive(s, ["a", "b", "c"], 1); // at "c", forward stays
    expect(s.selectedId).toBe("c");
  });

  it("wraps only when the wrap setting is on", () => {
    let s = { ...base(), wrap: true };
    s = moveActive(s, ["a", "b", "c"], -1);
    expect(s.selectedId).toBe("c");
    s = moveActive(s, ["a", "b", "c"], 1);
    expect(s.selectedId).toBe("a");
  });

  it("follows the filtered/sorted order passed in, not raw pair order", () => {
    const s = moveActive(base(), ["c", "a"], 1); // visible order c,a
    expect(s.selectedId).toBe("a");
  });
});

describe("keyToAction — W/S added", () => {
  it("maps w/s to prev/next and ignores them in fields", () => {
    expect(keyToAction("w", false)).toBe("prev");
    expect(keyToAction("S", false)).toBe("next");
    expect(keyToAction("w", true)).toBeNull();
  });
});

describe("changing previous decisions", () => {
  it("approve -> decline -> approve replaces, never duplicates records", () => {
    let s = withDecision(base(), "a", "approved", "t1");
    s = withDecision(s, "a", "declined", "t2");
    s = withDecision(s, "a", "approved", "t3");
    expect(s.pairs.find((p) => p.pairId === "a")?.reviewedAt).toBe("t3");
    expect(s.records.filter((r) => r.pair_id === "a")).toHaveLength(1);
    expect(s.records[0].decision).toBe("approved");
  });
});

describe("bulkDecide", () => {
  it("applies one decision to every listed pair, replacing old ones", () => {
    let s = withDecision(base(), "b", "approved", "t1");
    s = bulkDecide(s, ["a", "b"], "declined", "t2");
    const got = s.pairs.filter((p) => ["a", "b"].includes(p.pairId));
    expect(got.every((p) => p.decision === "declined" && p.reviewedAt === "t2")).toBe(true);
    expect(s.records).toHaveLength(2);
  });

  it("ignores ids that are not present", () => {
    const s = bulkDecide(base(), ["nope"], "approved", "t");
    expect(s.records).toHaveLength(0);
  });
});

describe("selection set", () => {
  it("toggles one and selects/deselects visible ids only", () => {
    let s = toggleSelect(base(), "a");
    expect(s.selectedIds).toEqual(["a"]);
    s = selectVisible(s, ["a", "b", "c"], true);
    expect([...s.selectedIds].sort()).toEqual(["a", "b", "c"]);
    s = selectVisible(s, ["b"], false);
    expect([...s.selectedIds].sort()).toEqual(["a", "c"]);
  });
});

describe("reconcileActive after filter changes", () => {
  it("keeps the active pair when still visible", () => {
    const s = reconcileActive(base(), ["a", "b", "c"]);
    expect(s.selectedId).toBe("a");
  });

  it("picks the nearest visible pair when the active one is filtered out", () => {
    let s: SelState = { ...base(), selectedId: "b" };
    s = reconcileActive(s, ["a", "c"]); // b hidden: nearest by position
    expect(["a", "c"]).toContain(s.selectedId);
    expect(s.selectedId).toBe("a"); // b sat between; take the earlier slot
  });

  it("nulls safely when nothing is visible", () => {
    expect(reconcileActive(base(), []).selectedId).toBeNull();
  });
});

describe("All decisions filter contract", () => {
  it("shows pending, approved and declined together; singles stay single", () => {
    let s = withDecision(base(), "a", "approved", "t");
    s = withDecision(s, "c", "declined", "t");
    const all = applyFilters(s.pairs, ALL_FILTER);
    expect(ids(all).sort()).toEqual(["a", "b", "c"]);
    expect(applyFilters(s.pairs, { ...ALL_FILTER, status: "approved" }).map((p) => p.pairId)).toEqual(["a"]);
    expect(applyFilters(s.pairs, { ...ALL_FILTER, status: "pending" }).map((p) => p.pairId)).toEqual(["b"]);
    expect(applyFilters(s.pairs, { ...ALL_FILTER, status: "declined" }).map((p) => p.pairId)).toEqual(["c"]);
  });

  it("missing-side pairs stay visible under All decisions", () => {
    const broken: ViewPair = { ...pair("x", 9), ai: null, decision: "pending", reviewedAt: null };
    const s = applyScan(initialSelState(), [pair("a", 1), broken], { records: [], corrupt: false }, 1);
    expect(ids(applyFilters(s.pairs, ALL_FILTER)).sort()).toEqual(["a", "x"]);
  });
});
