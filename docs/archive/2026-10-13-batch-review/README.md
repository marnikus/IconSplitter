# Batch folders review — approve/decline/warning + 4-icon rule

Date: 2026-10-13
Status: research + plan (no code, RULE 17)

## Request

Batch folder tab:

1. Warning if image was not split to exact 4 images. Yellow line + icon.
2. Add approve and decline status before split, stored in folder. Only approved images can be split to folders and processed. Declined and warning not included.
3. All previews icon split to 4 icons successfully are added to approved. All other cases are added to warning. User manually able to change statuses.
4. All this controls already used in SVG generate tab. Reuse all code, do not create duplicate codes.
5. Research first, build doc plan, no code now.

## Research — current Batch flow

- `src/batch/useBatch.ts`: owns root/dest picking, scan, selection, preset, rowMerges, process run. State `BatchState` has `rows: Row[]` (AiImageEntry + status + selected), `busy`, `toast`, `rowMerges`, `progress`, `running`.
- `src/batch/batchOps.ts`: `scanImages` reads dir tree, `collectAiImages`, `linkReferences`, `syncAndCollect` merges into statefile, `finishScan` sets rows with `selected` based on status (not missing/deleted). `batchProcess` filters `rows.filter(r=>r.selected)` and calls `processItems` which splits via `splitSheet` (detect + render) and writes to dest.
- `src/batch/useBatchView.ts`: view layer, filter/sort via `batchfilter`/`batchsort`, thumb prefs, selection via `useBatchSelection`.
- `src/batch/useBatchSelection.ts`: reuses `lib/reviewselect.ts` (selectOne, selectRange, toggleChecked, checkState) and `lib/batchselect.ts` (selectableIds, toLowerSet, isRowSelected). Checked ids stored in `appstore.batch.checked`, activeId, anchorId. Syncs core rows selected from checked.
- `src/batch/BatchBulkBar.tsx`: bulk bar with tri-state header, Select visible, Deselect all, zoom slider, Preview splits, Split selected. `canSplit = selectedCount>0 && !busy`.
- `src/batch/ScanTable.tsx`: list with columns File, Detection (merge slider), Preview splits, Created, Status, Open. Row class `svg-row batch-row ${status}${active? active}${selected? selected}`.
- `src/batch/useBatchPreview.ts`: preview queue, loads file, analyzeAsync, detectAsync, renderIcon thumbs. Returns `PreviewEntry` with `count` (boxes.length), `thumbs`, `boxes`, `status`.
- `src/lib/statefile.ts`: per-source status unprocessed/processed/skipped/missing/changed/deleted, stored in folder state file (per reference). No review status.
- `src/lib/batchfilter.ts`: filters by date, status, search. No review filter.

## Research — SVG Generate tab reuse

- `src/lib/svgmodel.ts`: `ReviewStatus = pending | approved | declined | needs-review`. Used for SVG versions.
- `src/lib/reviewselect.ts`: generic selection logic (selectOne, selectRange, toggleChecked, setChecked, checkState, checkedInView, selectionLabel). Used by both Selection V2 and Batch.
- `src/lib/reviewfilter.ts`: filtering by generation/review status, search.
- `src/svg/SvgBulkBar.tsx`: bulk bar with Approve selected, Decline selected, Needs review selected, plus Generate. Uses `decidableCount` to enable approve/decline.
- `src/svg/SvgRow.tsx`: row class `${review ?? pending}` gives color, decision actions Approve/Decline/Needs-review buttons per row, disabled when no valid SVG.
- `src/svg/reviewact.ts`: `decideReview` writes review decision to pair file (via `pairmeta`), updates rows, pushes undo entry.
- `src/svg/rowmodel.ts`: `shownVersion` returns version to show, review status from it.
- `src/svg/sources.ts` / `sourcelist.ts`: only approved sources are listed for generation (filter by approved).
- Visual: `svg-row` with review class has different border/background; warning uses yellow.

Key reusable patterns:
- `reviewselect.ts` already reused by Batch — keep.
- `reviewfilter.ts` filtering by review status — can add to Batch filter.
- Bulk bar pattern with Approve/Decline buttons — copy structure, not duplicate logic, reuse `reviewselect` and decision applier.
- Row decision actions per row — similar to `DecisionActions` in SvgRow, but for Batch preview count.
- Storage: SVG uses pair files (`*.svg.json` beside AI image). Batch could reuse `statefile` or create new `batch-review.json` or reuse pairmeta pattern. To avoid duplication, reuse `lib/reviewfile.ts` or `lib/statefile.ts` extension.

## New Batch review model

### ReviewStatus for Batch

Define `BatchReviewStatus = approved | declined | warning | pending`.

- `pending`: initial, no preview yet.
- `approved`: preview count ==4 (or user manually approved).
- `warning`: preview count !=4 (0,1,2,3,5+), yellow line + icon. Auto-assigned after preview.
- `declined`: user manually declined.

