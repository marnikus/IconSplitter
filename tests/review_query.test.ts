// TDD cycle R4 — reviewquery: date/status filters and the four sort keys.
// Month + custom From/To range are inclusive and local-time (spec §3, §4).
import { describe, expect, it } from "vitest";
import {
  applyQuery, defaultQuery, filtersCleared, mergeQuery, monthStamp, parseStamp,
  type QueryPatch, type ReviewQuery,
} from "../src/lib/reviewquery";
import { formatBytes, formatStamp, rescanNote, stampName } from "../src/lib/reviewformat";
import { item, pair } from "./helpers/review";

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();

const SEPT = item("sep", "pending", { mtime: at(2026, 9, 20, 9) });
const OCT_EARLY = item("oct-early", "approved", { mtime: at(2026, 10, 1, 8) });
const OCT_LATE = item("oct-late", "declined", { mtime: at(2026, 10, 5, 20) });

function query(patch: QueryPatch = {}): ReviewQuery {
  return mergeQuery(defaultQuery(), patch);
}

describe("date helpers", () => {
  it("parses datetime-local and date-only text as local time", () => {
    expect(parseStamp("2026-10-01T05:30")).toBe(at(2026, 10, 1, 5, 30));
    expect(parseStamp("2026-10-01")).toBe(at(2026, 10, 1, 0, 0));
    expect(parseStamp("")).toBeNull();
    expect(parseStamp("not a date")).toBeNull();
  });

  it("derives the YYYY-MM month key of a timestamp", () => {
    expect(monthStamp(at(2026, 10, 5, 20))).toBe("2026-10");
    expect(monthStamp(at(2026, 1, 5))).toBe("2026-01");
  });

  it("formats byte sizes and timestamps for the list", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatStamp(at(2026, 10, 1, 8, 5))).toBe("2026-10-01 08:05");
  });
});

describe("date filters (spec §3)", () => {
  const all = [SEPT, OCT_EARLY, OCT_LATE];

  it("shows everything in the default (all) scope", () => {
    expect(applyQuery(all, defaultQuery()).map((i) => i.id)).toEqual(["oct-late", "oct-early", "sep"]);
    expect(filtersCleared(defaultQuery())).toBe(true);
  });

  it("filters by month, inclusive of that month only", () => {
    const q = query({ scope: { mode: "month", month: "2026-10", from: "", to: "" } });
    expect(applyQuery(all, q).map((i) => i.id).sort()).toEqual(["oct-early", "oct-late"]);
    expect(filtersCleared(q)).toBe(false);
  });

  it("treats an empty month as no restriction instead of an empty list", () => {
    const q = query({ scope: { mode: "month", month: "", from: "", to: "" } });
    expect(applyQuery(all, q)).toHaveLength(3);
  });

  it("filters by a custom From/To range with both bounds inclusive", () => {
    const q = query({ scope: { mode: "range", month: "", from: "2026-10-01T08:00", to: "2026-10-05T20:00" } });
    expect(applyQuery(all, q).map((i) => i.id).sort()).toEqual(["oct-early", "oct-late"]);
  });

  it("supports an open-ended range and ignores unreadable bounds", () => {
    const from = query({ scope: { mode: "range", month: "", from: "2026-10-02T00:00", to: "" } });
    expect(applyQuery(all, from).map((i) => i.id)).toEqual(["oct-late"]);
    const to = query({ scope: { mode: "range", month: "", from: "", to: "2026-09-30T00:00" } });
    expect(applyQuery(all, to).map((i) => i.id)).toEqual(["sep"]);
    const junk = query({ scope: { mode: "range", month: "", from: "junk", to: "junk" } });
    expect(applyQuery(all, junk)).toHaveLength(3);
  });

  it("filters by review status", () => {
    expect(applyQuery(all, query({ status: "approved" })).map((i) => i.id)).toEqual(["oct-early"]);
    expect(applyQuery(all, query({ status: "declined" })).map((i) => i.id)).toEqual(["oct-late"]);
    expect(applyQuery(all, query({ status: "pending" })).map((i) => i.id)).toEqual(["sep"]);
  });
});

