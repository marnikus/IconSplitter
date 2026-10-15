# Batch Perf Freeze V2 — Deep Research 2026-10-15 (second pass)

## Symptom (still after first fix)
- After scrolling Batch page with 1000 images, page lags, freezing, CPU raises dramatically
- First fix (20b78e4) added content-visibility, metadata-only IDB, lazy thumbs via IntersectionObserver per row, cheap bar layout
- User reports still lagging after scroll

## Current Code Review (commit 20b78e4)

### ScanTable.tsx
- `useInView` creates **new IntersectionObserver per row** (1000 observers)
  - Each observer has callback that checks isIntersecting and calls onVisible
  - 1000 observers → 1000 callbacks, each with rootMargin 200px, heavy
  - Observer creation in useEffect per row, no sharing, causes memory + CPU
- `RowView` has `useRowRefs` that creates scrollRef + visRef, each with its own observer
- `setRefs` callback merges two refs (scrollRef and visRef) via assignment to .current, which is anti-pattern and may cause extra renders
- `onVisible` triggers `previewSingle(r)` when entry has count>0 but thumbs empty and done
  - If user scrolls quickly through 1000 rows, 1000 previewSingle calls may be triggered, each loads file via FS API, analyze, detect, render thumbs (CPU heavy)
  - No throttling, no queue, no abort, could cause concurrent file reads (MAX_CONCURRENT is 3 for preview queue, but previewSingle uses new AbortController per call, no limit)
  - Could cause CPU spike during scroll

### useBatchPreview.ts
- `usePreviewQueue` now has `filterEligible` that checks previews Map for each selected row, O(n) but okay
- `runWorkers` uses yieldToFrame and yieldToUI between rows, good for non-blocking
- `loadPersisted` still does getAllKeys + getAll (two transactions) even though metadata only ~1MB, okay but could be optimized to single getAll
- `savePersisted` stores metadata without thumbs, good, but still does void idbPut per preview (1000 puts) without batching
- `useReviewSync` builds rowMap (1000) and loops over previews (1000) on every rows/previews change, with seen Set to avoid repeat, okay but still runs on every render if rows or previews reference changes (Map new reference each setPreviews)
- `usePersistedLoad` merges loaded Map into prev Map, creating new Map each time, triggers re-render of all rows

### BatchRowMergeBar.tsx
- Changed to w-full max-w-[420px] mx-auto, better than w-fit, but still has range input with onChange + onInput both calling updateLocal (double events)
- Each row has its own local state for slider value, 1000 useState hooks, okay but could be heavy

### index.css
- Added content-visibility:auto contain-intrinsic-size 0 110px to .batch-row
  - This should help, but content-visibility with contain-intrinsic-size 0 110px may cause scrollbar jitter if estimated size wrong
  - Also, grid layout with 9 columns and justify-self:stretch may still cause layout for visible rows
  - No contain: layout style paint, only content-visibility

### Overall React rendering
- ScanTable renders all 1000 RowView at once (no virtualization)
- Each RowView has multiple hooks: useActiveScroll, useRowClick, useRowKey, useInView, useRowRefs, useCallback
- 1000 × 5 hooks = 5000 hook calls per render, plus 1000 IntersectionObservers
- Even with content-visibility, React still mounts 1000 components, reconciles 1000 rows on every state change (e.g., selection, preview progress)
- When previews Map updates (one entry at a time during preview generation), setPreviews creates new Map, triggers re-render of all 1000 rows (since ScanTable props.previews reference changes), even though only one row changed
- This causes O(n²) re-renders during preview queue: 1000 previews × 1000 rows = 1M RowView renders

## Profiling Hypotheses

### Hypothesis 1: 1000 IntersectionObservers
- Creating 1000 observers on mount is heavy, each observer has overhead
- Better to have single shared observer observing all rows, with callback that checks which rows intersect
- Or use content-visibility alone without JS observer for lazy thumbs, and only regenerate thumbs on explicit user action (click row) not on scroll

