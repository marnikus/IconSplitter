import { describe, expect, it } from "vitest";
import { applyBatchFilters, ALL_BATCH_FILTER, monthKey, type BatchRowLike } from "../src/lib/batchfilter";

function row(over: Partial<BatchRowLike> & { mtime: number }): BatchRowLike {
  return {
    name: "a_AI.png",
    relPath: "a/a_AI.png",
    dirPath: "a",
    status: "unprocessed",
    ...over,
  };
}

describe("batchfilter", () => {
  it("all passes everything", () => {
    const rows = [row({ mtime: 1000 }), row({ mtime: 2000, name: "b.png", relPath: "b/b.png", dirPath: "b" })];
    expect(applyBatchFilters(rows, ALL_BATCH_FILTER)).toHaveLength(2);
  });

  it("filters by status", () => {
    const rows = [row({ mtime: 1000, status: "unprocessed" }), row({ mtime: 2000, status: "processed" })];
    const filtered = applyBatchFilters(rows, { ...ALL_BATCH_FILTER, status: "processed" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].status).toBe("processed");
  });

  it("filters by month", () => {
    const tJan = new Date("2024-01-15").getTime();
    const tFeb = new Date("2024-02-15").getTime();
    const rows = [row({ mtime: tJan }), row({ mtime: tFeb })];
    const month = monthKey(tJan);
    const filtered = applyBatchFilters(rows, { ...ALL_BATCH_FILTER, date: { mode: "month", month } });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].mtime).toBe(tJan);
  });

  it("filters by custom range", () => {
    const rows = [row({ mtime: 1000 }), row({ mtime: 5000 }), row({ mtime: 9000 })];
    const filtered = applyBatchFilters(rows, { ...ALL_BATCH_FILTER, date: { mode: "custom", from: 4000, to: 6000 } });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].mtime).toBe(5000);
  });

  it("filters by search case-insensitive", () => {
    const rows = [row({ mtime: 1000, name: "icon-fire_AI.png", relPath: "cat/icon-fire_AI.png", dirPath: "cat" }), row({ mtime: 2000, name: "other_AI.png", relPath: "dog/other_AI.png", dirPath: "dog" })];
    const filtered = applyBatchFilters(rows, { ...ALL_BATCH_FILTER, search: "FIRE" });
    expect(filtered).toHaveLength(1);
  });

  it("combines filters", () => {
    const t = new Date("2024-03-01").getTime();
    const rows = [
      row({ mtime: t, status: "processed", name: "a.png", relPath: "a/a.png", dirPath: "a" }),
      row({ mtime: t, status: "unprocessed", name: "a.png", relPath: "a/a.png", dirPath: "a" }),
    ];
    const filtered = applyBatchFilters(rows, { date: { mode: "all" }, status: "processed", search: "" });
    expect(filtered).toHaveLength(1);
  });
});
