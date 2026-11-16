# Row settings isolation — a global change never pins a row (2026-10-21)

## 1. The request

> "setting in every item row should not be overridden by any global changes.
> Only local direct changes in local setting of a Row item can overriden it. Now
> it somehow overriden before the local changes in row item were made. Fix.
>
> 2 also add global btn to reset all overriden selected item to default.
>
> understand problem . create plan and steps as doc. then implement."

## 2. What the code actually does (measured, 2026-10-21)

Model today: `lib/upload/settings.effectiveSettings` = global defaults under,
that icon's `overrides` on top. A row is "overridden" only when its `overrides`
map is non-empty.

A probe test drove the real panel and read the stored
`iconSplitter.upload.settings.v1` after each gesture:

| gesture | `overrides` afterwards |
|---|---|
| global padding / badge width / shadow width / size-guide gap edits | `{}` — a global edit pins nothing |
| open and close one row's Settings dialog | `{}` |
| change one field in that row's dialog | `{ thatField }` only |
| the bar's STROKE control | `{}` (it writes the defaults) |
| **"Apply settings to selected" with rows checked** | **`{ 13 fields }` on every selected row** |

So the inheritance is correct, and the one path that violates the rule is the
bulk bar's **Apply settings to selected** (`shadowactions.applyDefaultsToSelected`
→ `asis.perIconFields(defaults)`). It copies the global values into each
selected row as its own pins — a global change creating row overrides, exactly
"overridden before the local changes in the row item were made". After that
click every row reads `13 fields overridden`, and later global edits no longer
reach those rows.

## 3. The rule (decided with the user)

1. **Only a local edit writes a row's overrides.** A global action — including
   any bulk button — never creates or rewrites per-row overrides.
2. Rows follow the global defaults until the user edits that row's own Settings
   dialog; then only the fields they touched are pinned (unchanged behaviour).
3. One global button resets the selection: it **clears** every checked row's
   overrides as one undoable step, so those rows inherit the current defaults
   again. Per-row "Reset to defaults" stays.
4. The decoration opt-ins ("Checked icons" Shadow / badge / size-guide
   checkboxes) are explicit user gestures on the selection, not defaults, and
   keep their documented behaviour.

"Apply settings to selected" is removed: with rule 2 it is either a no-op (a
row that inherits already follows the defaults) or a violation (it pins a
stale copy). Its slot in the bar becomes the reset.

## 4. Plan and steps

1. **Plan + contract doc** — this file; then the current pages (step 7).
2. **Red tests first** (`tests/upload_ui.test.tsx`):
   - the bulk bar no longer has `upload-apply-settings`;
   - Select all visible, then edit every global field in the global dialog →
     `overrides` stays `{}`;
   - two rows pinned locally, one checked, reset → only the checked row's
     pins are gone, one `uploadSettings` entry, undo restores, redo clears;
   - reset with nothing pinned → disabled, no history entry;
   - a reset clears decoration pins (badge + shadow) too, back to the
     defaults' off state.
3. **`src/upload/selectedsettings.ts`** — add `resetBatch(ctx, ids, label)`:
   skips rows with no pins, writes one `overrides-patch` with `null` per row
   (the existing "delete" payload) and pushes ONE `uploadSettings` entry.
4. **`src/upload/actions.ts`** — `resetOverridesSelected(ids)` action beside the
   per-row `resetOverride`; drop `applyDefaultsToSelected` from the surface.
5. **`src/upload/shadowactions.ts`** — delete `useOverrideApplyActions`,
   `decorationPins` and `DECORATION_FIELDS`; keep the shadow actions and their
   own messages.
6. **`src/lib/upload/asis.ts`** — delete `perIconFields` (its only caller was
   the removed apply) and the two test cases that only asserted it.
7. **UI** — `UploadBulkBar` swaps the button for
   `↺ Reset to defaults (N)` (`upload-reset-settings`, disabled at `N = 0`,
   title names what it does); `UploadPanel` computes `N` from the checked ids
   and wires the action.
8. **Docs (current pages)** — `sor/upload-settings.md` (the owner),
   `sor/upload-badge.md`, `sor/upload-sizeguide.md`, `sor/upload.md` (undo),
   `selectors/upload-list.md`, `sor/topics/UI_INVENTORY.md`; then one measured
   `QUALITY_RECHECK.md` entry (append only).
9. **Gates** — focused tests, `npx tsc --noEmit`, `npm run lint`,
   `node tools/quality.mjs --changed --allow-legacy`, `npm run verify:fast`,
   `npm run verify`; commit and push the branch.

## 5. Acceptance criteria

* No control outside a row's own Settings dialog can add a key to that row's
  `overrides` except the documented decoration opt-ins.
* `Apply settings to selected` no longer exists; nothing in the panel imports
  `perIconFields`.
* A reset of two pinned checked rows is ONE undo entry; undo restores both
  pins, redo clears both; unchecked rows are untouched.
* Resetting a row with a badge/shadow/size-guide pin removes those too — the
  defaults' own off state applies.
* A row with no pins keeps reading `inherits defaults` and exporting the
  current global settings.

## 6. Verification

Measured on 2026-10-21, branch `arena/cf992ba5-iconsplitter`:

* Red first: the four rewritten/new UI tests failed against the old panel
  (`upload-reset-settings` missing, `upload-apply-settings` still present).
* Green after the change: `tests/upload_ui.test.tsx` 61 passed;
  `npx tsc --noEmit` clean; `npm run lint` 0 errors / 23 warnings;
  `node tools/quality.mjs --changed --allow-legacy` GATE PASSED (the new
  `settingsreset.ts` is 22 lines; `actions.ts` stays BELOW its 296-line
  ratchet at 287 because the hook lives in its own module).
* `npm run verify:fast` ALL LANES PASSED — tests + coverage **2344** passed
  (one net new test), build OK; `npm run verify` before the push.
* The probe that opened this task is gone from the tree; its numbers are the
  table in §2.

## 7. Result

Implemented the same day on `arena/cf992ba5-iconsplitter`; the measured run is
in `docs/current/QUALITY_RECHECK.md`, the contract in
`sor/upload-settings.md`, and the button in `selectors/upload-list.md`.
