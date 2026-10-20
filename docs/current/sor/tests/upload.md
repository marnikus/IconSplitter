# SVG to upload tests

Focused test inventory; [all tests](../TESTS.md).

* `keyvault.test.ts` — the key rules on their own: a save that storage refused
  is reported `session` (and the key still loads), `save("")` is `empty` and
  erases nothing, an unreadable store answers `unreadable` — never `none` — and
  a corrupt envelope is absent, not a crash
* `upload_keypersist.test.tsx` — the reported bug, end to end: a key saved once
  survives an edit, a tab switch and a fresh boot; a session-only key says so
  instead of asking again; an empty Save cannot destroy a stored key (Save is
  disabled; `Forget` is what clears); five operations open ONE connection
* `upload_settings_store.test.ts`, `upload_keystore.test.ts`,
  `upload_journal.test.ts` — the stores (defaults + overrides round-trip,
  corrupt → defaults, clamps), the Gemini key's secret hygiene (own IndexedDB
  slot, never localStorage, session fallback) and the in-flight journal
  (restart → interrupted, corrupt → empty)
* `upload_rowmodel.test.ts` — row assembly from a real export.json + source
  hash, exact staleness (source/settings/metadata fingerprints), the metadata
  state a record carries, filters/sort/header/counts (incl. a failed run with
  record null counted), pruneChecked
* `upload_undo.test.ts` — `uploadSettings` and RULE 25 selection entries:
  validated payload, live/persist-only apply, no-op refusal, undo/redo across
  tabs; failed apply cannot advance the timeline cursor
* `upload_pinned_bulkbar.test.tsx` — the bulk bar sits in the shared sticky
  `.svg-bulkbar-pin`, a direct child of the tab column, above the rows
* `upload_default_settings.test.ts` — "default" for every visual setting
  (2026-10-19): parse/round-trip, the stroke (0–50, an icon's own read),
  stable fingerprints, prepare with each default, "as is" = the source byte for
  byte, `runExport` as is commits the source
* `upload_shadow.test.ts` / `upload_shadow_geometry.test.ts` (2026-10-20) —
  shadow-off legacy fingerprint/as-is, validated percentages, template stops/
  opacity and collision-free paint ID, icon-relative width/gap after stroke,
  source-frame margins/overflow, width/height-only frames, clipped-art refusal,
  zero-opacity and hidden geometry, pinned artboard fit and clean/SVGO references.
  `upload_runexport.test.ts` checks preview/JPEG prepared input, committed
  gradient SVG and built-in-EPS partial output; its two-pass regression proves
  that a previously committed EPS stays on disk but vanishes from the new
  partial or EPS-disabled record and Download all.
* `upload_expand.test.ts` — hidden strokes stay hidden when expanded, and a
  visible stroke under zero inherited fill opacity keeps its paint; source
  geometry and Shadow bounds agree with exported outlines
* `upload_paint_clash.test.ts` — strokes the background hides (black on black)
  are named; readable pairs and default/transparent/artwork say nothing
* `upload_live_preview.test.tsx` — the bar's STROKE writes the export
  `strokePx` and the live preview shows it; no dialog stroke row; the Default
  choices and "All default"; the preview box fits the artboard ratio (2:1;
  16 px = 2048 px); the icon's own stroke override (written on leave,
  inherit drops it); the custom W×H not clamped/written per keystroke;
  per-icon Shadow width/gap, live gradient preview and built-in-EPS warning
* `upload_ui.test.tsx` — DOM end-to-end: approved rows only (pending/orphan
  reported), previews + zoom, filters/search, selection, the settings dialog
  (defaults persisted not undoable; per-icon markers; bulk apply = ONE undo
  entry; reset), the exact-request confirmation, editable/copiable metadata
  fields, invalid-answer refusal, cancel (never resent), interrupted after a
  restart, selected-only Shadow (hidden checks, mixed toggles, undo, general
  bulk apply preserves it, popup EPS warning), deferred source-file preview
  read under unrelated timers and rescan, export → green committed package with
  the source untouched, stale →
  re-export, metadata embedded + verified, honest failure commits nothing.
* `upload_row_gestures.test.tsx` — RULE 25: Batch modifiers, visible header,
  arrows, modal isolation and global selection undo; no A/D or provider calls.
