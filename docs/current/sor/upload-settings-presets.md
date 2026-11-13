# Named Export settings presets

Part of [settings](upload-settings.md); independent of metadata prompt presets.

## Behavior

The GLOBAL Export settings popup includes a named preset catalog with:

- **Save as…** opens an inline name form; **Save** snapshots global defaults.
- **Load**: explicitly replace global defaults with the selected snapshot.
  Selecting a name alone never applies settings.
- **Rename** opens that name in the inline editor; confirm Rename to keep its settings under the new name.
- **Remove**: ask inline, then remove only after **Remove preset** confirmation;
  Cancel keeps it. Removing does not change current defaults or local rows.

The idle UI is one wrapping toolbar with a width-capped selector, Load, Save as…,
Rename and Remove; no bordered card, permanent name row or duplicated helper
paragraph. A name form appears only while saving/renaming, auto-focuses the input
and supports Enter submit, Escape/Cancel dismiss. Errors keep the editor/name
for correction; success returns to the compact toolbar. Selecting another preset
or requesting removal dismisses the editor. Load behavior is unchanged.

Names trim to1–60 characters and are unique ignoring case. Duplicate saves and
renames are rejected, never silently overwrite another preset. At most50 presets.
Save/rename/remove only manage the catalog; none implies loading, export or paid
metadata. Status text reports success or validation/storage failure.

Load uses the same canonical global-default action as ordinary settings edits.
Inherited settings change immediately. Local pins, selection/checks and separately
applied decoration choices remain intact; unchecked rows are never opted into
Shadow/badge/size guide. A preset captures all global general values (including
SVG/JPEG/EPS format flags, padding, artboard, paints and custom badge SVG) plus
global decoration dimensions. It does NOT capture checked-row decoration toggles,
which may be mixed and are not global defaults. Existing selected-only policy
keeps enabled decoration defaults false.

Load does not pin rows. Use [Apply as local](upload-local-settings.md) afterward
to freeze the checked batch, retaining that action's normal Undo/Redo. Catalog
edits and global loads follow existing device-default semantics, not row history.
Per-icon Export settings keeps its own fields/reset and has no catalog manager.

## Persistence and safety

The separate localStorage key `iconSplitter.upload.exportPresets.v1` stores
`{v:1,presets:[{name,settings}]}`. Popup close/reopen, tab changes and fresh panel
boot read this catalog; no source/export files or other preset catalogs change.
No credentials, model configuration, metadata or source paths are captured.

Read validates version/array/entries and runs canonical `normalizeSettings` over
every settings snapshot; unknown fields disappear, invalid values normalize,
unsafe SVG templates are rejected by the existing validator. Missing legacy
SVG/JPEG flags default true. Corrupt entries are skipped; last duplicate name
wins, with the most recent50 unique entries retained. Rename/remove preserve
other entries. Save/load normalize fresh nested settings so later edits cannot
mutate a saved snapshot. Saved status requires exact storage readback; denied/
full storage reports failure and keeps the current catalog UI unchanged.

## Selectors

Global-only `upload-settings-presets` compact div; toolbar `role=group`,
accessible name **Export presets**:

- `upload-settings-preset-select`: labelled Preset; empty placeholder.
- `upload-settings-preset-load`: Load, disabled without selection.
- `upload-settings-preset-save-open`: Save as…, opens the name form.
- `upload-settings-preset-form`: inline form, only during save/rename.
- `upload-settings-preset-name`: accessible Preset name, autoFocus, maxLength60.
- `upload-settings-preset-save`: Save submit, only during save.
- `upload-settings-preset-rename-confirm`: Rename submit, only during rename.
- `upload-settings-preset-edit-cancel`: dismiss name form without changes.
- `upload-settings-preset-rename`: Rename editor entry, disabled without selection.
- `upload-settings-preset-remove`: Remove, disabled without selection.
- `upload-settings-preset-remove-confirm` / `-remove-cancel`: inline confirmation.
- `upload-settings-preset-status`: polite live `role=status` result message.

These handles intentionally differ from metadata prompt `upload-preset-*` handles.

## Owners and tests

- `src/lib/upload/settingspresets.ts`: catalog parsing, names, snapshots and edits.
- `src/upload/settingspresetstore.ts`: independent key, read and verified save.
- `src/upload/settingspresetsmodel.ts`: popup-local form and explicit load action.
- `src/upload/UploadSettingsPresets.tsx`: accessible picker/editor/confirmation;
  `UploadSettingsDialog.tsx` integrates it only in global scope.
- `tests/upload_settings_presets.test.ts`: corruption/version/entry validation,
  bounds/collisions, create/rename/remove, independent normalized nested snapshots,
  legacy format defaults and denied/quota storage.
- `tests/upload_settings_presets_ui.test.tsx`: real panel Save/Load/Rename/Remove,
  no implicit loading, cancel/confirm, duplicate/blank/error messages, fresh boot,
  rich template/artboard/padding restoration, inherited vs pinned settings,
  checked/applied decoration safety, compact idle toolbar, on-demand editors/keyboard/cancel/error retention,
  explicit Apply-as-local/Undo, real SVG/EPS
  output using loaded settings with JPEG omitted and source bytes unchanged.
