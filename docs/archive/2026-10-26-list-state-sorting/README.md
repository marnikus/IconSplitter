# Reversible selection and approval sorting — 2026-10-26

## Agreed scope

User confirmed Batch, Selection V2, Generate SVG and SVG to upload, excluding
Single sheets (no checkable review list). Upload approval means accepted metadata,
not exported status or the already-approved source artwork.

## Plan before implementation

1. Witness red tests for grouping checked/unchecked and approved/not-approved in
   both directions. Non-approved includes pending, declined, warning, needs-review
   and absent decisions, as applicable; this is binary grouping, not old status rank.
2. Extend pure list sorts using canonical checked ids (not active row or Batch's
   legacy processing mirror). Preserve existing sorts and deterministic ties.
   Batch/Selection retain their Sort + Order controls; SVG/Upload get explicit
   first-group options in their current sort menu.
3. Wire live state changes into state sorting only. Normal selection must preserve
   memoized visible arrays and inexpensive row projection. SVG's existing pinned
   generation/date order remains intact; explicit state grouping is live instead.
   Keep source arrays/files/checks/active/anchors unchanged; navigation uses the
   exact displayed order, including Selection's decision auto-next computation.
4. Add pure, real-panel/hook and persistence regressions, including reversals,
   mixed non-approved states, hidden checks, canonical selection versus active,
   metadata accepted versus generated, ties and original input immutability.
5. Run focused types/lint/changed-quality, both delivery gates and native checks.
   Update current contract/selector/owner/test routes and append quality ledger
   without reading it. Commit/push only this feature on the session branch.

## Verification

- TDD witnessed **five failures** in `list_state_sort.test.ts` against the old
  pure sorts/parsers (`/home/user/list-state-sorting/red.log`). All five pass
  with the implementation. Tests pin both group directions across all four
  lists, mixed non-approved states, canonical/case-insensitive/hidden checks,
  accepted metadata versus processed exports, unchanged input and stored keys.
- Real-panel regressions pass in Batch, Selection V2, Generate SVG and Upload.
  They drive existing menus/checkboxes, live regrouping and approval, retained
  checks, Batch selection undo, and Selection's pre-decision checked-order
  next-pending navigation. Upload acceptance uses one confirmed fake transport.
  Its first test run used the wrong CSS selector; correcting it to the real
  role/testid selector made the fixture valid without changing production code.
- Pure/rowmodel/selection-response focused run: **100 tests / 6 files PASS**.
  The four existing large-list zero-selection-only-presentation checks pass.
  Docs navigation: **4 PASS**, after condensing repeated text to preserve all
  existing 9KB page and 5KB router limits. Assertions/budgets unchanged.
- Types, uncached lint (**0 errors / 20 existing warnings**), changed quality
  (16 production files including both new modules), and whitespace PASS.

Final delivery gates at base **637d3a8**:

| Gate | Result |
|---|---|
| `npm run verify:fast -- --base 637d3a8` | ALL LANES PASSED; 3,001 tests / 284 files |
| `npm run verify -- --base 637d3a8` | ALL LANES PASSED; 3,001 tests / 284 files + native 30 / 5 |
| Coverage statements / branches / functions / lines | 95.45 / 90.11 / 98.29 / 98.32% (all improve) |
| Native timing lane | PASS, 3.9s; budgets/harness unchanged |
| Coverage-suite duration | 97.1s fast / 96.4s full |
| Single-file production build | PASS, 7.7s fast / 7.9s full |

Both delivery runs passed types, lint, changed quality, tests/coverage and build.
Logs are outside Git under `/home/user/list-state-sorting/`. No live providers,
new dependencies, source media or existing cancellation/export behaviour changes.
Current canonical contract is `docs/current/sor/list-state-sorting.md`; router,
all four behaviour/selector pages and shared owner/test routes are updated.
