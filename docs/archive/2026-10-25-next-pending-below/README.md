# Closest pending row below — 2026-10-25

## Request and diagnosis
After a row is approved, activate the closest pending row below it in the displayed list, consistently across tabs. Selection currently searches raw scan order and wraps; its rendered list is independently filtered/sorted. Batch and Generate SVG have individual review actions but do not yet share auto-advance.

## Contract
- Use the visible order immediately before the decision; status sorting/filtering must not move/remove the reference row before finding its successor.
- After an individual approve/decline, skip reviewed rows and choose the first pending row strictly below the reviewed row. Never wrap or jump to a hidden row. If none exists, keep the active ID unchanged. An unknown/hidden reference does not advance.
- Selection's existing auto-next switch remains authoritative in both layouts. Batch and Generate SVG individual review actions use the same downward rule. SVG targets must have a generated SVG, as existing review eligibility requires; needs-review is not pending.
- Preserve checked IDs, anchors, bulk actions/confirmations, history entries, persistence/retry, paid-action gates and ordinary click/arrow navigation. Multi-item decisions and reset/warning/needs-review actions do not auto-advance.
- Upload only lists already-approved SVGs and has no approve/pending review workflow; the single-sheet editor likewise has no row approval. Their manual selection remains unchanged.
- Asynchronous SVG writes must not pull focus back if the user changes active row while saving.

## Steps (before implementation)
1. Add genuine failing regressions: shared downward navigation, Selection displayed vs scan order/filter/status sort/end-of-list, Batch individual review, SVG individual review and asynchronous focus safety.
2. Implement one pure shared next-pending-below helper; wire it into all individual review paths, using pre-decision visible order. Keep bulk and manual navigation separate.
3. Run focused tests, types, lint, changed-quality, fast and full verification without weakening tests, algorithms, alarms or isolation.
4. Update current behaviour owners and append measured verification evidence; scoped attributed commit and push the fixed session branch.

## Evidence
Completed all steps. One shared pure downward-search helper now drives Selection's filtered/sorted pre-decision list, Batch's visible-order review callbacks and SVG's pinned visible-order review writer. SVG also checks live candidate metadata and guards against stealing an active row changed during an asynchronous save. Existing controls, checked IDs/anchors, multi-row scope, review writes/history and manual navigation are preserved.

- Genuine RED: initial regression run **8 failed / 72 passed**, across Selection, Batch and SVG (`/home/user/next-pending-below/red.log`). The existing wrapping assertion was intentionally updated to the new no-wrap contract, not removed.
- Additional genuine RED: stale SVG candidate metadata test **1 failed / 58 passed** before adding the live metadata check (`stale-red.log`).
- Focused final: **171 tests / 7 files passed** (`focused.log`), including the real shared helper, both Selection layouts, Batch/SVG panel wiring and SVG review IO. Two additional supplied test-file patterns did not match any files; the count here reports only executed files.
- `npx tsc --noEmit`, `npm run lint` (**0 errors / 22 existing warnings**) and changed-quality vs **6c5b909** passed; all five changed production files satisfy the gate.
- `npm run verify:fast -- --base 6c5b909`: **ALL LANES PASSED**, including **2917 tests / 277 files**, coverage and production build.
- `npm run verify -- --base 6c5b909`: **ALL LANES PASSED** on the first full run; native uninstrumented budgets **30 tests / 5 files**, coverage suite **2917 / 277**, production build. Coverage statements/branches/functions/lines: **95.40% / 89.90% / 98.22% / 98.30%**. Full tests/coverage lane **90.2 s**; native lane **3.9 s**. Logs are outside the repo at `/home/user/next-pending-below/`.
- No dependencies, test harness, isolation, performance/coverage thresholds, pixel/export algorithms or source media changed. Existing generated `dist/` and `node_modules/` changes remain unstaged.
