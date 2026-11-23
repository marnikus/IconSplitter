# Clean, Direct-Geometry Exports Without Machine or Tool Evidence (2026-11-19)

## User mandate (RULE 26)

Exported files in this app — across both single-icon export (**SVG to upload**)
and sheet export (**SVG builder**: Editable SVG, Copy SVG markup, and Export
package SVG/JPEG/EPS) — must **never** leave any evidence of machine, AI
processing, or script-based operations, nor any information about what tool or
script created or assembled them.

## Root causes identified

1. **Generator / tool attribution in deliverables:**
   - `src/lib/svgBuilder/compose.ts` emitted
     `<desc>Generated with the SVG builder. Editable stroke-only icon sheet.</desc>`,
     `<title>… — icon sheet</title>`, and a `<metadata>{"v":1,"approvedOnly":true,…}</metadata>` JSON record.
   - `src/svgBuilder/exporter.ts` (`downloadSheetSvg` / `copySheetSvg`) delivered raw
     `doc.svg` containing `data-*` preview hooks and `currentColor` / `color`.
   - `src/lib/upload/xmp.ts` stamped `x:xmptk="IconSplitter"` into every JPEG and
     legacy EPS XMP packet.
   - `src/lib/upload/epsdoc.ts` stamped `%%Creator: IconSplitter (SVG to upload)`,
     and `epsmetadata.ts` / `epsiptc.ts` stamped `% IconSplitter …`,
     `IconSplitterXmp_`, and `IconSplitterStream_`.
2. **Scale-wrapper and stroke-compensation machine signatures:**
   - `src/lib/svgBuilder/svgAsset.ts` wrapped every placed cell and hero icon in
     `transform="translate(dx dy) scale(s)"` and divided `stroke-width` by `s`
     (e.g. `stroke-width="1.129"` × `scale(1.594)` = `1.7996`).
   - `src/lib/upload/rescale.ts` kept the old `viewBox` while scaling `width`/`height`
     and divided `stroke-width` by `factor` to 4 decimals when `rescaleStrokes` was off.
   - `src/lib/upload/svgclean.ts` rounded only 4+-decimal numbers to 3 decimals,
     leaving 2–3-decimal scaled residuals (`66.667`, `1.999`).

## Design

1. **Direct coordinate & size baking at 1 decimal max (`src/lib/upload/svgdirect.ts`):**
   - Spec-exact SVG path scanner (including compact arc flags) + zero-drift
     relative/absolute scaling and 1-decimal rounding (`round1`, `fmt1`,
     `directPathData`, `bakeDirectSvg`, `roundSvgGeometry1`).
   - `svgAsset.ts` bakes cell and hero icons directly into real artboard px
     rounded to 1 decimal max with direct `stroke-width` (e.g. `1.8`) and no
     `transform` wrapper; `sanitize()` caches compiled node descriptors so warm
     sheet composition stays pure arithmetic.
   - `rescale.ts` rescales `viewBox`, `width`/`height`, and geometry directly into
     target px rounded to 1 decimal max, keeping direct `stroke-width` when
     `rescaleStrokes` is off.
   - `svgclean.ts` absorbs remaining `transform`s (including moved `<text>` groups
     and outlined text paths) before tidying and rounds geometry, sizes, `viewBox`,
     and stroke attributes to 1 decimal max while preserving CSS `em` tracking and
     `0..1` alpha/stop ratios.
2. **Zero tool/generator attribution:**
   - `compose.ts` emits no generator `<desc>`, no `" — icon sheet"` suffix, and no
     provenance `<metadata>` JSON; `exporter.ts` cleans Editable SVG and clipboard
     SVG with `cleanSheetSvg(solidPaint(doc.svg))` and embeds accepted metadata.
   - `xmp.ts`, `epsdoc.ts`, `epsmetadata.ts`, `epsiptc.ts`, `exportstages.ts`, and
     `sheetpackage.ts` omit all `IconSplitter`, `x:xmptk`, and `%%Creator` markers
     while still stripping legacy envelopes when repairing older files on disk.
