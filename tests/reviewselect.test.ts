// reviewselect.test.ts — RULE 8: checkbox selection is its own state, keyed
// by stable pair id, and never leaks into review status (spec V2 §5/§9).
import { describe, expect, it } from "vitest";
import {
  checkState, checkedInView, selectIntent, selectOne, selectRange, setChecked, toggleChecked,
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

  it("a plain click selects that row alone", () => {
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
