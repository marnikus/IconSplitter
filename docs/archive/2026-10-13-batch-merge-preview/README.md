# Batch merge slider + Preview splits — 2026-10-13

## Context
Single Sheets already has 0–0.15 merge-distance slider (0.0025 steps), Auto reset, detected-boundary overlay, rendered icon previews. Batch presets store `split.mergeFrac` (null = auto); `batchsplit.ts` passes it to shared detector, but Batch has no slider or preview UI.

User request:
- In Batch only, expose one preset-saved global merge slider with Auto reset; use it for every row's preview and subsequent split.
- Add "Preview splits" beside "Split selected." For each selected eligible row, show every resulting icon as horizontal thumbnail strip with count. Reuse Batch's existing detect/render pipeline and preset output settings so previews match processing; don't write files or change JSON/status during preview.
- Keep Single Sheets unchanged.
- High performance for 1000 images preview without lag/crash.
- TDD, RULE 16/18/19, doc first.

## Research — current code

### Single Sheets merge UI
- `src/sheets/DetectionPanel.tsx`: `input[type=range] data-testid=merge-slider min 0 max 0.15 step 0.0025 value active.usedFrac` + `merge-reset` button disabled unless `active.manual`. `active` = Sheet with `boxes, usedFrac, manual, autoFrac`. `onRedetect(id, frac|null)` triggers `detect(an, frac)`.
- `src/App.tsx`: `analyze(img)` cached per sheet, `detect(an, null|frac)` on add/redetect, `squareInfo(boxes, padding)` shared, `renderIcon(img, an, boxes, box, sq, opts, maxOut)` for previews (maxOut 260). Boxes overlay in `BoundaryPreview.tsx`.

### Batch pipeline
- `src/lib/presets.ts`: `SplitSettings { padding, size, transparent, mergeFrac: number|null }`, `validFrac` clamps 0..0.15 else null (auto). `defaultPreset` has `mergeFrac: null`. `validatePreset` restores.
- `src/lib/batchsplit.ts`: `splitSheet(img, split)` = `analyze(img)` → `detect(an, split.mergeFrac)` → `renderAll` = for each box `renderIcon(..., opts={padding,size,transparent})` → `canvasToBlob`. Pure orchestration, no FS writes.
- `src/batch/useBatch.ts`: `run()` → `buildItems(root, selected)` → `processItems(items, { dest, split: preset.split, splitImage: splitOne, ... })`. `splitOne(file, split)` = `loadImageFile(file)` → `splitSheet`. So processing already uses `preset.split.mergeFrac` for every row.
- `src/batch/BatchPresetRow.tsx`: compact row: Preset name input, Save/Load/Delete, Padding (range 0-25), Size (select), Transparent (checkbox), Ignore (text). No merge control. `setPreset` patches preset and persists via `savePresets` + `saveLastName`.
- `src/batch/BatchBulkBar.tsx`: `svg-bulk` layout, left checkbox tri-state, selected counts, hidden warning, Select visible/Deselect all, right: zoom slider (ZoomSliderBase 48-800), total, `batch-process` = Split selected button disabled when !canSplit. No preview button.
- `src/batch/BatchPanel.tsx`: shell: `BatchControls` = SourceBar + FilterGrid + BulkBar; `PresetAndDest` = PresetRow + DestRow; `FullWidthList` = ScanTable; Overlays. Uses `useBatchView` (filter/sort/thumb/selection) + `useBatch` core.
- `src/batch/ScanTable.tsx`: 6-col grid, RowView with thumb cache, active/selected, uses `thumbUrl(relPath)` for preview thumbnail (single thumb per row, not split icons).

### Gaps
- No Batch merge slider UI; preset field exists but invisible.
- No preview of split icons; only single thumb per row.
- Need high-perf preview for 1000 rows.

## Design — architecture for high performance

### Goals
- One global merge slider in Batch, preset-saved, Auto reset, 0-0.15 step 0.0025, same UX as Single Sheets but global.
- Preview splits: button beside Split selected, shows per-selected-row icon count + horizontal strip of rendered icons.
- Reuse `detect` + `renderIcon` + preset opts so preview = processing.
- No FS writes, no status JSON change during preview.
- Handle 1000 images without tab crash: O(visible) work, not O(all), cancellable, cached, chunked.

### Components

