# Decorations are not overrides — reset clears every row parameter (2026-10-21)

## 1. The request

> "reset to inherite do not work for all overriden param in setting only some of
> them. see screenshot (example shadow and etc.)! FIX
> should work to absollute all param in setting."

Screenshot (`image-1.png`, one row's Settings dialog right after
`Reset to inherited`):

| block | marker |
|---|---|
| SHADOW (the template gradient) | **OVERRIDDEN** |
| shadow width % / gap below % | inherited |
| CORNER BADGE + width, corner, both insets | inherited |
| SIZE GUIDE + corner, bottom edge, logo widths, strokes, gap | inherited |
| **size guide — distance from left edge %** | **OVERRIDDEN** |

So two parameters survived the reset, and the whole point of the button — "the
row inherits everything again" — is not met.

## 2. Why (measured, 2026-10-21)

The previous change (`8547592`) made the reset skip **every decoration field**
so that the Export settings popup's Checked-icons boxes could never untick.
The boxes are not stored: they are derived from the checked rows' effective
settings (`shadowselection`, `badgeselection`, `sizeguideselection`), i.e. from
the same per-row `overrides` map. Keeping decoration fields away from the reset
was the only way to protect them — and it is exactly what leaves `shadowEnabled`
and `sizeGuideOffsetXPct` pinned after the reset.

The underlying mistake is the storage model, not the button: **a decoration is
not a row override.** A decoration is a selection-level choice made in the
global popup; a row override is a local edit made in that row's own dialog.
They were stored in the same map, so every rule ("never reset", "never untick",
"clear everything") had to be expressed as a subtraction from that map — and
each subtraction broke the other requirement.

## 3. The rule

1. `applied: { pairId: { shadowEnabled?, shadowWidthPct?, …, sizeGuideOffsetXPct? } }`
   stores the decorations a global control gave that row — **as values**, not
   as pin marks, in the same `v: 1` payload.
2. Effective settings for a row: `defaults ← applied decorations ← overrides`.
   So a decoration renders, fingerprints and exports exactly as before; only
   its provenance changed.
3. A row's dialog marker is a pure override check again: a decoration the popup
   applied reads **inherited** (it is not a local pin), and a local edit in the
   row's own dialog reads **overridden** and wins over the applied value.
4. The global popup's Checked-icons checkbox writes only `applied` values; to
   make a selection-level choice take effect it also clears those decoration
   fields from the rows' local overrides (a decoration gesture, not a default).
5. **`Reset to inherited` deletes the row's whole override map.** Every
   parameter reads inherited afterwards, whatever it is. Applied decorations
   are not overrides, so they stay — and the Checked-icons boxes keep their
   state because they derive from the (still decorated) effective settings.
6. The stored global `defaults` are still never written by a reset.
7. Migration on read: decoration fields already stored in a row's `overrides`
   (older builds, or the marks-era payloads) move into `applied`, so existing
   decorations stop reading overridden and survive the first reset.

## 4. Plan and steps