Storage: extend `SourceRecord` in `statefile.ts` or create new `BatchReviewRecord` stored in same state file or separate `batch-review.json` in root.

Option A (reuse statefile): Add `review?: BatchReviewStatus` field to `SourceRecord`. `validStatus` already handles unknown -> unprocessed, but review is separate. We can add `review` field with validation, default pending.

Option B (separate file like SVG): Create `batch-review.json` per folder or per image sidecar like `*.png.json` with review status. Reuse `reviewfile.ts` logic.

Recommendation: Option A — extend `statefile.ts` SourceRecord with optional `review` field, because Batch already has state file per reference, and we want to avoid duplicate file handling. Also need `reviewUpdated` timestamp.

But user says "add this to the folder" — implies store in folder, so statefile is already in folder (per reference). Good.

Alternatively, reuse `lib/reviewfile.ts` which is used for Selection? Let's check `reviewfile.ts`.

### Warning rule: exact 4 icons

- After preview (Preview splits), count = boxes.length.
- If count ==4 → approved, else warning.
- Yellow line + icon: row class `warning` with CSS `border-left: 3px solid yellow` or similar, like SVG's warning.
- Icon: ⚠ in status cell or review cell.

### Only approved can be split

- `batchProcess` currently filters `rows.filter(r=>r.selected)`. Change to `rows.filter(r=>r.selected && r.review===approved)`.
- Or `canSplit` should consider only approved selected count.
- `selectedCount` in bulk bar should show approved selected count? Or show total selected but split only approved with warning toast for others.
- Spec: "only approved images could be splitted to foldes and processed. declined and warning are not included to the splitting." So Split selected should only process approved, and show toast if some selected are not approved.

### Manual status change

- Bulk bar: add Approve selected, Decline selected, Warning? Actually user can change statuses manually. Provide buttons: Approve selected, Decline selected, maybe Reset to pending/warning.
- Per-row: add decision actions like SVG: Approve (✓), Decline (✕), Warning (⚠) or Reset.
- Reuse `SvgBulkBar` pattern: `onDecide` callback, `decidableCount` (rows with preview).
- Reuse `reviewselect` for selection gestures (already).

### Previews auto-assign

- In `useBatchPreview`, after each preview entry done, check count. If 4 → patch review approved, else warning.
- Need to call `patchBatchReview` or `markReviewed` that updates statefile and appstore.

## UI design (reuse SVG Generate tab)

- Row: class `batch-row ${review}` where review = approved/declined/warning/pending. CSS:
  - approved: green border or check
  - declined: red/dimmed
  - warning: yellow line + icon, like `svg-row needs-review` or `warning`.
  - pending: default.

- Columns: add Review column (like SVG) with badge, or reuse Status column to show review badge + count.

- Bulk bar: add buttons:
  - Approve selected (✓) — disabled when no decidable (no preview or no selected)
  - Decline selected (✕)
  - Maybe "Mark warning" or auto only.

- Per-row decision actions: similar to `DecisionActions` in `SvgRow`, but for Batch: Approve, Decline, Warning/Reset.