1. **BatchMergeBar.tsx** `src/batch/BatchMergeBar.tsx`
   - Props: `mergeFrac: number|null`, `onChange: (v:number|null)=>void`.
   - UI: label "Merge distance", value display "auto" or "0.025", slider `data-testid=batch-merge-slider min 0 max 0.15 step 0.0025 value=mergeFrac ?? 0`, note "Lower = split loose parts, Higher = merge", button `data-testid=batch-merge-reset` "↺ Reset to auto" disabled when null.
   - Same visual as DetectionPanel but compact row inside preset panel. Preset-saved via `setPreset({ split: {...preset.split, mergeFrac} })`.
   - RULE 18: ≤20 lines per subcomponent, file ≤120.

2. **BatchPreview lib** `src/lib/batchpreview.ts`
   - Pure helpers:
     - `clampMergeFrac(v:number|null): number|null` = validFrac clone (0..0.15 else null).
     - `previewKey(relPath, mergeFrac, padding, size, transparent, mtime?)` = string for cache.
     - `detectBoxes(an:Analysis, mergeFrac): Box[]` = wrapper over `detect`.
   - Keeps no canvas work; canvas work stays in batch hooks (needs DOM).
   - Testable: clamp, key, count.

3. **useBatchPreview.ts** `src/batch/useBatchPreview.ts`
   - State: `previews: Map<relPath, { count:number, thumbs:string[], boxes:Box[], status:'idle'|'loading'|'done'|'error' }>`
   - Cache: `analysisCache: Map<relPath, Analysis>` to avoid re-analyze when only mergeFrac changes.
   - Inputs: `root: DirHandleLike|null`, `selectedRows: Row[]`, `split: SplitSettings`, `thumbUrl: (relPath)=>Promise<string>`? Actually need file handle to load full image: reuse `resolveFile` logic via root. We'll accept `loadFile: (relPath)=>Promise<File>` and `loadImage: (file)=>Promise<HTMLImageElement>` for testability.
   - Concurrency: `MAX_CONCURRENT = 3`, queue of selected rows. Each task:
     1. get file → loadImageFile → analyze (cached) → detect(mergeFrac) → squareInfo(boxes, padding) → for each box renderIcon at small maxOut (e.g., 96) → toDataURL.
     2. Yield between rows via `await new Promise(r=>setTimeout(r,0))` to keep UI responsive (RULE 5).
   - Cancellation: `AbortController` per preview run, abort on new preview, on unmount, on mergeFrac change.
   - Virtualization support: `requestPreview(relPaths)` only for visible rows (via IntersectionObserver in UI). But initial implementation: preview selected rows on demand, chunked, not all at once.
   - LRU: limit cache size to 200 entries, evict oldest.
   - No writes: only reads via file handles.
   - Exposes: `previews`, `isPreviewing`, `previewSelected()`, `clear()`, `requestFor(relPath)`.

4. **BatchPreviewPanel.tsx** `src/batch/BatchPreviewPanel.tsx`
   - Props: `previews: Map`, `selectedRows: Row[]`, `thumbSize: number` (reuse batch thumb? but small 64).
   - Renders only selected eligible rows (selectable). For each row:
     - Header: file name, path, count badge `data-testid=batch-preview-count-{relPath}` showing "N icons".
     - Strip: horizontal flex `overflow-x:auto`, each thumb `img data-testid=batch-preview-thumb-{relPath}-{idx}` with 64px.
     - If loading: skeleton.
   - Virtualization: simple windowing — render only rows in viewport. Use `useVirtualList` helper: measure container height, estimated row height 120px, render slice + overscan 5. For 1000 rows, only ~15 DOM nodes.
   - Keep DOM light: thumbs are data URLs, but limit to first 20 icons per row with "+N more" if many.
   - Testids: `batch-preview-panel`, `batch-preview-row-{relPath}`, `batch-preview-strip-{relPath}`.

5. **BatchBulkBar extension**
   - Add button `data-testid=batch-preview` "◉ Preview splits" beside Split selected, disabled when no selectable selected or busy. Calls `onPreview`.
   - Keep same visual (svg-bulk-right).