1. **Plan and contract** — this file; docs in step 8.
2. **`src/lib/upload/decorations.ts`** — `AppliedDecorations` becomes a values
   record restricted to `DECORATION_FIELDS`; validated parsing (reuses
   `parseOverrides`, drops non-decoration keys); `decorationsOf`,
   `setDecorations`, `withoutDecoration` (drop one decoration's fields),
   `rowSettings(defaults, id, overrides, applied)` (the one merge order);
   drop the pin-mark helpers (`isApplied`, `localKeys`, `withApplied`,
   `withoutLocalPins`, `localResetKeys`, `marksOf`).
3. **Storage** — `settingsstore.parseUploadSettingsState` parses the new
   `applied` and migrates decoration fields out of `overrides` into it;
   `saveUploadSettings` keeps writing one payload.
4. **Writes** — `commitDecoration` writes `applied` values for the selection
   and clears those same decoration fields from local overrides;
   `commitBatch` (the selected-only shadow width/gap) writes `applied` values
   for the rows that already have the decoration on; both still push ONE
   `uploadSettings` entry, now carrying the applied half.
5. **Reads** — every per-row read of settings goes through `rowSettings`
   (`UploadRow` ×2, `exportactions` ×2, `rowmodel`, the three selection
   modules, the three action modules); `markerOf` and the row's pin count go
   back to plain `overrideKeys`; `UploadPanel` no longer passes marks to the
   dialog.
6. **Reset** — `resetBatch` and `resetOverride` delete the row's entire
   override map (ONE entry, undo restores it); `resettableIds` = rows with any
   override key; applied decorations untouched.
7. **Tests** — red first: a row with a decoration applied from the popup plus
   local pins on a decoration geometry and a general field, reset → **every**
   marker reads inherited, the three Checked-icons boxes stay checked, the
   decoration still renders, the stored defaults are byte-identical; the
   migration case (decoration fields stored in `overrides`) loads as inherited
   and survives the reset.
8. **Docs** — `sor/upload-settings.md` (owner), `sor/upload-badge.md`,
   `sor/upload-sizeguide.md`, `sor/storage/upload.md`, `sor/upload.md`,
   `selectors/upload-list.md`, `selectors/upload-dialogs.md`; one measured
   `QUALITY_RECHECK.md` entry.
9. **Gates** — focused tests, `tsc`, `lint`, `quality --changed`,
   `verify:fast`, `verify`; commit and push.

## 5. Acceptance criteria

* Apply Shadow + Corner badge + Size guide to a checked selection, pin one
  decoration number and one general setting in the row's own dialog, then
  `Reset to inherited`: every field in the dialog reads `inherited`, the row
  reads `inherits defaults`, and the three Checked-icons boxes are still
  checked.
* The decorations still render, preview and export (effective settings keep
  them), and the stored global defaults are byte-identical.
* A local edit after the reset pins that one field again (`overridden`) and
  wins over the applied decoration value.
* A payload whose decoration fields sit in `overrides` (older build) loads as
  applied — the dialog reads `inherited` and the reset keeps the decoration.
* Undo of a reset restores exactly the deleted overrides in one entry.

## 6. Verification (2026-10-21, final)

* **Model** — `DecorationValues = SettingsOverrides`; `rowSettings = { ...defaults,
  ...applied[id], ...overrides[id] }`; the row dialog computes `{ ...defaults,
  ...applied, ...overrides }`, so an applied value reads `inherited` and still
  renders. `migrateOverrides` moves a legacy payload's decoration fields into
  `applied` **once**, and only when the stored payload has no `applied` key —
  a payload this build wrote keeps every dialog pin an override (found by the
  live-preview suite: migrating on every read deleted `shadowEnabled` from
  `overrides` right after the dialog wrote it).
* **Reset** — `resetBatch`/`resetOverride` delete the whole override map;
  `resettableIds` counts rows with any override key; decorations in `applied`
  keep applying; stored defaults and the three Checked-icons boxes untouched.
* **Undo** — every decoration gesture and every reset is one `uploadSettings`
  entry whose two halves are `{ overrides, applied }` value maps; `nullIfEmpty`
  keeps an empty before-side from collapsing into a no-op, and
  `toUploadSettingsPatch` accepts a decoration-only payload (an `applied` key
  with no `overrides`).
* **Tests** — `upload_ui` 65/65 (reset clears all parameters, markers read
  inherited, migration, undo), `upload_settings_store` 14/14 (legacy migration
  gated on the missing key, values round-trip beside the overrides),
  `upload_undo` 19/19 (decoration-only payloads), `upload_live_preview` 14/14,
  full suite 2352 tests with only the known wall-clock
  `algo_efficiency` case red under load (standalone 4/4 green).
* **Gates** — `npx tsc --noEmit` clean; `npm run lint` 0 errors / 23 warnings;
  `node tools/quality.mjs --changed --allow-legacy --base HEAD` GATE PASSED
  (after `commitBatch` was split to get CC back under 10); `npm run verify`
  ALL LANES PASSED (types, lint, quality, tests + coverage, build); docs trimmed
  back under the 9,000 B page budget.