- Filter: add review filter to `BatchFilterGrid` (reuse `FilterGrid` from Selection V2 or SVG's generation/review filter). Add dropdown for review status.

- Warning line: yellow left border, icon ⚠ in status cell when count !=4.

## Storage plan (reuse, no duplication)

- Extend `src/lib/statefile.ts`:
  - Add `BatchReviewStatus` type.
  - Add optional `review?: BatchReviewStatus` and `reviewUpdated?: string` to `SourceRecord`.
  - Update `validRecord`, `recordFrom`, `newRecord`, `refreshRecord` to handle review, preserve on merge, revive logic.
  - Add `markReviewed(state, relPath, review, now)` similar to `markProcessed`.

- Or create new `src/lib/batchreview.ts` that reuses `reviewfile.ts` logic but for batch? To avoid duplication, extend statefile is simpler and reuses existing IO in `statewrite.ts`.

- `statewrite.ts`: `syncAndCollect` already merges scan into statefile, should preserve review. Need to ensure `mergeScan` keeps review field.

- `outcomes.ts`: `toOutcomes` currently maps ItemResult to status. Should also keep review? After split, status becomes processed, but review remains approved.

- Persistence: `statewrite.ts` writes state file via `writeState` (uses `serializeState`). So review will be persisted automatically if added to SourceRecord.

- Also need to sync `appstore.batch`? Currently checked/selected is in appstore, but review should be in statefile, not appstore. However, for UI responsiveness, we may need to keep review in `BatchState.rows` as well (like status). `Row` already has `status`, we can add `review`.

## Logic flow

1. Scan: `finishScan` creates rows with `review` from statefile (or pending if not exists). Also sets `checked` to approved? Or keep previous.
2. Preview: user clicks Preview splits (selected). `useBatchPreview.previewSelected` runs, for each row, after detect, count = boxes.length. If count==4, set review=approved, else warning. Update via `markReviewed` + `setS` rows review, and `patchBatch`? Actually review stored in statefile, so need to update statefile via `statewrite`? For immediate UI, update `rows` review in memory, and also persist to statefile via `syncAndCollect` or new `markReviewed`.
3. Manual decide: bulk or per-row Approve/Decline. Calls `decideBatchReview(ids, decision)` which updates rows review and persists to statefile.
4. Split: `batchProcess` filters only approved selected. If some selected are not approved, toast warning and skip them. Only approved processed.
5. After split, `finalize` marks processed status but keeps review.

## Reuse code (no duplication)

- Reuse `lib/reviewselect.ts` for selection (already).
- Reuse `lib/reviewfilter.ts` or extend `batchfilter.ts` to filter by review status — copy pattern but not duplicate logic, create `batchReviewFilter` that uses same shape.
- Reuse `svg/SvgBulkBar` structure for bulk approve/decline buttons — create `BatchReviewBulkBar` or extend `BatchBulkBar` with `onDecide` prop, reuse same CSS classes `svg-btn success/danger/warning`.
- Reuse `svg/SvgRow` decision actions pattern — create `BatchDecisionActions` component similar, reuse `ReviewStatus` type.
- Reuse `statefile.ts` persistence — extend, not new file.
- Reuse `reviewfile.ts` validation pattern for review field.

Files to reuse (import, not copy):
- `src/lib/reviewselect.ts`
- `src/lib/reviewfilter.ts` (for filter logic)
- `src/lib/statefile.ts` (extend)
- `src/svg/SvgBulkBar.tsx` (pattern)
- `src/svg/SvgRow.tsx` (decision actions pattern)
- `src/lib/svgmodel.ts` ReviewStatus (or define BatchReviewStatus similar)

## Files to change (plan)

- `src/lib/statefile.ts`: add `BatchReviewStatus`, add `review` field to `SourceRecord`, update validation, add `markReviewed`.
- `src/batch/useBatchTypes.ts`: Row extends with `review: BatchReviewStatus`.
- `src/batch/batchOps.ts`: `toRow` reads review from statuses map (need to extend statuses map to include review), `finishScan` sets checked based on review? `finalize` keeps review.
- `src/batch/statewrite.ts`: `syncAndCollect` returns review map, merge preserves review.
- `src/batch/useBatch.ts`: add `decide` action for review, similar to `setSelected`.
- `src/batch/useBatchView.ts`: expose review counts, decidableCount, onDecide.
- `src/batch/BatchBulkBar.tsx`: add Approve/Decline buttons, reuse SVG bulk bar pattern, add review counts.
- `src/batch/ScanTable.tsx`: add Review column, row class based on review, warning yellow line + icon when count !=4, decision actions per row.
- `src/batch/useBatchPreview.ts`: after preview, auto-assign review based on count (4→approved else warning), call `decide` or `markReviewed`.
- `src/batch/BatchFilterGrid.tsx`: add review filter dropdown (reuse FilterGrid).
- `src/index.css`: add CSS for `.batch-row.approved`, `.declined`, `.warning` with yellow left border, similar to `.svg-row`.
- `tests/`: add `batch_review.test.tsx` for warning rule, approve/decline only split, auto-assign.

## Tests (TDD)

- `batch_review.test.tsx`:
  - Preview count 4 → approved, count !=4 → warning (yellow).
  - Only approved selected are split, declined/warning skipped with toast.
  - Manual approve/decline changes status and persists.
  - Warning line has yellow class + icon.
  - Bulk approve/decline works, decidableCount.

- `batch_filter.test.ts`: add review filter.

- `batch_progress`: still works.

## Risks

- Extending statefile may break existing state files — need backward compat: missing review → pending.
- `useBatchTypes` import from `../lib/status` is broken (should be statefile) — fix as part of this.
- Ensure `processItems` respects review filter, not just selected.
- Ensure preview auto-assign doesn't override user manual decline.

## Steps (no code now, per request)

1. This doc.
2. Next: implement statefile review field + Row review.
3. Implement decide action + persistence.
4. Implement preview auto-assign.
5. Update BatchBulkBar with approve/decline.
6. Update ScanTable with review badge + warning yellow + per-row actions.
7. Update batchProcess to only split approved.
8. Update filter grid.
9. Tests.
10. Build + quality gate.

## Acceptance

- Warning if not exactly 4: yellow line + icon visible.
- Approve/decline controls in bulk bar and per row, stored in folder.
- Only approved split.
- Auto: 4→approved else warning, user can change.
- Reuse SVG Generate code, no duplication.
