// @vitest-environment node
// reviewselect.test.ts — RULE 8: checkbox selection is its own state, keyed
// by stable pair id, and never leaks into review status (spec V2 §5/§9).
import { describe, expect, it } from "vitest";
import {
  applyRowGesture, checkState, checkedInView, nextPendingBelow, nextVisibleId, pruneRowSelection, sameRowSelection, selectIntent, selectOne, selectRange, setChecked, toggleChecked,
} from "../src/lib/reviewselect";

describe("toggleChecked", () => {
  it("adds an id and removes it again", () => {
    const one = toggleChecked([], "p1");
    expect(one).toEqual(["p1"]);
    expect(toggleChecked(one, "p1")).toEqual([]);
  });

  it("keeps other ids untouched and never duplicates", () => {
    expect(toggleChecked(["p1", "p2"], "p2")).toEqual(["p1"]);
    expect(toggleChecked(["p1"], "p1")).toEqual([]);
  });
});

describe("setChecked (select all / deselect all)", () => {
  it("adds every visible id once", () => {
    expect(setChecked(["p9"], ["p1", "p2"], true).sort()).toEqual(["p1", "p2", "p9"]);
  });

  it("removes exactly the given ids, keeping the rest", () => {
    expect(setChecked(["p1", "p2", "p3"], ["p2"], false)).toEqual(["p1", "p3"]);
  });

  it("deselect all empties the selection", () => {
    expect(setChecked(["p1", "p2"], ["p1", "p2"], false)).toEqual([]);
  });

  it("does not mutate the incoming array", () => {
    const before = ["p1"];
    setChecked(before, ["p2"], true);
    expect(before).toEqual(["p1"]);
  });
});

describe("checkState — header checkbox incl. indeterminate", () => {
  it("none when nothing visible is checked", () => {
    expect(checkState(["p1", "p2"], [])).toBe("none");
  });

  it("all when every visible id is checked", () => {
    expect(checkState(["p1", "p2"], ["p2", "p1"])).toBe("all");
  });

  it("some (indeterminate) when only part of the visible list is checked", () => {
    expect(checkState(["p1", "p2", "p3"], ["p2"])).toBe("some");
  });

  it("scopes to the visible list: checks hidden by a filter do not make it 'all'", () => {
    expect(checkState(["p1"], ["p1", "p2"])).toBe("all");
    expect(checkState(["p2"], ["p1"])).toBe("none");
  });

  it("none for an empty visible list (select-all would be a no-op)", () => {
    expect(checkState([], ["p1"])).toBe("none");
  });
});

describe("checkedInView — what a bulk action may touch", () => {
  it("returns only ids that are both checked and visible, in visible order", () => {
    expect(checkedInView(["p3", "p1", "p2"], ["p1", "p9"])).toEqual(["p1"]);
  });

  it("empty when nothing is checked", () => {
    expect(checkedInView(["p1"], [])).toEqual([]);
  });
});

