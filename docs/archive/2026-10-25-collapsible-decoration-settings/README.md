# Collapsible Badge, Size guide and Shadow settings

## Request

Save vertical space in the export settings popup by letting Badge, Size guide
and Shadow collapse/expand like spoilers, in global and per-icon scopes.

## Plan (before production edits)

1. Write failing DOM tests against the real settings dialog for three distinct
   labelled disclosures, initially collapsed, independently expandable and
   collapsible, without closing the popup or changing settings.
2. Share one lightweight native details/summary presentation between the three
   existing section owners. Keep their current section handles and control sets;
   use the native keyboard/focus/disclosure semantics and visible arrow/focus
   styling. Start each newly opened popup collapsed to save space.
3. Keep children mounted so folding does not lose draft inputs/template editor
   state, duplicate fields or reset enablement/overrides. Existing selected-only,
   defaults, mixed/disabled and per-icon pin/Reset behavior remains unchanged.
4. Test both scopes, independent open state across rerenders, value/draft retention,
   real existing toggle/edit handlers after expansion and parent dialog Close.
   Retain existing regressions and all assertions.
5. Update bounded current settings/selector/owner/test docs and router as needed;
   run focused tests, types, lint, changed quality, documentation checks, fast and
   full verify without harness/budget changes. Append ledger unread, commit scoped
   changes and push only the active feature branch.

## Status

Implemented with `UploadSettingsGroup`: native `<details>/<summary>` for all
three existing owners, shared by global and per-icon popups. New popups start
collapsed; each group opens independently (multiple may remain open). Controls
stay mounted, including number drafts. Folding does not dispatch settings changes
or change decoration enablement, checked icons, defaults, overrides or pins.
Existing control IDs and handlers remain intact. Summary headers have native
arrows, keyboard activation and a visible focus outline.

Existing UI interaction helpers now open a folded ancestor before interacting
with its fields/editor. No original test assertions were removed or relaxed.
Settings, selector, owner, test-map and router documentation are updated within
the existing byte limits. No harness, algorithm or performance budget changed.

## Measured verification

- TDD: new real-dialog tests **12 failed** before implementation, then **12
  passed**. Both popup scopes, independent/multiple expansion, rerender retention,
  retained controls/drafts, existing checkbox handlers and Close/reopen covered.
- Final focused run: **30 tests / 4 files passed** (disclosure, badge editor,
  EPS settings, SVG regeneration). The full run below also covers Upload UI.
- `npx tsc --noEmit`: PASS. `npm run lint`: PASS (0 errors, 23 legacy warnings).
- Changed quality against `b0c429a`: PASS for all four production TSX files.
- Current documentation navigation: **4/4 PASS**; settings 8994 B, selectors
  8979 B, router 4992 B, within unchanged limits.
- `npm run verify -- --base b0c429a`: **ALL LANES PASSED**. Functional coverage
  **2783 tests / 257 files**; native performance **30 tests / 5 files**, original
  budgets unchanged; production single-file build **1794.85 kB / 556.90 kB gzip**.
  Evidence: `/home/user/disclosure-full.log`.
- Earlier focused and fast runs exposed timing-sensitive existing Upload UI
  notification assertions: metadata terminal/accepted summaries or missing-key
  errors were already empty when checked. The exact failing test varied; all new
  disclosure tests passed in those runs. Both suspect tests passed in isolation;
  a temporary observational log made the whole 83-test UI file pass and was
  immediately removed. This is diagnostic timing evidence, **not a fix**.
  No notification implementation or test harness changes were shipped.
  Failed evidence retained in `/home/user/disclosure-focused*.log`,
  `/home/user/disclosure-fast.log` and `/home/user/disclosure-fast-final.log`.
  Both fast runs had **2782/2783** tests passing; the unchanged suite subsequently
  passed in the full run (the later fast check reproduced a toast failure).
- No real-browser probe performed; native browser disclosure semantics are used,
  with DOM acceptance coverage rather than a claim of manual visual validation.

Final post-documentation fast check and delivery status recorded below.

Final post-documentation `npm run verify:fast -- --base b0c429a`: **ALL LANES
PASSED**, **2783 tests / 257 files**, with no further production or test changes.
Evidence: `/home/user/disclosure-fast-delivery.log`. This successful recheck does
not erase or resolve the earlier intermittent toast-test failures. Full and fast
both passed on the delivered source; src/lib coverage remains 95.25% statements,
89.62% branches, 98.14% functions and 98.25% lines. Prepared for scoped commit and
push on `arena/cf992ba5-iconsplitter`; no generated build/dependency files staged.
