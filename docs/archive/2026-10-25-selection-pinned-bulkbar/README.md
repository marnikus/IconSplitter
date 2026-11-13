# Selection bulk bar pins while scrolling — 2026-10-25

## Request and diagnosis
Keep Selection's selected-count/select-visible/deselect-all/zoom/bulk-review bar visible at the top while scrolling the list, matching the existing Batch, Generate SVG and Upload sticky bars. The existing `v2-bulk` is already the first child of `v2-workspace`, alongside the full list, but has no sticky positioning.

## Plan (before implementation)
1. Add a failing CSS contract regression for `v2-bulk`: sticky at top 0, above row/header content and below overlays, retaining its opaque background. Add a mounted DOM contract that the entire toolbar shares a list-height workspace with the rows, outside nested panel/table scrollers.
2. Add only the missing sticky CSS to the existing bar. Use the established z-index 6/top 0 convention and existing background/wrapping. Do not add a duplicate toolbar, a new preference, or change selection, zoom, confirmations, keyboard review, auto-next or comparison layout.
3. Run focused tests, types, lint, changed-quality, fast and full verification. CSS/DOM contract tests do not claim browser scroll geometry verification.
4. Update the existing Selection behaviour and selector owners, append measured quality evidence, then scoped attributed commit and push the session branch.

## Evidence
Completed: the existing `.v2-bulk` now uses `position: sticky; top: 0; z-index: 6`, without new wrappers, preferences or behavioural changes. Updated the current Selection behaviour and selector owners.

- Genuine RED: **1 failed / 44 passed**; failure was the missing sticky declaration (`/home/user/selection-pinned-bulkbar/red.log`).
- Focused GREEN: **57 tests / 4 files passed**, including Selection CSS/DOM regressions, existing Batch/SVG pinned-bar contracts and docs navigation (`focused.log`). These are CSS/DOM contract tests, not browser scroll geometry measurements.
- Types and lint passed (**0 errors / 22 existing warnings**). Changed-quality vs **101985a** passed, correctly reporting no applicable TS/TSX production files (the only production edit is CSS).
- `npm run verify:fast -- --base 101985a`: **ALL LANES PASSED**.
- `npm run verify -- --base 101985a`: **ALL LANES PASSED**, first full run. Coverage suite **2919 tests / 277 files**; native uninstrumented budgets **30 / 5**; production build passed. Statements/branches/functions/lines coverage **95.40 / 89.90 / 98.22 / 98.30%**. Full coverage lane **92.8 s**, native lane **3.9 s**.
- Logs retained outside the repo at `/home/user/selection-pinned-bulkbar/`. No dependencies, harness, isolation, assertions, algorithms, performance budgets or coverage thresholds changed. Generated `dist/` and existing `node_modules/` noise remain unstaged.
