# Builder export formats — research, defects and the fix (2026-11-19)

The user asked why the sheet builder's export settings do not show up as a popup,
why EPS never appears in a builder package, and asked for **Expand text to fills**
plus a **full-artboard rescale (aspect ratio kept) with "scale stroke
proportionally"**, all reachable from the Export ▾ menu — reusing the SVG-to-upload
implementation as much as possible.

## What already existed (reused, not rebuilt)

| Piece | Owner | State before this change |
| --- | --- | --- |
| One format domain | `src/lib/exportformats.ts` `ExportFormatOptions` | complete: SVG/JPEG/EPS flags, converter, MP, quality, SVGO, `expandStrokes`, `expandText`, `rescaleArtboard/Megapixels/Strokes`, `normalizeFormatOptions` |
| Upload settings extend it | `src/lib/upload/settings.ts` | `UploadSettings extends ExportFormatOptions` |
| Builder store | `src/svgBuilder/formatstore.ts` | one key `iconSplitter.builder.formats.v1`, validated on read |
| Shared row primitives | `src/ui/exportrows.tsx` | `ExportCheckRow`, `ExportNumberRow`, `ExportSelectRow` |
| Row implementations | `src/upload/UploadFormatSettings.tsx`, `UploadSettingsDialog.tsx`, `src/svgBuilder/SvgBuilderFormatDialog.tsx` | **duplicated by hand** |
| Expansion / rescale | `src/lib/upload/{expand,expandtext,rescale}.ts` | complete, DOM in/out |
| Package | `src/svgBuilder/sheetpackage.ts` | honours the flags |
| EPS converters | `src/lib/upload/epsconv/registry.ts` | built-in + Inkscape |

So the domain was in place. The defects were in the **wiring, the dialog shell and
the EPS stage** — not in the format model.

## Defects found (each reproduced before it was fixed)

1. **The settings were not a popup at all.** `SvgBuilderFormatDialog` rendered
   `<section class="bld-modal">` with no `.bld-backdrop`. `.bld-modal` is
   `position: static`, and the builder panel is a CSS grid, so the "dialog" was
   appended *in flow* at the very bottom of the panel — below the status bar,
   behind the sticky header's z-index, and off-screen until the user scrolled the
   whole page. Probed: `backdrop present: false`. This is exactly the reported
   "this export does not appear with export settings btn with popup menu".
2. **Every JPEG row was rendered twice.** `DeliveryRows` already emitted
   `bld-set-mp`, `bld-set-mp-match`, `bld-set-quality`, and `JpegRows` emitted the
   same three again. Probed: 19 testids, 3 duplicated — two live inputs per
   field, a duplicate `aria-label`, and the second copy showed a stale value in
   tests (`querySelector` finds the first).
3. **A literal `&quot;` in the converter hint** (`hint="… &quot;Also write EPS&quot; …"`):
   JSX keeps HTML entities verbatim in a string attribute, so the user read
   `&quot;Also write EPS&quot;`.
4. **EPS never shipped for a builder package.** Every composed sheet carries live
   `<text>` (banner title, subtitle, captions). The built-in Level-3 writer's
   documented subset ends at `path/rect/circle/ellipse/line/polyline/polygon`,
   so it answers `<text> is outside the EPS subset` → `partial` package with no
   `.eps`. Probed: `{"ok":false,"reason":"<text> is outside the EPS subset"}` for
   the default sheet; with the same document outlined, `ok: true`. The upload tab
   never hits this because approved icon SVGs usually have no text, and it has
   the `expandText` switch.
5. **`export.json` lied about the EPS writer.** `recordOf` always wrote
   `tools.eps.writer = BUILTIN_WRITER` and never wrote `tools.expand`, the text
   expansion or the rescale, even when the injected converter answered
   `writer: "inkscape-cli@1.3"`. Probed: `record writer=builtin-vector-4
   converter=builtin` after an Inkscape-shaped conversion. That breaks RULE 22
   ("the record names the exact tool").
