# Batch Perf Freeze — Deep Research 2026-10-15

## Symptom
After last update (per-root preview persistence + regenerate control), page lags on scroll, CPU spikes, freezing.

## Context
- Branch arena/736d3693-iconsplitter, commit d6575e5
- Batch tab lists up to 1000 AI images, each row: checkbox, thumb+info, detection merge bar, preview splits (up to 4 thumbs), review badge, decision buttons, date, status, open button
- Last update added:
  - Per-root IDB persistence: key = rootName::relPath, value = PreviewEntry with thumbs as data URLs
  - loadPersisted(rootName) gets all keys + all values (idbGetAllKeys + idbGetAll) then filters
  - usePersistedLoad merges loaded previews into state and calls onReviewedBatch (decide approve/warning) for all loaded
  - previewSelected(force) with filterEligible: if force=false skip done previews, if true regenerate
  - Regenerate splits button

## Measured / Suspected Bottlenecks

### 1. IDB payload size
- Each preview entry: 4 thumbs × ~15KB dataURL = 60KB per image
- 1000 images → 60MB stored in IDB, loaded via getAll in one transaction
- getAll + getAllKeys reads 60MB on main thread, blocks UI
- savePersisted writes 60KB per preview, 1000 writes = 60MB writes, each transaction overhead

### 2. React state size
- previews Map<string, PreviewEntry> holds 60MB of strings in memory
- setPreviews with new Map triggers re-render of all rows (1000 rows)
- Each row's PreviewCell renders thumbs as <img src={dataURL}> — 4000 <img> elements with base64 src, each decoded by browser, heavy layout

### 3. Review sync storm
- usePersistedLoad calls onReviewedBatch(toBatchEntries(loaded)) → v.decide(approve, 500 ids) + v.decide(warn, 500 ids)
- v.decide does setS (updates 1000 rows) + applyReviewOutcomes (writes JSON statefile per folder, async but triggers many IDB/file operations)
- useReviewSync also runs after rows+previews, collects sync list and calls onReviewedBatch again → double work
- On initial load after restart, we have 2×1000 row updates + 1000 JSON writes, causing CPU spike

### 4. No virtualization
- ScanTable renders all rows at once: <div class="svg-rows"> with 1000 children, each 9 columns
- Each row has flex, grid, w-fit (requires intrinsic size measurement), mx-auto (margin auto)
- Scroll triggers layout for 1000 rows, each with 4 images, detection slider, etc.
- Browser layout cost O(n) per scroll frame → jank

### 5. w-fit + mx-auto per row
- Previous bar: flex min-w-[360px] (block flex, width 100% of column, cheap)
- New bar: flex w-fit mx-auto → browser must measure content width for each of 1000 rows to compute fit-content, then center via auto margins
- fit-content measurement is expensive, especially with range input and buttons
- Combined with 1000 rows, causes layout thrashing on scroll

### 6. Data URL vs Object URL
- Thumbs as data URLs are base64 strings, stored in JS heap and IDB, decoded on each render
- Object URLs (blob) would be more efficient, but still 4000 images in DOM is heavy

## RULE 18 / 16 Implications
- File src/batch/useBatchPreview.ts grew to 293 lines (ideal 150-300, still okay but near limit)
- Function loadPersisted CC 11 previously, fixed via matchesRoot helper to CC ≤10
- BatchPanel loc 35→29 after extraction, okay
- But performance is not covered by quality gate, only size/CC — need manual perf fix

## Proposed Fix (Doc First)

### A. Persistence: store only metadata, not thumbs
- Store PreviewEntry without thumbs in IDB, only count, boxes, status, rootName
- Thumbs are ephemeral, regenerated on demand or cached in memory LRU, not persisted
- Reduces IDB payload from 60MB → ~1MB (1000 × ~1KB JSON)
- loadPersisted becomes cheap, no 60MB read

### B. Lazy preview rendering
- ScanTable: only render PreviewCell thumbs for visible rows (IntersectionObserver) or for active row
- Keep count badge always, but thumbs only when row is in viewport or hovered
- Reduces DOM nodes from 4000 images → ~40 visible (10 rows × 4)

### C. Batch review sync: debounce and single transaction
- usePersistedLoad should NOT call onReviewedBatch immediately; instead, let useReviewSync handle it once, and batch into single decide per review type
- Add seen Set already, but also debounce via requestIdleCallback or setTimeout 0 to avoid blocking initial render
- Avoid calling decide for legacy entries (no rootName) unless needed

### D. Virtualization or windowing
- For 1000 rows, use simple windowing: render only rows in viewport + buffer (e.g., react-window or custom)
- Or at least use content-visibility: auto on rows to let browser skip layout for offscreen rows
- Add CSS: .batch-row { content-visibility: auto; contain-intrinsic-size: 0 80px; } — cheap, no JS change, reduces layout cost dramatically

### E. Detection bar: revert to cheap layout
- Change bar from w-fit mx-auto back to flex w-full max-w-[420px] mx-auto or inline-flex with fixed min-width but not fit-content measurement per row
- Use fixed width for slider (w-32) and let bar be flex with justify-center, not w-fit
- Reduces intrinsic size measurement cost

### F. Clear IDB per root on demand
- clearPersisted(rootName) already deletes only current root keys, good
- Add periodic cleanup: if IDB size > threshold, clear oldest

### G. TDD tests
- Add test: loadPersisted with 1000 entries should be <100ms
- Add test: previewSelected force=false skips done, force=true regenerates
- Add test: ScanTable renders with content-visibility

## Acceptance
- After fix, scroll 1000 rows should be 60fps, CPU <20% on idle, IDB load <200ms, memory <100MB
- Previews still restore after restart (count + boxes, thumbs regenerated lazily)
- Regenerate button still works, overwrites older
- Quality gate passed, build <1550kB

## References
- docs/current/AGENT_RULES.md RULE 18 ideal sizes, RULE 16 quality, RULE 7 interruption, RULE 13 persistence
- src/batch/useBatchPreview.ts, BatchPanel.tsx, BatchBulkBar.tsx, ScanTable.tsx
- store.ts IDB helpers
