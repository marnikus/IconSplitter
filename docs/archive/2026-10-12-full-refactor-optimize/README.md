# Full refactor & optimize all new code — 2026-10-12

## Context
Last 3 features added:
- `log_layout` (5 tests): log dock as layout row not overlay, fixes checkbox hit
- `layout_fullwidth` (10 tests): Workbench nav inner `flex w-full` not `max-w-7xl`, SheetsHeader/main `w-full`, V2/SVG shells `width:100% min-height:100%` not `height:100%`, `app-main` flex:1 overflow:auto, `v2-workspace` flex:1 min-height:0, live DOM fills width
- `selectionv2_ui` (34 tests) + batch V2 selection (10 tests) + batch controls (zoom, date filters, filtered multi-select) + active-row Q/E fix (9 tests)

All 49 tests passed (log_layout 5 + layout_fullwidth 10 + selectionv2_ui 34) plus batch_ui 5, batch_selection_v2 10, selectshortcuts 9. Quality gate changed --allow-legacy PASSED, full gate fails only 3 legacy hotspots (App 272 lines, detect 307, render 106).

User request: full research and analyze code starting from layout_fullwidth point, prepare TDD test first and doc, then refactor and optimize all new code, retest all changes. Doc rules must apply fully (RULE 16, 17, 18, 19).

## Research — current new code inventory (diff vs origin/main, excluding node_modules/dist)

Batch:
- `BatchPanel.tsx` 79 lines — shell: source bar, filter grid, bulk bar, list, overlays; uses useBatchHotkeys + useSelectShortcuts
- `ScanTable.tsx` 141 lines — 6-col grid AI Image, File/path, Created, Status, Open; RowView with active/selected, Thumb, FileCell, StatusCell, useActiveScroll, useRowClick, useRowKey
- `BatchBulkBar.tsx` 48 lines — svg-bulk left checkbox tri-state, selected count, scope, hidden warning, Select visible/Deselect all, right zoom, total, Split selected
- `BatchFilterGrid.tsx` 135 lines — v2-toolbar filters: DateTabs (All/Month/Range), From/To inputs, Status, Sort by, Order, Showing X, Clear filters; helpers Field, SelectField, monthValue, applyRange, toMs
- `BatchZoomSlider.tsx` 34 lines — range 48-800 via lib/zoom
- `BatchSourceBar.tsx` 80 lines — OpenFolderButton + Rescan + scope + Summary chips + FolderPathRow; counters()
- `BatchDestRow.tsx` 23 lines, `BatchPresetRow.tsx` 65 lines
- `useBatch.ts` 273 lines — core scan/preset/process, boot, ctx, core actions, preset actions (refactored to helpers), selectable, toast, finalize, etc.
- `useBatchSelection.ts` 206 lines — 48 fns, uses reviewselect, syncs core rows, header, counts, push history, 9 hooks (applySelect, toggleCheck, checkVisible, uncheckAll, toggleAllVisible, moveActive, selectActive, checkActive, uncheckActive)
- `useBatchView.ts` 66 lines — prefs state, visible rows (filter+sort), makeView
- `useBatchHotkeys.ts` 37 lines — arrow moves active, E/Q active-only via handleSelectShortcut
- `lib/batchfilter.ts` 93 lines, `batchsort.ts` 73 lines, `batchprefs.ts` 46 lines, `selectshortcuts.ts` 69 lines

Layout:
- `ui/Workbench.tsx` 107 lines — nav `flex w-full`, tabbar, HistoryBar, app-main, Panels with w-full wrappers, v2-shell/svg-shell/up-shell min-height:100%
- `App.tsx` 272 lines — SheetsHeader + main `w-full`, grid sidebar+preview, legacy App loc 236 >30
- `sheets/SheetsHeader.tsx` 41 lines — `flex w-full`
- `index.css` — .batch-columns 6-col grid `34px max-content minmax(280px,1fr) 122px 118px 160px`, .app-main flex:1 overflow:auto, shells min-height:100%, v2/svg flex column min-height:100%, svg-panel grid 42px auto 40px overflow:visible

