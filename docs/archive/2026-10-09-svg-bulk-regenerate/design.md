# Generate SVG — bulk Regenerate (2026-10-09)

## 1. Ask and acceptance criteria

Add a global **Regenerate selected** action to the Generate SVG bulk bar. It is
selection-only and may send only selected rows that already have a valid
`row.newest` SVG. Selected rows without one are always excluded. The existing
**Generate selected** action remains separate and continues to accept selected
rows with or without an SVG.

## 2. Decisions

1. **Filter at both display and action boundaries.** A pure row-model helper
   filters checked ids against the current rows using `row.newest !== null`.
   Its result drives the displayed eligible count and the bulk action filters
   again against the live model before opening confirmation. No eligible ids
   means a disabled button and no request.
2. **Reuse generation's real pipeline.** Eligible ids open the existing
   paginated confirmation and use the same composite, validation, versioned
   save and runner. The confirmation names regeneration; regeneration writes
   the next SVG version and never overwrites history. If a run is in flight,
   bulk Regenerate confirms and appends behind the current queue, like bulk
   Generate. The existing single-row Regenerate behavior remains the front-of-
   queue next attempt while a run is active.
3. **Keep Generate selected unchanged.** It still acts on the whole checkbox
   selection, including rows with no generated SVG. It retains its existing
   confirmation and queue behavior.

## 3. Owners

| Owner | Change |
|---|---|
| `src/svg/rowmodel.ts` | Pure selected-id filter for rows with a valid newest SVG |
| `src/svg/actions.ts`, `types.ts` | Live eligibility check and confirmation operation kind |
| `src/svg/SvgBulkBar.tsx`, `SvgPanel.tsx` | Eligible count, disabled state, separate button and action wiring |
| `src/svg/SvgConfirm.tsx`, `SvgDialogs.tsx` | Distinguish regeneration in the shared confirmation |
| `tests/svg_io.test.ts` | Mixed selection filter, including rows with no valid SVG |
| `tests/svg_queue_ui.test.tsx` | Real mixed-selection batch, exact preview/request membership, queue pipeline and unchanged Generate |
| `docs/current/SYSTEM_OF_RECORD.md`, `UI_SELECTORS.md`, `docs/README.md` | Current behavior, handles and archive map |

## 4. TDD and verification

1. Test the pure filter with several selected rows, including rows with no SVG
   and a failed-only history; assert that only valid existing SVGs survive and
   that selection order is kept.
2. Drive the real panel and streaming transport: leave one selected row empty,
   generate another through the existing action, then regenerate a mixed
   selection. Assert the eligible count, regeneration wording, exact confirmation
   manifest and exact provider request; assert the empty row is not saved.
3. Run focused row-model, SVG UI/queue and confirmation tests, then repository
   verification. Check TypeScript, lint/quality gates and `git diff --check`;
   preserve the pre-existing Upload-tab Regenerate metadata changes.
