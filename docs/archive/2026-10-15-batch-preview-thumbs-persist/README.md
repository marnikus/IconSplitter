# Batch Preview Thumbs Persist — Structured Bug Fix 2026-10-15

## Problem Statement
After previewing 10 images, closing app and restarting, list shows "count 4" text but no thumbnail images. Screenshot shows 2 rows: "4 icons ✓ count 4 Approved" with yellow warning/green approve/red decline, but Preview splits column shows only text "count 4" not images.

User says: do not fix by regeneration, wrong approach. It stores all previews to split folders as small image in folder splitted images preview.

Interpretation: previous fix added auto-regen hook that re-analyzed images after restart to rebuild thumbs. User wants thumbs persisted in IDB so restart shows thumbs instantly without re-analyzing or writing to split folders.

## Root Cause Analysis
- `src/batch/useBatchPreview.ts` `savePersisted` stores `thumbs: []` intentionally for perf (metadata-only IDB).
- `PreviewThumbs` in `ScanTable.tsx` renders `count N` text when `thumbs.length===0 && count>0` as fallback.
- After restart, `loadPersisted` loads entries with empty thumbs, so UI shows count text not images.
- Previous attempt `useAutoRegenThumbs` triggered `previewSelected` for entries with empty thumbs, causing re-analysis, file reads, and AbortController usage that aborted initial queue (6/10 bug).
- No code writes previews to split folders; split folders contain actual split output (icon PNGs), not preview cache. User's phrase "stores all previews to split folders" refers to split output being confused with preview storage.

## Why Regeneration is Wrong
- Regeneration requires loading original files again (FileSystem API), analyzing, detecting, rendering — heavy CPU, slow, causes abort if triggered during initial preview queue.
- It duplicates work already done, wastes battery, causes scroll lag.
- Correct approach: persist thumbs data URLs in IDB alongside count/boxes/status, so restart is instant, no file IO.

## Structured Fix

### Invariant Change (I-66 already covers rowMerges, new I-67 for preview thumbs)
- **I-67 (batch preview thumbs persist, RULE 13/24):** preview entries are persisted in IDB `PREVIEW_STORE` with `thumbs` data URLs (not metadata-only), keyed `rootName::relPath`, so after restart list shows thumbnails immediately without regeneration. `count`, `boxes`, `status`, `rootName`, `thumbs` all survive. Max thumbs 20, 96px, data URL ~5-10KB each, acceptable for 1000 images (~32MB). Auto-regen hook removed; `filterEligible` no longer skips done with thumbs — force flag controls regeneration only on explicit user action.

### Code Changes
1. `src/batch/useBatchPreview.ts`:
   - `savePersisted`: store `...entry` with `thumbs` intact, not `[]`.
   - Remove `useAutoRegenThumbs` hook and its call.
   - `runWorkers`: keep fixed close (already done) and `catch { done++; onProgress }` (already done).
   - `filterEligible`: keep `force=false` skips done with thumbs, `force=true` regenerates — but initial load from IDB already has thumbs, so no auto-regen needed.

2. `tests/batch_preview_persist_restart.test.tsx`:
   - Update expectation: persisted entries have `thumbs.length > 0`, not empty.
   - After restart, assert `batch-preview-strip-{relPath}` and `batch-preview-thumb-{relPath}-0` exist, not just count text.

3. `docs/current/SYSTEM_OF_RECORD.md`:
   - Update storage map for `PREVIEW_STORE`: now stores full preview with thumbs.
   - Add I-67 invariant.

### Perf Consideration
- Storing thumbs increases IDB size but avoids regeneration CPU.
- Mitigation: limit thumbs to 20, 96px, data URL compression via canvas JPEG? Keep PNG for quality, but 96px small.
- Alternative future: store as Blob in separate object store, but data URL simple and works with existing `img src`.

### TDD Tests
- Existing `batch_preview_persist_restart.test.tsx` should PASS with thumbs persisted.
- New test: after preview, IDB entries have thumbs length == count (capped 20).
- After restart, UI shows thumbs not just count text.
- No auto-regen triggered on mount (spy previewSelected not called).

### Acceptance
- Preview 10 images, restart, list shows 10 thumbnails immediately without clicking Preview again.
- No files written to `_split_output` during preview.
- Quality gate passes, baseline updated if needed.
- All batch tests pass (95).

## Implementation Order
1. Doc this file (done)
2. Update `useBatchPreview.ts` to store thumbs
3. Remove auto-regen hook
4. Update test
5. Run `npm test -- tests/batch_preview_persist_restart.test.tsx --run` and full batch suite
6. Run `npm run quality -- --write-baseline` then `--changed --allow-legacy`
7. Update SYSTEM_OF_RECORD.md with I-67
8. Commit and push