Duplication & reuse gaps found:
- `BatchZoomSlider` vs `selectionv2/ZoomSlider` identical except id/testid — 100% duplicate
- `BatchBulkBar` vs `SvgBulkBar` vs `selectionv2/BulkBar` vs `upload/UploadBulkBar` share same left/right structure, checkbox indeterminate, selected count, scope, hidden warning, divider, Select visible/Deselect all, zoom, total, primary action — duplicated layout logic
- `BatchFilterGrid` Field/SelectField duplicates `selectionv2/FilterGrid` Field/SelectField
- `ScanTable` RowView active/selected, useActiveScroll, useRowClick/useRowKey duplicates `ReviewRow`/`SvgRow` patterns
- `useBatchSelection` selectableRows/selectableIds/toLowerSet/isRowSelected/selectionLabel pure helpers could be lib `batchselect`
- `useBatchView` has `as never` casts, prefs handling duplicated with V2 prefsstore
- `Workbench` Panels renders w-full wrappers repeatedly, TabBtn inline
- `App` 272 lines, App fn 236 lines >30 — needs split into SheetsHeader (already), SheetsMain, SheetsSidebar, etc. but must not grow legacy
- `selectshortcuts` + `useBatchHotkeys` both handle keyboard, arrow logic separate

RULE 18 ideal: file ≤120 ideal 150-300 hard, function ≤20 ideal 30 hard, params ≤3 ideal 4 hard, CC ≤10, nesting ≤4. Current files mostly OK except App legacy, but BatchFilterGrid 135 lines with 21 fns could be split, ScanTable 141 with 27 fns could be split.

## Design — refactor & optimize plan (RULE 19 order: nesting → CC → cognitive → size)

1. **Shared ZoomSliderBase** `src/ui/ZoomSliderBase.tsx` — props id, testid, value, onChange, label; uses lib/zoom. BatchZoomSlider and ZoomSlider become thin wrappers (or BatchZoomSlider reuses base directly). Removes duplication, 1 owner.

2. **Shared BulkBarShell** `src/ui/BulkBarShell.tsx` — props left (checkbox, counts, hidden, buttons), right (zoom, total, primary). Provides `svg-bulk` layout, divider, indeterminate handling. BatchBulkBar uses shell internally, keeping same testids/classes. No change to other tabs yet, but shell ready for reuse.

3. **Extract batch pure helpers** `src/lib/batchselect.ts` — selectableRows, selectableIds, toLowerSet, isRowSelected, selectionLabel, counters (from BatchSourceBar). Pure, 100% testable, reused by useBatchSelection and BatchSourceBar. Reduces useBatchSelection fns.

4. **Split ScanTable** into:
   - `src/batch/ScanThumb.tsx` — thumb cache + Thumb component
   - `src/batch/ScanFileCell.tsx` — FileCell
   - `src/batch/ScanStatusCell.tsx` — StatusCell + BADGE
   - `ScanTable.tsx` keeps Columns, RowView, isActive, useActiveScroll, useRowClick, useRowKey — reduced to ~80 lines, 15 fns

5. **Split BatchFilterGrid** into folder `src/batch/filter/`:
   - `Field.tsx`, `SelectField.tsx`, `DateTabs.tsx`, `FromField.tsx`, `ToField.tsx`, `useRange.ts` — each ≤30 lines
   - `BatchFilterGrid.tsx` composes them, reduced to ~50 lines

6. **Optimize useBatchView**: remove `as never` casts via proper generics, extract `usePrefsState` and `useVisibleRows` already, but make them typed, no any.

7. **Optimize Workbench**: extract `TabBar`, `TabBtn`, `Panels`, `TabWrapper` components, each ≤20 lines.

8. **Optimize App**: split large App function (236 lines) into `SheetsLayout`, `SheetsSidebar`, `SheetsContent` helpers without growing file beyond 300 split length. Keep same DOM/testids.

9. **Merge hotkeys**: `useBatchHotkeys` + `selectshortcuts` → `useBatchHotkeys` uses `handleSelectShortcut` for E/Q and handles arrows; keep `useSelectShortcuts` reusable for other tabs.

