# Export formats — one domain, two flows

The **SVG to upload** tab and the **sheet builder** ship stock packages with the
SAME format decisions (2026-11-17). One interface owns them —
`lib/exportformats.ts` `ExportFormatOptions` — and `UploadSettings` EXTENDS it,
so the upload dialog, its per-icon overrides, the fingerprint and the builder's
own export settings dialog can never drift apart.

## The shared options (`ExportFormatOptions`)

| field | default | meaning |
| --- | --- | --- |
| `includeSvg` | on | unchecked: no SVG file is written or included in the next exported package |
| `includeJpeg` | on | unchecked: no JPEG is rendered, written or included in the next exported package |
| `includeEps` | off | a genuine EPS; the converter below writes it, and anything it cannot write fails that stage honestly |
| `epsConverter` | built-in | who writes the EPS: the built-in subset writer (vector gradients, Level 3), or Inkscape CLI through the local helper |
| `jpegMegapixels` | 15.1 | the JPEG resolution when it does not follow the artboard (1…64) |
| `jpegQuality` | 0.92 | 0.5 – 1 |
| `jpegMatchArtboard` | on | the JPEG is the artboard itself (its px, after any rescale); untick for the MP above |
| `optimizeSvg` | on | the export copy only — viewBox, geometry, strokes and metadata are preserved |
| `expandStrokes` | off | strokes become filled shapes (what some stocks require); the SVG, JPEG and EPS all ship without strokes |
| `expandText` | off | NEW: every `<text>` becomes filled glyph outlines; what cannot be outlined fails that stage honestly, in BOTH flows |
| `rescaleArtboard` | off | NEW: rescale the FULL artboard, keeping its ratio, until its area is `rescaleMegapixels` (1000×1000 @ 20 MP → 4472×4472) |
| `rescaleMegapixels` | 20 | the target area of that rescale (1…64); dormant while the box is off |
| `rescaleStrokes` | on | while rescaling: scale stroke widths proportionally; untick and every stroke keeps its printed px (widths ÷ factor) |

## 2026-11-19 — what was actually broken

The builder's `Export settings…` item existed but shipped four defects; all are
fixed and pinned by tests:

1. **The dialog could not be seen.** `BuilderFormatSettings` returned a bare
   `.bld-modal` with no `.bld-backdrop`, and `.bld-modal` has no positioning of
   its own — so the "modal" rendered inline at the bottom of the scrolling
   panel. It is now a backdrop-wrapped `aria-modal` dialog closed by Close,
   Escape and a backdrop press (the panel's other dialogs' contract).
2. **The JPEG rows were duplicated.** The dialog rendered one component that
   already contained `JPEG (MP)` / `same size as the artboard` / `JPEG quality`
   and then a second component with the same three rows (duplicate test ids,
   two inputs writing the same value). Now every row comes from the ONE shared
   sheet and a test asserts exactly one of each.
