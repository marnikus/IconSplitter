// @vitest-environment node
// builder_select.test.ts — RULE 8 + design §5.3: the sheet's icon selection.
// The load-bearing property is REPRODUCIBILITY: the same pool, mode, seed,
// threshold, filter, locks and capacity must give the same slots every time, or a
// preset cannot reproduce a sheet and the export guarantee means nothing.
//
// Also pinned: a lock keeps its INDEX across a re-roll and across a capacity
// change, a threshold excludes below-threshold icons instead of quietly padding,
// and a shortfall is a number the UI can say — never a silent repeat.
import { describe, expect, it } from "vitest";
import { selectSlots, type SelectionRequest } from "../src/lib/builder/select";
import type { BuilderIcon } from "../src/lib/builder/rows";
import { shuffleBySeed, seededPick } from "../src/lib/builder/rng";

function icon(id: string, tags: string[], over: Partial<BuilderIcon> = {}): BuilderIcon {
  return {
    id, svgPath: `d/${id}.svg`, name: id, folder: over.folder ?? "d",
    tags, tagSource: "metadata", fingerprint: "1:1", version: 1, ...over,
  };
}

const POOL: BuilderIcon[] = [
  icon("ant", ["animal", "small"]),
  icon("bear", ["animal", "big"]),
  icon("cat", ["animal", "small"]),
  icon("dog", ["animal", "big"]),
  icon("egg", ["food"]),
  icon("fig", ["food"]),
];

function req(over: Partial<SelectionRequest> = {}): SelectionRequest {
  return {
    mode: "random", pool: POOL, capacity: 4, seed: 1234, threshold: 0,
    folder: "", tag: "", lockedIds: [], repeat: false, ...over,
  };
}

