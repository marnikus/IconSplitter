# Upload EPS and stroke expansion

The optional EPS path in [SVG to upload](upload.md); exports are local,
100% pure vector (**zero** raster operators and **zero** `MPSParser`-rasterizing
shadings permitted anywhere in an artwork), and validated before commit.

## Converter choices

The built-in EPS writer (`src/lib/upload/{eps,epsgradient,epsshading,epsbands,epsai,epszlib,epsinflate,epsaicheck,epsaistate,epsailex}.ts`,
zero external binaries and zero runtime dependencies) emits a dual-layer pure
vector **Adobe Illustrator EPS** document (`builtin-subset-5`) so both PostScript
interpreters and **Adobe Illustrator 30.8+** open every gradient and stroke as
100% live vector objects (`Embedded Images: 0`, `mpsParserFallback: false`):

1. **Pure Level-2 vector PostScript page body (`eps.ts`, `epsshading.ts`,
   `epsbands.ts`, `epspath.ts`):** outer `%%Creator: Adobe Illustrator(R) 24.0` +
   `DocumentHeader "AI11EPS"` + `%AI9_PrintingDataBegin` headers paired with
   clipped vector polygon slabs (`linearBandsPs`) and concentric cubic-Bezier
   ellipses (`radialBandsPs`) (**zero** `shfill`, **zero** `/ShadingType`, so even
   generic PostScript parsers cannot rasterize smooth shadings into bitmaps).
   Gradient strokes (`stroke="url(#…)"`) are expanded in pure TypeScript via
   `expandOutline` (`src/lib/upload/geom/expand/`) into closed cubic-Bezier
   vector outlines (**zero** `strokepath` flattening).
2. **Native Adobe Illustrator 30.8+ vector editing stream (`epsai.ts`,
   `epszlib.ts`, `epsinflate.ts`):** emits uncompressed private header before
   `%AI9_DataStream` + zlib/ASCII85 stream starting directly at `%%BoundingBox:`
   (`%AI5_FileFormat 14.0`, `0` duplicate `%!PS-Adobe` header). Defines
   deduplicated live translucent Illustrator Gradient Swatches (`%AI5_BeginGradient`,
   `Bd`, 12-arg `%_c m y k r g b 2 opacity 6 50 ramp Bs`, `BD`, `%AI5_EndGradient`),
   `0 <opacity> 0 0 0 Xy` transparency, 7-arg `Xa`/`XA` colors, live stroked
   paths (`S`/`B`), compound paths (`*u … *U`), and live vector gradient instances
   (`Bb`, `Bh`, 13-arg `Bg`, `Xm`, per-stop `Bm`, `BB`).

Upload template shadows, [corner badges](upload-badge.md),
[S/L size guides](upload-sizeguide.md) and gradient icons export cleanly to pure
vector EPS (`status: "processed"`). Unsupported SVG features (`<pattern>`, `<text>`,
`<image>`, non-`pad` `spreadMethod`, unresolved `url(#missing)`) fail honestly
(`partial`), whereas **any raster image or invalid AI stream in EPS hard-fails the
entire export (`status: "failed"`, zero committed files)**.

* EPS converters (`docs/archive/2026-10-09-eps-converters-inkscape-expand/design.md`,
  `docs/archive/2026-10-21-eps-illustrator-vector-gradients/design.md`): `CONVERTERS`
  (`src/lib/upload/epsconv/registry.ts`) lists `builtin` (`writer:
  "builtin-subset-5"`) and `inkscape` (`http://127.0.0.1:47391`). When Inkscape's
  Cairo backend emits `shfill`/`/ShadingType`/raster operators on gradient SVGs,
  `inkscapeConverter` seamlessly upgrades in-subset SVGs through `builtinConverter`
  to 100%-vector native AI EPS and hard-fails any remaining raster output.
* **Hard Zero-Raster + Native AI Verifier (`epscheck.ts` + `epsaicheck.ts` +
  `epsdoc.ts` + `exportstages.ts` + `exportvalidate.ts`):** Every EPS passes
  `verifyEpsDocument`, `findRasterOperators` (forbidding `image`, `colorimage`,
  `imagemask`, `cairo_image`, `cairo_imagemask`, `/ImageType`, `/DCTDecode`,
  `/JPXDecode`, `/CCITTFaxDecode`, `/JBIG2Decode`, `%AI5_BeginRaster`, `XI`, `XG`,
  `Xh`, `XH`, `shfill`, `/ShadingType`), **and** `verifyAiPrivateStream` /
  `inspectAiEps` (inflating `%AI9_DataStream` in pure TS to verify outer `AI11EPS`
  signature, header concatenation, 12-arg `Bs`, 7-arg `Xa`/`XA`, 13-arg `Bg`, `Xm`,
  `Bm`, balanced `*u/*U`, and zero embedded rasters).
* The Inkscape helper (`tools/bridge/server.mjs` + `inkscape.mjs`) listens on
  `127.0.0.1` only (`GET /health`, `POST /convert/eps` ≤ 20 MB, 60 s timeout,
  immediate child kill on disconnect, isolated temp dir).
* Expand strokes to fills (`expandStrokes`, default off; fingerprinted when on)
  converts stroked shapes into filled cubic-Bezier outlines via `src/lib/upload/expand.ts`
  (`TOL = 0.01 px`, recorded in `tools.expand: { enabled, shapes }`).