6. **The builder package inherited the upload tab's decorations.** `settings =
   { ...loadUploadSettings().defaults, ...loadBuilderFormats() }` pulled the
   upload tab's background/padding/artboard/shadow/badge defaults into the sheet
   package (and into the recorded `settings.defaults`), so a black upload
   background silently became the sheet's EPS/JPEG flatten colour.
7. **All formats off wrote a silent package.** With SVG, JPEG and EPS unticked the
   builder still wrote a PNG + `export.json` and reported success; the upload flow
   has `NO_OUTPUT_FORMATS` preflight for exactly this.
8. **No artboard-aware hints.** The JPEG hint said "untick for a bigger file"
   without naming the artboard px the JPEG would be (the reference sheet names
   `5500×3000 px`), and it ignored the rescale that decides those px.

## The fix

* **One row set, two flows.** `src/ui/exportrows.tsx` grows a wiring object
  (`FormatRowWiring`: `prefix`, `value`, `onChange`, optional `marker`, optional
  `artboard`) and three row groups — `FormatDeliveryRows`, `FormatJpegRows`,
  `FormatTransformRows` — plus `FormatOffWarning`. The builder dialog and the
  upload dialog both render those groups; only the wiring differs (builder store
  vs `changeMany` + inherited/overridden markers). Testid prefixes stay
  `bld-set-*` and `upload-set-*`, so no existing selector moved.
* **Real popup.** The dialog is wrapped in `.bld-backdrop` with
  `role="dialog" aria-modal`, Escape and backdrop-press close, and the same
  `.up-set-grid` layout the upload dialog uses.
* **EPS that works — honestly.** `src/lib/svgBuilder/epsoutline.ts`
  (`outlineForEps`) decides: the built-in writer + live `<text>` → run the SHARED
  `expandTextToFills` on the document handed to the converter only, and report it
  as an EPS auto-fix (`tools.eps.fixes`, RULE 22/24: informed, never asked).
  Inkscape already outlines text (`--export-text-to-path`), so it is untouched.
  No outliner / no matching font → the document is left alone and the stage fails
  with the existing named reason plus the fix that names both ways out. SVG and
  JPEG keep live text unless `expandText` is on.
* **Truthful record.** The package records the converter's own `writer`, the
  stroke-expansion count, the outlined-run count and the rescale factor/px.
* **Own settings.** `builderExportSettings(formats)` = `DEFAULT_UPLOAD_SETTINGS`
  + the builder's stored formats; no upload-tab decoration leaks in.
* **Preflight.** All formats off → `NO_OUTPUT_FORMATS` before any file work, in
  the dialog (warning row) and in the export action.
* **Menu.** Export ▾ names the active formats in the settings item, and the
  header's Export-all button names them in its title.

## Rescale rule (shared, `lib/exportformats.ts`)

`factor = sqrt(mp·10⁶ / (w·h))`; root `width`/`height` become
`round(w·factor)`/`round(h·factor)` and the `viewBox` is untouched, so every
coordinate scales with the document. With **Scale strokes proportionally** off,
each visible `stroke-width` is divided by the factor first, so the stroke prints
at the px it had before the rescale. 1000×1000 @ 20 MP → 4472×4472 (factor
4.4721) — the user's own example, pinned by a test.

## Tests (written first, red → green)

| Suite | Pins |
| --- | --- |
| `tests/builder_export_formats_wiring.test.ts` | `outlineForEps` (builtin vs inkscape, no text, refused), `builderExportSettings` (no upload leak), `formatSummary`, `jpegSizeAfterRescale`/`jpegHint`, rescale size |
| `tests/builder_sheetpackage_formats.test.ts` | EPS ships with text (fixes reported), the converter's writer in `export.json`, expand/rescale blocks, all-off refusal |
| `tests/builder_export_settings_ui.test.tsx` | unique testids, adapter parity with the upload rows, all-off warning, artboard px hints, converter quote |
| `tests/builder_export_dialog.test.tsx` | the real panel: the dialog opens INSIDE `.bld-backdrop`, Escape closes, a gesture persists to the builder store |
