# Batch folders — add V2 controls: zoom, date filters, filtered multi-select

Date: 2026-10-12
Reference: Selection V2 (image-1.png) shows filter bar + bulk bar with zoom 48-800
Target: Batch folders (image-2.png) currently has presets + images list with fixed 40px thumbs, no date filter, no filtered select, no zoom.

## Requirements from user

- Selection V2 controls reference; Batch folders target
- Add V2's shared 48–800 px thumbnail zoom to Batch via lib/zoom.ts; keep split/export size separate
- Add V2 date filters and filtered multi-select. Generate SVG has date sorting, use it feature for Batch folder tab
- Reuse Batch's existing preset-based folder-handle restore and per-image JSON/rescan for Batch folder tab
- Use TDD; verify other tabs unchanged
- RULE 16 + RULE 18

## Current Batch state

- src/batch/BatchPanel.tsx: HeaderControls (Root, Rescan, selected, Split), MainGrid (PresetBar, DestInfo, ScanTable)
- src/batch/ScanTable.tsx: rows, toggle, selectAll, thumb 40px fixed, max-h 28rem scroll, badge status
- src/batch/useBatch.ts: boot restores last preset + handles, scanImages via readDirTree/walkTree/linkReferences, rows have mtime, status, selected, refRelPath, preset, dest, busy, toast
- lib/scan.ts: FileEntry has mtime, size; AiImageEntry extends it
- lib/zoom.ts: ZOOM_MIN 48, MAX 800, STEP 4, DEFAULT 84, clampZoom, zoomLabel, zoomBox, zoomBoxRatio — shared by V2 and Generate SVG (I-55)

## Desired Batch state

- Filter bar (like V2 FilterGrid): Date filter All/Month/Range, From (month or datetime-local), To (datetime-local), Status (All + SourceStatus values), Sort by (date/name/path/status), Order (Newest/Oldest), Showing X images, Clear filters
- Bulk bar (like V2 BulkBar): header checkbox indeterminate, X selected across Y visible, Select visible, Deselect all, ZOOM slider 48-800 with px readout, Split selected (existing) + maybe status counts
- Thumbnail zoom: use lib/zoom.ts clampZoom, zoomLabel, persisted in localStorage (batchprefs), applied to Thumb size, keep split size (1024) separate
- Filtered multi-select: visible = filtered+sorted rows, select visible selects only visible, deselect all deselects all, header checkbox reflects visible selection
- Sorting: reuse Generate SVG date sorting idea — sort by mtime, name, path, status
- Preserve: preset restore (loadHandles, restoreKnownRoot), per-image JSON/rescan (syncAndCollect, applyOutcomes), dest logic, ref warnings

## Design — keep RULE 18 ideal sizes

Split into small pure modules (each ≤20 lines ideal, ≤30 fail):

- lib/batchfilter.ts: DateFilter same shape as reviewfilter, BatchFilter {date, status, search}, applyBatchFilters(rows, filter), parseBatchFilter, monthKey reuse, filterLabel
- lib/batchsort.ts: SortState {by: date|name|path|status, dir}, sortBatchRows(rows, sort), parseSort, sortLabel
- lib/batchprefs.ts: persist thumb height, filter, sort in localStorage under key "batch-prefs-v1", parse with validation (RULE 13), default thumb ZOOM_DEFAULT
- batch/BatchFilterGrid.tsx: UI like V2 FilterGrid but for Batch, props filter/sort/shown/setFilter/setSort, uses SegButton, monthKey, from/to handling
- batch/BatchBulkBar.tsx: UI like V2 BulkBar but for Batch, props header, checkedCount, visibleCount, thumb, onToggleAll, onSelectVisible, onDeselectAll, onThumb, split action
- batch/BatchZoomSlider.tsx: reuse lib/zoom, same as V2 ZoomSlider but testid batch-thumb
- batch/useBatchView.ts: hook that wraps useBatch, manages filter/sort/thumb state, computes visible (filter+sort), header state, checked counts, provides checkVisible/uncheckAll/toggle etc., persists via batchprefs

BatchPanel refactored:

- useBatch() for core scan/preset/process
- useBatchView(b) for filter/sort/zoom/visible
- HeaderControls stays but shows visible counts
- BatchFilterGrid below header when rootName != ""
- BatchBulkBar above ScanTable when rows present
- ScanTable receives visible rows, thumb height, toggle, etc., thumb size via zoomBox or simple square

TDD plan:

- tests/batch_filter.test.ts: date all/month/custom, status all/unprocessed/processed, search, combined
- tests/batch_sort.test.ts: by date asc/desc, name, path, status, stable tiebreak
- tests/batch_prefs.test.ts: parse valid/invalid, clamp zoom
- tests/batch_ui.test.tsx: renders filter grid, bulk bar, zoom slider 48-800, select visible only affects visible, deselect all, thumb size changes with slider, other tabs unchanged

Other tabs unchanged verification:

- existing svg_ui, selectionv2_ui, layout_fullwidth, log_layout still green
- Workbench mounts BatchPanel only when tab=batch, no shared shell change

## RULE 16 / 18 check

- No new function >30 lines, file ≤300, params ≤4, CC ≤10, nesting ≤4
- Extract by concept: filter, sort, prefs, zoom, bulk, grid each own file
- Tests execute real logic (filter/sort pure, prefs validation, UI with fake FS)
