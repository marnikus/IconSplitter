# Batch Perf TDD — 2026-10-15

## Goal
TDD approach for performance bug introduced in 3398b0a, with tests and docs.

## Bug Recap (from 3398b0a exact root cause doc)
- Commit 1f1ab76 clean, 3398b0a introduces scroll lag
- Added usePersistedLoad and useReviewSync with O(n²) rows.find and unstable onReviewed (v new every render)
- Per-entry decide 1000× causing 1M renders + file writes

## TDD Approach

### 1. Write failing tests first (Red)
- Test file: tests/batch_perf_regression.test.tsx
- Tests:
  - useBatchView stability: v reference should be stable when s.rows not changing
  - useReviewSync should use Map lookup O(1) not find O(n²) — test via counting find calls or via time <100ms for 1000 rows
  - onReviewed should be stable (not change every render)
  - previewSelected force flag: force=false skips done with thumbs, force=true regenerates
  - persistence per root: savePersisted stores key rootName::relPath, loadPersisted filters
  - RowView memoization: previews Map new ref but same entry should not re-render all rows
  - Detection bar cheap layout: class should be w-full max-w-[420px] not w-fit
  - Content-visibility: .batch-row should have content-visibility:auto

### 2. Implement fix (Green)
- Fixes already in 5bab8bf, 94ea14f, d02aee4:
  - useBatchView useMemo for view and ps, stable decide/decideActive
  - useBatch memoized coreActions/viewActions
  - useBatchPreview: Map lookup, seen Set, onReviewedBatch, metadata-only IDB, filterEligible includes thumbs empty, usePersistedLoad without onReviewed deps
  - ScanTable: memo RowView, no per-row IntersectionObserver, content-visibility in CSS
  - BatchRowMergeBar: w-full max-w-[420px] mx-auto, only onChange

### 3. Verify (Refactor + Quality)
- Run vitest for new tests
- Run quality gate
- Build

## Performance Tests Design

### Test 1: useBatchView stability
- Render BatchPanel with 10 rows, capture v reference via ref
- Trigger unrelated state change (e.g., setThumb) that doesn't affect rows
- v should be stable or only change when relevant deps change
- For exact bug, v changed every render → onReviewed changed every render → effect runs every render

### Test 2: useReviewSync O(n²) vs O(n)
- Create 1000 rows and 1000 previews
- Measure time for collectSync or useReviewSync effect
- Should be <100ms for 1000, not >500ms
- Also ensure it uses Map, not find

### Test 3: onReviewedBatch batching
- Mock v.decide to count calls
- Call onReviewedBatch with 1000 entries (500 approve, 500 warn)
- Should call decide 2 times, not 1000

### Test 4: persistence per root
- savePersisted("rootA", entry) and savePersisted("rootB", entry) with same relPath
- loadPersisted("rootA") should return only rootA entries
- Keys should be "rootA::relPath"

### Test 5: previewSelected force flag
- Setup previews Map with 2 done entries (one with thumbs, one without)
- Call previewSelected(selected, false) → should only regenerate entry without thumbs
- Call previewSelected(selected, true) → should regenerate both

### Test 6: RowView memoization
- Render ScanTable with 100 rows, count RowView renders via mock
- Update previews Map with new ref but same entry for one row
- Only that row should re-render, not all 100

### Test 7: detection bar cheap layout
- Render BatchRowMergeBar and check className includes w-full max-w-[420px] and not w-fit

### Test 8: content-visibility
- Check CSS for .batch-row contains content-visibility:auto

## Docs
- All docs in docs/archive/2026-10-15-batch-perf-*/README.md
- SYSTEM_OF_RECORD updated if needed
- UI_SELECTORS updated for new regenerate button

## Acceptance
- All new perf tests pass
- Existing batch tests pass (batch_selection_v2, batch_flex_thumb_info, etc.)
- Quality gate passed
- Build <1560kB
- Scroll 1000 rows 60fps
