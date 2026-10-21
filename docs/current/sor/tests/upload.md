# SVG to upload tests

Focused test inventory; [all tests](../TESTS.md).

Endpoint inheritance/settings/preview/final-package tests: [stroke endpoints](../upload-stroke-endpoints.md#owners-and-tests).

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
* `upload_discovery.test.ts` — item-level approval gates export after a
  regeneration or legacy mixed review; an approved item exports its newest
  valid on-disk version regardless of old version reviews or preview choice
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
* `upload_badge_settings.test.ts`, `upload_badge_geometry.test.ts`,
  `upload_badge.test.ts` and `upload_outline.test.ts` — opt-in/default
  fingerprints, scientific-notation path parsing, exact four-corner insets,
  width/aspect and narrow-artboard fit, source/root-opacity/no-fit safety,
  expand-to-fills for the six outlined handles, badge-off byte identity and
  icon coordinates unchanged. `upload_runexport` verifies clean SVG,
  preview/JPEG prepared input and genuine built-in EPS for opaque badge
  paths/outlines, with existing Shadow partial EPS unchanged.
* `upload_sizeguide_geometry.test.ts`, `upload_sizeguide.test.ts` and
  `upload_sizeguide_settings.test.ts` — S-then-L bottom alignment, exact
  four-corner insets, ratio-preserving tall icons, per-logo stroke widths,
  supplied S/L outlines and label geometry, uniform shrink/no-fit with untouched
  insets, gradient id renaming, no artboard/shadow repeat, badge-last ordering,
  expand-strokes behaviour, opt-in/default fingerprints and validation.
* `upload_expand.test.ts` — hidden strokes stay hidden when expanded, and a
  visible stroke under zero inherited fill opacity keeps its paint; source
  geometry and Shadow bounds agree with exported outlines
* `upload_paint_clash.test.ts` — strokes the background hides (black on black)
  are named; readable pairs and default/transparent/artwork say nothing
* `upload_live_preview.test.tsx` — the bar's STROKE writes the export
  `strokePx` and the live preview shows it; no dialog stroke row; the Default
  choices and "All default"; padding Default and icon-stroke Bar activate only
  inside their buttons, not blank setting space; the preview box fits the
  artboard ratio (2:1; 16 px = 2048 px); the icon's own stroke override
  (written on leave, inherit drops it); custom W×H commits on leave;
  per-icon Shadow width/gap and corner badge, live vector preview and built-in-EPS warning
* `upload_ui.test.tsx` — DOM end-to-end: approved rows only (pending/orphan
  reported), previews + zoom, filters/search, selection, the settings dialog
  (defaults persisted not undoable; per-icon markers; bulk apply = ONE undo
  entry; reset), the exact-request confirmation, editable/copiable metadata
  fields, invalid-answer refusal, cancel (never resent), interrupted after a
  restart, selected-only Shadow (hidden checks, mixed toggles, undo, general
  bulk apply preserves it, popup EPS warning), selected-only badge opt-in
  (mixed/hidden checks, undo, one shared defaults block, per-icon
  markers/reset), selected-only size-guide opt-in (mixed/hidden checks, undo,
  one shared defaults block, corner-driven edge labels, per-icon markers),
  deferred source-file preview
  read under unrelated timers and rescan, export → green committed package with
  the source untouched, stale →
  re-export, metadata embedded + verified, honest failure commits nothing.
* `upload_row_gestures.test.tsx` — RULE 25: Batch modifiers, visible header,
  arrows, modal isolation and global selection undo; no A/D or provider calls.

Native vector EPS: `upload_epsgradient`, `upload_epsvectorcheck` cover axial/radial
shading, template alpha, restricted data/stack grammar, nonlinear color error
bounds and raster rejection. `upload_runexport` verifies saved EPS/XMP bytes,
cached raster rejection, Download all and corruption after tmp verification.
See `sor/upload-eps-gradients.md` for support limits and missing input fixtures.

Metadata/export progress, cancellation, handoff and hidden-tab tests: [process progress](../process-progress.md#tests-and-safety).

Embedded JPEG/EPS carriers, repair and independent upload test page: [stock file metadata](../upload-file-metadata.md).
