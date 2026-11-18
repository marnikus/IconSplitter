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

Stored payloads validate per field (one bad field costs one default); the
upload flow additionally overrides them per icon, and every output-affecting
field enters `settingsFingerprint` (`expandText`, `rescale*` included).

## Where each flow consumes them

- **Upload**: `UploadSettings` extends the interface; `prepare.ts` ends with
  expand-text then rescale on the finished artboarded SVG, `optimize.ts` and the
  EPS/JPEG stages read the same fields as before.
- **Builder**: its own persisted store (`svgBuilder/formatstore.ts`, one storage
  key, validated on read) feeds the **Export settings…** item of the builder's
  Export menu — the same rows, same hints, shared row components
  (`ui/exportrows.tsx`, the upload dialog's toggles/numbers wrap them). The
  stock package (`sheetpackage.ts`) honours every field: flags gate the files,
  `optimizeSvg` records a real SVGO block in export.json, `expandStrokes` /
  `expandText` / rescale transform the composed sheet BEFORE it is packaged,
  and `jpegMatchArtboard` decides the JPEG px (artboard px, else MP).
- The Export menu's quick downloads (Editable SVG, PNG 2×, clipboard) stay
  untouched previews; the PACKAGE is what the options shape.

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
