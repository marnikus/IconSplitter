// selectiondelta.test.ts — the compact selection history payload. A delta must
// restore the EXACT selection array (order included: selection order is the
// request order) and must never invent, duplicate or lose an id.
import { describe, expect, it } from "vitest";
import {
  applySelectionOp, applySelectionPayload, diffSelection, invertSelectionOp,
  readSelectionPayload, selectionPayloads, touchedIds, type SelectionOp,
} from "../src/lib/selectiondelta";
import type { RowSelection } from "../src/lib/reviewselect";

const ids = (n: number, prefix = "id") => Array.from({ length: n }, (_, i) => `${prefix}-${i}`);

/** Forward then inverse must be the identity, whatever the edit was. */
function roundTrip(before: string[], after: string[]): void {
  const forward = diffSelection(before, after);
  expect(applySelectionOp(before, forward)).toEqual(after);
  expect(applySelectionOp(after, invertSelectionOp(forward))).toEqual(before);
  const inverse = invertSelectionOp(forward);
  expect(applySelectionOp(after, inverse)).toEqual(before);
  expect(applySelectionOp(before, invertSelectionOp(inverse))).toEqual(after);
}

describe("diffSelection", () => {
  it("records one insertion as one run at its destination index", () => {
    expect(diffSelection(["a", "c"], ["a", "b", "c"])).toEqual({
      removed: [], added: [{ at: 1, ids: ["b"] }],
    });
  });

  it("records one removal as one run at its original index", () => {
    expect(diffSelection(["a", "b", "c"], ["a", "c"])).toEqual({
      removed: [{ at: 1, ids: ["b"] }], added: [],
    });
  });

  it("collapses a contiguous block into a single run, not one entry per id", () => {
    const added = diffSelection([], ["a", "b", "c"]).added;
    expect(added).toEqual([{ at: 0, ids: ["a", "b", "c"] }]);
    // contiguity is positional: the ids land next to each other, so one run
    expect(diffSelection([], ["a", "c"]).added).toEqual([{ at: 0, ids: ["a", "c"] }]);
    // a gap in the RESULT (index 1 belongs to an untouched id) splits the run
    expect(diffSelection(["m"], ["a", "m", "c"]).added).toEqual([{ at: 0, ids: ["a"] }, { at: 2, ids: ["c"] }]);
  });

  it("keeps selection order when several ids are added out of list order", () => {
    // selection order is the request order (RULE 10) — it is not sorted
    roundTrip(["z"], ["z", "y", "x"]);
    roundTrip([], ["c", "a", "b"]);
    roundTrip(["b", "a"], ["b", "a", "d", "c"]);
  });

  it("round-trips reordering existing ids (Shift after sorting), including mixed edits", () => {
    roundTrip(["c", "a", "b"], ["a", "b", "c"]);
    roundTrip(["a", "b", "c"], ["c", "b", "a"]);
    roundTrip(["z", "a", "b", "c"], ["b", "a", "new", "c"]);
  });

  it("round-trips every mixed edit", () => {
    roundTrip([], ids(5));
    roundTrip(ids(5), []);
    roundTrip(ids(20), ids(20).filter((_, i) => i % 3 !== 0));
    roundTrip(ids(20).filter((_, i) => i % 2 === 0), ids(20).filter((_, i) => i % 2 === 1));
    roundTrip(["a", "b"], ["a", "b"]); // no change at all
  });

  it("round-trips a 1,000-row selection toggle", () => {
    const all = ids(1000);
    roundTrip(all, all.filter((id) => id !== "id-500"));
    roundTrip([], all);
    roundTrip(all, []);
  });
});

