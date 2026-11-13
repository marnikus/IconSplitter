# Review is one status per item, not per SVG version (2026-10-20)

## The report

> "each SVG version does not have its personal review status. the review status
> is all one global for the full item row. So switching versions does not change
> status every time. FIX"

Reproduced: `SvgVersion.review` was the only review field. `reviewact.decideReview`
wrote it on the *shown* version, `rowmodel.toListRow` read the *shown* version,
and `SvgRow`/`SvgPanel` counted the *shown* version. Choosing another version in
the history therefore changed the badge, the review filter, the tally and the
approved count of the same icon.

## Decision

Review is a property of the **item (the pair row)**, exactly like the pair's
`decision`: one icon, one status.

* `PairMeta.review: ReviewStatus` is the stored truth. It is written once, by
  `withReview(meta, status)`, which also mirrors the value into every version
  record so a build that predates the field still reads one consistent answer.
  `PAIR_META_VERSION` stays `2`: the key is additive, and a reader that does not
  know it falls back to the versions.
* `SvgVersion.review` is kept as the **mirror** and as the migration input: a file
  without the item key reads the newest *decided* version once
  (`derivedReview`) and upgrades on the next write. Per-version review is never
  read by any surface again.
* `withVersion(meta, rec)` — the only writer of a new attempt — sets the item
  status from a GENERATED record (`pending` for a fresh generation,
  `needs-review` after a regeneration) and leaves it untouched for a failed one,
  so a failed attempt cannot reopen or close a review.
* `SvgRow.review` replaces `SvgRow.approved`: the row badge, `toListRow`, the
  review filter, `usageTotals`, the `svg-count-approved` chip, the scan key and
  the panel's approved count all read it. `approvedVersion()` is gone with it —
  it was the per-version reading of the same question.
* Undo is recorded per source: `SvgReviewRec` is `{ id, review }`. `applyReviewPatch`
  restores the item status without naming a version, and a history entry written
  before this change (which still carries `version`) is accepted and ignored.

## Consequences

* Switching the shown version, choosing another version in the history or
  renaming a file cannot change the status — the surfaces never read a version.
* Approving an item approves it in every version's mirror; regenerating reopens
  the whole row to `needs-review`; declining then regenerating still ends at
  `needs-review` (a new attempt needs a new review, I-7x regeneration family).
* The versions dialog keeps listing `v.review`; the value is identical for every
  version by construction, which is the point.

## Files

`src/lib/pairmeta.ts` (`review`, `withReview`, `derivedReview`, `withVersion`,
parse/serialize), `src/lib/svgfile.ts` (drop `approvedVersion`), `src/svg/types.ts`
(`SvgRow.review`), `src/svg/rowmodel.ts`, `src/svg/reviewact.ts`,
`src/svg/reviewundo.ts`, `src/svg/scankey.ts`, `src/svg/SvgRow.tsx`,
`src/svg/SvgPanel.tsx`, `src/state/apply.ts` (accept an entry without `version`),
new suite `tests/svg_review_item.test.ts`.

Invariant: I-78 in `docs/current/sor/invariants/svg.md`.
