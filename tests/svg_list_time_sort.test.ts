// svg_list_time_sort.test.ts — "when was the artwork made" sorting and the one
// direction control (2026-11-02). Two new orders answer what the file system
// knows and the list never showed: the age of the SVG a row displays and the age
// of the AI source it displays. Every order keeps ONE direction rule, so the
// ascending/descending control works for any sort AND any filter, and rows with
// no timestamp at all are last in both directions instead of pretending to be
// the oldest.
import { describe, expect, it } from "vitest";
import {
  naturalDir, sortSvgRows, type SvgDir, type SvgListRow, type SvgSort,
} from "../src/lib/svglist";

const at = (iso: string): number => Date.parse(iso);

function row(name: string, patch: Partial<SvgListRow> = {}): SvgListRow {
  return {
    id: name, name, relPath: `dir/${name}`, generation: "generated", review: "approved",
    generatedAt: null, cost: null, costEstimated: false, tokens: null, version: 1,
    svgCreatedAt: null, aiCreatedAt: null, ...patch,
  };
}

/** The three rows these tests sort, deliberately out of every order. */
const ROWS: SvgListRow[] = [
  row("b.svg", { id: "b", generatedAt: at("2026-10-02T10:00:00Z"), svgCreatedAt: at("2026-09-01T10:00:00Z"), aiCreatedAt: at("2026-01-01T10:00:00Z"), cost: 0.4 }),
  row("a.svg", { id: "a", generatedAt: at("2026-10-03T10:00:00Z"), svgCreatedAt: at("2026-08-01T10:00:00Z"), aiCreatedAt: at("2026-03-01T10:00:00Z"), cost: 0.1 }),
  row("c.svg", { id: "c", generatedAt: at("2026-10-01T10:00:00Z"), svgCreatedAt: at("2026-10-20T10:00:00Z"), aiCreatedAt: at("2026-02-01T10:00:00Z"), cost: 0.9 }),
];

const ids = (rows: readonly SvgListRow[]): string[] => rows.map((r) => r.id);

describe("sorting by when the SVG was created", () => {
  it("orders by the SVG's own time, newest first, whatever the generation time was", () => {
    expect(ids(sortSvgRows(ROWS, "svg-created"))).toEqual(["c", "b", "a"]);
    expect(ids(sortSvgRows(ROWS, "svg-created", [], "asc"))).toEqual(["a", "b", "c"]);
  });

  it("is a different order from the generation date — the file may be older than its record", () => {
    expect(ids(sortSvgRows(ROWS, "date"))).toEqual(["a", "b", "c"]);
    expect(ids(sortSvgRows(ROWS, "svg-created"))).not.toEqual(ids(sortSvgRows(ROWS, "date")));
  });

  it("puts a row without any SVG time last, in BOTH directions", () => {
    const rows = [...ROWS, row("z.svg", { id: "z" })];
    expect(ids(sortSvgRows(rows, "svg-created")).at(-1)).toBe("z");
    expect(ids(sortSvgRows(rows, "svg-created", [], "asc")).at(-1)).toBe("z");
  });
});

describe("sorting by when the AI source was created", () => {
  it("orders by the AI source's own time, newest first and oldest first", () => {
    expect(ids(sortSvgRows(ROWS, "ai-created"))).toEqual(["a", "c", "b"]);
    expect(ids(sortSvgRows(ROWS, "ai-created", [], "asc"))).toEqual(["b", "c", "a"]);
  });

  it("keeps a row with no AI time at the end rather than at the top of \"newest\"", () => {
    const rows = [row("z.svg", { id: "z" }), ...ROWS];
    expect(ids(sortSvgRows(rows, "ai-created"))).toEqual(["a", "c", "b", "z"]);
  });
});

