# Upload settings, artboard and geometry

The settings and output geometry for [SVG to upload](upload.md); see [I-60 and I-62](invariants/upload.md).

**Detail pages:** [geometry: bounds, bake, placement](upload-geometry.md) · [corner badge](upload-badge.md).

## Current settings and output geometry

* **"Default" for every visual setting** (2026-10-19,
  [plan](../../archive/2026-10-19-upload-default-settings/README.md); `lib/upload/asis`):
  - `paddingPct: null` keeps the SVG's own margins: its viewBox is fitted, in one pass.
  - Background `default` adds no artboard rect.
  - Stroke colour `artwork` is labelled Default.
  - Artboard mode `source` is the SVG's own viewBox size and ratio ("Scale to N MP"
    applies only in `content`).
  - `strokePx` 0 = default.
  - **All five default with Expand, Shadow and corner badge off = as is**: the export SVG is the approved file
    byte for byte. It gets no clean, no bake and no SVGO, and the clean-SVG-1.1
    check is skipped (it must still parse); the JPEG and EPS are built from it.
  - Factory defaults and their fingerprint (`36232c04`) are unchanged; padding
    null fingerprints as `"default"`.
* **One stroke width** (2026-10-19): the bar's STROKE (`upload-stroke`) IS the
  defaults' `strokePx`, range 0–50.
  - The global dialog has no width row. One icon MAY pin its own width (follow-up,
    same day): its dialog's `upload-set-stroke` (empty = the bar's, inherited;
    `upload-set-stroke-inherit` drops the pin), read by `parseOverrides` (with
    the `strokePt` alias). "Apply settings to selected" pins the 13 general
    fields, not the bar stroke or separately applied Shadow/badge pins.
  - The old preview-only `previewStroke` pref is gone from this tab.
* **Live export preview** (2026-10-19, `upload/exportpreview`): each row previews
  `prepareExportSvg(source, effective)`, including applied Shadow and corner badge vectors,
  debounced 120 ms and cached per source and fingerprint. The box is `zoomBoxFit`.
* **Typed numbers commit on leave** (2026-10-19, `ui/DraftNumberInput`): the
  custom artboard W×H and the icon's stroke width keep a local draft while
  typed; blur/Enter validates (clamps) and writes once, Escape restores.
* **Paint clash** (2026-10-19, `lib/upload/paintclash`): a hex stroke colour on
  a hex background below WCAG non-text contrast (3:1) is named in the row's
  preview note and in the dialog (`upload-set-paint-clash`) — e.g. black on
  black exports a solid square. Default / transparent / artwork paint: no note.

* **Selected-only Shadow** (2026-10-20): the global Export settings popup's
  **Checked icons** checkbox adds or removes the bundled
  `src/svg/templates/shadow.svg` radial-gradient oval on CHECKED icons,
  including hidden checks, never the active unchecked row. Mixed checks add to
  all; all-on removes from all. The separate selected-only Width/Gap fields
  change only checked icons that already have Shadow on; an off icon is never
  enabled by editing a dimension. Width 10–200% (default 80%) of the *final
  painted* icon width and clear bottom gap 0–100% (default 5%) of its height
  are not preview-only CSS. Inherited **Shadow defaults** in the same popup
  change numeric defaults without opting icons in; stored global
  `shadowEnabled:true` is ignored on read. One icon may override all three
  fields in its own dialog. Each checked-set edit is one `uploadSettings` undo
  entry and keeps unrelated overrides. Normal Apply settings to selected leaves
  existing shadow pins alone. Enabled shadow fingerprints its full validated
  dimensions and template hash; disabled/dormant values leave historic
  fingerprints (and byte-for-byte as-is) unchanged. Built-in EPS cannot paint
  the gradient: the bar, row and both dialog scopes warn that the result is
  partial with valid SVG/JPEG; the chosen local converter never switches silently.
* **Artboard corner badge** (2026-10-20): the supplied fixed black vector is
  checked-only opt-in, with one **Badge defaults** block (four corners, width %
  and two inward edge distances) plus per-icon overrides. Those defaults never
  opt unchecked icons in, and a badge-on icon without placement pins inherits
  them; badge-on changes alone affect the fingerprint. The
  [corner badge contract](upload-badge.md) owns placement, failure, EPS and undo
  details.