describe("explorer-style selection", () => {
  const ORDER = ["a", "b", "c", "d"];

  it("maps modifiers to an intent, shift winning over ctrl", () => {
    expect(selectIntent({})).toBe("replace");
    expect(selectIntent({ shiftKey: true })).toBe("range");
    expect(selectIntent({ ctrlKey: true })).toBe("toggle");
    expect(selectIntent({ altKey: true })).toBe("toggle");
    expect(selectIntent({ metaKey: true })).toBe("toggle");
    expect(selectIntent({ shiftKey: true, ctrlKey: true })).toBe("range");
  });

  it("selectOne is a single-id range fallback, not the plain-row gesture", () => {
    expect(selectOne("b")).toEqual(["b"]);
  });

  it("shift+click covers the range in either direction", () => {
    expect(selectRange(ORDER, "a", "c")).toEqual(["a", "b", "c"]);
    expect(selectRange(ORDER, "d", "b")).toEqual(["b", "c", "d"]);
    expect(selectRange(ORDER, "b", "b")).toEqual(["b"]);
  });

  it("falls back to the single row when there is no usable anchor", () => {
    expect(selectRange(ORDER, null, "c")).toEqual(["c"]);
    expect(selectRange(ORDER, "gone", "c")).toEqual(["c"]);
    expect(selectRange(ORDER, "a", "gone")).toEqual(["gone"]);
  });

  it("ctrl+click toggles one row and leaves the others alone", () => {
    expect(toggleChecked(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleChecked(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("nextVisibleId — arrow-key active row navigation", () => {
  const order = ["a", "b", "c"];

  it("starts at the first or last visible row when none is active", () => {
    expect(nextVisibleId(order, null, 1)).toBe("a");
    expect(nextVisibleId(order, null, -1)).toBe("c");
  });

  it("moves in visible order and stops at either edge", () => {
    expect(nextVisibleId(order, "a", 1)).toBe("b");
    expect(nextVisibleId(order, "b", -1)).toBe("a");
    expect(nextVisibleId(order, "c", 1)).toBe("c");
    expect(nextVisibleId(order, "a", -1)).toBe("a");
  });

  it("does not invent a target for an empty visible list", () => {
    expect(nextVisibleId([], null, 1)).toBeNull();
  });
});

describe("sameRowSelection — skip gestures that made no change", () => {
  const before = { checked: ["a", "b"], active: "b", anchor: "a" };

  it("compares checked ids by value, not array identity", () => {
    expect(sameRowSelection(before, { checked: ["a", "b"], active: "b", anchor: "a" })).toBe(true);
  });

  it("detects changes to checks, active target and anchor separately", () => {
    expect(sameRowSelection(before, { ...before, checked: ["a"] })).toBe(false);
    expect(sameRowSelection(before, { ...before, active: "a" })).toBe(false);
    expect(sameRowSelection(before, { ...before, anchor: "b" })).toBe(false);
  });
});

describe("applyRowGesture — Batch-style active row versus checked rows", () => {
  const visibleIds = ["a", "b", "c", "d"];

  it("a plain row click only activates and anchors, preserving checked ids even when hidden", () => {
    const before = { checked: ["a", "hidden"], active: "a", anchor: "a" };
    const after = applyRowGesture(before, { id: "c", intent: "replace", visibleIds });
    expect(after).toEqual({ checked: ["a", "hidden"], active: "c", anchor: "c" });
    expect(before).toEqual({ checked: ["a", "hidden"], active: "a", anchor: "a" });
  });

  it("Shift checks the inclusive visible range from the plain-click anchor as one transition", () => {
    const before = applyRowGesture({ checked: [], active: null, anchor: null },
      { id: "d", intent: "replace", visibleIds });
    expect(applyRowGesture(before, { id: "b", intent: "range", visibleIds }))
      .toEqual({ checked: ["b", "c", "d"], active: "b", anchor: "b" });
  });

  it("Shift falls back to the clicked row when a restored anchor is absent or hidden", () => {
    for (const anchor of [null, "filtered-out"]) {
      expect(applyRowGesture({ checked: ["a"], active: "a", anchor },
        { id: "c", intent: "range", visibleIds }))
        .toEqual({ checked: ["c"], active: "c", anchor: "c" });
    }
  });

  it("Ctrl, Alt and Meta toggle one check, activate it and preserve the original anchor", () => {
    for (const mods of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }]) {
      const gesture = { id: "c", intent: selectIntent(mods), visibleIds };
      const before = { checked: ["a", "hidden"], active: "a", anchor: "a" };
      expect(applyRowGesture(before, gesture))
        .toEqual({ checked: ["a", "hidden", "c"], active: "c", anchor: "a" });
      expect(applyRowGesture({ ...before, checked: ["a", "hidden", "c"] }, gesture))
        .toEqual({ checked: ["a", "hidden"], active: "c", anchor: "a" });
    }
  });
});

describe("pruneRowSelection — removed sources are never targets", () => {
  it("removes vanished checks and clears a vanished active row and Shift anchor", () => {
    const before = { checked: ["present", "removed"], active: "removed", anchor: "removed" };
    expect(pruneRowSelection(before, new Set(["present"])))
      .toEqual({ checked: ["present"], active: null, anchor: null });
    expect(before.checked).toEqual(["present", "removed"]);
  });

  it("treats a completed empty scan as no selectable sources", () => {
    expect(pruneRowSelection({ checked: ["old"], active: "old", anchor: "old" }, new Set()))
      .toEqual({ checked: [], active: null, anchor: null });
  });
});

describe("nextPendingBelow", () => {
  const rows = [
    { id: "z", pending: true }, { id: "a", pending: false },
    { id: "c", pending: false }, { id: "b", pending: true },
  ];
  const next = (visible: typeof rows, from: string) => nextPendingBelow(visible, from, (r) => r.id, (r) => r.pending);
  it("uses supplied order, skipping reviewed rows and never mutating it", () => {
    const before = rows.map((r) => ({ ...r }));
    expect(next(rows, "z")).toBe("b");
    expect(rows).toEqual(before);
    expect(next([rows[3], rows[0]], "b")).toBe("z");
  });
  it("never wraps or guesses when the anchor is hidden or absent", () => {
    expect(next(rows, "b")).toBeNull();
    expect(next(rows, "hidden")).toBeNull();
    expect(next([], "z")).toBeNull();
    expect(next([rows[0], rows[1], rows[2]], "z")).toBeNull();
  });
});
