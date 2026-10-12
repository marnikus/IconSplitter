# New review status: regenerated — new review (yellow)

Date: 2026-10-11
Area: Generate SVG tab review statuses

## Problem

User wants to distinguish icons that were regenerated and need re-review.
Currently review statuses are pending | approved | declined.
- pending is yellow but also used for never-reviewed and reset.
- After regeneration, new version is automatically pending, indistinguishable from never-reviewed.
- No way to filter or see that a regenerated icon needs attention.

Requirement:
- Add new status "regenerated - new review" (yellow warning icon) that is automatically given after regenerating an icon.
- User can also give it manually via badge button (yellow warning icon near decline and approved).

## Current behaviour

- `ReviewStatus = "pending" | "approved" | "declined"` in `src/lib/svgmodel.ts`
- `isReview` checks those 3.
- `saveversion.ts` `toRecord` sets review = "pending" for new versions (both generation and regeneration)
- `runbatch.ts` does not differentiate review status.
- `SvgRow.tsx` DecisionActions: Generate/Regenerate button, Approve ✓, Decline ✕
- `SvgBulkBar.tsx`: bulk approve/decline
- `svglist.ts`: ReviewFilter = all | pending | approved | declined, REVIEW_RANK, tallyReviews, usageTotals counts approved only.
- CSS: `.svg-badge.pending` yellow, `.approved` green, `.declined` red.
- `pairmeta.ts` toDecision handles pending/approved/declined.

## Desired behaviour

### New status

- Add `ReviewStatus = "pending" | "approved" | "declined" | "needs-review"`
  - Value "needs-review" (or "regenerated") — choose "needs-review" as more generic, but display as "Regenerated — new review" or "Needs review" yellow.
  - User description says "regenerated - new review" — we will display as "Regenerated — new review" with yellow badge, warning icon.
  - Alternative name "regenerated" — but "needs-review" is clearer for manual use. We will use "needs-review" as value, display label "Regenerated — new review" or "Needs review".
  - Let's use value `"needs-review"` and label mapping: `needs-review` -> "Regenerated — new review" (or "Needs review").

- Automatic assignment:
  - When `RunArgs.regen.kind === "current-svg"` (regeneration), new saved version's review = "needs-review" (not pending).
  - When generation (main prompt), review = "pending" (existing).

- Manual assignment:
  - Row has third button yellow warning icon (e.g. ⚠ or ↻?) near approve/decline.
  - Testid `svg-needs-review-{id}` or `svg-regenerate-review-{id}`? Use `svg-needs-review-{id}`.
  - Bulk bar: add button "Needs review selected" or similar, or reuse existing approve/decline with third.
  - For simplicity, add button in row: `svg-needs-review-{id}` with yellow style, icon ⚠, title "Needs review".
  - Clicking sets decision to "needs-review" via same `decide` path.

- Filtering:
  - Add to ReviewFilter: "needs-review"
  - Update REVIEW_RANK, inReview, etc.
  - Update tallyReviews to count needs-review.

- Display:
  - CSS: `.svg-badge.needs-review` yellow (same as pending but distinct class) with warning icon? Use yellow background.
  - Add `.v2-badge.needs-review` etc if needed (though V2 is selection tab, not SVG tab, but keep consistent).
  - Row class `needs-review` for styling? Currently row class uses review value: `svg-row ${shown?.review}` — so adding new review will produce class `needs-review`, need CSS for it if we want row highlight? Could reuse pending styling.

- Persistence:
  - `parseVersion` must accept new review value.
  - `pairmeta.ts` toDecision must accept it? Actually pairmeta decision is separate from version review — pair decision is for selection approval, not SVG review. So maybe not needed. But check: Decision type in reviewfilter is different.
  - `isReview` must include new value.
  - `tallyReviews` must include.

- History/undo:
  - reviewundo stores review values, should handle new one (no change, just string).

- Bulk actions:
  - Add bulk button for needs-review? User says badge manually near decline and approved — row level is enough, but bulk also useful. We will add bulk button in SvgBulkBar: `svg-needs-review-selected`.

