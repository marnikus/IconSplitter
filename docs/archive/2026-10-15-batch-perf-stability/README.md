# Batch perf stability — scroll freeze / CPU spike fix (ported)

2026-10-15 · Ported from `arena/736d3693-iconsplitter` (chain 20b78e4 → 5bab8bf →
94ea14f → d02aee4 → 32c6797, "exact root cause 3398b0a"), re-based onto this
branch's preview/merge implementation. TDD: `tests/batch_perf_regression.test.tsx`
(11 tests) written red first — 4 failed here before the port.

## Root cause (from that branch's analysis)

`useBatch()` returned a fresh object literal every render ⇒ `core`/`v` identity
changed on every render ⇒ `v.decide`/`onReviewed*` closures were new every
render ⇒ every downstream effect re-ran every render, and the review sync wrote
per-row state per render (O(n·renders)) ⇒ CPU spike / scroll freeze on large
lists. Introduced by the persistence work (3398b0a there; the same shape existed
here after the preview-restore feature).

## The fix, piece by piece (this tree)

| Piece | Where | Effect |
|---|---|---|
| Stable `core` | `useBatch.ts` | `coreActions`/`viewActions`/`presetActions` memoized bags; the returned object is `useMemo`'d; `fsSupported()` computed once |
| Stable `view` | `useBatchView.ts` | `decide`/`decideActive` hoisted to `useCallback`; `makeView` result `useMemo`'d; `usePrefsState` bag memoized |
| Row render skip | `ScanTable.tsx` | `RowView` = `memo` over a data-driven deps table (previews entry, row fields, activeId, thumb, merges, staleness predicate) |
| Off-screen cost | `src/index.css` | `.batch-row { content-visibility: auto; contain-intrinsic-size: 0 110px }` |
| Cheap detection bar | `BatchRowMergeBar.tsx` | `w-full max-w-[420px] min-w-[300px]` (no `w-fit`/`min-w-[360px]`), single `onChange` handler |
| De-duplicated review sync | `useBatchPreview.ts` | the restore effect no longer fires `onReviewed*` — `useReviewSync` owns it, so a restore cannot double-write every row; restore deps shrank to `[root, rootName, setPreviews]` |
| Thumbs-aware eligibility | `useBatchPreview.ts` | Preview re-renders a `done` row whose entry has no thumbs; the fallback entry carries a 1px placeholder so it never re-queues |

Superseded on the source branch: its mid-arc "store metadata only, drop thumbs"
(20b78e4) was reverted by its own final commit (ddceb69) — records persist
thumbs again, which is what this branch already did. The regression test asserts
the final verdict.

## Acceptance

- `tests/batch_perf_regression.test.tsx` 11/11; existing suites unchanged.
- `npm run verify:fast` ALL LANES PASSED (174 files / 1,874 tests).
- Scroll 1000 rows stays responsive: unstable identity gone, per-row memo +
  content-visibility cut the per-scroll render cost.
