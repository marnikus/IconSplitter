// svgrows.test.ts — the Generate SVG list is derived from approved pairs and
// sidecars only; filters/sort/search behave like the rest of the app.
import { describe, expect, it } from "vitest";
import { approvedSources, DEFAULT_ROW_FILTERS, filterRows, rowFrom, sortRows } from "../src/svggen/rows";
import type { ViewPair } from "../src/lib/reviewfilter";
import { addVersion, emptySidecar, type SvgVersionRec } from "../src/lib/svgsidecar";

const pair = (id: string, over: Partial<ViewPair> = {}): ViewPair => ({
  pairId: id, base: id, relDir: "coastal",
  source: { relPath: `coastal/${id}.png`, size: 1, mtime: 1 },
  ai: { relPath: `coastal/${id}_AI.png`, size: 2, mtime: 2 },
  created: 1, generated: 2, decision: "approved", reviewedAt: null, ...over,
});

const rec = (version: number, over: Partial<SvgVersionRec> = {}): SvgVersionRec => ({
  version, file: `f.v${version}.svg`, createdAt: "c", prompt: "p", provider: "requesty",
  model: "m", batchId: null, requestId: null, position: 1, compositeHash: null,
  tokensIn: 1, tokensOut: 1, tokensTotal: 2, cost: 0.01, costKind: "actual",
  validationOk: true, validationWarnings: [], review: "pending", status: "generated", safeError: null, ...over,
});

describe("approvedSources", () => {
  it("keeps approved pairs with an AI side only", () => {
    const rows = approvedSources([pair("a"), pair("b", { decision: "pending" }), pair("c", { ai: null })]);
    expect(rows.map((r) => r.pairId)).toEqual(["a"]);
  });
});

describe("rowFrom", () => {
  it("no sidecar means not generated and no review", () => {
    const r = rowFrom(pair("a"), null, null, false);
    expect(r.generation).toBe("not-generated");
    expect(r.review).toBeNull();
    expect(r.version).toBeNull();
  });

  it("a valid version shows generated/pending with its usage", () => {
    const sc = addVersion(emptySidecar("a", "p", "fp"), rec(1));
    const r = rowFrom(pair("a"), sc, null, false);
    expect(r.generation).toBe("generated");
    expect(r.review).toBe("pending");
    expect(r.version).toBe(1);
    expect(r.tokensTotal).toBe(2);
  });

  it("only failed versions read as failed, never generated", () => {
    const sc = addVersion(emptySidecar("a", "p", "fp"), rec(1, { status: "failed", validationOk: false }));
    expect(rowFrom(pair("a"), sc, null, false).generation).toBe("failed");
  });

  it("a live generating state wins over the stored sidecar", () => {
    const r = rowFrom(pair("a"), null, "generating", false);
    expect(r.generation).toBe("generating");
  });
});

describe("filterRows / sortRows", () => {
  const rows = [
    rowFrom(pair("a"), null, null, false),
    rowFrom(pair("b"), addVersion(emptySidecar("b", "p", "fp"), rec(1, { review: "approved" })), null, false),
  ];

  it("filters by generation, review and search", () => {
    expect(filterRows(rows, { ...DEFAULT_ROW_FILTERS, generation: "not-generated" }).map((r) => r.pairId)).toEqual(["a"]);
    expect(filterRows(rows, { ...DEFAULT_ROW_FILTERS, review: "approved" }).map((r) => r.pairId)).toEqual(["b"]);
    expect(filterRows(rows, { ...DEFAULT_ROW_FILTERS, search: "coastal/_ai" }).length).toBe(0);
    expect(filterRows(rows, { ...DEFAULT_ROW_FILTERS, search: "_AI" }).length).toBe(2);
  });

  it("sorts by name and by cost desc", () => {
    expect(sortRows(rows, "name").map((r) => r.name)[0]).toContain("a");
    expect(sortRows(rows, "cost").map((r) => r.pairId)).toEqual(["b", "a"]);
  });
});