6. **BatchPanel wiring**
   - `BatchPanel` creates `previewHook = useBatchPreview({ root, rows, split })`.
   - `BatchControls` passes `onPreview=previewHook.previewSelected` to BulkBar.
   - New section `MergeAndPreview` = `BatchMergeBar` + `BatchPreviewPanel` (when previews non-empty).
   - `BatchPresetRow` stays but MergeBar is separate compact row above Images list (per request: Presets row above Images). Actually place MergeBar inside PresetAndDest or as its own panel.
   - When `preset.split.mergeFrac` changes, preview cache invalidated (or kept but re-detected). Clear previews on change.

### High-perf details for 1000 images

- **O(visible) not O(all)**: Virtualized list renders only visible preview rows. IntersectionObserver triggers `requestFor` for rows entering view; others stay idle.
- **Chunked async**: `for` loop with `await sleep(0)` between rows prevents main-thread block. Concurrency 3 limits parallel canvas work.
- **Analysis cache**: `analyze` is expensive (downscale + hist). Cache per file so merge slider drag only re-detects, not re-analyzes.
- **Small thumbs**: Preview renders at 64-96px maxOut, not full size, reduces canvas pixels ~16x vs 256px.
- **Data URL limit**: Only first 20 thumbs per row stored; count shows total. Avoids 1000 rows × 10 icons × 64px data URLs = ~ huge memory but still bounded.
- **Abort**: New preview run aborts previous, freeing object URLs.
- **No FS writes**: preview path never calls `processItems` or `applyOutcomes`.
- **Debounce slider**: `onChange` debounced 150ms for preview, immediate for preset save? Preset save should be immediate but preview generation debounced.

### Data flow

```
preset.split.mergeFrac (null|0..0.15) --persisted via setPreset
  → BatchMergeBar slider + reset
  → useBatchPreview uses same mergeFrac for detect
  → previewSelected() → for each selected Row:
      file → img → Analysis (cached) → detect(mergeFrac) → boxes → count
      → for each box renderIcon(img, an, boxes, box, squareInfo(boxes, padding), {padding,size,transparent}, 96) → dataURL
  → previews Map → BatchPreviewPanel virtualized strips
  → run() (Split selected) uses same preset.split → same detect/render → writes files
```

### Test plan (TDD)

Create `tests/batch_merge_preview.test.tsx`:

- Merge slider exists in Batch: `batch-merge-slider` min 0 max 0.15 step 0.0025, `batch-merge-reset` disabled when auto, enabled when manual, clicking reset sets null.
- Preset-saved: changing slider updates preset in localStorage / via setPreset mock.
- Preview button: `batch-preview` exists beside `batch-process`, disabled when none selected, enabled when selected.
- Preview shows count + strip: after picking root + selecting 2 rows + clicking preview, `batch-preview-panel` appears, each `batch-preview-row-*` has `batch-preview-count-*` matching detect count, `batch-preview-strip-*` contains thumbs.
- Reuses pipeline: preview count equals `detect(analyze(img), mergeFrac).boxes.length` (real lib).
- No writes: during preview, `processItems` / FS writes not called, status unchanged.
- High perf: preview for 1000 rows (mock) does not create 1000 DOM nodes at once — virtualized to ≤20 rendered rows, generation chunked (test with fake timers / concurrency).

Also unit tests `tests/batchpreview.test.ts`:
- `clampMergeFrac` valid 0..0.15 else null.
- `previewKey` includes mergeFrac, padding, etc.
- Cache eviction.

### RULE 16/18 compliance

- New files ≤120 lines ideal, ≤300 hard.
- Functions ≤20 ideal, ≤30 hard, params ≤3 ideal, ≤4 hard, CC ≤10, nesting ≤4.
- Split by concept: MergeBar, PreviewPanel, useBatchPreview (hooks ≤10 per component), batchpreview lib pure.
- No duplication: reuse `detect`, `renderIcon`, `squareInfo`, `ZoomSliderBase`, `BulkBarShell` patterns.
- No new smells.

### Verification

- `npx tsc --noEmit` clean
- `node tools/quality.mjs --changed --allow-legacy` GATE PASSED
- `npm test tests/batch_merge_preview.test.tsx tests/batchpreview.test.ts --run` green
- Full suite `npm test -- --run` 1787+ new tests green
- Manual: Batch with 1000 images, merge slider drag, Preview splits shows strips, scroll smooth, Split selected still uses same merge.

## Scope

Batch only. Single Sheets unchanged. Preset auto-save. No file writes during preview.
