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

## One row implementation (2026-11-19)

The rows are not written twice. `ui/exportrows.tsx` owns three row GROUPS —
`FormatDeliveryRows` (SVG / JPEG / EPS + the converter), `FormatJpegRows` (MP,
the artboard-match box, quality) and `FormatTransformRows` (SVGO, stroke
expansion, text expansion, the rescale and its two rows) — plus
`FormatOffWarning`. Each takes a `FormatRowWiring`: the testid prefix
(`upload-set` / `bld-set`), the options and the flow's ONE write path, with an
optional marker slot (the upload scope's inherited/overridden chip). The upload
dialog groups them through `upload/UploadFormatSettings.tsx`
(`UploadFormatSettings` / `UploadJpegSettings` / `UploadTransformSettings`, wired
to `changeMany` + `Marker`); the builder dialog renders the same groups straight
over its own store (`svgBuilder/formatstore.ts` `useBuilderFormats`).

Both dialogs therefore read the identical wording and hints, and both refuse the
all-off state BEFORE any file work: `FormatOffWarning` in the popup
(`upload-set-formats-warning` / `bld-set-formats-warning`) and
`hasOutputFormats` in the runner. `formatSummary` names what a run will ship
("SVG + JPEG + EPS", else "no formats") for the menu and the toasts, and
`jpegBoxFor` / `rescaledArtboard` produce the exact px the JPEG hint prints, so
the number a user reads is the number the file gets.

## Where each flow consumes them

- **Upload**: `UploadSettings` extends the interface; `prepare.ts` ends with
  expand-text then rescale on the finished artboarded SVG, `optimize.ts` and the
  EPS/JPEG stages read the same fields as before.
- **Builder**: its own persisted store (`svgBuilder/formatstore.ts`, one storage
  key, validated on read) feeds the **Export settings…** item of the builder's
  Export menu, which opens a real modal (`.bld-backdrop`, `role="dialog"`,
  Escape / backdrop press close it) — the same rows and hints as the upload
  dialog. The stock package (`sheetpackage.ts`) honours every field: flags gate
  the files, `optimizeSvg` records a real SVGO block in export.json,
  `expandStrokes` / `expandText` / rescale transform the composed sheet BEFORE it
  is packaged, and `jpegMatchArtboard` decides the JPEG px (artboard px after any
  rescale, else MP). A sheet's settings are the builder's OWN over the neutral
  defaults (`svgBuilder/formatwiring.ts` `builderExportSettings`): the upload
  tab's background, padding, artboard, shadow and badge never shape a sheet's
  files or its recorded settings. `tools.text` and `tools.rescale` record what
  the two new stages really did.
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

## The sheet's own pen and spacing (2026-11-19)

Two numbers the editor shows used to disagree with the files:

* **Stroke width.** A cell group is fitted with a `scale()`, so a `stroke-width`
  written verbatim was multiplied by it: "1 px" painted 3.2 px on the sheet, and
  that local number went straight into the SVG and the EPS. A stroke is absolute,
  so `svgAsset.ts` now writes `userPx / fit.scale` — the group's own transform
  multiplies it back, and the printed pen is the user's px everywhere (the same
  rule the upload flow applies to its global stroke).
* **Letter spacing.** The sheet wrote `0.025em`; `expandtext.ts` read a bare
  number, so `0.025em` → `NaN` → **0** per glyph, and every EPS (a sheet always
  outlines for the built-in converter) shipped without the spacing. The sheet now
  writes px at the run's own size, and `letterSpacingPx` still resolves `em`,
  `px` and bare lengths for foreign documents.

## A sheet's EPS carries text (2026-11-19)

Every composed sheet has live `<text>` (banner title, subtitle, captions) and the
built-in Level-3 writer's documented subset ends at shapes, so before this the
EPS stage answered `<text> is outside the EPS subset` and a builder package went
`partial` with no `.eps` — at every setting, EPS converter included.

`lib/svgBuilder/epsoutline.ts` `outlineForEps` decides the EPS stage's document:
for the **built-in** converter it runs the SHARED `expandTextToFills` (the upload
tab's own code, never a second outliner) on the copy handed to the writer only,
and reports `EPS_TEXT_FIX` as an EPS auto-fix → `tools.eps.fixes` (informed,
never asked, RULE 22/24). The shipped SVG and JPEG keep their live text unless
**Expand text to fills** is on. **Inkscape** receives the untouched sheet: its CLI
already outlines text (`--export-text-to-path`). What cannot be outlined (no
outliner on the machine, no font for a run) leaves the document untouched and
fails just that stage with the reason AND `EPS_TEXT_HINT` — the two honest ways
out: untick Also write EPS, tick Expand text to fills, or choose Inkscape.

`needsTextFonts` says when a run must warm the font cache first (the outliner is
sync): Expand text to fills, or an EPS through the built-in converter. Both the
upload runner (`upload/exportstages.ts`) and the builder action
(`svgBuilder/actions/sheetexport.ts`) ask it before preparing. An EPS-only
request that cannot be written still fails the whole package (`partial`/`failed`
honesty is unchanged for the upload flow); a builder package always writes its
SVG/JPEG, so a refused EPS is `partial` with the rest delivered.
