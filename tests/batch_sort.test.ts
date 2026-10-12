import { describe, expect, it } from "vitest";
import { sortBatchRows, DEFAULT_BATCH_SORT } from "../src/lib/batchsort";
import type { BatchSortable } from "../src/lib/batchsort";

function row(over: Partial<BatchSortable> & { mtime: number; name: string; relPath: string }): BatchSortable {
  return {
    dirPath: "",
    status: "unprocessed",
    ...over,
  };
}

describe("batchsort", () => {
  it("sorts by date desc default newest first", () => {
    const rows = [row({ mtime: 1000, name: "a.png", relPath: "a/a.png" }), row({ mtime: 3000, name: "b.png", relPath: "b/b.png" }), row({ mtime: 2000, name: "c.png", relPath: "c/c.png" })];
    const sorted = sortBatchRows(rows, DEFAULT_BATCH_SORT);
    expect(sorted.map((r) => r.mtime)).toEqual([3000, 2000, 1000]);
  });

  it("sorts by date asc", () => {
    const rows = [row({ mtime: 3000, name: "b.png", relPath: "b/b.png" }), row({ mtime: 1000, name: "a.png", relPath: "a/a.png" })];
    const sorted = sortBatchRows(rows, { by: "date", dir: "asc" });
    expect(sorted[0].mtime).toBe(1000);
  });

  it("sorts by name case-insensitive", () => {
    const rows = [row({ mtime: 1000, name: "Zebra_AI.png", relPath: "z/z.png" }), row({ mtime: 1000, name: "apple_AI.png", relPath: "a/a.png" })];
    const sorted = sortBatchRows(rows, { by: "name", dir: "asc" });
    expect(sorted[0].name).toBe("apple_AI.png");
  });

  it("sorts by path", () => {
    const rows = [row({ mtime: 1000, name: "a.png", relPath: "b/a.png", dirPath: "b" }), row({ mtime: 1000, name: "a.png", relPath: "a/a.png", dirPath: "a" })];
    const sorted = sortBatchRows(rows, { by: "path", dir: "asc" });
    expect(sorted[0].dirPath).toBe("a");
  });

  it("sorts by status rank", () => {
    const rows = [row({ mtime: 1000, name: "a.png", relPath: "a/a.png", status: "processed" }), row({ mtime: 1000, name: "b.png", relPath: "b/b.png", status: "unprocessed" })];
    const sorted = sortBatchRows(rows, { by: "status", dir: "asc" });
    expect(sorted[0].status).toBe("unprocessed");
  });

  it("stable tiebreak on relPath", () => {
    const rows = [row({ mtime: 1000, name: "a.png", relPath: "b/a.png" }), row({ mtime: 1000, name: "a.png", relPath: "a/a.png" })];
    const sorted = sortBatchRows(rows, { by: "date", dir: "asc" });
    expect(sorted[0].relPath).toBe("a/a.png");
  });
});
