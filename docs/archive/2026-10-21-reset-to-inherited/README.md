# Reset to inherited — the bulk reset never touches a decoration (2026-10-21)

## 1. The request

> "no. same pronblem!
>
> I click reset to defaults and shadow, badge and size guide were reseted
> /unchecked in checkboxes in global setting but should not!
>
> understand problem . create plan and steps as doc. then implement."
>
> "**↺ Reset to defaults (0) - is not reset to default it reset to inherrited!
> change the behavior and name also of button. \"Reset to inherrited\"**"

## 2. What the code actually does (measured, 2026-10-21)

The bulk button **was never a defaults reset**. `resetBatch`
(`src/upload/selectedsettings.ts`) deletes the checked rows' `overrides[id]`
entries; the stored `defaults` are never written by it. The name said the
opposite, so the one thing it *did* clear — a row's local settings — read as
"my global settings got reset".

The second half is what the screenshot shows. The **Checked icons** boxes in
the Export settings popup are not stored anywhere: they are derived every
render from the checked rows' effective settings
(`shadowselection.selectedShadow`, `badgeselection.selectedBadge`,
`sizeguideselection.selectedSizeGuide` — `effectiveSettings(defaults,
overrides[id]).shadowEnabled`, …). So clearing the rows' decoration flags
unticks the three boxes, and that is exactly what the reset did whenever the
flag was a plain override:

| row state | reset before this fix |
|---|---|
| flag carries an `applied` mark (set by the popup this session) | kept (2026-10-21 fix) |
| flag stored by an earlier build, or written/confirmed in the row's own dialog | **cleared → Shadow / Badge / Size guide boxes untick** |
| any other local pin (padding, paint, artboard, …) | cleared (intended) |
| stored global `defaults` | never written (intended) |

The `applied` map therefore cannot be the guard: a decoration that predates
the map, or one whose value the user confirmed locally, is still a decoration —
and no "reset" button should ever remove it.

## 3. The rule (decided with the user)

1. The button is **“↺ Reset to inherited (N)”**. Its job is: drop the checked
   rows' LOCAL pins so those rows follow the global defaults again. It is not,
   and never was, a defaults reset.
2. **It never removes a decoration.** `shadowEnabled`, `badgeEnabled`,
   `sizeGuideEnabled` and their geometry (shadow width/gap, badge corner/width/
   insets, size-guide corner/logo sizes/strokes/gap/insets) are kept on the
   row, so the three Checked-icons boxes stay checked. The only control that
   removes a decoration is its own checkbox (global, for the selection) or the
   same checkbox inside the row's dialog.
3. The stored global `defaults` are never written by it.
4. `N` counts the checked rows that have a local, non-decoration pin — the
   rows this button would really change.
5. The row dialog's own reset follows the same rule and the same name
   (“Reset to inherited”): local settings go, decorations stay.
6. Undo restores exactly the removed pins in one `uploadSettings` entry.

## 4. Plan and steps

1. **`src/lib/upload/decorations.ts`** — one list naming every decoration field
   (`DECORATION_FIELDS`, derived from `DECORATION_FIELD` + the three geometry
   groups) and `isDecorationField`; a `withoutReset` helper that returns the
   override map minus every local NON-decoration key, plus the surviving marks.
2. **`src/upload/selectedsettings.ts`** — `resetBatch` uses it, so a reset can
   never delete a decoration or its mark, whatever the row's history;
   `resettableIds` counts only local non-decoration pins.
3. **`src/upload/overrideactions.ts`** — the row's `resetOverride` uses the same
   helper; labels become “Reset to inherited”.
4. **UI names** — `UploadBulkBar` button `↺ Reset to inherited (N)` + title;
   the row dialog's `upload-set-reset` becomes “Reset to inherited” with a hint
   that decorations are kept; history labels and toasts say “Reset to
   inherited”.
5. **Tests** — red first: a new `upload_ui` case applies all three decorations,
   adds a local padding pin, clicks the reset and asserts (a) all three
   Checked-icons boxes still read checked, (b) the three flags survive on the
   row, (c) `defaults` are byte-identical, (d) the padding pin is gone, (e) the
   button says “Reset to inherited”. A second case seeds a row whose flags are
   plain overrides (no `applied` marks — the migration case) and asserts the
   same. Existing cases that expected the reset to clear a shadow/badge are
   rewritten to the new rule.
6. **Docs** — `sor/upload-settings.md` (owner), `sor/upload-badge.md`,
   `sor/upload-sizeguide.md`, `sor/storage/upload.md`, `sor/upload.md`,
   `selectors/upload-list.md`, `selectors/upload-dialogs.md`; one measured
   `QUALITY_RECHECK.md` entry.
7. **Gates** — focused tests, `tsc`, `lint`, `quality --changed`,
   `verify:fast`, `verify`; commit and push.

## 5. Acceptance criteria

* With Shadow, Corner badge and Size guide applied to the checked selection
  and any local pin present, clicking `↺ Reset to inherited` leaves all three
  Checked-icons boxes checked and the three decorations on every icon.
* The same holds when the flags are plain overrides without an `applied` mark.
* The clicked row's local padding/paint/artboard/JPEG pins are gone and the row
  reads `inherits defaults` for those fields.
* Stored `defaults` are byte-identical before and after; the button is disabled
  (N = 0) when the selection has no local pin.
* The row dialog's own button is called “Reset to inherited”, removes local
  settings only, and one undo restores them.

## 6. Verification

Measured on 2026-10-21, branch `arena/cf992ba5-iconsplitter`:

* Red first (mutation check on the finished code): dropping the decoration
  branch from `withoutLocalPins` + `localResetKeys` fails the migration case
  with `expected undefined to deeply equal { shadowEnabled: true, …(2) }` —
  i.e. the reset deletes the flags and the three boxes untick, exactly the
  reported bug. Restored: green.
* The all-three case: apply Shadow + Corner badge + Size guide to a checked
  row, change a global Shadow default to 130, pin padding 17 locally.
  `↺ Reset to inherited (1)` →
  `overrides.FOG = { shadowEnabled: true, badgeEnabled: true, sizeGuideEnabled: true }`,
  `applied.FOG` the same three, `defaults.shadowWidthPct = 130` untouched, the
  padding pin gone, the row reads `inherits defaults`, and the three
  Checked-icons boxes still read checked. One undo restores the padding pin.
* The migration case (flags stored as plain overrides, no `applied` marks):
  same result — the flags stay and the boxes keep their state.
* The row's own `Reset to inherited` keeps the badge pins (enable, width 55,
  corner top-left, insets 6/9) and the applied shadow; it clears only the
  padding pin, and one undo restores it.
* `tests/upload_ui.test.tsx` 65 passed; storage 14 and undo 19 unchanged;
  full suite 2352 passed.
* `npx tsc --noEmit` clean; `npm run lint` 0 errors / 23 warnings;
  `node tools/quality.mjs --changed --allow-legacy` GATE PASSED;
  `npm run verify`: types, lint, quality gate, tests+coverage and build PASSED.
  The uninstrumented native perf lane is wall-clock sensitive on this host
  (synthetic 1000px detect 200–245 ms against a 200 ms budget, load average
  ~1.9 on 2 cores; no detection code touched); run standalone it passed 30/30
  repeatedly. Budgets were not changed.
