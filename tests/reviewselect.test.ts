// reviewselect.test.ts — RULE 8: multi-selection model for the review list.
// Selection is scope-checked (visible list) and always separate from status.
import { describe, expect, it } from "vitest";
import {
  headerCheck, hiddenIds, intersectIds, pruneIds, toggleId, unionIds,
} from "../src/lib/reviewselect";

describe("toggleId", () => {
  it("adds an unchecked id and removes a checked one", () => {
    expect(toggleId([], "a")).toEqual(["a"]);
    expect(toggleId(["a", "b"], "b")).toEqual(["a"]);
  });

  it("keeps other ids intact (multi-select one by one)", () => {
    expect(toggleId(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    expect(toggleId(["a", "b", "c"], "a")).toEqual(["b", "c"]);
  });
});

describe("unionIds", () => {
  it("adds every visible id exactly once (Select all over the filtered list)", () => {
    expect(unionIds([], ["a", "b"])).toEqual(["a", "b"]);
    expect(unionIds(["a", "x"], ["a", "b"])).toEqual(["a", "x", "b"]);
    expect(unionIds(["a", "b"], ["a", "b"])).toEqual(["a", "b"]);
  });
});

describe("headerCheck", () => {
  const vis = ["a", "b"];

  it("unchecked when nothing visible is checked", () => {
    expect(headerCheck([], vis)).toBe("unchecked");
    expect(headerCheck(["x"], vis)).toBe("unchecked");
  });

  it("checked when every visible id is checked (hidden extras stay fine)", () => {
    expect(headerCheck(["a", "b"], vis)).toBe("checked");
    expect(headerCheck(["a", "b", "x"], vis)).toBe("checked");
  });

  it("indeterminate for a partial visible selection", () => {
    expect(headerCheck(["a"], vis)).toBe("indeterminate");
    expect(headerCheck(["a", "x"], vis)).toBe("indeterminate");
  });

  it("empty visible list is unchecked, never vacuously checked", () => {
    expect(headerCheck(["a"], [])).toBe("unchecked");
    expect(headerCheck([], [])).toBe("unchecked");
  });
});

describe("scope split", () => {
  it("intersectIds keeps only checked ids that are visible", () => {
    expect(intersectIds(["a", "x", "b"], ["a", "b", "c"])).toEqual(["a", "b"]);
  });

  it("hiddenIds reports checked rows the filters hide (never silently acted on)", () => {
    expect(hiddenIds(["a", "x", "b"], ["a", "b", "c"])).toEqual(["x"]);
    expect(hiddenIds(["a"], ["a"])).toEqual([]);
  });
});

describe("pruneIds", () => {
  it("drops ids whose pair vanished at rescan", () => {
    expect(pruneIds(["a", "gone", "b"], ["a", "b"])).toEqual(["a", "b"]);
    expect(pruneIds(["gone"], ["a"])).toEqual([]);
  });

  it("keeps selection across filter/sort changes (alive ids survive)", () => {
    expect(pruneIds(["a", "b"], ["b", "a", "c"])).toEqual(["a", "b"]);
  });
});
