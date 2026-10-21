# Upload EPS and stroke expansion

The optional EPS path in [SVG to upload](upload.md); exports are local,
compact, lag-free, 100% pure vector (**zero** raster operators and **zero**
`MPSParser`-rasterizing shadings permitted anywhere in an artwork), and
validated before commit.

## Converter choices

The built-in EPS writer (`src/lib/upload/{eps,epsgradient,epsshading,epsbands,epsai,epszlib,epsinflate,epsaicheck,epsaistate,epsailex}.ts`,
zero external binaries and zero runtime dependencies) emits a byte-faithful CRLF
**Adobe Illustrator EPS** document (`builtin-subset-6`) calibrated directly
against `Adobe Illustrator(R) 30.8.2` output (`icon-award-ribbon_8_02.eps`) so
both **Adobe Illustrator 30.8+** and standalone PostScript viewers open every
gradient and stroke instantly as clean, lightweight live vector objects
(`Embedded Images: 0`, `mpsParserFallback: false`):

1. **Compact outer Level-2 PostScript preview (`epsdoc.ts`, `epsshading.ts`,
   `epsbands.ts`, `epspath.ts`):** outer CRLF `%%Creator: Adobe Illustrator(R) 24.0`
   + `DocumentHeader "AI11EPS"` + `%AI9_PrintingDataBegin` headers, compact pure
   vector preview (`<= 16` 4-anchor cubic-Bezier radial ellipses and `<= 20`
   convex linear slabs; `0` 48-gon tessellation, `0` `shfill`, `0` `/ShadingType`),
   closed by `%%PageTrailer` -> `showpage` -> `%%Trailer` -> `%%EOF` ->
   `%AI9_PrintingDataEnd` -> `ai9_skip_data`. Gradient strokes (`stroke="url(#…)"`)
   expand via `expandOutline` (`src/lib/upload/geom/expand/`) into clean cubic
   Beziers (`0` `strokepath` flattening).
2. **Native Adobe Illustrator 30.8.2 editing stream (`epsai.ts`, `epszlib.ts`,
   `epsinflate.ts`):** CRLF uncompressed private header before `%AI9_DataStream`
   + `64`-char `%`-prefixed ASCII85/zlib stream starting at `%%BoundingBox:` with
   `%AI5_FileFormat 6.0`, `%AI9_BeginArtStyles`, `%AI5_BeginPalette` swatch cells,
   deduplicated live translucent Gradient Swatches (`%_Br` ramp table + paired
   `%_BS` / `%_… Bs` 12-arg RGBA stops, `0` stack orphans), `0 <opacity> 0 0 0 Xy`
   transparency, 7-arg `Xa`/`XA` colors, live strokes (`S`/`B`), `*u … *U`
   compounds, and 13-arg `Bg` + `Xm` + `Bm` + `Bh` gradient instances (**1 single
   live object per SVG shape**).

* EPS converters (`docs/archive/2026-10-09-eps-converters-inkscape-expand/design.md`,
  `docs/archive/2026-10-21-eps-illustrator-vector-gradients/design.md`): `CONVERTERS`
  lists `builtin` (`writer: "builtin-subset-6"`) and `inkscape` (`127.0.0.1:47391`),
  which upgrades gradient SVGs through `builtinConverter` when Cairo emits `shfill`
  or bitmaps and hard-fails any raster output.
* **Hard Zero-Raster + Native AI + Anti-Lag Verifier (`epscheck.ts`,
  `epsaicheck.ts`, `epsdoc.ts`, `exportstages.ts`, `exportvalidate.ts`):** Every
  EPS passes `verifyEpsDocument`, `findRasterOperators`, outer clip-band/vertex
  optimization limits (`<= 24` clipped fills, `<= 12` `lineto` vertices), **and**
  `verifyAiPrivateStream` / `inspectAiEps` (inflating `%AI9_DataStream` in pure TS
  and running `epsaistate.ts` across all operators).
* Expand strokes to fills (`expandStrokes`, default off; fingerprinted when on)
  converts stroked shapes into filled cubic-Bezier outlines via `src/lib/upload/expand.ts`.
