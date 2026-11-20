# Export formats — one domain, two flows

The **SVG to upload** tab and the **sheet builder** ship stock packages with the
SAME format decisions. `lib/exportformats.ts` `ExportFormatOptions` owns them and
`UploadSettings` EXTENDS it, so the dialog, the per-icon overrides, the
fingerprint and the builder's settings can never drift apart.

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
| `cleanExport` | on | clean the saved SVG and the EPS document — see **Clean rule**; Title, description and tags stay. In BOTH dialogs: off restores the legacy two-carrier EPS |
| `expandStrokes` | off | strokes become filled shapes (what some stocks require); the SVG, JPEG and EPS all ship without strokes |
| `expandText` | off | NEW: every `<text>` becomes filled glyph outlines; what cannot be outlined fails that stage honestly, in BOTH flows |
| `rescaleArtboard` | off | NEW: rescale the FULL artboard, keeping its ratio, until its area is `rescaleMegapixels` (1000×1000 @ 20 MP → 4472×4472) |
| `rescaleMegapixels` | 20 | the target area of that rescale (1…64); dormant while the box is off |
| `rescaleStrokes` | on | while rescaling: scale stroke widths proportionally; untick and every stroke keeps its printed px (widths ÷ factor) |

## 2026-11-19 — what was actually broken

Five defects, all fixed and pinned:

1. **The settings were hidden and misplaced.** `ui/exportmodal.tsx` is now the
   ONE popup (backdrop, sticky head, Close, Escape) both dialogs render, opened
   from a `⚙ Export settings` header button (`builder-export-settings`) too.
2. **Duplicated JPEG rows** (two components, same three ids) — now one sheet.
3. **The JPEG hint never named the real file** — now `exportArtboardSize`.
4. **EPS looked unavailable** — the dialog warns first (see below).
5. **Exports ignored the ink.** `currentColor` is browser-only (Illustrator
   paints black) and SVGO renamed hex the EPS writer cannot read.
   `prepareSheetSvg` runs `lib/upload/solidpaint.ts` first; the optimizer keeps
   hex (`shortname: false, names2hex: true`).

## Where each flow consumes them

- **Upload**: `UploadSettings` extends the interface; `prepare.ts` ends with
  expand-text then rescale, and the optimize/EPS/JPEG stages read the fields.
- **Builder**: `svgBuilder/formatstore.ts` (one validated key) feeds the header
  button and the menu item; the popup is the upload's own shell and renders the
  SAME `ExportFormatSheet` under `bld-set-*` (the upload dialog passes
  `upload-set`). `sheetpackage.ts` honours every field: flags gate the files,
  `optimizeSvg` records a real SVGO block, the expansions/rescale transform the
  composed sheet BEFORE packaging, `cleanExport` runs the clean pass (below) and
  `jpegMatchArtboard` decides the JPEG px.
- The menu's preview items (Editable SVG, PNG 2×, clipboard) stay untouched
  previews; **Export package** runs `exportSelectedArtboards` and names the
  formats it will really carry (`SVG · JPEG · EPS (built-in …)`, `SVG off`).

## Ownership (one row, one owner)

| Piece | Owner |
| --- | --- |
| the options, their defaults/validation, `exportArtboardSize`, `jpegNote` | `src/lib/exportformats.ts` |
| the rows both dialogs render (flags, EPS writer + helper, JPEG px/match/quality, SVGO, expansions, rescale) | `src/ui/exportsheet.tsx` |
| the pure row markup (checkbox/number/select) | `src/ui/exportrows.tsx` |
| the Inkscape helper row | `src/ui/epshelper.tsx` |
| the upload dialog's marker + override write path | `src/upload/settingsfield.tsx` |
| the builder's own persisted options | `src/svgBuilder/formatstore.ts` |
| the builder dialog + menu plan | `src/svgBuilder/SvgBuilderFormatDialog.tsx`, `SvgBuilderExportMenu.tsx` |

## EPS availability (what a builder export really writes)

The built-in writer is a PostScript subset: **live `<text>` is outside it**
(`<text> is outside the EPS subset`). A sheet always carries banner text, so
`Also write EPS` with the built-in converter and `Expand text to fills`
unticked fails THAT stage honestly (`partial`, named on the row). The dialog
says so first (`builder-format-eps-note`) and names both fixes: tick **Expand
text to fills** or pick the **Inkscape CLI** helper (`bld-eps-helper` reports
live whether that machine can write it).

## Stroke width, tracking and ink (2026-11-19)

Widths are authored in ARTBOARD px, but the cell `<g>` scales the icon's own
viewBox into its cell, so the written `stroke-width` is that px ÷ the cell
scale: 1 px stays 1 px in the SVG and the EPS. `vector-effect` is gone — only
the browser honoured it, so the EPS painted width × scale.

Tracking is an em length (`0.025em` for `7/100 em`) and is read through
`lib/upload/geom/length.ts` (em/rem/ex/ch/%, signed, px and unitless) — plain
`Number("0.025em")` is NaN, which silently became 0, so expanded text (and every
EPS, which needs it) lost the spacing. The outliner gets the run's px spacing.

Ink: a saved file never carries `currentColor` (resolved to the nearest
`color`) nor a CSS colour name, so the artboard's or a template's colour is what
the SVG, the JPEG and the EPS paint.

## Clean rule (2026-11-19)

With `cleanExport` on, `prepareSheetSvg` runs the upload tab's own policy
(`lib/upload/cleandom`) plus the sheet's final touches
(`lib/upload/svgclean.ts`): every `data-*`/`class`/`aria-*` goes (asset
ids, cell indexes, the config hash, approve flags), so do comments, the repeated
`xmlns` of a stitched copy, any `<metadata>` that is not the tag list (ours read
`<metadata>{"v":1,…}</metadata>`: prompt, model, source fingerprints) and float
noise (`1.9992750000000001` → `1.999`). px, viewBox, geometry, Title, description
and the DC tags survive; a raster `<image>` is refused by name.

Then the tidy passes (`lib/upload/svgtidy.ts`) remove what is still
machine-shaped and paints nothing: the dead `color="…"` beside an explicit
stroke (the desktop-editor quirk — kept only while some `currentColor` still
needs it), paint a child merely repeats from its group, values that ARE the SVG
initial value (`stroke-linecap="butt"`, `fill-rule="nonzero"`, `text-anchor="start"`),
the attribute-less `<g>` wrappers a cell-by-cell stitch leaves (`<g><g><text>`
becomes `<text>`), empty containers, indentation-only text nodes, and
`xlink:href` → the SVG 2 `href` plus the declaration that then dangles. `opacity`
is never compared (per-element compositing, not inherited paint) and the paint
pass stops at every reference subtree, where the `<use>` decides inheritance.
Authored coordinates are NOT touched: a 0.05 grid (`x="18.75"`, `rx="1.4"`) and
real arcs/rounded rects are what marks the file human, so only 4+ decimal values
are rounded. Idempotent, and pinned as such. The upload chain runs this same
pair (`keepSize: false`).

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
