// @vitest-environment node
// upload_rowbadge.test.ts — named coloured labels on SVG-to-upload rows (I-79).
import { describe, expect, it } from "vitest";
import {
  EMPTY_ROW_BADGES, ROW_BADGE_MAX, addBadge, applyBadgeToIds, applyState,
  badgesOf, knownBadges, parseBadgeFilter, parseRowBadgeState, recolorBadge,
  removeBadge, removeBadgeFromIds, renameBadge, rowMatchesBadge, toggleBadgeOn,
} from "../src/lib/upload/rowbadge";

function withBadge(name = "Priority", color = "#ff5b7e") {
  const next = addBadge(EMPTY_ROW_BADGES, name, color);
  if (next === null) throw new Error("add");
  return next;
}

describe("catalog CRUD", () => {
  it("adds a named colour, refuses a blank or duplicate name, and caps the list", () => {
    const one = withBadge();
    expect(one.catalog).toEqual([{ id: "rb1", name: "Priority", color: "#ff5b7e" }]);
    expect(addBadge(one, "   ")).toBeNull();
    expect(addBadge(one, "priority")).toBeNull();
    const two = addBadge(one, "Redo", "#5cc8ff");
    expect(two?.catalog.map((b) => b.name)).toEqual(["Priority", "Redo"]);
    let filled = EMPTY_ROW_BADGES;
    for (let i = 0; i < ROW_BADGE_MAX; i++) filled = addBadge(filled, `B${i}`, "#745cff") ?? filled;
    expect(filled.catalog).toHaveLength(ROW_BADGE_MAX);
    expect(addBadge(filled, "overflow")).toBeNull();
  });

  it("renames, recolours and removes, stripping the id from every row", () => {
    const start = toggleBadgeOn(withBadge(), "pair_a", "rb1");
    const renamed = renameBadge(start, "rb1", "Urgent");
    expect(renamed?.catalog[0].name).toBe("Urgent");
    expect(renameBadge(start, "rb1", " ")).toBeNull();
    expect(renameBadge(start, "rb9", "Gone")).toBeNull();
    const two = addBadge(start, "Redo", "#5cc8ff");
    expect(renameBadge(two!, "rb1", "redo")).toBeNull();
    const recoloured = recolorBadge(start, "rb1", "#32D68B");
    expect(recoloured?.catalog[0].color).toBe("#32d68b");
    expect(recolorBadge(start, "rb1", "red")).toBeNull();
    expect(recolorBadge(start, "rb9", "#32d68b")).toBeNull();
    const gone = removeBadge(start, "rb1");
    expect(gone.catalog).toEqual([]);
    expect(gone.assigned).toEqual({});
    expect(removeBadge(start, "rb9")).toBe(start);
  });

  it("reuses the next free id when a hole exists in the catalog", () => {
    const one = addBadge(EMPTY_ROW_BADGES, "A", "#745cff");
    const two = addBadge(one!, "B", "#32d68b");
    const hole = removeBadge(two!, "rb1");
    expect(addBadge(hole, "C", "#ff5b7e")?.catalog.map((b) => b.id)).toEqual(["rb2", "rb1"]);
  });
});

describe("assignment and multi-apply", () => {
  it("toggles one or more badges on a single row", () => {
    const catalog = addBadge(withBadge(), "Redo", "#5cc8ff");
    if (!catalog) throw new Error("redo");
    const one = toggleBadgeOn(catalog, "pair_a", "rb1");
    const two = toggleBadgeOn(one, "pair_a", "rb2");
    expect(badgesOf(two, "pair_a")).toEqual(["rb1", "rb2"]);
    expect(knownBadges(two, "pair_a").map((b) => b.name)).toEqual(["Priority", "Redo"]);
    expect(badgesOf(toggleBadgeOn(two, "pair_a", "rb1"), "pair_a")).toEqual(["rb2"]);
  });

  it("applies to a selection: missing rows gain it; all-on removes it", () => {
    const catalog = withBadge();
    const mixed = toggleBadgeOn(catalog, "pair_a", "rb1");
    const added = applyBadgeToIds(mixed, ["pair_a", "pair_b"], "rb1");
    expect(badgesOf(added, "pair_a")).toEqual(["rb1"]);
    expect(badgesOf(added, "pair_b")).toEqual(["rb1"]);
    const cleared = applyBadgeToIds(added, ["pair_a", "pair_b"], "rb1");
    expect(badgesOf(cleared, "pair_a")).toEqual([]);
    expect(badgesOf(cleared, "pair_b")).toEqual([]);
    expect(applyBadgeToIds(catalog, [], "rb1")).toBe(catalog);
    expect(applyBadgeToIds(catalog, ["pair_a"], "rb9")).toBe(catalog);
    expect(toggleBadgeOn(catalog, "pair_a", "rb9")).toBe(catalog);
  });

  it("removes a badge from every checked row without toggling it onto mixed rows", () => {
    const catalog = withBadge();
    const assigned = toggleBadgeOn(toggleBadgeOn(catalog, "pair_a", "rb1"), "pair_c", "rb1");
    const removed = removeBadgeFromIds(assigned, ["pair_a", "pair_b", "pair_c"], "rb1");
    expect(badgesOf(removed, "pair_a")).toEqual([]);
    expect(badgesOf(removed, "pair_b")).toEqual([]);
    expect(badgesOf(removed, "pair_c")).toEqual([]);
    expect(removeBadgeFromIds(assigned, [], "rb1")).toBe(assigned);
    expect(removeBadgeFromIds(assigned, ["pair_a"], "missing")).toBe(assigned);
  });
});

describe("filter and parse (RULE 13)", () => {
  it("matches all / none / any / a named id", () => {
    expect(rowMatchesBadge([], "all")).toBe(true);
    expect(rowMatchesBadge([], "none")).toBe(true);
    expect(rowMatchesBadge(["rb1"], "none")).toBe(false);
    expect(rowMatchesBadge(["rb1"], "any")).toBe(true);
    expect(rowMatchesBadge([], "any")).toBe(false);
    expect(rowMatchesBadge(["rb1", "rb2"], "rb2")).toBe(true);
    expect(rowMatchesBadge(["rb1"], "rb2")).toBe(false);
  });

  it("keeps valid catalog entries and drops junk, unknown assignments and foreign versions", () => {
    const parsed = parseRowBadgeState({
      v: 1,
      catalog: [
        { id: "rb1", name: "  Go  ", color: "#FF5B7E" },
        { id: "", name: "x", color: "#745cff" },
        { name: "no-id", color: "#745cff" },
        "nope",
      ],
      assigned: { pair_a: ["rb1", "ghost", "rb1"], pair_b: ["ghost"], pair_c: 3 },
    });
    expect(parsed.catalog).toEqual([{ id: "rb1", name: "Go", color: "#ff5b7e" }]);
    expect(parsed.assigned).toEqual({ pair_a: ["rb1"] });
    expect(parseRowBadgeState({ v: 2, catalog: [] })).toEqual(EMPTY_ROW_BADGES);
    expect(parseRowBadgeState(null)).toEqual(EMPTY_ROW_BADGES);
    expect(parseBadgeFilter("none")).toBe("none");
    expect(parseBadgeFilter("rb9")).toBe("rb9");
    expect(parseBadgeFilter(0)).toBe("all");
    expect(applyState({ v: 1, catalog: [], assigned: {} })).toEqual(EMPTY_ROW_BADGES);
    expect(applyState({ v: 9 })).toBeNull();
  });
});
