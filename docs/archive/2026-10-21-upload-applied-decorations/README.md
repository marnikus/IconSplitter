# Applied decorations — a checked-set opt-in is not a row pin (2026-10-21)

## 1. The request

> "setting in every item row should not be overridden by any global changes.
> Only local direct changes in local setting of a Row item can overriden it. Now
> it somehow overriden before the local changes in row item were made. Fix.
>
> 2 also add global btn to reset all overriden selected item to default.
>
> understand problem . create plan and steps as doc. then implement."

## 2. What the screenshot showed (measured, 2026-10-21)

One row, opened after Shadow, Corner badge and Size guide were ticked for a
checked selection in the Export settings popup:

| where | before | expected |
|---|---|---|
| each enable row's marker | `overridden` ×3 | `inherited` |
| the row's settings line | `3 fields overridden` | `inherits defaults` |
| the decoration itself | applied to preview/export | unchanged |

The three checkboxes go through `commitBatch` (`shadowactions`, `badgeactions`,
`sizeguideactions`), which wrote `<decoration>Enabled: true` into that icon's
`overrides` map — the only place the export, the preview, the fingerprint and
the staleness check read the flag. Nothing recorded WHERE the flag came from,
so `markerOf` (`settingsfield`) — "key present → overridden" — and
`UploadRow`'s `overrideKeys(...).length` counted a selection-level opt-in as a
local edit. The user had made no local change in that row.

## 3. The rule

1. The enable flag STAYS in the icon's `overrides` (the pipeline is untouched).
2. A new persisted map records which flags the checked-icons control applied:
   `applied: { [pairId]: { shadow?, badge?, sizeGuide? } }` in the same `v: 1`
   payload as `defaults`/`overrides`; a payload without it reads `{}`.
3. The marker and the pin count subtract applied flags: applied → `inherited`.
4. A change to that flag in the row's OWN dialog clears the mark, so it becomes
   a real local pin from then on. The comparison is by VALUE — the dialog hands
   over the whole merged override, and presence alone would demote decorations
   the user never touched.
5. Turning a decoration OFF for the selection deletes the flag and the mark:
   "off" is the absence of a pin, never a `false` pin.
6. `↺ Reset to defaults (N)` clears the selected rows' local pins **and** their
   applied marks in ONE `uploadSettings` entry; N counts a row with either, so
   the button can always undo a decoration it applied; the stored global
   defaults are never written by it.

## 4. Plan and steps

1. **Plan and contract** — this file; then the current pages (step 8).
2. **`src/lib/upload/decorations.ts`** (new, pure): the three keys and their
   fields, validated parsing of the stored marks, `isApplied`, `localKeys`
   (override keys minus applied), `withApplied`, `appliedEqual`, `mergeApplied`.
3. **Storage** — `settingsstore` gains `applied` in the same payload,
   `loadApplied()`, and a two-argument `saveOverrides(overrides, applied)` for
   the unmounted undo path (never one map without the other).
4. **State** — `statemodel` carries `applied`; `override` and `overrides-patch`
   take the marks change beside the overrides change.
5. **Undo** — `uploadundo.UploadSettingsPatch` gains `applied?`;
   `toUploadSettingsPatch` validates it; the persist-only path writes both maps.
6. **Writes** — `commitDecoration(c, ids, { key, on, label })` in
   `selectedsettings` replaces the three ad-hoc decoration writers (one history
   entry per gesture, both maps in before/after). The per-row
   `setOverride`/`resetOverride` move to `overrideactions.ts` and drop a mark
   only when the flag's value really moved.
7. **Reads** — `markerOf` reads an applied flag as `inherited`; `UploadRow`
   counts `localKeys`; `UploadPanel` passes the row's marks; the bar's N uses
   `resettableIds` (a local pin **or** an applied mark).
8. **Docs** — `sor/upload-settings.md` (owner), `sor/upload-badge.md`,
   `sor/upload-sizeguide.md`, `sor/storage/upload.md`, `sor/upload.md`,
   `selectors/upload-dialogs.md`, `selectors/upload-list.md`; one measured
   `QUALITY_RECHECK.md` entry.
9. **Gates** — focused tests, `tsc`, `lint`, `quality:changed`,
   `verify:fast`, `verify`; commit and push.

## 5. Acceptance criteria

* Add Shadow, Corner badge and Size guide to a checked selection, open that
  row's dialog: the three enable rows read `inherited`, the row reads
  `inherits defaults`, and the decorations are really applied (preview/export
  keep them).
* Toggling one of them in the row's own dialog makes that one read
  `overridden`; the other two stay `inherited`; undo restores the applied state
  and its `inherited` word.
* Turning a decoration off for the selection leaves no `false` pin behind.
* `↺ Reset to defaults (N)` clears the selected rows' local pins and applied
  decorations only, in one entry; the stored global defaults are byte-identical
  afterwards, including the values the user changed.
* An older payload without `applied` loads as "nothing applied"; junk marks are
  dropped field by field.

## 6. Verification

Measured on 2026-10-21, branch `arena/cf992ba5-iconsplitter`:

* Red first (mutation check on the finished code): taking the applied branch out
  of `markerOf` fails the first case with `expected 'overridden' to be
  'inherited'`; dropping the marks from `resetBatch` fails the second with
  `expected { shadow: true } to be undefined`. Restored: both pass.
* The same row's stored payload after the three checkboxes:
  `overrides: { shadowEnabled: true, badgeEnabled: true, sizeGuideEnabled: true }`,
  `applied: { shadow: true, badge: true, sizeGuide: true }` — the flags stayed
  where the pipeline reads them, the provenance is beside them.
* After the row's own badge toggle: `applied` keeps `shadow` and `sizeGuide`
  only; the row reads `1 field overridden`; undo restores all three marks and
  the `inherited` word.
* Reset with FOG checked: `overrides.FOG`/`applied.FOG` gone, `overrides.ARCH`/
  `applied.ARCH` untouched, `defaults` still `{ shadowWidthPct: 130,
  badgeWidthPct: 32 }` as the user set them.
* `tests/upload_ui.test.tsx` 63 passed; `tests/upload_settings_store.test.ts` 14
  passed (including the new round-trip and junk cases); `tests/upload_undo.test.ts`
  19 passed (including the applied half).
* `npx tsc --noEmit` clean; `npm run lint` 0 errors / 23 warnings;
  `node tools/quality.mjs --changed --allow-legacy` GATE PASSED (the new
  `lib/upload/decorations.ts` is 93 lines; `commitDecoration` takes one object
  spec so it stays at 3 parameters); `npm run verify` ALL LANES PASSED (tests +
  coverage + build).

## 7. Result

Implemented the same day; the contract lives in `sor/upload-settings.md` and the
measured gate run in `docs/current/QUALITY_RECHECK.md`.
