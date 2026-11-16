# Batch Per-Row Merge Override — Design Doc

## Problem

Global merge distance (0-0.15 step 0.0025, auto) works for most sheets but not all. Some icon sheets require individual adjusting. Need per-row override that takes precedence over global bar for preview and split.

Requirements:
- Each row has its own control same as global: Detection - merge distance bar as global parameter, and button Apply, and button Reset
- Apply overrides global control bar rules for that row
- Reset clears override, falls back to global
- Preview and processing must use per-row override if exists, else global
- Keep global bar preset-saved, per-row overrides in-memory (or prefs) for session, cleared on Reset / Clear All
- High perf: 1000 rows, each with slider, no lag
- TDD, RULE 18 ideal sizes, RULE 16 quality gates, docs/current/ rules
- Single Sheets unchanged, Batch only

## Research

Current Batch architecture:
- `useBatch` owns rows, preset (split.mergeFrac global), scanning, processing
- `useBatchView` composes filter/sort/selection/prefs, visible rows
- `BatchPanel` -> BatchControls (SourceBar, FilterGrid, BulkBar) + PresetAndDest + BatchMergeBar (global) + ScanTable (rows)
- `BatchMergeBar` uses `clampMergeFrac` and `setPreset` to save global
- `useBatchPreview` uses `previewKey` with mergeFrac, padding, size, transparent, mtime; analysisCache LRU 200, concurrency 3, abortable
- `ScanTable` RowView: checkbox, thumb, file cell, PreviewCell (count+strip), date, status, open; grid 7 cols with preview 1fr
- Processing: `process` in useBatch builds items via `buildItems` -> `toItem`, then `processItems` with dest, split (global), splitImage=splitOne(file, split) -> splitSheet
- Tests: batch_merge_preview checks global slider, preview button beside split, inline preview same row, no writes, high perf

Missing:
- Per-row merge storage
- Per-row UI controls
- Preview and processing using per-row override
- Tests for per-row override

## Design

### Data Model