describe("sorting (spec §4 — every key, both directions)", () => {
  const three = [
    item("b/second", "pending", { mtime: at(2026, 10, 2) }),
    item("a/third", "approved", { mtime: at(2026, 10, 3) }),
    item("c/first", "declined", { mtime: at(2026, 10, 1) }),
  ];

  const ids = (patch: QueryPatch) => applyQuery(three, query(patch)).map((i) => i.id);

  it("sorts by creation date ascending and descending", () => {
    expect(ids({ sort: { key: "date", dir: "asc" } })).toEqual(["c/first", "b/second", "a/third"]);
    expect(ids({ sort: { key: "date", dir: "desc" } })).toEqual(["a/third", "b/second", "c/first"]);
  });

  it("sorts by status (pending → approved → declined) and back", () => {
    expect(ids({ sort: { key: "status", dir: "asc" } })).toEqual(["b/second", "a/third", "c/first"]);
    expect(ids({ sort: { key: "status", dir: "desc" } })).toEqual(["c/first", "a/third", "b/second"]);
  });

  it("sorts by filename and by folder path", () => {
    expect(ids({ sort: { key: "name", dir: "asc" } })).toEqual(["c/first", "b/second", "a/third"]);
    expect(ids({ sort: { key: "name", dir: "desc" } })).toEqual(["a/third", "b/second", "c/first"]);
    expect(ids({ sort: { key: "path", dir: "asc" } })).toEqual(["a/third", "b/second", "c/first"]);
    expect(ids({ sort: { key: "path", dir: "desc" } })).toEqual(["c/first", "b/second", "a/third"]);
  });

  it("breaks ties deterministically by pair id and never mutates the input", () => {
    const same = [item("z", "pending", { mtime: 5 }), item("a", "pending", { mtime: 5 })];
    expect(applyQuery(same, query()).map((i) => i.id)).toEqual(["a", "z"]);
    expect(three.map((i) => i.id)).toEqual(["b/second", "a/third", "c/first"]);
  });
});

describe("mergeQuery / clear (spec §3 — filters can be cleared quickly)", () => {
  it("patches one part of the query without losing the rest", () => {
    const q = mergeQuery(query({ sort: { key: "name", dir: "asc" } }), { scope: { mode: "month" } });
    expect(q.scope.mode).toBe("month");
    expect(q.scope.month).toBe("");
    expect(q.sort).toEqual({ key: "name", dir: "asc" });
    expect(filtersCleared(q)).toBe(false);
  });

  it("clears every filter while keeping the sort", () => {
    const dirty = query({ scope: { mode: "range", from: "2026-10-01T00:00", to: "" }, status: "approved", sort: { key: "path", dir: "asc" } });
    const clean = mergeQuery(dirty, { scope: { mode: "all", month: "", from: "", to: "" }, status: "all" });
    expect(filtersCleared(clean)).toBe(true);
    expect(clean.sort).toEqual({ key: "path", dir: "asc" });
  });
});

describe("rescan and display notes (spec §9)", () => {
  it("describes a rescan as new, removed, changed, renamed and total", () => {
    const before = [pair("a", { mtime: 1 }), pair("b", { mtime: 1 }), pair("gone", { mtime: 5 }), pair("lost", { mtime: 7, size: 33 })];
    const after = [pair("a", { mtime: 1 }), pair("b", { mtime: 2 }), pair("fresh", { mtime: 9, size: 99 }), pair("moved", { mtime: 5 })];
    const note = rescanNote(before, after);
    expect(note).toContain("4 pairs");
    expect(note).toContain("+1 new");
    expect(note).toContain("−1 removed");
    expect(note).toContain("~1 changed");
    expect(note).toContain("1 renamed");
  });

  it("says so honestly when there is nothing to review", () => {
    expect(rescanNote([], [])).toBe("No images found");
  });

  it("makes a filename-safe timestamp for corrupt backups", () => {
    expect(stampName(new Date(2026, 9, 1, 12, 0, 5))).toBe("2026-10-01T12-00-05");
  });
});

describe("filters and sorting combine (spec §3 + §4)", () => {
  it("filters October, then sorts by name descending", () => {
    const q = query({
      scope: { mode: "month", month: "2026-10", from: "", to: "" },
      sort: { key: "name", dir: "desc" },
    });
    expect(applyQuery([SEPT, OCT_EARLY, OCT_LATE], q).map((i) => i.id)).toEqual(["oct-late", "oct-early"]);
  });
});
