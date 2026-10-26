// @vitest-environment node
import { describe, expect, it } from "vitest";
import { batchSortLabel, parseBatchSort, sortBatchRows } from "../src/lib/batchsort";
import { parseSort, sortLabel, sortPairs } from "../src/lib/reviewsort";
import { sortSvgRows, type SvgListRow } from "../src/lib/svglist";
import { sortUploadRows } from "../src/upload/rowlist";
import type { UploadListRow } from "../src/upload/types";
import type { ViewPair } from "../src/lib/reviewfilter";

const names = (rows: { id: string }[]) => rows.map((r) => r.id);
const svg = (id: string, review: SvgListRow["review"]): SvgListRow => ({ id, name: id, relPath: id,
  review, generation: "generated", generatedAt: null, cost: null, costEstimated: false, tokens: null, version: 1 });
const upload = (id: string, metadata: UploadListRow["metadata"]): UploadListRow => ({ id, name: id,
  relPath: id, metadata, status: "processed", approvedValid: 1, badges: [] });
const batch = (name: string, review?: "approved" | "pending" | "declined" | "warning") => ({ name,
  relPath: name, dirPath: "", mtime: 1, status: "processed" as const, review, selected: false });
const pair = (pairId: string, decision: ViewPair["decision"]): ViewPair => ({ pairId, base: pairId,
  suffix: "", relDir: "", created: 1, generated: 1, decision, reviewedAt: null, source: null, ai: null });

describe("review-list binary state sorting", () => {
  it("Batch uses canonical case-insensitive checks, not the processing mirror; preserves input", () => {
    const rows = [batch("b", "approved"), batch("a"), batch("c", "declined"), batch("d", "warning")];
    const before = [...rows];
    expect(sortBatchRows(rows, { by: "selected", dir: "asc" }, ["B"]).map((r) => r.name)).toEqual(["a", "c", "d", "b"]);
    expect(sortBatchRows(rows, { by: "selected", dir: "desc" }, ["B"]).map((r) => r.name)).toEqual(["b", "a", "c", "d"]);
    expect(sortBatchRows(rows, { by: "approval", dir: "asc" }).map((r) => r.name)).toEqual(["a", "c", "d", "b"]);
    expect(sortBatchRows(rows, { by: "approval", dir: "desc" }).map((r) => r.name)).toEqual(["b", "a", "c", "d"]);
    expect(rows).toEqual(before);
  });
  it("Selection groups ALL non-approved decisions together and uses checkbox ids", () => {
    const rows = [pair("b", "approved"), pair("a", "declined"), pair("c", "pending")];
    expect(sortPairs(rows, { by: "selected", dir: "asc" }, ["c"]).map((r) => r.pairId)).toEqual(["a", "b", "c"]);
    expect(sortPairs(rows, { by: "selected", dir: "desc" }, ["c"]).map((r) => r.pairId)).toEqual(["c", "a", "b"]);
    expect(sortPairs(rows, { by: "approval", dir: "asc" }).map((r) => r.pairId)).toEqual(["a", "c", "b"]);
    expect(sortPairs(rows, { by: "approval", dir: "desc" }).map((r) => r.pairId)).toEqual(["b", "a", "c"]);
    expect(rows.map((r) => r.pairId)).toEqual(["b", "a", "c"]);
  });
  it("SVG offers both selection and binary approval directions without modifying rows", () => {
    const rows = [svg("b", "approved"), svg("d", "needs-review"), svg("a", "declined"), svg("c", "pending")];
    expect(names(sortSvgRows(rows, "selected", ["c", "hidden"]))).toEqual(["c", "a", "b", "d"]);
    expect(names(sortSvgRows(rows, "unselected", ["c"]))).toEqual(["a", "b", "d", "c"]);
    expect(names(sortSvgRows(rows, "unapproved"))).toEqual(["a", "c", "d", "b"]);
    expect(names(sortSvgRows(rows, "approved"))).toEqual(["b", "a", "c", "d"]);
    expect(names(rows)).toEqual(["b", "d", "a", "c"]);
  });
  it("Upload approval means accepted metadata, NOT successful export or approved SVG source", () => {
    const rows = [upload("b", "accepted"), upload("a", "generated"), upload("c", "empty"), upload("d", "invalid")];
    expect(names(sortUploadRows(rows, "selected", ["c"]))).toEqual(["c", "a", "b", "d"]);
    expect(names(sortUploadRows(rows, "unselected", ["c"]))).toEqual(["a", "b", "d", "c"]);
    expect(names(sortUploadRows(rows, "unapproved"))).toEqual(["a", "c", "d", "b"]);
    expect(names(sortUploadRows(rows, "approved"))).toEqual(["b", "a", "c", "d"]);
    expect(names(rows)).toEqual(["b", "a", "c", "d"]);
  });
  it("validates and round-trips new persisted Batch/Selection sort keys", () => {
    for (const by of ["selected", "approval"] as const) {
      for (const dir of ["asc", "desc"] as const) {
        expect(parseBatchSort({ by, dir })).toEqual({ by, dir });
        expect(parseSort({ by, dir })).toEqual({ by, dir });
        const group = by === "selected" ? "selected" : "approved";
        const order = dir === "asc" ? `Not ${group} first` : `${group[0].toUpperCase()}${group.slice(1)} first`;
        expect(batchSortLabel({ by, dir })).toContain(order);
        expect(sortLabel({ by, dir })).toContain(order);
      }
    }
    expect(parseBatchSort({ by: "invented", dir: "bad" })).toEqual({ by: "date", dir: "desc" });
    expect(parseSort({ by: "invented", dir: "bad" })).toEqual({ by: "date", dir: "desc" });
  });
});
