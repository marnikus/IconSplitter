# Export settings popup layout

Part of [export settings](upload-settings.md); [dialog handles](../selectors/upload-dialogs.md).

## Compact visual controls

Both global and per-icon dialogs use one full-width responsive grid containing
Padding, Artboard, and a stacked paint column (Stroke colour / Stroke endpoints;
per-icon Stroke width is above those paints). Groups wrap on narrow screens;
no visual control is moved into a disclosure or hidden at any breakpoint.
Fonts and input heights are unchanged. Hints remain visible with compact line
boxes; the padding Default button sits beside its heading above the four sides.

Custom artboards have labelled Width px and Height px inputs side by side, then
the reduced ratio and MP readouts. The Scale to checkbox, numeric MP target and
unit share a row with their explanatory note below. Pinned/source artboards
still show the disabled scale controls and explain why. Custom inputs still
commit on blur/Enter, Escape restores; global/inherited/local writes are unchanged.
All default, presets, Apply as local, formats and export geometry are unchanged.

## Existing decoration disclosures

Badge, Size guide and Shadow use independent native details/summary groups,
initially collapsed. Click/Enter/Space toggles each; several may stay open.
Folding is display-only: controls/drafts/values/checks/pins remain mounted.
Rerenders retain open state; normal blur commits are unchanged.

## Selectors

- `upload-set-visual` / `.up-visual-settings`: responsive primary grid with three
  direct groups in visual/tab order: padding, artboard, `.up-visual-paints`.
- `.up-padding-head`: existing padding label/marker and Default button together.
- `.up-artboard-custom`: two-column custom-size grid; existing `upload-set-artboard-{w,h,ratio,mp}` handles stay unchanged.
- `.up-artboard-scale`: existing `upload-set-mp-{scale,target,scale-note}` plus MP unit; no new field handles.
- Existing `upload-set-{badge,sizeguide,shadow}-summary` toggles its native group.

## Owners and tests

`upload/UploadSettingsDialog.tsx`, `UploadPaddingSetting.tsx`,
`UploadArtboardSettings.tsx` and scoped `index.css` own layout. No domain/schema
change. `tests/upload_compact_visual_settings.test.tsx` locks global/per-icon
control presence, grouping, labels/readouts, responsive CSS and live/draft writes.
These are DOM/CSS contracts, not browser pixel measurements. Existing padding,
preview, EPS settings, disclosure, preset and local-apply UI tests protect behaviour.
