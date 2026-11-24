# Upload tests

[All tests](../TESTS.md).

[Caps](../upload-stroke-endpoints.md#owners-and-tests);
[local](../upload-local-settings.md#tests); [formats](../upload-formats.md#owners-and-tests); [presets](../upload-settings-presets.md#owners-and-tests).

* `keyvault.test.ts` — refused storage reports `session` (key still loads),
  empty save erases nothing, unreadable stays distinct from absent, corrupt
  envelopes are absent rather than crashing.
* `upload_keypersist.test.tsx` — saved key survives edit/tab/restart; session
  state is reported, empty Save cannot destroy a key, Forget clears it; five
  operations use one connection.
* `upload_settings_store.test.ts`, `upload_keystore.test.ts`,
  `upload_journal.test.ts` — the stores (defaults + overrides round-trip,
  corrupt → defaults, clamps), the Gemini key's secret hygiene (own IndexedDB
  slot, never localStorage, session fallback) and the in-flight journal
  (restart → interrupted, corrupt → empty)
* `upload_discovery.test.ts` — item-approval gates; [accepted source identity](../version-acceptance.md),
  legacy newest-valid fallback, missing/unreadable accepted files and exclusions.
* Named row labels: [contract](../upload-row-badges.md); Ctrl-click/undo UI in `upload_rowbadge_ui.test.tsx`, retry in `stockupload_runner.test.ts`.
* `upload_rowmodel.test.ts` — row assembly from a real export.json + source
  hash, exact staleness (source/settings/metadata fingerprints), the metadata
  state a record carries, filters/sort/header/counts (a failed run counts with
  record null), pruneChecked
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
  `upload_runexport.test.ts`: preview/JPEG input, gradient SVG, built-in-EPS
  partial output; two-pass regression: a committed EPS stays on disk but
  leaves the new partial/EPS-off record + Download all. `export_clean_upload.test.ts`
  (9) — the sheet clean copy: dead `color`, bare `<g>`, provenance, float
  noise; fingerprint moves only for off. `export_eps_identity.test.ts` —
  no work name, hash or `%AI…` in shipped EPS/SVG (RULE 26).
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
  are named; readable pairs, default/transparent/artwork say nothing
* `upload_live_preview.test.tsx` — the bar's STROKE writes the export
  `strokePx` and the live preview shows it; no dialog stroke row; the Default
  choices and "All default"; padding Default and icon-stroke Bar activate only
  inside their buttons, not blank space; the preview fits the artboard ratio
  (2:1; 16 px = 2048 px); the icon's own stroke override (written on leave,
  inherit drops it); custom W×H commits on leave;
  per-icon Shadow width/gap and corner badge, live vector preview and built-in-EPS warning
* `upload_ui.test.tsx` — DOM end-to-end: approved rows only (pending/orphan
  reported), previews + zoom, filters/search, selection, the settings dialog
  (defaults persisted not undoable; per-icon markers; bulk apply = ONE undo
  entry; reset), request confirmation, editable/copiable metadata, automatic
  valid-result acceptance for row/bulk Generate/Regenerate, accepted-cache
  reload, preserved ownership, mixed-batch acceptance counts,
  no automatic export after Generate/Regenerate (explicit Export refreshes packages),
  legacy-draft/manual-edit acceptance, invalid/malformed/truncated refusal,
  failed/cancelled regeneration keeping accepted text/cache, cancel (never
  resent), interrupted after a restart, selected-only Shadow (hidden checks,
  mixed toggles, undo, general bulk apply preserves it, popup EPS warning), selected-only badge opt-in
  (mixed/hidden checks, undo, one shared defaults block, per-icon
  markers/reset), selected-only size-guide opt-in (mixed/hidden checks, undo,
  one shared defaults block, corner-driven edge labels, per-icon markers),
  deferred source-file preview read under unrelated timers and rescan, export →
  green committed package with the source untouched, stale → re-export,
  metadata embedded + verified, honest failure commits nothing.
* `upload_row_gestures.test.tsx` — RULE 25: Batch modifiers, visible header,
  arrows, modal isolation and global selection undo; no A/D or provider calls.

Native vector EPS: `upload_epsgradient`/`upload_epsvectorcheck` cover axial/radial
shading, template alpha, the data/stack grammar, color error bounds, raster
rejection; `upload_runexport` verifies saved EPS/XMP bytes, cached-raster
rejection, Download all, tmp corruption. Limits: [gradients](../upload-eps-gradients.md).

`upload_download_ui.test.tsx` drives real planned copies/readback with gated
browser I/O: per-file progress, hidden portal/cancel, audio once, retained
summaries, duplicate-picker protection, cancelled-picker silence and mixed
kept/missing/failed outcomes. `upload_process_progress.test.tsx` also pins the
download slot, stale events and toolbar counts.

Metadata/export/download progress, cancellation, handoff, hidden-tab tests: [process progress](../process-progress.md#tests-and-safety).

Embedded JPEG/EPS carriers, repair, independent upload page: [stock file metadata](../upload-file-metadata.md).

Adobe saved-page regression and opt-in LIVE upload validation (local reader is not Adobe acceptance): [guide](../upload-adobe-validation.md).


User-defined badge validation, editor, persistence/undo/live preview and
supplied-file export tests: [custom templates](../upload-badge.md#custom-svg-templates).

* `upload_auto_repair.test.ts`, `upload_viewrepair.test.ts`,
  `upload_fitfallback.test.ts` — real bulbs, bounded pinned-fit and minor-frame
  recovery, safety, source immutability, vector EPS. [Cases/policy](../upload-auto-repair.md).

* `upload_centred_fit.test.ts` — leaf64×64/50px/8% centering; grid/padded containment, presets, EPS, cleaning, impossible fits.
* `upload_offset_equivalence.test.ts`, `upload_offset_distance.test.ts` — hash/threshold equivalence.

`upload_settings_disclosure.test.tsx`: both scopes, native folding, mounted
drafts, retained open state, toggle/blur, Close/reopen.

* `upload_padding_sides.test.ts`, `upload_padding_sides_ui.test.tsx`,
  `upload_padding_sides_export.test.ts` and live-preview coverage: independent
  margins, compatible storage/hash/undo, exact fits, supplied SVG/JPEG/vector EPS
  pipeline. [Contract](../upload-padding.md).

* `upload_stroke_repair.test.ts` plus actual preview/package tests:
  [snowflake, affine pen geometry/compositing, source/final widths, dashes,
  safety and vector exports](../upload-auto-repair.md#non-uniform-stroke-transforms).

* `upload_tightbounds.test.ts`, `upload_flag_viewport.test.ts` — tight viewport
  math/safety and both flags; preview/package tests above. [Policy](../upload-auto-repair.md#tight-source-viewport-classification).
