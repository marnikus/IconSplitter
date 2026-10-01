// reviewselect.test.ts — RULE 8: checkbox selection is its own state, keyed
// by stable pair id, and never leaks into review status (spec V2 §5/§9).
import { describe, expect, it } from "vitest";
import { checkState, checkedInView, setChecked, toggleChecked } from "../src/lib/reviewselect";

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
