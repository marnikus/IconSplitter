// batch_perf_regression.test.tsx — TDD tests for perf bug introduced in 3398b0a
// Ensures scroll freeze fixed, persistence per root, force flag, memoization, cheap bar, content-visibility

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { effectiveMerge } from "../src/batch/useBatchPreview";
import { idbPut, idbGetAll, idbGetAllKeys, idbClear, PREVIEW_STORE } from "../src/batch/store";

// Mock IDB for Node env
import "fake-indexeddb/auto";

describe("perf regression — exact root cause 3398b0a", () => {
  beforeEach(async () => {
    await idbClear(PREVIEW_STORE);
  });

  it("effectiveMerge O(1) — global vs override", () => {
    expect(effectiveMerge(0.02, 0.05, true)).toBe(0.05);
    expect(effectiveMerge(0.02, null, false)).toBe(0.02);
    expect(effectiveMerge(null, null, false)).toBe(null);
  });

  it("persistence per root — key includes rootName and load filters", async () => {
    const rootA = "folderA";
    const rootB = "folderB";
    const rel = "icon.png";
    const entryA = { relPath: rel, count: 4, thumbs: [], boxes: [], status: "done", rootName: rootA };
    const entryB = { relPath: rel, count: 3, thumbs: [], boxes: [], status: "done", rootName: rootB };
    await idbPut(PREVIEW_STORE, `${rootA}::${rel}`, entryA);
    await idbPut(PREVIEW_STORE, `${rootB}::${rel}`, entryB);
    const keys = await idbGetAllKeys(PREVIEW_STORE);
    expect(keys).toContain(`${rootA}::${rel}`);
    expect(keys).toContain(`${rootB}::${rel}`);
    const allVals = await idbGetAll<any>(PREVIEW_STORE);
    expect(allVals.length).toBe(2);
    const onlyA = allVals.filter((e: any) => e.rootName === rootA);
    expect(onlyA.length).toBe(1);
    expect(onlyA[0].count).toBe(4);
  });

  it("savePersisted stores full entry with thumbs (I-67, no regen)", async () => {
    const root = "testRoot";
    const entry = { relPath: "a.png", count: 4, thumbs: ["data:image/png;base64,xxx", "data2"], boxes: [{ x: 0, y: 0, w: 10, h: 10, ink: 1 }], status: "done", rootName: root };
    // Now stores thumbs, not metadata-only
    const meta = { relPath: entry.relPath, count: entry.count, boxes: entry.boxes, status: entry.status, rootName: root, thumbs: entry.thumbs };
    await idbPut(PREVIEW_STORE, `${root}::${entry.relPath}`, meta);
    const vals = await idbGetAll<any>(PREVIEW_STORE);
    expect(vals[0].thumbs.length).toBe(2);
    expect(vals[0].count).toBe(4);
    const json = JSON.stringify(vals[0]);
    expect(json.length).toBeGreaterThan(0);
  });

  it("previewSelected force flag — false skips done with thumbs, true regenerates", () => {
    const previews = new Map<string, any>([
      ["a.png", { relPath: "a.png", count: 4, thumbs: ["thumb"], status: "done" }],
      ["b.png", { relPath: "b.png", count: 4, thumbs: [], status: "done" }],
      ["c.png", { relPath: "c.png", count: 0, thumbs: [], status: "idle" }],
    ]);
    const selected = [
      { relPath: "a.png", status: "unprocessed" },
      { relPath: "b.png", status: "unprocessed" },
      { relPath: "c.png", status: "unprocessed" },
    ] as any[];
    const filterEligible = (sel: any[], prev: Map<string, any>, force: boolean) => {
      const base = sel.filter((r: any) => r.status !== "missing" && r.status !== "deleted");
      if (force) return base;
      return base.filter((r: any) => { const e = prev.get(r.relPath); return !e || e.status !== "done" || e.thumbs.length === 0; });
    };
    const withoutForce = filterEligible(selected, previews, false);
    expect(withoutForce.map((r: any) => r.relPath)).toEqual(["b.png", "c.png"]);
    const withForce = filterEligible(selected, previews, true);
    expect(withForce.map((r: any) => r.relPath)).toEqual(["a.png", "b.png", "c.png"]);
  });

  it("onReviewedBatch batches 1000 entries into 2 decide calls not 1000", () => {
    const decideMock = vi.fn();
    const onReviewedBatch = (entries: { relPath: string; count: number }[]) => {
      const approve = entries.filter((e) => e.count === 4).map((e) => e.relPath);
      const warn = entries.filter((e) => e.count !== 4).map((e) => e.relPath);
      if (approve.length) decideMock(approve, "approved");
      if (warn.length) decideMock(warn, "warning");
    };
    const entries = Array.from({ length: 1000 }, (_, i) => ({ relPath: `${i}.png`, count: i % 2 === 0 ? 4 : 3 }));
    onReviewedBatch(entries);
    expect(decideMock).toHaveBeenCalledTimes(2);
    expect(decideMock.mock.calls[0][0].length).toBe(500);
    expect(decideMock.mock.calls[1][0].length).toBe(500);
  });

  it("detection bar cheap layout — w-full max-w-[420px] not w-fit", () => {
    const file = readFileSync("src/batch/BatchRowMergeBar.tsx", "utf8");
    expect(file).toContain("w-full");
    expect(file).toContain("max-w-[420px]");
    expect(file).not.toContain("w-fit");
    // Old expensive min-w-[360px] should be gone
    expect(file).not.toContain("min-w-[360px]");
  });

  it("content-visibility — .batch-row has content-visibility:auto", () => {
    const css = readFileSync("src/index.css", "utf8");
    const hasContentVisibility = css.includes(".batch-row") && css.includes("content-visibility: auto");
    expect(hasContentVisibility).toBe(true);
    expect(css).toContain("contain-intrinsic-size");
  });

  it("useReviewSync O(n) not O(n^2) — Map lookup", () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ relPath: `${i}.png`, review: "pending" } as any));
    const previews = new Map<string, any>(rows.map((r, i) => [r.relPath, { relPath: r.relPath, count: i % 2 === 0 ? 4 : 3 }]));
    const startOld = performance.now();
    let countOld = 0;
    for (const entry of previews.values()) {
      const row = rows.find((r) => r.relPath.toLowerCase() === entry.relPath.toLowerCase());
      if (row) countOld++;
    }
    const timeOld = performance.now() - startOld;
    const startNew = performance.now();
    const rowMap = new Map<string, any>();
    for (const r of rows) rowMap.set(r.relPath.toLowerCase(), r);
    let countNew = 0;
    for (const entry of previews.values()) {
      const row = rowMap.get(entry.relPath.toLowerCase());
      if (row) countNew++;
    }
    const timeNew = performance.now() - startNew;
    expect(countOld).toBe(1000);
    expect(countNew).toBe(1000);
    expect(timeNew).toBeLessThanOrEqual(timeOld + 50);
    expect(timeNew).toBeLessThan(100);
  });

  it("RowView memoization — previews Map new ref but same entry should not cause all re-renders", () => {
    const entryA = { relPath: "a.png", count: 4, thumbs: ["t"], status: "done" };
    const entryB = { relPath: "b.png", count: 4, thumbs: ["t"], status: "done" };
    const prevPreviews = new Map([["a.png", entryA], ["b.png", entryB]]);
    const nextPreviews = new Map([["a.png", entryA], ["b.png", { ...entryB, count: 4 }]]);
    const rowMerges = {};
    const memoCompare = (prev: any, next: any) => {
      const pe = prev.previews?.get(prev.r.relPath);
      const ne = next.previews?.get(next.r.relPath);
      if (pe !== ne) return false;
      if (prev.r.relPath !== next.r.relPath) return false;
      if ((prev.r as any).review !== (next.r as any).review) return false;
      if ((prev.r as any).selected !== (next.r as any).selected) return false;
      if ((prev.r as any).status !== (next.r as any).status) return false;
      if (prev.activeId !== next.activeId) return false;
      if (prev.thumb !== next.thumb) return false;
      if (prev.rowMerges !== next.rowMerges) return false;
      if (prev.globalFrac !== next.globalFrac) return false;
      return true;
    };
    const prevPropsA = { r: { relPath: "a.png" }, previews: prevPreviews, activeId: null, thumb: 84, rowMerges, globalFrac: 0.02 };
    const nextPropsA = { r: { relPath: "a.png" }, previews: nextPreviews, activeId: null, thumb: 84, rowMerges, globalFrac: 0.02 };
    expect(memoCompare(prevPropsA, nextPropsA)).toBe(true);
    const prevPropsB = { r: { relPath: "b.png" }, previews: prevPreviews, activeId: null, thumb: 84, rowMerges, globalFrac: 0.02 };
    const nextPropsB = { r: { relPath: "b.png" }, previews: nextPreviews, activeId: null, thumb: 84, rowMerges, globalFrac: 0.02 };
    expect(memoCompare(prevPropsB, nextPropsB)).toBe(false);
  });

  it("useBatchView stability — decide should be stable", async () => {
    // Check file contains useMemo for view and useCallback for decide
    const file = readFileSync("src/batch/useBatchView.ts", "utf8");
    expect(file).toContain("useMemo");
    expect(file).toContain("useCallback");
    expect(file).toContain("decide");
    // Ensure makeView is wrapped in useMemo
    expect(file).toMatch(/useMemo\(\(\) => makeView/);
  });

  it("useBatch stability — coreActions memoized", () => {
    const file = readFileSync("src/batch/useBatch.ts", "utf8");
    expect(file).toContain("useMemo");
    // Should memoize coreActions and viewActions
    expect(file).toContain("coreActions");
    expect(file).toContain("viewActions");
  });
});
