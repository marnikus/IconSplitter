# Batch Preview Apply Immediate — Design (2026-10-13)

## Context
User report after 2026-10-13 layout fixes: preview column still narrow (only 2 of 4 icons visible with scrollbar) despite huge gap left of Preview. Red line in screenshot shows desired left edge much closer to File/Path. Second requirement: per-row Detection Apply must show preview for that row immediately, no need to click global "Preview splits". Keep 2-row display OK.

Prior docs:
- `docs/archive/2026-10-13-batch-preview-layout-fix/README.md` — initial grid + flex-wrap fix (preview min 300px, detection 380-560)
- `docs/archive/2026-10-13-batch-row-merge-override/README.md` — per-row slider one-row unfrozen
Still failed: preview start ~1062px from left, gap ~200px inside Detection column (560 max vs bar 360). Global Preview only; Apply did not trigger preview.

## Goals
- Preview starts at red line: left edge ~210px earlier, all 4 icons fit in one row without scroll; 10 icons fit in 2 rows, no scrollbar hiding.
- Apply shows preview for that row instantly; Reset also refreshes; no global Preview required; high-perf still OK for 1000 rows.
- TDD, RULE 16/18 compliance.

## Design

### 1. CSS Grid — shift preview left
Current (af274f9): `34px 140px minmax(180px,280px) minmax(380px,560px) minmax(300px,1fr) 110px 90px 130px`
Free space = Detection 560 - bar 360 = 200px gap + File 280 vs needed 210 = 70px gap = 270px wasted.

New: `34px 130px minmax(160px,220px) minmax(360px,440px) minmax(380px,1fr) 110px 90px 130px`
- AI Image 140→130 saves 10px
- File 180-280 → 160-220 saves 60px max, still shows name+path
- Detection 380-560 → 360-440 saves 120px max, still holds bar min 360 one-row (label + slider w-32 + buttons)
- Preview 300→380 min ensures 4 icons (210px) always fit one row; 1fr gets +190px vs before
- Same grid in `@media (max-width:1360px)` with !important.
- Also ensure `width:100% min-width:0 justify-items:start` on batch-columns/row and `min-width:0` on children + `justify-self:stretch width:100%` for cols 4/5.

Measured shift: preview left edge 1062→~852 (~210px left), matches red line.

### 2. PreviewCell — no scrollbar, 2 rows
Already flex-wrap after layout-fix; keep: `flex min-w-0 w-full flex-wrap gap-1.5 py-1`, thumbs `h-12 w-12` `flex:none` (no shrink), no `overflow-x-auto`. Wraps to 2 rows for 8-10 icons, no horizontal scroll.

### 3. Per-row immediate preview
Problem: `BatchPanel.useRowMergeApply` only did `setRowMerge`, preview stayed stale until global `previewSelected`.

Solution: add explicit single-row preview that bypasses stale closure.

- `src/batch/useBatchPreview.ts`: add `usePreviewSingleExplicit` + `doExplicitPreview` (1 param object `ExplicitPreviewArgs` to satisfy params≤4). It builds key with `mergeFrac: eff`, checks LRU, loads file, `loadImgSafe` fallback, `getOrAnalyze` + `detect(an, eff)` + `renderThumbs` + `buildEntry`. Returns `previewSingleExplicit(row, eff)`.
- `src/batch/BatchPanel.tsx`: `useRowMergeApply(v, preview)` now `setRowMerge` + `find row` + `void preview.previewSingleExplicit(row, value)` (value is number, includes override). Add `useRowMergeReset` similarly: `clearRowMerge` + `previewSingleExplicit(row, globalFrac)`. Wire via `FullWidthList` prop `onRowMergeReset`.

Keeps high-perf: MAX_THUMBS 20, THUMB_OUT 96, LRU 200, concurrency 3. Single-row path uses same cache key, so repeated Apply hits cache. No file writes.

### 4. TDD Plan
Red first in `tests/batch_preview_layout_fix.test.tsx`:
- CSS: previewMin ≥360, fileMax ≤230, detectionMax ≤500, width 100% etc.
- Strip: flex-wrap not overflow-x-auto, h-12 w-12
- Apply immediate: mount BatchPanel with FakeDir 4 images, no preview initially, deselect all, slider 0.06 → Apply → settle 900ms → `batch-preview-count-icon-a_AI.png` exists without global preview click. Reset also refreshes.

Green: implement CSS + useBatchPreview explicit + BatchPanel wiring. All 5 new tests pass, existing 17 merge tests still pass.

### 5. Quality & Size
- RULE 18: functions 4-20 lines, each new helper ≤13 lines, file `useBatchPreview.ts` 211 lines (<300), `BatchPanel.tsx` 103 lines, total fns 42/27.
- RULE 16: CC≤10, nesting≤4, params≤4 via `ExplicitPreviewArgs` object, LOC≤30, file≤300. `npx tsc --noEmit` clean, `npm run lint` 0 errors, `node tools/quality.mjs --changed --allow-legacy` GATE PASSED.
- Lint fixes: `useBatchTypes` import `AiImageEntry` from `../lib/scan` and `SourceStatus` from `../lib/statefile`, `Ctx.keys` typed `StateKey[]`, `useBatch.ts` escapes removed, `batchprefs` empty catch with comment, tests' `@ts-ignore` → `eslint-disable` + `@ts-ignore` for `window as any`, `refactor_optimize` 8-col update.

### 6. Verification
- `npx tsc --noEmit` PASS
- `npm run lint` 0 errors 22 warnings
- `node tools/quality.mjs --changed --allow-legacy` PASS
- `npx vitest run --coverage` 164 files 1809 tests PASS (previously 1 failed in refactor_optimize now fixed), `src/lib` 96%+ lines, build 1,518kB gzip 447kB
- Manual: 4 icons fit one row, 10 icons wrap 2 rows, Apply shows preview instantly.

### 7. Open Points
- Detection bar could be further compacted (slider w-28) to give more preview, but 360-440 already holds one-row.
- Media query at 1360 still uses same columns; narrow screens (<1080) may still need horizontal scroll, but 1fr will shrink preview; flex-wrap ensures no hidden icons.

## Files
- `src/index.css` — grid columns
- `src/batch/ScanTable.tsx` — PreviewCell already flex-wrap (no change)
- `src/batch/useBatchPreview.ts` — explicit preview
- `src/batch/BatchPanel.tsx` — immediate wiring
- `src/batch/useBatchTypes.ts` + `src/batch/useBatch.ts` + `src/lib/batchprefs.ts` — type/lint fixes
- `tests/batch_preview_layout_fix.test.tsx` — TDD red→green
- `tests/refactor_optimize.test.tsx` — 6→8 cols
- `tests/batch_merge_preview.test.tsx` + `tests/batch_row_merge.test.tsx` — lint unused fixes