3. **The JPEG hint never named the real file.** The row said only "untick for a
   bigger file". The shared sheet computes `exportArtboardSize(artboard,
   options)` — the artboard's px, or the RESCALED px while `rescaleArtboard` is
   on — and names it (`5500×3000 px`, `4472×4472 px` for 1000² @ 20 MP).
4. **EPS looked unavailable.** With the built-in writer a sheet's live banner
   text fails the EPS stage; the dialog now warns before the export and names
   both fixes, the Export menu offers the package with the formats it will
   carry, and the Inkscape helper row shows live availability.

Stored payloads validate per field (one bad field costs one default); the
upload flow additionally overrides them per icon, and every output-affecting
field enters `settingsFingerprint` (`expandText`, `rescale*` included).

## Where each flow consumes them

- **Upload**: `UploadSettings` extends the interface; `prepare.ts` ends with
  expand-text then rescale on the finished artboarded SVG, `optimize.ts` and the
  EPS/JPEG stages read the same fields as before.
- **Builder**: its own persisted store (`svgBuilder/formatstore.ts`, one storage
  key, validated on read) feeds the **Export settings…** item of the builder's
  Export menu. The dialog is a real MODAL (`.bld-backdrop`, `aria-modal`,
  Escape / backdrop / Close) and renders the SAME sheet component the upload
  dialog renders — `ui/exportsheet.tsx` `ExportFormatSheet` — under its own
  test-id scope (`bld-set-*`; the upload dialog passes `upload-set`), with its
  own store write path and no marker. The stock package (`sheetpackage.ts`)
  honours every field: flags gate the files, `optimizeSvg` records a real SVGO
  block in export.json, `expandStrokes` / `expandText` / rescale transform the
  composed sheet BEFORE it is packaged, and `jpegMatchArtboard` decides the
  JPEG px (artboard px, else MP).
- The Export menu's preview items (Editable SVG, PNG 2×, clipboard) stay
  untouched previews; the **Export package** item runs `exportSelectedArtboards`
  and names the formats that package will really carry (`SVG · JPEG · EPS
  (Inkscape CLI (local helper))`, `SVG off` for a switch that is off), so a
  format is never invisible nor implied when it is off.

## Ownership (one row, one owner)

| Piece | Owner |
| --- | --- |
| the options, their defaults/validation, `exportArtboardSize`, `jpegNote` | `src/lib/exportformats.ts` |
| the rows both dialogs render (flags, EPS writer + helper, JPEG px/match/quality, SVGO, expansions, rescale) | `src/ui/exportsheet.tsx` |
| the pure row markup (checkbox/number/select) | `src/ui/exportrows.tsx` |
| the Inkscape helper row (URL, Check, live state + fix) | `src/ui/epshelper.tsx` |
| the upload dialog's marker + live defaults/override write path | `src/upload/settingsfield.tsx` (`UploadSettingsDialog` wraps the sheet) |
| the builder's own persisted options | `src/svgBuilder/formatstore.ts` |
| the builder dialog (modal + EPS live-text note) and the menu plan | `src/svgBuilder/SvgBuilderFormatDialog.tsx`, `SvgBuilderExportMenu.tsx` |

## EPS availability (what a builder export really writes)

The built-in writer is a PostScript subset: **live `<text>` is outside it**
(`<text> is outside the EPS subset`). A composed sheet always carries its banner
title/subtitle as text, so `Also write EPS` with the built-in converter and
`Expand text to fills` unticked fails THAT stage honestly (the rest of the
package still ships, `partial`). The builder dialog says this BEFORE the export
(`builder-format-eps-note`) and names both fixes: tick **Expand text to fills**
(words ship as outlines) or choose the **Inkscape CLI** helper, whose row
(`bld-eps-helper`) reports live whether that machine can write it. The upload
flow keeps its per-row, per-icon honesty (a failing EPS is named on the row).

## Stroke width and tracking (2026-11-19)

Widths are authored in ARTBOARD px, but the cell `<g>` scales the icon's own
viewBox into its cell, so the written `stroke-width` is that px ÷ the cell
scale: the painted width is what the panel set — 1 px stays 1 px in the SVG and
the EPS. The old `vector-effect="non-scaling-stroke"` stood in for this and only
the browser honoured it (the EPS painted width × scale, and expanded outlines
baked the heavier pen); nothing in the sheet relies on it now.

Tracking is an em length (`0.025em` for `7/100 em`) and is read through
`lib/upload/geom/length.ts` (em/rem/ex/ch/%, signed, px and unitless) — plain
`Number("0.025em")` is NaN, which silently became 0, so expanded text (and every
EPS, which needs it) lost the spacing. The outliner gets the run's px spacing.

## Rescale rule

`factor = sqrt(mp · 10⁶ / (w · h))`; the root `width`/`height` become
`round(w · factor)` / `round(h · factor)` and the `viewBox` is untouched, so
every coordinate scales with the document. With `rescaleStrokes` off, each
visible `stroke-width` is divided by the factor first — the stroke prints at
the px it had before the rescale. A document without a readable px size or
viewBox is refused by name, untouched.

## Expand-text rule

Each `<text>` run is handed to an injected outliner (test fakes, or the browser
provider: the Local Font Access API + opentype.js outline the resolved family
and weight of the run's font stack). The outliner answers glyph paths in run
local coordinates plus the run's advance width; the transform places them
(anchor start/middle/end, letter-spacing included) as ONE filled `<path>` per
run, carrying the text's fill and opacity. Refusals are named BEFORE the tree
is touched: a stroked text, `<tspan>` children, or no outliner / no matching
font for a run. The SVG, JPEG and EPS then all ship without live text.

## Honesty

Every stage that cannot write its file reports a named problem with its fix
and the rest of the package still ships (`partial` in export.json); a format
switched off writes nothing and leaves the previous package's file untouched.
