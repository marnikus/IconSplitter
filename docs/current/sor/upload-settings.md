# Upload settings

For [Upload](upload.md); [I-60/I-62](invariants/upload.md).

**Details:** [geometry](upload-geometry.md) · [padding](upload-padding.md) · [badge](upload-badge.md) · [size guide](upload-sizeguide.md) · [caps](upload-stroke-endpoints.md) · [formats](upload-formats.md) · [presets](upload-settings-presets.md).

## Collapsible popup groups

Badge, Size guide and Shadow use independent native details/summary in both
popups, initially collapsed. Click/Enter/Space opens/folds each; several may stay
open. Folding is display-only: controls/drafts/values/checks/pins remain mounted.
Rerenders retain open state; normal blur commits are unchanged.

## Current settings and output geometry

* **Default visual settings** (`lib/upload/asis`):
  - `paddingPct: null` keeps the SVG's own margins (one fit pass).
  - Background `default` adds no artboard rect.
  - Stroke colour `artwork` is labelled Default.
  - Artboard mode `source` is the SVG's own viewBox size and ratio (N MP applies
    only in `content`).
  - `strokePx` 0 and `strokeLinecap: source` = default.
  - **All six default with Expand, Shadow, corner badge and size guide off = as is**: the export SVG is the approved file
    byte for byte — no clean, no bake, no SVGO, and the clean-SVG-1.1 check is
    skipped (it must still parse); JPEG and EPS build from it.
  - Default fingerprint (`36232c04`) are unchanged; padding
    null fingerprints as `"default"`.
* **One stroke width** (2026-10-19): the bar's STROKE (`upload-stroke`) IS the
  defaults' `strokePx`, range 0–50.
  - The global dialog has no width row. One icon MAY pin its own width (follow-up,
    same day): its dialog's `upload-set-stroke` (empty = the bar's, inherited;
    `upload-set-stroke-inherit` drops the pin), read by `parseOverrides` (with
    the `strokePt` alias). Ordinary global edits never pin rows. Explicit
    [Apply as local](upload-local-settings.md) freezes the checked batch,
    including the current bar width; bulk Reset clears its local pins.
* **Live export preview** (2026-10-19, `upload/exportpreview`): each row previews
  `prepareExportSvg(source, effective)` — decorations included — debounced
  120 ms, cached per source and fingerprint in a `zoomBoxFit` box.
* **Typed numbers commit on leave** (2026-10-19, `ui/DraftNumberInput`): the
  custom artboard W×H and the icon's stroke width keep a draft; blur/Enter
  clamps and writes once, Escape restores.
* **Paint clash** (2026-10-19, `lib/upload/paintclash`): a hex stroke colour on
  a hex background below WCAG non-text contrast (3:1) is named in the row's
  preview note and in the dialog (`upload-set-paint-clash`) — e.g. black on
  black. Default / transparent / artwork paint: no note.

* **Selected-only Shadow** (2026-10-20): the global Export settings popup's
  **Checked icons** checkbox adds or removes the bundled
  `src/svg/templates/shadow.svg` radial-gradient oval on CHECKED icons, hidden
  checks included, never the active unchecked row; mixed adds, all-on removes. Width/Gap change only checked icons that already have
  Shadow on — a dimension never enables one. Width 10–200% (80%) of the *final
  painted* icon width and bottom gap 0–100% (5%) of its height are not
  preview-only CSS. **Shadow defaults** in the same popup change numbers
  without opting icons in; stored global
  `shadowEnabled:true` is ignored on read. One icon may override all three in
  its own dialog. Each checked-set edit is one `uploadSettings` undo
  entry and keeps unrelated overrides. An
  enabled shadow fingerprints its dimensions and template hash; dormant values
  leave historic fingerprints (and as-is bytes) unchanged. Built-in EPS cannot paint
  the gradient: the bar, row and both dialog scopes warn it is partial while
  SVG/JPEG still commit; the chosen local converter never switches silently.
