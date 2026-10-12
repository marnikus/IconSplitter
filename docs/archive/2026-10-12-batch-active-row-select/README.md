# Fix Q/E to affect only active row, not all rows — 2026-10-12

## Problem
User reports: when row active (purple), Q should deselect only active row and never all rows, E should select only active row and never all rows. Currently Q/E select/deselect all rows which is wrong. Bulk actions must remain via buttons Select visible / Deselect all.

Previous mapping correction: Q deselect, E select, A approve, D decline. Earlier we implemented Q/E as bulk select all visible / deselect all, but user expects active-only like A/D.

## Research
- V2 patterns: active row separate from checked, ↑/↓ moves active without changing checks, click selects one, Shift range, Ctrl toggle, checkbox only, anchor survives.
- SVG hotkeys: Space toggles checkbox for active row, A approve active, D decline active, arrows move active.
- Batch has same active row (selectedId), checked separate. Bulk buttons Select visible / Deselect all already exist for all rows.
- Reusable lib `selectshortcuts` should handle active row only, not bulk. Bulk remains via buttons.
- Existing `useBatchSelection` had moveActive/selectActive but no checkActive/uncheckActive.
- Other tabs: SelectionV2 uses selectedId, SVG uses activeId, Upload uses activeId — all need same active-only Q/E.

## Design
- `SelectAllTarget` now `activeId?, selectActive?, deselectActive?, selectVisible?, deselectAll?` — E tries selectActive if activeId present, else fallback to selectVisible (legacy); Q tries deselectActive if activeId present, else fallback to deselectAll.
- `handleSelectShortcut` split into helpers `trySelectActive`, `tryDeselectActive`, `handleE`, `handleQ` to reduce CC from 13 to <10.
- `useBatchSelection` adds `checkActive` and `uncheckActive`: setChecked activeId true/false, one undo entry, respects case-insensitive match.
- `useBatchView` exposes checkActive/uncheckActive.
- `useBatchHotkeys` now calls checkActive/uncheckActive for E/Q, not checkVisible/uncheckAll.
- `BatchPanel` uses both hotkeys and `useSelectShortcuts` with activeId/selectActive/deselectActive.
- `useSelectionV2` adds checkActive/uncheckActive via `makeCheckActive`/`makeUncheckActive` helpers, loc reduced to <30.
- `SelectionV2Panel` passes activeId=core.s.selectedId, selectActive=checkActive, deselectActive=uncheckActive.
- `svg/actions.ts` adds checkActive/uncheckActive, refactored to helpers useCheckActive/useUncheckActive/useDecide, file reduced from 312 to 209 lines.
- `SvgPanel` passes activeId/checkActive/uncheckActive.
- `upload/uiactions.ts` adds checkActive/uncheckActive, refactored into helpers useToggleCheck etc., loc reduced to <30.
- `UploadPanel` passes activeId/checkActive/uncheckActive.
- `ScanTable` footer hint updated to "↑↓ active row · E select active · Q deselect active · Click row, Shift range, Ctrl toggle · Bulk via buttons".
- Batch UI already simplified to 6 columns (AI Image, File/path, Created, Status, Open) same visual as SVG/V2.

## Verification
- TDD: updated `tests/selectshortcuts.test.ts` to expect active-only: E selects only active, Q deselects only active, fallback to bulk when no active, uppercase works, ignores modifiers/text fields, A/D not handled.
- Updated `tests/batch_selection_v2.test.tsx` Q/E test to set active row via rowClick, then E => 1 selected (active only), Q => 0 selected, bulk still via buttons.
- Tests green: batch_selection_v2 10/10, selectshortcuts 9/9, batch_ui 5/5, selectionv2_ui 34/34, layout_fullwidth 12/12.
- Quality gate changed --allow-legacy PASSED (previously failed for selectshortcuts CC, useSelectionV2 loc, svg/actions loc/file, upload/uiactions loc, batch/useBatch loc/file). Fixed by splitting helpers and compacting.
- Manual: select row active purple, press E => only active checked, Q => only active unchecked, bulk buttons still affect all visible.