### Hypothesis 2: PreviewSingle storm on scroll
- When scrolling quickly, many rows become visible in quick succession (rootMargin 200px)
- Each triggers previewSingle which loads file (FS handle → file → image decode → analyze → detect → render)
- Even though MAX_CONCURRENT is 3 for queue, previewSingle has no concurrency limit, could have 100+ concurrent file reads
- CPU spikes due to image decode + analyze (canvas operations) happening during scroll

### Hypothesis 3: React re-render storm
- previews Map new reference on each setPreviews (even for one entry) causes ScanTable to re-render all rows
- Each RowView does `previews?.get(r.relPath)` which is O(1) but still 1000 gets per render
- During preview generation, 1000 setPreviews → 1000 × 1000 = 1M RowView renders, each with hooks, causing freeze
- Solution: memoize RowView with React.memo and custom comparison, or split previews Map into per-row state, or use useMemo for rows

### Hypothesis 4: Content-visibility not enough
- content-visibility:auto helps browser skip layout for offscreen, but React still renders all components
- Need true virtualization: only mount visible rows + buffer (e.g., 20 rows), not 1000
- Or at least use `contain: layout style paint` + `content-visibility`

### Hypothesis 5: Detection bar range input double events
- onChange + onInput both call updateLocal, causing double state updates per slider move
- For 1000 rows, if user scrolls and accidentally touches slider, could cause many updates

## Proposed Fix V2

### A. Shared IntersectionObserver
- Replace per-row `new IntersectionObserver` with single shared observer singleton
- Hook `useInView` uses shared observer, registers element, callback via WeakMap
- Reduces 1000 observers → 1 observer, 1000 entries

### B. Lazy thumbs: only on demand, not on scroll
- Remove auto-regeneration on scroll (onVisible → previewSingle)
- Instead, show count badge always, thumbs placeholder with button "Load preview" or show thumbs only for active row
- Or keep lazy but throttle: queue visible rows that need thumbs, process at most 3 concurrently, with abort on scroll away
- After restart, previews show count (metadata) but thumbs are empty until user clicks row or selects and clicks Preview/Regenerate

### C. Memoize RowView
- Wrap RowView with React.memo, compare only relevant props: r, entry, active, thumb, etc.
- Use `previews?.get(r.relPath)` inside memoized component, but ensure previews Map reference change doesn't cause all rows to re-render if entry unchanged
- Implement custom comparison: if prev.previews?.get(r.relPath) === next.previews?.get(r.relPath) and other props same, skip render

### D. Virtualization
- Implement simple windowing: render only visible rows based on scroll position, using container height and estimated row height (110px)
- Use `useVirtual` hook: calculate start/end index from scrollTop, render slice
- Or use `content-visibility` + `contain` and keep React rendering all, but memoization will help

### E. Debounce review sync and preview load
- `usePersistedLoad` should not trigger review sync for all 1000 at once; instead, batch via setTimeout or requestIdleCallback
- `useReviewSync` already has seen Set, but should also debounce via idle callback

### F. Detection bar: remove onInput, keep onChange only
- onInput + onChange double fires, keep only onChange for simplicity

### G. Store thumbs as Blob URLs not dataURLs (future)
- For now metadata only, thumbs generated on demand and cached in memory LRU, not persisted

## Acceptance V2
- Scroll 1000 rows at 60fps, no freeze, CPU <10% idle, <30% during scroll
- No 1000 IntersectionObservers, only 1 shared
- No auto previewSingle storm on scroll, only on explicit action or active row
- RowView memoized, previews Map update only re-renders affected row
- Quality gate passed, build <1560kB

## References
- Previous doc: docs/archive/2026-10-15-batch-perf-freeze/README.md
- src/batch/ScanTable.tsx, useBatchPreview.ts, BatchRowMergeBar.tsx
- index.css .batch-row content-visibility
