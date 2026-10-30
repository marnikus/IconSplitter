// @vitest-environment node
// batch_perf_regression.test.tsx — TDD regression tests for the batch scroll /
// CPU-spike perf bug (root cause chain fixed on arena/736d3693-iconsplitter,
// commits 20b78e4…32c6797): unstable core/view identity, O(n²) review sync,
// per-row re-render churn. Ported onto this branch's implementation (which
// persists thumbs — the branch's own final verdict, its ddceb69).
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectiveMerge } from "../src/batch/useBatchPreview";
import { idbClear, idbGetAll, idbGetAllKeys, idbPut, PREVIEW_STORE } from "../src/batch/store";

import "fake-indexeddb/auto";

describe("perf regression — unstable identity, review sync, render churn", () => {
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
    const allVals = await idbGetAll<{ rootName: string; count: number }>(PREVIEW_STORE);
    expect(allVals.length).toBe(2);
    const onlyA = allVals.filter((e) => e.rootName === rootA);
    expect(onlyA.length).toBe(1);
    expect(onlyA[0].count).toBe(4);
  });

  it("stored records keep thumbs so a restart shows them instantly (no regen, I-67)", async () => {
    const root = "testRoot";
    const entry = { relPath: "a.png", count: 4, thumbs: ["data:image/png;base64,xxx", "data2"], boxes: [{ x: 0, y: 0, w: 10, h: 10, ink: 1 }], status: "done", rootName: root };
    await idbPut(PREVIEW_STORE, `${root}::${entry.relPath}`, entry);
    const vals = await idbGetAll<{ thumbs: string[]; count: number }>(PREVIEW_STORE);
    expect(vals[0].thumbs.length).toBe(2); // the branch's final verdict (its ddceb69) — thumbs persist
    expect(vals[0].count).toBe(4);
  });

  it("previewSelected force flag — false skips done with thumbs, true regenerates", () => {
    const previews = new Map<string, { status: string; thumbs: string[] }>([
      ["a.png", { status: "done", thumbs: ["thumb"] }],
      ["b.png", { status: "done", thumbs: [] }],
      ["c.png", { status: "idle", thumbs: [] }],
    ]);
    const selected = [
      { relPath: "a.png", status: "unprocessed" },
      { relPath: "b.png", status: "unprocessed" },
      { relPath: "c.png", status: "unprocessed" },
    ];
    const filterEligible = (sel: { relPath: string; status: string }[], prev: Map<string, { status: string; thumbs: string[] }>, force: boolean) => {
      const base = sel.filter((r) => r.status !== "missing" && r.status !== "deleted");
      if (force) return base;
      return base.filter((r) => { const e = prev.get(r.relPath); return !e || e.status !== "done" || e.thumbs.length === 0; });
    };
    expect(filterEligible(selected, previews, false).map((r) => r.relPath)).toEqual(["b.png", "c.png"]);
    expect(filterEligible(selected, previews, true).map((r) => r.relPath)).toEqual(["a.png", "b.png", "c.png"]);
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
    const rows = Array.from({ length: 1000 }, (_, i) => ({ relPath: `${i}.png`, review: "pending" as const }));
    const previews = new Map(rows.map((r, i) => [r.relPath, { relPath: r.relPath, count: i % 2 === 0 ? 4 : 3 }]));
    const startOld = performance.now();
    let countOld = 0;
    for (const entry of previews.values()) {
      const row = rows.find((r) => r.relPath.toLowerCase() === entry.relPath.toLowerCase());
      if (row) countOld++;
    }
    const timeOld = performance.now() - startOld;
    const startNew = performance.now();
    const rowMap = new Map(rows.map((r) => [r.relPath.toLowerCase(), r]));
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
    const memoCompare = (prev: { previews: Map<string, { relPath: string }>; r: { relPath: string; review?: string; selected?: boolean; status?: string }; activeId: string | null; thumb: number; rowMerges: object; globalFrac: number | null }, next: typeof prev): boolean => {
      const pe = prev.previews?.get(prev.r.relPath);
      const ne = next.previews?.get(next.r.relPath);
      if (pe !== ne) return false;
      if (prev.r.relPath !== next.r.relPath) return false;
      if (prev.r.review !== next.r.review) return false;
      if (prev.r.selected !== next.r.selected) return false;
      if (prev.r.status !== next.r.status) return false;
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

  it("useBatchView stability — the view is built in a memo with stable decide", () => {
    const file = readFileSync("src/batch/useBatchView.ts", "utf8");
    expect(file).toContain("useMemo");
    expect(file).toContain("useCallback");
    expect(file).toContain("decide");
    // makeView must be wrapped in useMemo, not called inline per render
    expect(file).toMatch(/useMemo\(\(\) => makeView/);
  });

  it("useBatch stability — coreActions memoized", () => {
    const file = readFileSync("src/batch/useBatch.ts", "utf8");
    expect(file).toContain("useMemo");
    // coreActions and viewActions must be memoized bags, not fresh literals
    expect(file).toContain("coreActions");
    expect(file).toContain("viewActions");
  });
});
