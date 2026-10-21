# Upload EPS and stroke expansion

The optional EPS path in [SVG to upload](upload.md); exports are local,
100% pure vector (**zero** raster operators permitted anywhere in an artwork),
and validated before commit.

## Converter choices

The built-in EPS writer (`src/lib/upload/{eps,epsgradient,epsshading,epsai,epszlib}.ts`,
zero external binaries and zero runtime dependencies) emits a dual-layer pure
vector **EPS 10** document so both PostScript interpreters and Adobe Illustrator
open every gradient and stroke as live vector objects (`Embedded Images: 0`):

1. **Printable PostScript LanguageLevel 3 vector page body (`eps.ts`,
   `epsshading.ts`, `epspath.ts`):** native smooth shadings (`shfill`,
   `/ShadingType 2` linear and `/ShadingType 3` radial, `/FunctionType 2`/`3`
   piecewise stops, `objectBoundingBox` + `userSpaceOnUse` +
   `gradientTransform`, `href` inheritance, `fill`/`eofill` + `clip`/`eoclip`,
   and stop/paint alpha pre-composited onto the solid export background).
   Gradient strokes (`stroke="url(#…)"`) are expanded in pure TypeScript via
   `expandOutline` (`src/lib/upload/geom/expand/`) into closed cubic-Bezier
   vector outlines filled with `shfill` (**zero** `strokepath` flattening).
2. **Native Adobe Illustrator 10 vector editing stream (`epsai.ts`,
   `epszlib.ts`):** emits `%AI9_PrivateDataBegin … %AI9_DataStream …
   %AI9_PrivateDataEnd` inside `%%Trailer … %%EOF`, compressed synchronously in
   pure TypeScript via RFC 1950 zlib + RFC 1951 fixed-Huffman/LZ77 + PostScript
   ASCII85 `%`-comment lines. Defines deduplicated live Illustrator Gradient
   Swatches (`%AI5_BeginGradient`, `Bd`, `%_Bs`, `BD`, `%AI5_EndGradient`) in
   `%%BeginSetup` and flat artboard-space vector paths (`m`, `L`, `C`), compound
   paths (`*u … *U`), fill rules (`0 XR` / `1 XR`), process/RGB colors
   (`Xa` / `XA`), and live gradient instances (`Bb`, `Bh`, `Bg`, `Xm`, `BB`).

Upload template shadows, [corner badges](upload-badge.md),
[S/L size guides](upload-sizeguide.md) and gradient icons export cleanly to pure
vector EPS (`status: "processed"`). Unsupported features (`<pattern>`, `<text>`,
`<image>`, non-`pad` `spreadMethod`, unresolved `url(#missing)`) fail honestly
(`partial`), committing SVG/JPEG while leaving any older `.eps` unadvertised.

* EPS converters (2026-10-09, design
  `docs/archive/2026-10-09-eps-converters-inkscape-expand/design.md`): the
  EPS writer is CHOSEN, not fixed. The registry `CONVERTERS`
  (`src/lib/upload/epsconv/registry.ts`) is the one table the drop list, the
  settings parser and the EPS stage read: `builtin` (the pure-TS writer above,
  `writer: "builtin-subset-4"`) and `inkscape` (Inkscape on this machine
  through the local helper at `http://127.0.0.1:47391` — `GET /health` to
  probe, `POST /convert/eps` with alpha-pre-flattened SVG to convert, `writer:
  "inkscape-cli@<version>"` from `x-inkscape-version`). `epsConverter` is NOT in
  the settings fingerprint: switching converters rebuilds the EPS only, and
  choosing a converter never toggles `includeEps`. The built-in writer anchors
  `%%HiResBoundingBox`, integer outward-rounded `%%BoundingBox`, `%AI5_ArtSize:
  height width`, and centered `%AI3_TemplateBox` to the prepared `viewBox`. The
  writer ID `builtin-subset-4` lets export planning refresh older packages' EPS
  files without re-rendering JPEGs. Accepted metadata is embedded as Dublin Core
  XMP (`%ADO_ContainsXMP: MainFirst` + `BDC`/`EMC` `pdfmark` before `%%Trailer`)
  and read back before atomic commit.
* **Hard Zero-Raster Gate (`epscheck.ts` + `epsdoc.ts` + `epsconv/inkscape.ts`):**
  Every EPS — whoever wrote it — passes `verifyEpsDocument` (EPSF-3.0 header,
  `%%LanguageLevel`, `%%BoundingBox`, `%%EOF`) **and** `findRasterOperators`,
  which strips XMP `<?xpacket …?>` packets, `(…)` literal strings, `<…>` hex
  strings, and `%` comments (so metadata containing `"image"` never triggers a
  false positive) and rejects `%AI5_BeginRaster` and any executable raster token
  (`image`, `colorimage`, `imagemask`, `cairo_image`, `cairo_imagemask`,
  `/ImageType`, `/DCTDecode`, `/JPXDecode`, `/CCITTFaxDecode`, `/JBIG2Decode`,
  `XI`, `XG`, `Xh`, `XH`). `verifyEps` also executes the stack checker (`I-61`).
  `tools.eps.{enabled, converter, writer, fixes?}` records provenance, and batch
  runs probe Inkscape once up front (`iconSplitter.upload.bridge.v1`).
* The Inkscape helper (`tools/bridge/server.mjs` + `inkscape.mjs`, started by
  `run_inkscape_bridge.bat` / `run_app_inkscape.bat`, any OS:
  `node tools/bridge/server.mjs [--port] [--inkscape] [--dist]`) is a
  dependency-free Node HTTP server on **127.0.0.1 only**. `GET /health` probes
  live on every call; `POST /convert/eps` (≤ 20 MB SVG) runs `inkscape
  --export-type=eps --export-area-page --export-text-to-path --export-ps-level=3`
  in an isolated temp dir cleaned up in `finally`, killing the child immediately
  on timeout (60 s) or client disconnect (`499`), and `GET /` serves `dist/`.
  Tested against a fake Inkscape in `tests/bridge_inkscape.test.ts`.
* Expand strokes to fills (`expandStrokes`, default off; fingerprinted only when
  on) makes `prepare` convert visibly stroked shapes into filled cubic-Bezier
  outlines via `src/lib/upload/expand.ts` over `src/lib/upload/geom/expand/`
  (`pen`, Tiller–Hanson `offset` within `TOL = 0.01 px`, `joins` with miter /
  KAPPA round / bevel and inner vertex pivot, `arclen` + de Casteljau `dash`,
  `assemble`). Paint order is kept; `url(#…)` strokes, negative dashes, and dash
  periods under `0.01 px` are refused honestly in `expand.ts` before modifying
  the DOM. Recorded in `tools.expand: { enabled, shapes }` (`· strokes → fills`).
