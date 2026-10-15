# Exact Root Cause — Commit 3398b0a vs 1f1ab76

## User Report
- Commit 1f1ab76 (A/D/W hotkeys) — no perf bug
- Commit 3398b0a (warning shows 4 icons but marked warning) — introduces scroll lag, CPU spike

## Diff Analysis

### Files changed in 3398b0a:
- src/batch/batchOps.ts (15 lines)
- src/batch/useBatchPreview.ts (79 lines)
- dist/index.html (bundle)

### batchOps.ts change
```ts
// Before (1f1ab76):
const rows = images.map(toRow)
const checked = rows.filter...
setS(p => { existing, nextMerges, return {...p, busy:null, rows, refWarnings, rowMerges} })

// After (3398b0a):
setS(p => {
  const prevReview = new Map(p.rows.map(r => [relPathLower, review]))
  const rows = images.map(img => {
    status = statuses.get(...) ?? unprocessed
    diskReview = reviews.get(...) ?? pending
    prev = prevReview.get(...)
    review = prev && prev!=="pending" ? prev : diskReview
    return {...img, status, review, selected}
  })
  checked = rows.filter...
  patchBatch inside setS
  existing, nextMerges
  return {...p, busy:null, rows, refWarnings, rowMerges}
})
```
- Cost: O(n) Map build + O(n) rows map, inside setS callback (runs on main thread during scan)
- Not scroll-related, only on scan (refresh). Should not cause scroll lag, but adds work during scan.

### useBatchPreview.ts change — THE CULPRIT

#### Before (1f1ab76):
- File header: high-perf preview owns cache, load, thumb render, queue, abort and single-row immediate preview
- Functions: useCaches, usePreviewState, useLoadFile, savePersisted, loadPersisted, makeFallback, evictMap, evictLru, renderThumbs, renderThumbsYielding, loadImgSafe, getOrAnalyze, buildEntry, effectiveMerge, useDoPreviewCore, useDoPreview, usePreviewOne, markLoading, runWorkers, makeRunId, initPreviewProgress, makePreviewProgressUpdater, usePreviewQueue, usePreviewSingle, clear, clearMemory, cancel, dismiss, prevRootRef effect, loadPersisted effect (only setPreviews), abort cleanup
- No useReviewSync, no usePersistedLoad with onReviewed, no useRootChange extracted

#### After (3398b0a):
Added 3 new hooks:
```ts
function useRootChange(root, clearMemory) { ... }
function usePersistedLoad(setPreviews, onReviewed) {
  useEffect(() => {
    void (async () => {
      const loaded = await loadPersisted();
      if (loaded.size > 0) {
        setPreviews(prev => { if (prev.size>0) return prev; return loaded; });
        for (const e of loaded.values()) onReviewed?.(e.relPath, e.count);
      }
    })();
  }, [setPreviews, onReviewed]);
}
function useReviewSync(rows, previews, onReviewed) {
  useEffect(() => {
    if (!rows.length || !previews.size) return;
    for (const entry of previews.values()) {
      const row = rows.find(r => r.relPath.toLowerCase() === entry.relPath.toLowerCase());
      if (!row) continue;
      if (row.review === "declined") continue;
      const expected = entry.count===4 ? "approved" : "warning";
      if (row.review !== expected) onReviewed?.(entry.relPath, entry.count);
    }
  }, [rows, previews, onReviewed]);
}
```

#### Performance Killers in this commit:

1. **O(n²) in useReviewSync**
   - `previews.values()` loop (n=1000) × `rows.find` (O(n)=1000) = 1M string lowercasing + comparisons per effect run
   - Effect runs when rows OR previews OR onReviewed changes

2. **Unstable onReviewed dependency**
   - In BatchPanel.tsx (unchanged between commits): 
     ```ts
     const onReviewed = useCallback((relPath, count) => {
       const review = count===4 ? "approved" : "warning";
       v.decide([relPath], review);
     }, [v]);
     ```
   - `v` is from `useBatchView()` which in 1f1ab76 and 3398b0a both does `return makeView({...})` without useMemo → new object every render
   - `v.decide` is `(ids, review) => core.decide(ids, review)` new arrow every makeView call → new function every render
   - Therefore `v` changes every render → `onReviewed` changes every render (useCallback dep [v])
   - Therefore `useReviewSync` effect dependency [rows, previews, onReviewed] → onReviewed changes every render → effect runs every render
   - Every render does 1M comparisons → CPU spike, even without scroll, but scroll triggers re-renders via active row, selection, etc.

3. **Per-entry onReviewed in usePersistedLoad**
   - `for (const e of loaded.values()) onReviewed?.(e.relPath, e.count)` — 1000 calls
   - Each onReviewed calls `v.decide([relPath], review)` → setS (updates rows) + applyReviewOutcomes (writes JSON statefile per folder)
   - 1000 setS → 1000 React re-renders of 1000 rows = 1M RowView renders
   - 1000 file writes (IDB or FS) → I/O storm

4. **usePersistedLoad dependency on unstable onReviewed**
   - Effect deps [setPreviews, onReviewed] → onReviewed changes every render → effect re-runs every render
   - Each run does `await loadPersisted()` (IDB getAll) reading potentially 60MB if thumbs persisted, plus loop calling onReviewed 1000 times
   - Even though setPreviews has guard `if (prev.size>0) return prev`, it still does IDB read and onReviewed calls every render

5. **No batching**
   - 1000 individual decide calls instead of 2 batched calls (approve 500, warn 500)

## Why 1f1ab76 had no bug
- No useReviewSync, no usePersistedLoad with onReviewed loop
- Only previewSelected and previewSingle called onReviewed per preview generation (one at a time, during explicit user action, not on every render)
- No O(n²) find, no effect running every render

## Fix Strategy (already partially done in later commits, but need to ensure exact fix for 3398b0a regression)

### Immediate fix for 3398b0a exact code:
- Make `v` stable: wrap `makeView` in `useMemo` in `useBatchView.ts`
- Make `decide` stable: useCallback in makeView or directly use core.decide stable
- Make `onReviewed` stable: use ref or useCallback with stable deps
- Replace `rows.find` with Map lookup O(1)
- Batch onReviewed calls via `onReviewedBatch`
- Debounce useReviewSync via seen Set + requestIdleCallback
- Store only metadata in IDB (no thumbs) to avoid 60MB read
- Remove per-row IntersectionObserver (added later, not in 3398b0a but contributes)
- Memoize RowView to avoid re-render storm

### Verification:
- After fix, `useReviewSync` should run only when rows or previews actually change, not every render
- O(n) not O(n²)
- 2 decide calls not 1000
- Scroll should not trigger effect

## References
- git diff 1f1ab76..3398b0a
- src/batch/useBatchPreview.ts, BatchPanel.tsx, useBatchView.ts
- Previous docs: 2026-10-15-batch-perf-freeze, 2026-10-15-batch-perf-freeze-v2
