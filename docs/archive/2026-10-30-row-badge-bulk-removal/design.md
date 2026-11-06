# Row badge bulk removal and upload re-application

## Structured request

**Problem 1 — selected-row removal:** Applied row badges can currently be
removed from one row by clicking its chip, or toggled on/off for checked rows
from **Apply badges**. There is no direct mouse gesture to remove one specific
badge from every checked row at once.

**Problem 2 — re-upload:** When an item is successfully uploaded to a stock
site again, that site's automatic row badge must be assigned again even if a
user previously removed that assignment (or removed the badge entry from the
catalog). A failed upload must not assign it.

## Intended contract / acceptance criteria

1. A plain left click on an applied badge chip removes that badge from only the
   chip's row; it must not alter checked rows.
2. Ctrl + left click on an applied badge chip removes that same badge from all
   checked rows. This is a removal-only operation, including for a mixed
   selection; it must not add the badge to unchecked rows or selected rows that
   do not have it. With no checked rows it is a no-op.
3. The gesture works in both SVG-to-upload and Stock Upload lists. It remains
   independent of row selection, and the removal is one undoable badge-state
   change.
4. After an actual successful stock upload, the matching site badge is
   restored on the item, regardless of a prior row-level removal. Failure or
   local-only staging does not assign it.
5. Badge labels remain local UI metadata; no export or provider payload changes.

## Implementation plan

1. Add a pure remove-from-IDs operation and unit coverage for mixed, missing,
   and empty selections.
2. Add a Ctrl-left-click route on badge chips, wire it to checked IDs in both
   lists, and commit through the existing badge history/store path.
3. Add regression coverage for single-click vs. Ctrl-click, undo, and a
   successful re-upload after badge removal; retain failure/no-upload guards.
4. Update the current row-badge contract, selectors, and upload invariant/test
   references.
5. Run focused tests, TypeScript, lint, changed quality gates, and verification.

## Outcome

Implemented in both row-list surfaces. Chip handlers read current selection through
a stable action callback so checking many rows does not re-render every row.
Successful transfer results re-derive the badge state from the current store and
restore the target badge even after row or catalog removal. Focused tests pass;
`npm run verify` passed all lanes, including full tests/coverage and build.