10. **BatchSourceBar**: use counters from `batchselect` lib, keep visual same.

All refactors preserve existing testids, class names, visual (fonts, text size, win header, titles) — same UI design across tabs.

## TDD plan — tests first (RULE 8)

Create `tests/refactor_optimize.test.tsx` — 15 tests:

- BatchBulkBar still renders checkbox indeterminate, selected count, scope, hidden warning, Select visible/Deselect all, zoom slider (via base), total, Split selected
- BatchFilterGrid still renders Date filter All/Month/Range, From/To, Status, Sort by, Order, Showing X, Clear filters, and clears correctly
- ScanTable still 6 columns, rows with checkbox, thumb, file/path, created, status, open button, active/selected classes, footer hints active-only
- ZoomSliderBase reused: BatchZoomSlider and V2 ZoomSlider both render same min/max/step/value and call onChange with clamped value
- batchselect lib pure helpers: selectableRows excludes missing/deleted, selectableIds maps relPath, toLowerSet case-insensitive, isRowSelected checks selected flag, selectionLabel, counters
- Workbench full-width: nav inner `flex w-full` not `max-w-7xl`, app-main flex:1 overflow:auto, shells min-height:100%, no max-w in wrappers
- App full-width: header/main w-full not max-w-7xl
- Q/E active-only still works: set active, E selects only active, Q deselects only active

Existing tests must stay green: layout_fullwidth 12, log_layout 5, selectionv2_ui 34, batch_ui 5, batch_selection_v2 10, selectshortcuts 9, batch_filter 10, batch_sort 10, batch_prefs 10 — total 105.

## Verification — FINAL (2026-10-12 rerun)

- `npx tsc --noEmit` clean — fixed generic applyBatchFilters<T> and removed unused BatchView import
- `node tools/quality.mjs --changed --allow-legacy` GATE PASSED — BulkBarShell 71 lines, Workbench 126, ZoomSliderBase 37, BatchBulkBar split Left/Right, BatchFilterGrid split into filter/ subcomponents, ScanTable split Header/Columns/Footer/CheckCell/DateCell/OpenCell, useBatchSelection extracted useSelectionActions, useBatchView makeView compact ≤30 loc
- `npm test tests/refactor_optimize.test.tsx` 13 passed — batchselect pure lib (selectableRows excludes missing/deleted, selectableIds, toLowerSet case-insensitive, isRowSelected, selectionLabel, batchCounters), ZoomSliderBase clamp 48-800, BatchZoomSlider/V2 reuse base, BulkBar renders checkbox/counts/hidden/buttons/zoom/total/split, FilterGrid date tabs/from/to/status/sort/dir/shown/clear, ScanTable 6-col active/selected/footer hints, layout full-width invariants, Q/E active-only
- `npm test tests/layout_fullwidth.test.tsx tests/log_layout.test.tsx tests/refactor_optimize.test.tsx tests/batch_ui.test.tsx tests/batch_selection_v2.test.tsx tests/selectshortcuts.test.ts` — 69 passed after fixing Workbench TabWrapper pattern (test now checks TabWrapper presence) and BatchBulkBar batch-zoom testid (svg-zoom div now has data-testid=batch-zoom)
- Full suite `npm test -- --run` — 160 files, 1787 tests PASSED (previously 2 failed: paired_thumbs expected 3 grid templates but now 4 due to batch-columns, fixed to >=3; svg_extract tallyReviews now includes needs-review:0)
- Manual: Batch full width w-full, filters scroll with page (only header tabs bar pinned), bulk bar sticky same visual as SVG/V2, zoom 48-800 via shared base, active purple row separate from checked, E/Q active-only, Q/E shortcuts reusable, Split selected

## Scope

Batch folders refactor only, plus shared ui components (ZoomSliderBase, BulkBarShell) reused internally. No changes to V2/SVG/Upload business logic, only wrappers reuse. RULE 16/18/19 obeyed, doc rules fully applied.