* **Artboard corner badge** (2026-10-20): the supplied fixed black vector is
  checked-only opt-in, with one **Badge defaults** block (corner, width %, two
  inward insets) plus per-icon overrides; those defaults never opt unchecked
  icons in. See the [corner badge contract](upload-badge.md).
* Settings: global defaults (padding %, background — `transparent` (the
  default) or one hex, stroke width in px — the file's own units, written as
  typed (2026-10-08; a stored `strokePt` reads as `strokePx`), stroke colour —
  one hex, `#000000` by default, or the artwork's own, JPEG target MP, JPEG
  quality, SVGO optimize on, optional EPS, artboard) plus per-icon overrides;
  the effective settings are defaults under, the applied decorations, then the
  icon's own overrides on top, and every field is marked inherited or
  overridden. Row edits or explicit Apply as local pin fields; ordinary global
  edits never write a row. A decoration — a Checked-icons
  flag or a selected-only dimension — is *applied*, not pinned (2026-10-21,
  [plan](../../archive/2026-10-21-decorations-are-not-overrides/README.md)):
  `applied: { pairId: DecorationValues }` holds the values the selection set,
  so the marker reads `inherited` and the decoration survives any reset
  (payload `v: 2`; a `v: 1` payload's marks and decoration overrides migrate
  once on read).
  **"↺ Reset to inherited (N)"** deletes the checked icons' whole override
  map — row edits AND batch snapshots — as ONE undoable
  `uploadSettings` entry (N counts the icons that pin something); applied
  decorations keep applying and the stored defaults and Checked-icons boxes
  are never touched. The row dialog's own "Reset to inherited" does the same
  for that row; global-defaults edits are persisted but NOT undoable, like
  presets. The
  checkbox selection is session-persisted and
  its gestures are undoable through the separate `uploadChecked` history type.
* **Scale to N MP** (I-62):
  two more settings fields, `scaleToMegapixels` (default off) and
  `artboardMegapixels` (default 5, clamped 1–64 like the JPEG; junk → 5). On,
  and only in `content` mode, the artboard is the content fit (icon + padding)
  scaled uniformly so `artW × artH = N × 10⁶` (`fitArtboard` with a
  `{ megapixels }` target; `artboardTarget` makes a pinned size win) — the
  padding keeps its meaning, strokes keep their verbatim px (the placement loop
  re-measures), and the JPEG still renders at `jpegMegapixels` in the
  artboard's ratio (the MP target is the vector's artboard, what a stock
  measures). The fingerprint appends `["mp", N]` ONLY while the
  box is on, so the defaults' fingerprint (`36232c04`) and existing packages
  stay as they are; the dormant number moves `settingsEqual` only. The record's
  `tools.artboard.scaledTo` is N while it applies and null otherwise (a pinned
  artboard with the box on records null — the px decided); the row's settings
  line appends `· artboard N MP` under the same rule. UI: the row under the
  artboard select in `src/upload/UploadArtboardSettings.tsx` — the checkbox
  `upload-set-mp-scale`, the number `upload-set-mp-target` (disabled while the
  box is off) and the note `upload-set-mp-scale-note` (`the artboard (icon +
  padding) is scaled to N MP · strokes keep their px`; with a pinned artboard
  the checkbox is disabled and the note reads `the pinned size decides the
  megapixels`).
* The artboard has three modes:
  `content` (the artboard hugs the artwork, as before), a square px preset
  (256/512/1024/2048/4096 — "512×512 and other popular") or an exact CUSTOM
  W×H, which is what lets the user set the output aspect ratio. Read back
  through `clampArtboard`: 16–8192 px per edge, a 64 MP total area ceiling that
  shrinks BOTH edges together so the ratio survives, and a preset that snaps to
  the nearest offered size; a corrupt value becomes `content`. Explicit content/source modes also persist as local pins.
* The JPEG resolution is NEVER capped by the artboard. `jpegMatchArtboard`
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
* **S/L size guide** (2026-10-20): the finished icon repeated smaller (S left
  of L, letter outlines underneath) is a checked-only opt-in with one **Size
  guide defaults** block that never opts unchecked icons in; see the
  [size guide contract](upload-sizeguide.md).