describe("one direction control for every order", () => {
  /** Distinct in every field a sort reads, so a reversal is always observable. */
  const DISTINCT: SvgListRow[] = [
    row("b.svg", { id: "b", relPath: "d/b.svg", generation: "generated", review: "pending", cost: 0.4,
      generatedAt: at("2026-10-02T10:00:00Z"), svgCreatedAt: at("2026-09-01T10:00:00Z"), aiCreatedAt: at("2026-01-01T10:00:00Z") }),
    row("a.svg", { id: "a", relPath: "d/a.svg", generation: "not-generated", review: "approved", cost: 0.1,
      generatedAt: at("2026-10-03T10:00:00Z"), svgCreatedAt: at("2026-08-01T10:00:00Z"), aiCreatedAt: at("2026-03-01T10:00:00Z") }),
    row("c.svg", { id: "c", relPath: "d/c.svg", generation: "failed", review: "declined", cost: 0.9,
      generatedAt: at("2026-10-01T10:00:00Z"), svgCreatedAt: at("2026-10-20T10:00:00Z"), aiCreatedAt: at("2026-02-01T10:00:00Z") }),
  ];

  const VALUE_SORTS: SvgSort[] = ["date", "cost", "svg-created", "ai-created"];

  it("reverses every value order when the direction is flipped", () => {
    for (const sort of VALUE_SORTS) {
      const forward = ids(sortSvgRows(DISTINCT, sort));
      const back = ids(sortSvgRows(DISTINCT, sort, [], other(naturalDir(sort))));
      expect(back, `${sort} must reverse`).toEqual([...forward].reverse());
    }
  });

  it("reverses the alphabetic orders too", () => {
    const byName = ids(sortSvgRows(DISTINCT, "name"));
    expect(byName).toEqual(["a", "b", "c"]);
    expect(ids(sortSvgRows(DISTINCT, "name", [], "desc"))).toEqual(["c", "b", "a"]);
  });

  it("swaps the blocks of a grouped order and keeps the names readable inside them", () => {
    expect(ids(sortSvgRows(DISTINCT, "approved"))).toEqual(["a", "b", "c"]); // approved first
    expect(ids(sortSvgRows(DISTINCT, "approved", [], "asc"))).toEqual(["b", "c", "a"]);
    expect(ids(sortSvgRows(DISTINCT, "unapproved"))).toEqual(["b", "c", "a"]); // the label's own order
    expect(ids(sortSvgRows(DISTINCT, "unapproved", [], "asc"))).toEqual(["a", "b", "c"]);
    expect(ids(sortSvgRows(DISTINCT, "selected", ["c"]))).toEqual(["c", "a", "b"]);
    expect(ids(sortSvgRows(DISTINCT, "selected", ["c"], "asc"))).toEqual(["a", "b", "c"]);
  });

  it("keeps each order's own natural direction until the user flips it", () => {
    expect(naturalDir("date")).toBe("desc");
    expect(naturalDir("svg-created")).toBe("desc");
    expect(naturalDir("ai-created")).toBe("desc");
    expect(naturalDir("cost")).toBe("desc");
    expect(naturalDir("name")).toBe("asc");
    expect(naturalDir("generation")).toBe("asc");
    expect(naturalDir("review")).toBe("asc");
    // A grouped order starts with the rows the group is about.
    expect(naturalDir("approved")).toBe("desc");
    expect(naturalDir("unapproved")).toBe("desc");
  });

  it("never leaves the order of two equal rows to chance", () => {
    const twins = [
      row("b.svg", { id: "b", svgCreatedAt: 5 }),
      row("a.svg", { id: "a", svgCreatedAt: 5 }),
    ];
    expect(ids(sortSvgRows(twins, "svg-created"))).toEqual(["a", "b"]);
    expect(ids(sortSvgRows(twins, "svg-created", [], "asc"))).toEqual(["a", "b"]);
  });

  it("still filters first and sorts what is left, in either direction", () => {
    const rows = [row("a.svg", { id: "a", generation: "not-generated", svgCreatedAt: 3 }), ...ROWS];
    const kept = rows.filter((r) => r.generation === "generated");
    expect(ids(sortSvgRows(kept, "svg-created", [], "asc"))).toEqual(["a", "b", "c"]);
    expect(ids(sortSvgRows(kept, "svg-created", [], "desc"))).toEqual(["c", "b", "a"]);
  });
});

function other(dir: SvgDir): SvgDir {
  return dir === "asc" ? "desc" : "asc";
}
