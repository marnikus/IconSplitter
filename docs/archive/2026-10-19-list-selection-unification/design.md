# List selection unification — design (2026-10-19)

## Context and authority

Batch already distinguishes an active row (keyboard/review target) from checked rows (bulk target). Selection V2 currently treats a plain row click as *replace checked selection*, while Generate SVG and SVG to upload merely activate a row; their header, filtered selection, undo and shortcuts also differ. A click that changes the bulk target unexpectedly is especially costly in Generate SVG. Make Batch's list gesture semantics the common contract for the four list tabs. The current contract belongs in `docs/current/rules/BEHAVIOR.md` (RULE 25) and `docs/current/sor/invariants/shared.md` (I-73), with tab-specific exceptions on the owning pages. This design is a plan, not evidence that code already implements it.

## Batch-authoritative gesture matrix

| Gesture | Active row / range anchor | Checked rows (bulk selection) |
|---|---|---|
| Plain row click, or Enter on a focused row | Activate row and set anchor to it. | **Unchanged**, including existing hidden checks. |
| Row checkbox | Leave active row and anchor alone. | Toggle only this row. |
| Ctrl/Alt/Cmd+row click | Activate clicked row; keep previous anchor. | Toggle only clicked row; preserve other checks. |
| Shift+row click | Activate clicked row; advance anchor to it. | **Replace** checks with the contiguous visible-order range from previous anchor through clicked row; missing/filtered-out anchor degrades to clicked row only. |
| Up/Down navigation | Move active row through eligible visible rows. | Unchanged. |
| E / Q | With active row, leave active/anchor alone. | Check / uncheck only active row. With no active row, E checks visible; Q clears all. Text-editing surfaces keep their keystrokes. |
| Header checkbox | Unchanged. | Tri-state on **visible eligible** rows; checking adds visible rows without clearing hidden checks, unchecking removes only visible rows. |
| Select visible / Deselect all | Unchanged. | Add visible eligible rows / clear all checks, including hidden checks. |
| Filter/sort or tab switch | Keep ids and valid active/anchor; visual order is recomputed for the next range. | Never silently check or discard hidden ids; show checked, visible and hidden counts. Prune only stale ids after source disappearance. |
| Undo / redo | Restore the gesture's active row and anchor where they changed. | One global timeline entry per gesture (including bulk check controls); no history entry for a no-op. |

Clicks on nested action buttons, text fields, sliders and checkboxes must not trigger the enclosing row gesture. Checkbox checked state is the authority; active highlight alone cannot add a row to a bulk action. Batch's successful scan initially checks eligible rows, while Selection V2, Generate SVG and Upload begin **unchecked**; do not broaden automatic selection into paid-action tabs. Space on a focused Batch/V2/Upload row activates it; Generate SVG keeps its guarded active-check Space alias. Preserve persisted selections only when valid, never infer checks from an active row or approval.

## Tab-specific boundaries

- **Batch:** Keep its `batchChecked` global-history pathway and selectable (not missing/deleted) row rule. Correct the documentation handle for its actual header (`batch-check-all`), and describe `batch-select-visible` versus `batch-deselect` distinctly. Selection is not permission to export excluded/deleted items.
- **Selection V2:** Active row still receives A/D/next-pending decisions; checked rows are only potential bulk targets. Approve/Decline/Reset selected remain armed (confirm count, Escape/Cancel disarm) and operate on **checked ∩ visible ∩ complete**; incomplete and hidden checks are counted, never silently acted on. No resurrected approve-visible/reset-visible action. V1 comparison decisions and pair-file writes remain unchanged.
- **Generate SVG:** Apply the common row/checkbox/range/visible gestures while preserving source eligibility: only approved existing canonical AI raster outputs are rows. Generate/Regenerate selected are paid operations; checking is never consent to send. The exact checked eligible sources and order are disclosed in the existing per-request preview/manifest, then require explicit confirmation before any bytes go to the named provider; opening a confirmation sends nothing, Stop blocks unsent requests. Regenerate additionally excludes rows with no valid generated SVG. No live provider calls in tests.
- **SVG to upload:** Only rows with an approved valid SVG are selectable. The row's active state opens metadata detail, while checks drive bulk metadata/export/download. There are no A/D review shortcuts here. Metadata generation/regeneration remains behind exact-input provider confirmation; local export stays local. Make check gestures undoable on the **one global timeline** alongside `uploadSettings`; do not imply that downloaded files or paid requests are undone. Starting a scan or switching tabs cannot auto-check all approved rows.

## Implementation sequence

1. Write focused failing pure/DOM tests for every gesture in the matrix, including checked vs active, filtered hidden ids, anchor fallback, initial unchecked, history round-trips, and nested button/checkbox isolation in Batch, Selection V2, Generate SVG and Upload. Witness red before changing production behaviour; use real `src/lib/` logic (RULE 8).
2. Reuse the Batch `selectIntent` / `selectRange` / `checkState` / `checkedInView` semantics via one shared selection helper where appropriate; do not fork four interpretations. Ensure each tab's row handler ignores embedded controls and its keyboard handler respects text inputs.
3. Update Selection V2 plain click to active-only (not `selectOne`); retain checked/visible/complete and armed decision safeguards. Unify SVG and Upload row-modifier, anchor and header-visible behaviour without changing source discovery, request planning or export eligibility. Preserve Batch's scan defaults and the other tabs' unchecked starts.
4. Route changed check/active/anchor gestures through `HistoryProvider` once; retain Batch/V2 history, give SVG and Upload their own validated entry types, and route older SVG-origin `checked` entries to SVG rather than V2. A failed apply leaves the cursor unchanged; irreversible files/downloads/provider sends are not undoable. Gate parked Batch/SVG listeners and modal/armed shortcuts so one key cannot act on two tabs.
5. Update the canonical rule/invariant, tab behaviour, selectors and test inventories together; keep pages under 9 KB (split per RULE 17). Remove obsolete V2 plain-click and approve-visible descriptions and correct the Batch select-all handle.

## Test-first acceptance and verification

- Failing focused tests first: Batch's plain click leaves checks unchanged, modifiers and anchor preserve or replace exactly as the matrix says; the same cases pass for V2/SVG/Upload, including header indeterminate and filtered hidden checks; repeated gestures do not add spurious history; Undo/Redo restores ids/anchor/active across tab switches, including Upload; Batch checks eligible rows after scan and the other three start unchecked.
- Safety regressions: V2 bulk touches only checked∩visible∩complete, is armed and disarmable; SVG preview/manifest and confirmation match paid request sources, with no request on open/cancel; Upload excludes unapproved sources, does not bind A/D decisions, and confirms metadata separately from local export. Exercise provider boundaries using fakes; never make live calls.
- Run the focused suites, `npx tsc --noEmit`, `npm run lint`, `npm run quality:changed`, `npm run verify:fast`; before any push run `npm run verify`. For docs, run `tests/docs_navigation.test.ts` and validate page sizes, anchors and route links. The implementation owner records actual measured results in the append-only quality ledger. No gate is asserted here before execution.