describe("rng — one seeded stream, no ambient randomness", () => {
  it("the same seed shuffles the same way", () => {
    expect(shuffleBySeed([1, 2, 3, 4, 5], 7)).toEqual(shuffleBySeed([1, 2, 3, 4, 5], 7));
  });

  it("a different seed shuffles differently", () => {
    const a = shuffleBySeed(["a", "b", "c", "d", "e"], 7).join("");
    const b = shuffleBySeed(["a", "b", "c", "d", "e"], 8).join("");
    expect(a).not.toBe(b);
  });

  it("shuffling keeps every member exactly once", () => {
    expect([...shuffleBySeed(["a", "b", "c", "d"], 3)].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("a pick is in range and stable for a seed", () => {
    expect(seededPick(5, 99)).toBe(seededPick(5, 99));
    expect(seededPick(5, 99)).toBeGreaterThanOrEqual(0);
    expect(seededPick(5, 99)).toBeLessThan(5);
  });

  it("never returns NaN for a degenerate input", () => {
    expect(Number.isFinite(shuffleBySeed([], 1).length)).toBe(true);
    expect(seededPick(1, 0)).toBe(0);
  });
});

describe("selectSlots — determinism", () => {
  it("the same request gives the same slots three times", () => {
    const a = selectSlots(req());
    const b = selectSlots(req());
    const c = selectSlots(req());
    expect(a.slots).toEqual(b.slots);
    expect(b.slots).toEqual(c.slots);
  });

  it("a different seed gives a different sheet", () => {
    expect(selectSlots(req({ seed: 1 })).slots).not.toEqual(selectSlots(req({ seed: 2 })).slots);
  });

  it("the order of the pool does not change the answer", () => {
    const shuffledPool = [...POOL].reverse();
    expect(selectSlots(req({ pool: shuffledPool })).slots).toEqual(selectSlots(req()).slots);
  });

  it("fills the capacity it can and reports nothing missing", () => {
    const out = selectSlots(req());
    expect(out.slots).toHaveLength(4);
    expect(out.shortfall).toBe(0);
    expect(out.slots.every((id) => id !== null)).toBe(true);
  });
});

describe("selectSlots — no silent repeats", () => {
  it("never places the same icon twice", () => {
    const out = selectSlots(req({ capacity: 6 }));
    expect(new Set(out.slots).size).toBe(6);
  });

  it("a pool smaller than the sheet leaves holes and says how many", () => {
    const out = selectSlots(req({ capacity: 10 }));
    expect(out.slots).toHaveLength(10);
    expect(out.shortfall).toBe(4);
    expect(out.slots.filter((id) => id === null)).toHaveLength(4);
  });

  it("repeats only when the user opts in, and then fills every cell", () => {
    const out = selectSlots(req({ capacity: 10, repeat: true }));
    expect(out.shortfall).toBe(0);
    expect(out.slots.every((id) => id !== null)).toBe(true);
    expect(out.repeated).toBe(true);
  });
});

describe("selectSlots — locks keep their place", () => {
  it("a locked icon stays at its own index across a re-roll", () => {
    const first = selectSlots(req({ seed: 11 }));
    const lockedId = first.slots[2] as string;
    const rerolled = selectSlots(req({ seed: 99, lockedIds: [lockedId], previous: first.slots }));
    expect(rerolled.slots[2]).toBe(lockedId);
  });

  it("a lock does not appear twice", () => {
    const first = selectSlots(req({ seed: 11 }));
    const lockedId = first.slots[2] as string;
    const rerolled = selectSlots(req({ seed: 99, capacity: 6, lockedIds: [lockedId], previous: first.slots }));
    expect(rerolled.slots.filter((id) => id === lockedId)).toHaveLength(1);
  });

  it("growing the sheet preserves the locks and the cells before them", () => {
    const first = selectSlots(req({ seed: 11 }));
    const lockedId = first.slots[1] as string;
    const grown = selectSlots(req({ seed: 11, capacity: 6, lockedIds: [lockedId], previous: first.slots }));
    expect(grown.slots[1]).toBe(lockedId);
    expect(grown.slots.slice(0, 4).filter((id) => id !== null).length).toBe(4);
  });

  it("shrinking the sheet drops holes at the end, not the locks", () => {
    const first = selectSlots(req({ seed: 11, capacity: 6 }));
    const lockedId = first.slots[0] as string;
    const shrunk = selectSlots(req({ seed: 11, capacity: 2, lockedIds: [lockedId], previous: first.slots }));
    expect(shrunk.slots).toHaveLength(2);
    expect(shrunk.slots[0]).toBe(lockedId);
  });

  it("a lock whose icon left the library is reported, not silently kept", () => {
    const out = selectSlots(req({ lockedIds: ["gone"] }));
    expect(out.staleLocks).toEqual(["gone"]);
    expect(out.slots).not.toContain("gone");
  });
});

describe("selectSlots — modes", () => {
  it("filtered takes only the chosen folder", () => {
    const kitchen = POOL.map((i) => (i.id === "egg" || i.id === "fig" ? { ...i, folder: "food" } : i));
    const out = selectSlots(req({ mode: "filtered", pool: kitchen, folder: "food", capacity: 2 }));
    expect(new Set(out.slots)).toEqual(new Set(["egg", "fig"]));
  });

  it("filtered takes only the chosen tag", () => {
    const out = selectSlots(req({ mode: "filtered", tag: "food", capacity: 4 }));
    expect(new Set(out.slots.filter((id) => id !== null))).toEqual(new Set(["egg", "fig"]));
    expect(out.shortfall).toBe(2);
    expect(out.slots.slice(2)).toEqual([null, null]); // holes sit at the end
  });

  it("similar ranks by the reference profile and excludes below the threshold", () => {
    const out = selectSlots(req({
      mode: "similar", capacity: 4, threshold: 50, anchorTags: ["animal", "small"],
    }));
    // `ant` and `cat` match both tokens; `bear`/`dog` match one; `egg`/`fig` match none.
    expect(out.slots[0] === "ant" || out.slots[0] === "cat").toBe(true);
    expect(out.slots).not.toContain("egg");
    expect(out.slots).not.toContain("fig");
    expect(out.basis).toBe("metadata");
  });

  it("similar says which tag source it scored on, so the copy can be honest", () => {
    const filenamePool = POOL.map((i) => ({ ...i, tagSource: "filename" as const }));
    expect(selectSlots(req({ mode: "similar", pool: filenamePool, anchorTags: ["animal"] })).basis).toBe("filename");
    const bare = POOL.map((i) => ({ ...i, tags: [], tagSource: "none" as const }));
    expect(selectSlots(req({ mode: "similar", pool: bare, anchorTags: ["animal"] })).basis).toBe("none");
  });

  it("random ignores tags but still fills the sheet", () => {
    expect(selectSlots(req()).slots.every((id) => id !== null)).toBe(true);
  });
});

describe("selectSlots — degenerate input stays finite", () => {
  it("an empty pool is an empty sheet, not a crash", () => {
    const out = selectSlots(req({ pool: [], capacity: 4 }));
    expect(out.slots).toEqual([null, null, null, null]);
    expect(out.shortfall).toBe(4);
  });

  it("capacity 0 gives an empty sheet", () => {
    expect(selectSlots(req({ capacity: 0 })).slots).toEqual([]);
  });

  it("a negative or NaN capacity becomes an empty sheet", () => {
    expect(selectSlots(req({ capacity: -5 })).slots).toEqual([]);
    expect(selectSlots(req({ capacity: Number.NaN })).slots).toEqual([]);
  });
});
