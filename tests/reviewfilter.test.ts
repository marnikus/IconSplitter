// reviewfilter.test.ts — RULE 8: date/status/search filtering for Selection.
import { describe, expect, it } from "vitest";
import {
  applyFilters, filterLabel, monthKey, parseFilter, type ListFilter, type ViewPair,
} from "../src/lib/reviewfilter";

const T = (s: string) => new Date(s).getTime();

function pair(id: string, created: number, generated: number | null, dir = "a", status: ViewPair["decision"] = "pending"): ViewPair {
  return {
    pairId: id, base: id, relDir: dir,
    source: { relPath: `${dir}/${id}.png`, size: 1, mtime: created },
    ai: generated === null ? null : { relPath: `${dir}/${id}_AI.png`, size: 2, mtime: generated },
    created, generated, decision: status, reviewedAt: null,
  };
}

const ALL: ListFilter = { date: { mode: "all" }, status: "all", search: "", pairing: "all" };

// Oct 1, Oct 15, Sep 20 pairs
const P1 = pair("p1", T("2026-10-01T08:00:00Z"), T("2026-10-01T09:00:00Z"));
const P2 = pair("p2", T("2026-10-15T08:00:00Z"), T("2026-10-15T09:00:00Z"), "a", "approved");
const P3 = pair("p3", T("2026-09-20T08:00:00Z"), null, "b", "declined");
const PAIRS = [P1, P2, P3];

describe("applyFilters", () => {
  it("all mode keeps everything", () => {
    expect(applyFilters(PAIRS, ALL)).toHaveLength(3);
  });

  it("month mode keeps only pairs anchored in that month", () => {
    const f: ListFilter = { ...ALL, date: { mode: "month", month: "2026-10" } };
    const got = applyFilters(PAIRS, f).map((p) => p.pairId);
    expect(got).toEqual(["p1", "p2"]);
  });

  it("custom range is inclusive on both ends and uses created or generated", () => {
    const f: ListFilter = {
      ...ALL,
      date: { mode: "custom", from: T("2026-10-01T09:00:00Z"), to: T("2026-10-01T09:00:00Z") },
    };
    // p1 created 08:00 (out) but generated 09:00 (in) -> included
    expect(applyFilters(PAIRS, f).map((p) => p.pairId)).toEqual(["p1"]);
  });

  it("custom range excludes everything outside", () => {
    const f: ListFilter = { ...ALL, date: { mode: "custom", from: T("2026-01-01T00:00:00Z"), to: T("2026-01-31T00:00:00Z") } };
    expect(applyFilters(PAIRS, f)).toHaveLength(0);
  });

  it("status filter selects a single decision", () => {
    expect(applyFilters(PAIRS, { ...ALL, status: "approved" }).map((p) => p.pairId)).toEqual(["p2"]);
    expect(applyFilters(PAIRS, { ...ALL, status: "declined" }).map((p) => p.pairId)).toEqual(["p3"]);
    expect(applyFilters(PAIRS, { ...ALL, status: "pending" }).map((p) => p.pairId)).toEqual(["p1"]);
  });

  it("search matches filename or folder, case-insensitive", () => {
    expect(applyFilters(PAIRS, { ...ALL, search: "P1" }).map((p) => p.pairId)).toEqual(["p1"]);
    expect(applyFilters(PAIRS, { ...ALL, search: "b/" }).map((p) => p.pairId)).toEqual(["p3"]);
    expect(applyFilters(PAIRS, { ...ALL, search: "zzz" })).toHaveLength(0);
  });

  it("filters combine with AND semantics", () => {
    const f: ListFilter = { date: { mode: "month", month: "2026-10" }, status: "approved", search: "", pairing: "all" };
    expect(applyFilters(PAIRS, f).map((p) => p.pairId)).toEqual(["p2"]);
  });
});

describe("pairing filter — missing-pair states (spec V2 §8)", () => {
  it("all keeps complete and incomplete pairs", () => {
    expect(applyFilters(PAIRS, { ...ALL, pairing: "all" })).toHaveLength(3);
  });

  it("incomplete keeps only pairs with a missing side", () => {
    expect(applyFilters(PAIRS, { ...ALL, pairing: "incomplete" }).map((p) => p.pairId)).toEqual(["p3"]);
  });

  it("complete drops pairs with a missing side", () => {
    expect(applyFilters(PAIRS, { ...ALL, pairing: "complete" }).map((p) => p.pairId)).toEqual(["p1", "p2"]);
  });

  it("combines with the status filter (declined AND incomplete)", () => {
    const f: ListFilter = { ...ALL, status: "declined", pairing: "incomplete" };
    expect(applyFilters(PAIRS, f).map((p) => p.pairId)).toEqual(["p3"]);
    expect(applyFilters(PAIRS, { ...f, status: "approved" })).toHaveLength(0);
  });
});

describe("monthKey", () => {
  it("formats epoch ms as YYYY-MM in local time", () => {
    const d = new Date(2026, 9, 1, 12, 0, 0); // local Oct 1 2026
    expect(monthKey(d.getTime())).toBe("2026-10");
  });
});

describe("parseFilter — restoring a saved filter (RULE 13)", () => {
  it("accepts a well-formed filter", () => {
    const f: ListFilter = { date: { mode: "month", month: "2026-10" }, status: "approved", search: "fog", pairing: "incomplete" };
    expect(parseFilter(f)).toEqual(f);
  });

  it("falls back to ALL_FILTER for anything unusable", () => {
    for (const bad of [null, undefined, "x", 7, [], { date: "soon" }, { status: "maybe" }, { pairing: "half" }]) {
      expect(parseFilter(bad)).toEqual(ALL);
    }
  });

  it("keeps valid parts and defaults the rest", () => {
    expect(parseFilter({ status: "declined", date: { mode: "all" }, search: 3, pairing: "all" }))
      .toEqual({ ...ALL, status: "declined", search: "" });
  });

  it("rejects a custom range with non-finite bounds", () => {
    expect(parseFilter({ date: { mode: "custom", from: "a", to: 2 }, status: "all", search: "", pairing: "all" })).toEqual(ALL);
    expect(parseFilter({ date: { mode: "custom", from: 1, to: 2 }, status: "all", search: "", pairing: "all" }))
      .toEqual({ ...ALL, date: { mode: "custom", from: 1, to: 2 } });
  });
});

describe("filterLabel — the words an undo shows", () => {
  it("names every active condition and falls back to all pairs", () => {
    expect(filterLabel(ALL)).toBe("Filter: all pairs");
    expect(filterLabel({ ...ALL, status: "approved" })).toBe("Filter: status approved");
    expect(filterLabel({ ...ALL, pairing: "incomplete", search: "fog" })).toBe("Filter: incomplete pairs, “fog”");
    expect(filterLabel({ ...ALL, date: { mode: "month", month: "2026-10" } })).toBe("Filter: 2026-10");
    expect(filterLabel({ ...ALL, date: { mode: "custom", from: 1, to: 2 } })).toBe("Filter: custom range");
  });
});
