# Apply current export settings as local — plan (2026-10-25)

## Problem and intended workflow

SVG-to-upload currently offers live global defaults and individual overrides.
Users cannot conveniently freeze a checked batch to one export style, change
settings, and freeze a second batch to another style without opening every row.

Add **Apply as local (N)** to the GLOBAL Export settings popup. Clicking copies
the current global general settings into every checked, currently loaded icon's
local override map. It replaces older general pins rather than copying an old
row's size back over the newly chosen global size. Checked icons hidden by a
filter participate; unchecked/active-only rows and unknown/stale ids do not.

No click means no new behavior: global edits remain live for inheriting fields;
existing local pins remain local. Clicking does not revert/change global defaults
or change selection, source files, metadata, provider configuration or exports.
It is a settings action, not an export or a paid request.

## Snapshot details and compatibility

- Pin ALL settings fields explicitly, including false, null, default/source
  choices, content-fitting artboards and values currently equal to defaults.
  Otherwise later global edits could leak into a supposedly frozen batch.
- Shadow/badge/size-guide are special: their enabled flags are selected-only,
  not global defaults. Preserve and freeze each selected icon's CURRENT effective
  decoration choices/geometry. Do not accidentally turn a checked decoration off
  because global enabled defaults are always false; never enable an unchecked row.
  Keep the separate applied-decoration map intact, including on reset/undo.
- Validate snapshots through the existing settings parser; clone nested artboard
  and padding data. Permit an explicit content artboard override to survive
  persistence/history (it was previously treated as inheritance).
- Existing per-row markers show overridden; previews/export/stale detection use
  the normal defaults → applied → local merge. No second settings store/schema.
- One click is ONE uploadSettings undo/redo entry for the complete changed batch,
  preserving exact previous partial overrides. Equal existing full snapshots are
  a no-op (no redundant history); empty selection disables the button.
- Reset to inherited keeps its existing behavior: remove local pins and resume
  current globals/applied decorations. Settings persist through tab switches and
  reload; undo while unmounted uses the existing persistence path.
- Controls still commit on blur. A real click after editing a draft must freeze
  the newly committed value, not a stale render snapshot.

## Implementation steps (tests first)

1. Add failing parser/snapshot and real panel tests: button availability, live
   globals without Apply, selected/hidden scope, replacing old pins, two different
   frozen batches, later global edits, explicit off/null/content settings,
   preservation of decorations, duplicate/no-op ids, one-step undo/redo/reset,
   reload/unmounted history and draft commit ordering.
2. Add a small pure local-snapshot function in src/lib/upload; retain real math
   and the existing validation/equality paths. Extend artboard override parsing.
3. Implement a selected-settings batch using the existing reducer patch and
   history entry. Wire through the existing bulk-settings hook/action surface.
4. Add the global-dialog action and scope note/count/disabled state. Keep the
   per-row dialog's reset and existing controls unchanged.
5. Update settings owner, selectors, storage/test/source indexes and router;
   all current pages <=9KB and router<5KB. Append measured ledger entry unread.
6. Focused RED→GREEN, types, lint, changed quality, fast/full verification; review
   scoped diff and commit/push only this feature. No generated artifacts staged.

## Repository checkpoint

The initial checkout exposed prior completed work as uncommitted over344b638.
Fetched this same branch;945 relevant source/test/tool/current-doc files exactly
matched remote2187e78 (ledger deliberately not read). Advanced this branch/index
to that existing remote commit with a worktree-preserving mixed reset; working
status became clean. No user file was discarded or another branch created.

## Acceptance

Batch A can freeze e.g.512px/8% settings; batch B can freeze1024px/12%; a later
2048px global edit affects only remaining inherited rows. Reapplying to A
explicitly replaces its old general settings. One undo/redo restores the entire
batch, with persistent exact choices and unchanged unrelated rows/decorations.

## Implementation and verification (2026-10-25)

Implemented the planned global-only Apply as local (N) action, validated detached
snapshots, checked/loaded/unique scope, full-field pins, decoration preservation
and one-entry history. Existing Reset and normal global editing remain intact.
Content-fit artboard overrides now persist explicitly. Existing controlled-dialog
fixtures gained the new callback; their assertions were retained (folding also
asserts the new action is not accidentally called).

Initial runner startup failed because the restored dependencies lacked Linux
Rollup; `npm run setup` repaired the platform installation, without lockfile or
source dependency changes. That startup error was NOT counted as RED. Then the
real tests produced5 failing feature assertions (missing button/content-fit pin).
Implementation made them green. An initial new history test incorrectly expected
Undo to delete timeline entries; corrected it to check the restored cursor label,
exact original maps and one-entry increment instead. An unused test import found
by types/lint was removed. No existing assertion, timeout or threshold was relaxed.

Measured acceptance:
- New feature10 tests/2files PASS: complete snapshots, nested copy, scope/no-op,
  actual SVG512/1024/2048 geometry and byte-identical as-is output, two distinct
  batches, live globals without Apply, local markers, reset, hidden checks,
  exact undo/redo, draft blur, reload and persistent unmounted history.
- Broader focused79tests/8files PASS; documentation navigation4/4 PASS.
- Standalone `npx tsc --noEmit`, lint (0errors/23existing warnings), changed
  quality versus2187e78 PASS. New/changed functions stay within RULE16 limits.
- `npm run verify:fast -- --base 2187e78`: ALL LANES PASSED2872tests/272files.
- `npm run verify -- --base 2187e78`: ALL LANES PASSED2872tests/272files plus
  native30tests/5files; types/lint/quality/coverage/build PASS.
- Full src/lib coverage95.33%statements/89.74%branches/98.20%functions/98.29%lines;
  new settingslocal module100%allmetrics. Source scope/native budgets unchanged.
- Current contract/owner/storage/test/selector routes updated, each<=9KB,
  router<5KB. No dependency/build/cache/coverage artifacts included in the commit.

Current behavior/owners/selectors/tests:
`docs/current/sor/upload-local-settings.md`.