describe("applySelectionOp", () => {
  const before = ["a", "b", "c"];

  it("removes then inserts, ascending", () => {
    const op: SelectionOp = { removed: [{ at: 0, ids: ["a", "b"] }], added: [{ at: 2, ids: ["x"] }] };
    expect(applySelectionOp(before, op)).toEqual(["c", "x"]);
  });

  it("rejects a malformed payload instead of guessing", () => {
    expect(applySelectionOp(before, { removed: [{ at: 9, ids: ["a"] }], added: [] })).toEqual(before.filter((x) => x !== "a"));
    expect(applySelectionOp(before, { removed: [], added: [{ at: 99, ids: ["x"] }] })).toEqual(["a", "b", "c", "x"]);
    expect(applySelectionOp(before, { removed: [{ at: 0 } as never], added: [] })).toBeNull();
    expect(applySelectionOp(before, { removed: "nope" as never, added: [] })).toBeNull();
    expect(applySelectionOp(before, { removed: [{ at: 0, ids: [] }], added: [] })).toBeNull();
  });

  it("stays exact when the live selection moved on (id-based fallback)", () => {
    // another tab added "d" after the gesture: the recorded indices no longer fit
    expect(applySelectionOp(["x", "a", "b", "c", "d"], { removed: [{ at: 0, ids: ["a"] }], added: [] })).toEqual(["x", "b", "c", "d"]);
  });

  it("never duplicates an id, even when the payload tries", () => {
    const out = applySelectionOp(["a", "b"], { removed: [], added: [{ at: 0, ids: ["a"] }] });
    expect(out).toEqual(["a", "b"]);
    expect(applySelectionOp([], { removed: [], added: [{ at: 0, ids: ["x", "x"] }] })).toEqual(["x"]);
  });
});

describe("payloads", () => {
  const sel = (checked: string[], active: string | null = null, anchor: string | null = null): RowSelection => ({ checked, active, anchor });

  it("writes both directions so undo and redo are self-contained", () => {
    const before = sel(["a", "b"], "a", "a");
    const after = sel(["a", "b", "c"], "c", "b");
    const p = selectionPayloads(before, after);
    expect(applySelectionPayload(p.after, before.checked)).toEqual(after.checked);
    expect(applySelectionPayload(p.before, after.checked)).toEqual(before.checked);
    expect(p.after.active).toBe("c");
    expect(p.before.active).toBe("a");
    expect(p.after.anchor).toBe("b");
  });

  it("records an active-only move with no ids", () => {
    const p = selectionPayloads(sel(["a"], "a", "a"), sel(["a"], "b", "a"));
    expect(p.after.sel).toEqual({ removed: [], added: [] });
    expect(p.after.active).toBe("b");
    expect(p.before.active).toBe("a");
  });

  it("reads an old absolute payload as absent, so the caller keeps compatibility", () => {
    expect(readSelectionPayload({ ids: ["a"], anchor: null, active: null })).toBeNull();
    expect(readSelectionPayload({ ids: ["a"] })).toBeNull();
    expect(readSelectionPayload(null)).toBeNull();
    expect(readSelectionPayload({ sel: { removed: [], added: [] }, anchor: null, active: "x" })?.active).toBe("x");
  });

  it("refuses a payload without both sides validated", () => {
    expect(applySelectionPayload({ sel: { removed: [{ at: 0 }], added: [] }, anchor: null, active: null }, ["a"])).toBeNull();
    expect(applySelectionPayload({ sel: { removed: [], added: [] }, anchor: 5, active: null }, ["a"])).toBeNull();
  });
});

describe("payload size", () => {
  it("does not grow with the selection size", () => {
    const all = ids(1000);
    const payload = selectionPayloads({ checked: all, active: null, anchor: null }, { checked: all.filter((id) => id !== "id-7"), active: null, anchor: null });
    const bytes = JSON.stringify(payload).length;
    const absolute = JSON.stringify({ ids: all, anchor: null, active: null }).length;
    expect(bytes).toBeLessThan(400);
    expect(absolute).toBeGreaterThan(bytes * 20); // 1,000 ids vs one delta
  });

  it("never lists more touched ids than the cap, and stays ordered", () => {
    const all = ids(1000);
    expect(touchedIds([], all)).toHaveLength(24); // capped: the delta carries the truth
    const touched = touchedIds([], all, 4);
    expect(touched).toHaveLength(4);
    expect(touchedIds(["b", "a"], ["a", "c"])).toEqual(["b", "c"]);
  });
});