- Automatic yellow after regeneration:
  - In saveversion.ts, toRecord takes review param — we will pass review based on regen.
  - In runbatch.ts, need to pass regen info to saveSvgVersion.
  - Simplest: SaveArgs gets `review?: ReviewStatus` optional, default pending. In runbatch, if state.args.regen.kind === "current-svg", set review = "needs-review" else "pending".
  - For failure case metaAfterFailure keeps pending (not needs-review).

### Test plan (TDD)

- New test file `tests/svg_review_status.test.tsx` or extend existing `svg_ui.test.tsx`:
  - Unit: isReview accepts needs-review, parseVersion accepts it, tallyReviews counts it.
  - UI: SvgRow shows yellow badge for needs-review, has button `svg-needs-review-{id}`.
  - Bulk: SvgBulkBar shows needs-review button.
  - Runner: saveversion with regen sets needs-review, generation sets pending.
  - Integration: after regeneration, row's review badge is needs-review yellow.

- Steps:
  1. Extend svgmodel.ts ReviewStatus + isReview.
  2. Extend svgfile.ts tallyReviews.
  3. Extend svglist.ts ReviewFilter + rank + filter.
  4. Extend saveversion.ts to accept review status.
  5. Extend runbatch.ts to pass review status based on regen.
  6. Update SvgRow.tsx to add third button.
  7. Update SvgBulkBar.tsx to add bulk needs-review.
  8. Update CSS for badge.
  9. Update UI_SELECTORS.md.
  10. Verify quality gates.

## Risks

- Existing tests that assert review counts or filter values will need update (they currently only check pending/approved/declined).
- PairMeta decision vs version review confusion — ensure we only change version review, not pair decision.
- Backward compatibility: old pair files without new status still parse (pending/approved/declined). New status files parsed by old code would be dropped (parseVersion returns null if review unknown) — so we must update isReview to accept new value before reading old files. That's okay, old builds will drop new status versions as invalid, but we are on new build.
- The yellow color already used for pending — we will reuse same yellow but with distinct class for future differentiation.

## Invariants

- I-new: regenerated icon gets "needs-review" automatically (yellow).
- User can manually set any version to needs-review via row button.
- Filter "needs-review" shows those rows.
- Existing pending/approved/declined behaviour unchanged.

## Implementation (final)

- Value chosen: `needs-review` (display "Regenerated — new review")
- Files changed:
  - `src/lib/svgmodel.ts`: added needs-review to ReviewStatus + isReview
  - `src/lib/svgfile.ts`: tallyReviews extended
  - `src/lib/svglist.ts`: ReviewFilter + REVIEW_RANK
  - `src/svg/saveversion.ts`: SaveArgs.review? optional, toRecord uses it
  - `src/svg/runbatch.ts`: isRegen detection -> review = needs-review : pending
  - `src/svg/SvgRow.tsx`: DecisionActions adds warning button ⚠ with testid svg-needs-review-{id}, label handling
  - `src/svg/SvgBulkBar.tsx`: onDecide widened, added bulk warning button svg-needs-review-selected
  - `src/svg/SvgControls.tsx`: review filter dropdown adds needs-review option
  - `src/svg/reviewact.ts`: history label for needs-review
  - `src/index.css`: .svg-btn.warning, .svg-badge.needs-review, .v2-badge.needs-review
  - `docs/current/UI_SELECTORS.md`: updated selectors

- Automatic: regeneration (regen.kind === "current-svg") sets needs-review
- Manual: row button and bulk button
- Tests: tests/svg_review_status.test.tsx 6 passing, existing svg_ui 38 passing, confirm 15, regen 8, queue 14, versions 6
- Quality gate: --changed --allow-legacy PASSED, tsc --noEmit clean
- RULE 18: files under 300 lines, functions 4-20 ideal respected, no new large file

## Update 2026-10-11 (yellow line)
- Added yellow side line for needs-review rows, same as green (approved) and red (declined) via ::after pseudo.
- CSS: `.svg-row.needs-review::after` and `.v2-row.needs-review::after` background var(--v2-yellow).