- New type `RowMergeMap = Map<string, number|null>` where key=relPath.toLowerCase(), value=mergeFrac override (number 0..0.15 or null for auto? But per-row reset means clear override, so null as override value could mean explicit auto override? Simpler: value=number|null where null means explicit auto override? But spec says Reset clears override. So we need distinction: undefined = no override (use global), null = override to auto, number = override to manual. However global also has null=auto. For per-row, we need ability to override global auto with manual, and override global manual with auto. So we need to allow null as explicit override. Then undefined = no override.

Simplify: `RowMergeOverride = number | null | undefined` where undefined = use global, null = auto override, number = manual override.

Store as `Map<string, number|null>` where missing = no override, present with null = auto override, present with number = manual override. This matches previewKey which already handles null.

- Add to `BatchState`? Or separate hook `useRowMerges` in `useBatchView` to avoid bloating core? But processing needs it, so it should be in core `useBatch` or passed to process.

Option A: Add to `BatchState` `rowMerges: Record<string, number|null>` (serializable). Update scan to preserve existing overrides for rows that still exist.

Option B: Separate hook `useRowMerges` in `useBatchView` that holds Map and is passed to `useBatch` process via callback? Processing is in useBatch, which doesn't have access to view.

Simpler: Add to `BatchState` as `rowMerges: Map<string, number|null>` but Map not serializable for React state? Use object Record.

We'll add `rowMerges: Record<string, number|null>` where key=relPath.toLowerCase().

Actions:
- `setRowMerge(relPath, value: number|null)` -> sets override
- `clearRowMerge(relPath)` -> deletes override
- `clearAllRowMerges()` -> clears all

Update `scan` to preserve rowMerges: when new rows scanned, keep overrides for those relPaths that still exist.

### Preview Pipeline Reuse

- `useBatchPreview` currently takes `root, rows, split` (global). Change to take `globalSplit` and `rowMerges` map, and for each row compute effective mergeFrac = rowMerges[relPath.toLowerCase()] ?? globalSplit.mergeFrac (where ?? checks if override exists, not nullish? Need to check if key exists, because null is valid override). So use `hasOwn` check.

- `previewKey` already includes mergeFrac, so per-row override will cause different key and cache miss, correct.

- `previewOne` should use effective mergeFrac.

- `previewSelected` should use effective per row.

- Keep analysisCache, LRU, concurrency, abort, no writes.

### Processing Pipeline

- `process` in useBatch currently uses `ctx.state.current.preset.split` global for all items.
- Modify to use per-row override: for each selected row, compute effective split = {...globalSplit, mergeFrac: rowMerges[relPath.toLowerCase()] ?? globalSplit.mergeFrac } but need hasOwn check for null override.

- `buildItems` and `processItems` need to accept per-row split? `processItems` currently takes single split for all. We can modify to pass per-item split via `splitImage` closure that captures per-row effective split, or modify BatchItem to include split override.

Simplest: Change `buildItems` to return items with per-row split, and `processItems` to use item's split if present else global. But `processItems` is generic, used elsewhere? Check usage: only in batch.

Alternative: In `runBatch`, for each selected row, call `splitSheet` with effective split directly, not via `processItems` generic split param. But we want to reuse existing `processItems` which loops and calls splitImage.

We can make `splitImage` close over rowMerges and compute effective split per file based on relPath? But splitImage only gets file, not relPath. So need to pass relPath or have map from file to relPath? Better to modify `BatchItem` to include `splitOverride`.

Simpler: Modify `processItems` to accept `split` as global, but `splitImage` can be a function that given file and relPath returns blobs with correct mergeFrac. We can change `BatchItem` to include `relPath` and in `splitOne` lookup override.

Implement: `splitOne` currently `(file, split) => Blob[]`. Change to capture rowMerges and relPath via closure in `runBatch` loop, or make `buildItems` produce items where each item has its own effective split.

Proposed: `buildItems` returns `Array<{item: BatchItem, effectiveSplit: SplitSettings}>`, then in `runBatch` loop we call `splitSheet` with effectiveSplit.

But to keep reuse of `processItems`, we can modify `processItems` to accept `getSplitForItem?: (item: BatchItem) => SplitSettings` callback.

Simpler for now: Don't use `processItems` for per-row override, instead implement custom loop in `process` that respects per-row overrides, similar to preview's concurrency and abort, but reusing `splitSheet`.

We need to check existing `processItems` implementation to see if it already supports per-item progress and abort. It does. We can duplicate its logic with per-row split.

For minimal change and RULE compliance, we will:

- Add `rowMerges` to BatchState
- Add actions `setRowMerge`, `clearRowMerge`
- Update `useBatchView` to expose these actions and also compute effective merge per visible row
- Update `useBatchPreview` to accept rowMerges and use effective
- Update `useBatch` process to use effective merge per row

### UI

- New component `BatchRowMergeBar.tsx` (or `RowMergeControl.tsx`):
  - Props: relPath, globalFrac, overrideFrac (number|null|undefined), onApply, onReset
  - Local state slider value: effective value (override ?? global ?? 0)
  - Label: "Merge" + effective display (auto or 0.####) + indicator if overridden (e.g., "• overridden" or different color)
  - Slider: same as global: min 0 max 0.15 step 0.0025, data-testid `batch-row-merge-slider-${relPath}`
  - Apply button: data-testid `batch-row-merge-apply-${relPath}`, disabled if local == effective override? Or always enabled? Should be enabled when local differs from effective? Simpler always enabled, but when no override and local == global, Apply will set override to same as global (still override). Could be okay.
  - Reset button: data-testid `batch-row-merge-reset-${relPath}`, disabled when no override (undefined)
  - Layout: compact row, similar visual to global bar but smaller, inside preview cell or below file name? User says each row also has its own control same as global. Should be in same row? We already have preview column taking space. We can place row merge control below preview strip or above, within same row's preview cell.

- Update `ScanTable.tsx` RowView:
  - Pass globalFrac, overrideFrac, onApply, onReset
  - Render `BatchRowMergeBar` inside PreviewCell or as separate cell? To keep same row with main thumbnail, we already have preview column. We can render row merge bar inside preview column above count+strip, or as additional row below main row.

  Design: In PreviewCell, show:
  - Row merge bar (slider + Apply + Reset)
  - Count badge
  - Strip

  Or separate component `RowMergeControl` that is always visible, even when no preview yet, so user can adjust per-row before preview.

  Requirement: each row also has its own control same as global. So it should be visible always, not only after preview.

  So in RowView, we should show per-row merge control always (for eligible rows), not only when preview exists.

  We can add a new cell or section inside row that shows per-row merge control.

  Grid currently has 7 columns, we have preview column taking 1fr. We can put per-row merge control inside preview column above preview strip, always visible.

- Update `BatchPanel.tsx` to pass rowMerges and actions to ScanTable.

### High Perf

- Per-row controls: 1000 rows * slider = 1000 sliders, each with local state, could be heavy but okay if using memo and not rendering all at once? ScanTable renders all visible rows (after filter), which could be 1000. 1000 sliders with state might be okay, but we should use memo and avoid re-renders.

- Use `React.memo` for RowView and BatchRowMergeBar, and useCallback for actions.

- Slider local state per row is okay.

### Tests (TDD)

Create `tests/batch_row_merge.test.tsx`:

1. Shows per-row merge slider 0-0.15 step 0.0025 with Apply and Reset for each row
2. Apply overrides global: global 0.05, per-row Apply 0.10 -> preview count changes for that row only, other rows use global
3. Reset clears override, falls back to global
4. Processing uses per-row override: split with per-row mergeFrac
5. No file writes during preview, preview reuses detect/render pipeline

Also update existing `batch_merge_preview.test.tsx` to still pass (global slider + preview inline).

### RULE 18 & 16

- Ideal sizes: functions 4-20 lines, file 150-300 lines
- New files: `BatchRowMergeBar.tsx` ~80 lines, `useRowMerges.ts` maybe ~50 lines
- Keep existing files under 30 loc per fn, CC<=10, nesting<=4
- Use domain types for grouping, not catch-all options
- Add ideal-size reason if needed

### Implementation Order

1. Add `rowMerges` to BatchState in `useBatch.ts`, actions, preserve on scan
2. Create `src/batch/BatchRowMergeBar.tsx` component
3. Update `useBatchPreview.ts` to accept rowMerges and use effective
4. Update `useBatch.ts` process to use effective per-row
5. Update `useBatchView.ts` to expose rowMerges and actions
6. Update `BatchPanel.tsx` to pass to ScanTable
7. Update `ScanTable.tsx` to render per-row merge control inside PreviewCell or new cell
8. Write TDD tests, run, fix
9. Verify quality gates, tsc, full suite

