# Upload — Apply as local

Part of [export settings](upload-settings.md); [selectors](../selectors/upload-dialogs.md).

## Behavior

The GLOBAL Export settings popup offers **Apply as local (N)**. It copies the
current global general settings to all checked, loaded SVGs as local overrides.
Checked rows hidden by filters participate; active-but-unchecked rows do not.
N is the checked count, not the visible count. No selection disables the button.
The per-icon popup keeps its own edit/reset controls, without this bulk button.

Use it to freeze batch A at512px, change globals to1024px and freeze batch B,
then change globals again without changing either frozen batch. Reapplying
explicitly replaces old GENERAL pins with the current globals; it is not a merge
that silently keeps an old pinned size.

**Global editing still works exactly as before.** Edits immediately affect
inheriting fields on all rows, whether checked or not. Apply does not roll those
defaults back: it additionally pins the checked batch. Without Apply, no local
pins are created by ordinary global edits. Existing local pins still win.

The snapshot includes every settings field, even false/off, null/source-default,
content-fit and values currently equal to global defaults. A content artboard is
now a valid explicit local pin, retained on reload/history restore; absence still
means inherited. Nested padding/artboard values are copied, not shared references.

Shadow, corner badge and S/L size guide use selected-only flags rather than global
enabled defaults. Apply preserves and freezes each selected row's current effective
decoration choices AND dimensions. It does not turn decorations off, unify a mixed
selection's decorations or enable an unchecked row. The separate `applied` map is
untouched. Existing explicit selected-decoration controls still work normally.

## History, persistence and output

- One click, one `uploadSettings` history entry for all changed rows; exact prior
  partial overrides (or no overrides) are restored by one Undo, then Redo reapplies
  the whole snapshot. Duplicate ids are processed once; unknown/stale/unchecked
  ids are ignored. An already-equal full snapshot adds no history.
- Both row/bulk **Reset to inherited** drop the local pins, including snapshots,
  and resume current defaults plus applied decorations. Defaults and checks stay.
- Existing settings key/schema v2 persists the snapshots through tab switches and
  reload. Unmounted undo/redo uses the existing store writer/parser, not a new cache.
- In row settings, frozen fields read **overridden**, even if their value equals
  today's global value. Normal previews/stale detection/export consume the same
  effective settings merge. Actual export geometry retains each batch's chosen size.
- Draft number inputs still commit on blur/Enter; clicking Apply after leaving a
  draft uses the committed value. The dialog stays open for further adjustment.
- This is a local settings operation, not an export, source-file edit, provider
  request or metadata edit. No provider/credential/view settings are copied.

## Selectors

- `upload-set-apply-local`: native button, global scope only; label
  `Apply as local (N)`, disabled for zero checks. Semantic role/name is preferred.
- `upload-set-apply-local-note`: explains hidden checks, preserved decorations,
  frozen overrides and Reset to inherited.
- Existing `upload-set-marker-*`, `upload-set-reset`, `upload-reset-settings`,
  `hist-undo` and `hist-redo` expose the resulting state/actions.

## Owners

- `src/lib/upload/settingslocal.ts`: validated detached local snapshot, general
  defaults plus current decoration values; canonical parser/fields stay in
  `src/lib/upload/settings.ts` (including explicit content-fit artboard pins).
- `src/upload/selectedsettings.ts`: `commitLocalBatch`, one reducer/history patch.
- `src/upload/settingsreset.ts`: current-context batch Apply/Reset actions;
  wired through `src/upload/actions.ts` and `src/upload/UploadDialogs.tsx`.
- `src/upload/UploadSettingsDialog.tsx`, `src/upload/settingsfield.tsx`: button,
  scope/count, controlled callback and existing inherited/overridden markers.

## Tests

- `tests/upload_apply_local.test.ts`: content-fit persistence/history, full-field
  snapshots, copied nested values, duplicate/stale/unchecked/no-op batch scope,
  real prepared SVG sizes and byte-identical as-is output after global changes.
- `tests/upload_apply_local_ui.test.tsx`: real panel/store/history; no-selection
  state, ordinary live inheritance, replacing pins, two independent style batches,
  hidden checks, unchanged decorations, one-step undo/redo/reset, draft commit,
  reload and undo/redo while the panel is unmounted. No provider calls.

Design/steps: [dated plan](../../archive/2026-10-25-upload-apply-local/README.md).