* Settings: global defaults (padding %, background — `transparent` (the
  default) or one hex, stroke width in px — the file's own units, written as
  typed (2026-10-08; a stored `strokePt` from before reads as the same number
  under `strokePx`), stroke
  colour — one hex, `#000000` by default (2026-10-08), or the artwork's own,
  JPEG target MP, JPEG quality, SVGO
  optimize on, optional EPS, artboard) plus per-icon overrides; the effective
  settings are defaults under,
  overrides on top, and the settings dialog marks every field inherited or
  overridden. "Apply settings to selected" pins the current defaults onto the
  selection as ONE undoable `uploadSettings` history entry; per-icon set/reset
  pushes one entry each; global-defaults edits are persisted but NOT undoable
  (the same class as presets). The checkbox selection is session-persisted and
  its gestures are undoable through the separate `uploadChecked` history type.
* **Scale to N MP** (2026-10-09, I-62, design
  `docs/archive/2026-10-09-eps-executable-artboard-megapixels/design.md` D5):
  two more settings fields, `scaleToMegapixels` (default off) and
  `artboardMegapixels` (default 5, clamped 1–64 like the JPEG; junk → 5). On,
  and only in `content` mode, the artboard is the content fit (icon + padding)
  scaled uniformly so `artW × artH = N × 10⁶` (`fitArtboard` with a
  `{ megapixels }` target; `artboardTarget` makes a pinned size win) — the
  padding keeps its meaning (how small the icon sits in the artboard), strokes
  keep their verbatim px (the placement loop re-measures, so the area lands
  within the file's precision; exact in one pass when the artwork is all
  fills), and the JPEG is untouched (it still renders at `jpegMegapixels` in
  the artboard's ratio — the MP target is about the vector's artboard, which
  is what a stock measures). The fingerprint appends `["mp", N]` ONLY while the
  box is on, so the defaults' fingerprint (`36232c04`) and every existing
  package stay as they are; the number is dormant while the box is off (it
  does not move the fingerprint, but `settingsEqual` sees it). The record's
  `tools.artboard.scaledTo` is N while it applies and null otherwise (a pinned
  artboard with the box on records null — the px decided); the row's settings
  line appends `· artboard N MP` under the same rule. UI: the row under the
  artboard select in `src/upload/UploadArtboardSettings.tsx` — the checkbox
  `upload-set-mp-scale`, the number `upload-set-mp-target` (disabled while the
  box is off) and the note `upload-set-mp-scale-note` (`the artboard (icon +
  padding) is scaled to N MP · strokes keep their px`; with a pinned artboard
  the checkbox is disabled and the note reads `the pinned size decides the
  megapixels`). "N fields overridden" after a bulk apply is 14.
* The artboard (2026-10-08) is one more settings field, with three modes:
  `content` (the artboard hugs the artwork, as before), a square px preset
  (256/512/1024/2048/4096 — "512×512 and other popular") or an exact CUSTOM
  W×H, which is what lets the user set the output aspect ratio. Read back
  through `clampArtboard`: 16–8192 px per edge, a 64 MP total area ceiling that
  shrinks BOTH edges together so the ratio survives, and a preset that snaps to
  the nearest offered size; a corrupt value becomes `content`. Only a
  non-`content` artboard is written into the stored overrides.
* The JPEG resolution is NEVER blocked by the artboard (2026-10-08, the user's
  correction: "a small artboard must not cap the resolution"). `jpegMatchArtboard`
  (default true) says whether the JPEG follows a PINNED artboard's exact px;
  unticking it — which typing a megapixel value does in the same gesture —
  renders `jpegMegapixels` instead while keeping the artboard's aspect ratio, so
  a 512×512 artboard can still ship an 8000×8000 JPEG. With a `content`
  artboard the question does not exist (the artboard follows the MP), so the
  checkbox is not shown. Both the flag and the megapixels are ordinary settings
  (defaults + per-icon overrides), the flag is in the fingerprint because it
  changes the output, and the ONE canonical `SETTINGS_FIELDS` list (which
  `overridesEqual` in the undo path derives from) names every overrideable
  field, so a change confined to the artboard or the flag can never be
  swallowed as "nothing changed".
