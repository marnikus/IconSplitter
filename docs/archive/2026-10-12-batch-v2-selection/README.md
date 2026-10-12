# Batch V2 selection + A/E shortcuts — 2026-10-12

## Problem
Batch folders had simple checkbox selection without active row, no keyboard navigation, no range/toggle gestures, no anchor persistence, no undo per gesture, and no A/E shortcuts. User requested V2 behaviors (purple active row separate from checked, ↑/↓ moves active and scrolls into view without changing checks, exact gestures, tri-state header, counts, missing/deleted ineligible, Split selected preserved) plus reusable A/E select/deselect for all rows.

## Design
- Reuse `src/lib/reviewselect.ts` (toggleChecked, setChecked, checkState, checkedInView, selectIntent, selectOne, selectRange) and V2 patterns from `ReviewRow.tsx`/`useSelectionV2.ts`.
- Add `SessionBatch {checked, activeId, anchorId}` to `src/lib/session.ts` with parse/DEFAULT, include in `DEFAULT_SESSION` and `toSession`.
- Add `batch` slice to `src/state/appstore.ts` with `patchBatch`, include in `initialAppState` and `sessionOf`.
- Add history type `batchChecked` to `ENTRY_TYPES` and `applyBatchChecked` in `src/state/apply.ts` that patches batch checked/anchor/active.
- Create reusable `src/lib/selectshortcuts.ts`: `handleSelectShortcut` pure (A selects visible, E deselects all, ignores Ctrl/Meta/Alt and text fields via `isTextField`), `useSelectShortcuts` hook.
- Create `src/batch/useBatchSelection.ts`: source of truth is appstore batch, syncs core rows selected boolean, computes header via `checkState(selectableIds(visible), checked)`, hiddenCount (checked but filtered out), affectedCount via `checkedInView`, one history entry per gesture (replace/range/toggle/checkVisible/uncheckAll/toggleAll/moveActive/selectActive), anchor survives filtering/sorting, hidden anchor fallback via `selectRange`, missing/deleted ineligible via `selectableIds`.
- Refactor `src/batch/useBatchView.ts` to use `useBatchSelection`, keep filter/sort/thumb prefs via `batchprefs`, expose activeId/anchorId/hiddenCount/affectedCount/selectRow/moveActive etc.
- Update `src/batch/ScanTable.tsx`: RowView with active vs checked, `useActiveScroll` scrollIntoView, `rowClass` active/selected, `isActive` case-insensitive, `useRowClick` with `selectIntent` (Shift precedence), `useRowKey` Enter/Space selects one, checkbox onChange only toggles checks (stops propagation), button stops propagation, `RowCheck`/`RowInfo`/`RowBadge` split for RULE 16.
- Update `src/batch/BatchBulkBar.tsx`: add hiddenCount/affectedCount props, show hidden warning, tri-state header via indeterminate, Select visible/Deselect all, counts.
- Update `src/batch/BatchPanel.tsx`: use `useBatchHotkeys` (arrow keys + A/E via `handleSelectShortcut`), pass activeId/selectRow/toggleCheck to ScanTable, pass hiddenCount/affectedCount to BulkBar, full-width list no max-h, only header tabs bar pinned (controls non-sticky).
- Create `src/batch/useBatchHotkeys.ts`: listens keydown, ignores text fields, uses `handleSelectShortcut` for A/E, handles ArrowUp/Down via `moveActive`, preventDefault.
- Add CSS `.batch-row.active` and `.batch-row.selected` in `src/index.css` same purple as V2.
- Add `useOptionalHistory` in `HistoryProvider.tsx` to allow tests without provider, `useBatchSelection` uses optional history.
- TDD: `tests/batch_selection_v2.test.tsx` 10 tests covering purple active separate, arrow moves active without changing checks, click selects one, Shift range, Ctrl/Alt/Meta toggle with Shift precedence, checkbox only, tri-state header, Split selected preserved, undo per gesture, A/E shortcuts, anchor survives. `tests/selectshortcuts.test.ts` 6 tests for reusable A/E. Existing `batch_ui` 5 and `layout_fullwidth` 12 still green.
- Keep missing/deleted ineligible, preserve Split selected, don't copy V2 A/D decisions, auto-next, Space zoom.
- RULE 16: split large functions (useBatchSelection 42 fns 181 lines, BatchPanel 16 fns 78 lines, ScanTable 26 fns 115 lines, useBatchView 13 fns 64 lines, BatchPresetRow refactored to 8 fns). Legacy failures (App, useBatch, detect, render) unchanged.
- RULE 18: ideal sizes via extracted helpers, one responsibility per file.

## Verification
- `npm test tests/batch_ui.test.tsx` 5 passed
- `npm test tests/batch_selection_v2.test.tsx` 10 passed
- `npm test tests/selectshortcuts.test.ts` 6 passed
- `npm test tests/layout_fullwidth.test.tsx` 12 passed
- `npm test tests/apply.test.ts` updated for batchChecked 10 passed
- `node tools/quality.mjs` new files OK, only legacy 4 files fail (baseline)
- Manual: Batch list full width, full page scroll, active purple row, checkbox only, Shift range, Ctrl toggle, arrow keys move active and scroll, A/E select/deselect, hidden count, undo/redo, session restore.

## Scope
Batch folders only, reusable A/E lib for other tabs. No changes to V2 A/D approve/decline.
