# Architectural Design: Native Adobe Illustrator Vector Gradients & Hard Raster-Rejection Verification (`builtin-subset-5`)

**Date:** 2026-10-21  
**Status:** Approved for Implementation (`Design First -> Implement Solve`)  
**Scope:** `src/lib/upload/{eps.ts,epsdoc.ts,epsai.ts,epsaicheck.ts,epszlib.ts,epsshading.ts,epscheck.ts,epsconv/builtin.ts,epsconv/inkscape.ts}`, `tests/assets/svg to EPS/{icon-handshake-heart_7_01_v2.svg,icon-handshake-heart_7_03_v2.jpg}`, `tests/upload_eps_illustrator_verify.test.ts`

---

## 1. Problem Statement & User Acceptance Criteria

When opening `.eps` files exported by `builtin-subset-4` (`2769702d`) in real **Adobe Illustrator(R) 30.8.2** on Windows, gradients (such as the elliptical translucent drop shadow `<ellipse cx="600.001" cy="532.866" fill="url(#a)" fill-opacity=".2" rx="180.868" ry="21.133"/>` in `tests/assets/svg to EPS/icon-handshake-heart_7_01_v2.svg`) appeared inside Illustrator as **embedded raster `<Image>` objects** instead of live vector objects with native vector gradients — and neither the production EPS export verifier nor the automated test suite detected the failure.

### Hard Acceptance Criteria
1. **100% Native Vector Objects in Adobe Illustrator 30.8+:** Every SVG in the supported vector/gradient subset — specifically including `tests/assets/svg to EPS/icon-handshake-heart_7_01_v2.svg` — MUST open in Adobe Illustrator as **pure live vector paths, live native Gradient Swatches (`<linearGradient>` & `<radialGradient>`, multi-stop, per-stop `stop-opacity`, element `fill-opacity`, elliptical & focal geometry), and live editable strokes** (`"EDITABLE STROKE WIDTH"`), with **`0` raster `<Image>` objects** under both native Illustrator import and generic PostScript import.
2. **Hard Export & Test Failure on Any Raster Image or Rasterizing Operator:** Both the production export verifier (`verifyEps`, `verifyEpsDocument`, converter pipeline, commit validator) **and** the automated Vitest suite MUST detect any raster image data (outer PostScript, compressed `%AI9_DataStream`, or PDF `/Subtype /Image` XObject) **as well as** any PostScript smooth-shading operator (`shfill` / `/ShadingType`) that causes Illustrator's `MPSParser.aip` to synthesize a bitmap `<Image>`, and **immediately fail both the export and the test**.
3. **End-to-End Fixture Verification:** Automated export + multi-engine verification (strict Illustrator native stream interpreter + real GPL Ghostscript 10.06 WASM PDF XObject audit + pixel comparison against `tests/assets/svg to EPS/icon-handshake-heart_7_03_v2.jpg`) MUST run in CI as part of `npm run verify`.

---

## 2. Forensic Root-Cause Diagnosis

Direct byte-level inspection and zlib decompression of `design temp/two eps to compare/icon-award-ribbon_8_02.eps` (saved directly from the target `Adobe Illustrator(R) 30.8.2` Windows installation) alongside `tests/assets/svg to EPS/icon-handshake-heart_7_01_v2.svg` established **six exact root causes** behind the `2769702d` failure:

| # | Defect in `2769702d` (`builtin-subset-4`) | Effect in `Adobe Illustrator(R) 30.8.2` | Ground-Truth Evidence (`icon-award-ribbon_8_02.eps` & AI Format Spec) |
|---|---|---|---|
| **RC-1** | **Outer DSC header lacked Adobe Illustrator format signatures AND body emitted Level-3 `shfill`.** `epsdoc.ts` wrote `%%Creator: IconSplitter (SVG to upload)` with `%%LanguageLevel: 3` and omitted `%ADOBeginClientInjection: DocumentHeader "AI11EPS"`, `%%AI8_CreatorVersion:`, and `%AI9_PrintingDataBegin`. | Illustrator's Format Manager bypassed its native `Illustrator Format` reader and dispatched the `.eps` to **`MPSParser.aip`** (generic foreign PostScript parser). **`MPSParser.aip` rasterizes every PostScript `shfill` dictionary at open time into a bitmap `<Image>` inside a `<Clip Group>`**, even though zero `image` tokens appear in the `.eps` file text. | `icon-award-ribbon_8_02.eps` lines 1–18: `%%Creator: Adobe Illustrator(R) ...`, `%%LanguageLevel: 2`, `%ADOBeginClientInjection: DocumentHeader "AI11EPS"`, `%%AI8_CreatorVersion: ...`, `%AI9_PrintingDataBegin`. Real Illustrator EPS **never** emits `shfill` in its outer Level-2 PostScript page stream. |
| **RC-2** | **Malformed `%AI9_PrivateDataBegin` stream concatenation.** `epsai.ts` wrote `%%Creator: IconSplitter (SVG to upload)` in the uncompressed private header AND repeated `%!PS-Adobe-3.0\n%%Creator: ...` at byte 0 inside the zlib-compressed `%AI9_DataStream`. | Illustrator concatenates the uncompressed header lines between `%AI9_PrivateDataBegin` and `%AI9_DataStream` directly onto the inflated bytes of `%AI9_DataStream`. Repeating `%!PS-Adobe-3.0` inside zlib produced a malformed dual-header stream. | `icon-award-ribbon_8_02.eps` private section: uncompressed lines end at `%AI9_DataStream`, and byte 0 of the inflated stream starts directly at `%%BoundingBox: ...`. |
| **RC-3** | **12-operand vs 13-operand `Bg` stack underflow in AI 9+ streams.** `epsai.ts` emitted `1 (name) x y angle len 1 0 0 1 0 0 Bg` (**12 operands**, AI 7/8 arity). | In AI 9–30.8 (`%AI9_DataStream`), `Bg` pops **13 operands**: `flag (name) xOrigin yOrigin angle length a b c d tx ty aspectRatio Bg`. Missing `aspectRatio` underflowed the AI operand stack on the first gradient path, causing Illustrator's native AI reader to abort and fall back to the printed PostScript page (`MPSParser.aip` -> raster `<Image>`). | AI 9+ native gradient instances always emit 11 numbers after `(name)` (`13` operands total before `Bg`), followed by `Xm` and `Bm` 6-element affine matrices. |
| **RC-4** | **Baked opaque gradient stops instead of native per-stop opacity + live object `Xy` transparency.** `epsai.ts` pre-mixed gradient stop alpha onto solid background RGB and omitted `<00FF>\n0` + `%_... 2 <opacity> 6 50 <ramp> Bs` and `0 <fillOpacity> 0 0 0 Xy`. | In `icon-handshake-heart_7_01_v2.svg`, `<radialGradient id="a">` has 3 translucent stops (`#000` at `0` op `1`, `#1f1f1f` at `0.649` op `0.25`, `#474747` at `1` op `0`) plus `fill-opacity=".2"` on `<ellipse>`. Pre-mixing lost live translucency and omitted modern AI stop ramp syntax. | Modern `%AI5_FileFormat 14.0` gradient definitions use `[\n<00FF>\n0\n%_<c> <m> <y> <k> <r> <g> <b> 2 <opacity> 6 50 <ramp> Bs` + `0 <alpha> 0 0 0 Xy` for live editability over any background. |
| **RC-5** | **Segment operator case (`L`/`C` vs `l`/`c`).** `epsai.ts` wrote uppercase `C`/`L` everywhere. | Marks smooth Bezier knots as corner cusps instead of smooth curves. | `icon-award-ribbon_8_02.eps` lines 518–650: real Illustrator 30.8.2 writes lowercase `m`, `l`, `c`, with per-subpath `f`/`F`/`s`/`S`/`b`/`B` inside `*u ... *U` compound paths. |
| **RC-6** | **Verifier blind spot in `epscheck.ts` & `epsdoc.ts`.** `findRasterOperators` scanned only outer PS text for raw `image`/`XI` tokens. | Completely missed (a) `shfill` (`MPSParser` rasterization trigger), (b) compressed raster blocks (`%AI5_BeginRaster` / `XI`) inside `%AI9_DataStream`, and (c) broken `%AI9_DataStream` headers/stack arities that force Illustrator fallback. | Export and tests passed `2769702d` despite Illustrator 30.8.2 producing a raster `<Image>`. |

---

## 3. Architecture Evaluation & Selected Solution (`builtin-subset-5`)

### Candidate Architectures Considered

1. **Option A — Single-Stream Legacy AI 7/8 EPS (`%AI5_FileFormat 3`, `tzunghaor/inkscape-eps-export` style):**
   - *Pros:* Plain ASCII, zero `shfill` in body.
   - *Cons (** Disqualified for `icon-handshake-heart_7_01_v2.svg` **):* Legacy AI 7/8 format lacks `Xy` object opacity, lacks per-stop opacity (`opacity 6` in `Bs`), and **cannot represent non-circular radial gradients without `Xm`/`Bm`** (`tzunghaor` explicitly warns: *"radial gradients will appear circle shaped"*, turning the `361.7 x 42.3` thin horizontal drop shadow under the handshake into a giant `361.7 x 361.7` circle).

2. **Option B — Outer PostScript Level-3 `shfill` + Fixed `%AI9_DataStream`:**
   - *Pros:* Compact outer PostScript.
   - *Cons (** Rejected as Single-Point Fragility **):* Retains `shfill` in the outer PostScript stream. If *any* downstream tool, user setting, or parser opens the outer PostScript page via `MPSParser.aip`, `shfill` immediately rasterizes into a bitmap `<Image>`. Moreover, real Adobe Illustrator itself saves EPS at `%%LanguageLevel: 2` (`icon-award-ribbon_8_02.eps` line 10) and **never** emits `shfill`.

3. **Option C (SELECTED — `builtin-subset-5`: Zero-`shfill`, Zero-Raster Native Illustrator EPS-10 + Pure Vector Level-2 PostScript Page):**
   - **Layer 2 — Byte-Faithful Native Adobe Illustrator Editing Stream (`%AI9_PrivateDataBegin ... %AI9_DataStream ... %AI9_PrivateDataEnd`):**
     - Outer DSC header carries exact Illustrator EPS markers (`%%Creator: Adobe Illustrator(R) 24.0`, `%%For: (IconSplitter) ()`, `%%LanguageLevel: 2`, `%ADOBeginClientInjection: DocumentHeader "AI11EPS"`, `%%AI8_CreatorVersion: 24.0.0`, `%AI9_PrintingDataBegin`, `%ADOEndClientInjection: DocumentHeader "AI11EPS"`).
     - Uncompressed `%AI9_PrivateDataBegin` header (`%!PS-Adobe-3.0 EPSF-3.0`, `%%Creator: Adobe Illustrator(R) 10.0`, `%%AI8_CreatorVersion: 24.0.0`, `%%For: (IconSplitter) ()`, `%%Title: (...)`, `%%Canvassize: 16383`) concatenates seamlessly into zlib+ASCII85 `%AI9_DataStream` starting at `%%BoundingBox:` + `%%HiResBoundingBox:` + `%AI5_FileFormat 14.0` + `%AI9_ColorModel: 1` — matching `icon-award-ribbon_8_02.eps` byte-for-byte.
     - Emits **1 single live vector object per SVG shape**, **live native Gradient Swatches** (`%AI5_BeginGradient` with `<00FF>\n0` and `%_<c> <m> <y> <k> <r> <g> <b> 2 <opacity> 6 50 <ramp> Bs` preserving exact stop colors & opacities), **live element opacity** (`0 <opacity> 0 0 0 Xy`), **exact 13-operand `Bg` + `Xm` + `Bm` + `Bh`** (preserving exact `8.56:1` elliptical aspect ratio `ry/rx = 0.116842` and off-center focal points), **7-operand `c m y k r g b Xa`/`XA`**, **lowercase `m`/`l`/`c`**, **live editable stroke widths** (`w`, `J`, `j`, `M`, `d`, per-subpath `s`/`S`/`b`/`B`), and cubic-Bezier-expanded vector outlines for `stroke="url(#grad)"`.
   - **Layer 1 — Pure Vector PostScript Level-2 Page Stream (`0` `shfill`, `0` raster operators anywhere in file):**
     - Solid fills and solid strokes emit exact `moveto`/`lineto`/`curveto`/`closepath` + `setrgbcolor` + `fill`/`eofill`/`stroke` (preserving exact `[0.75 0 0 -0.75 ...] concat` coordinate system).
     - Linear, concentric radial, elliptical radial, and focal radial gradients on the outer printed page emit **pure vector clipped Bezier geometry** (`gsave <path> clip|eoclip [<gradMatrix>] concat` followed by exact adaptive-step pure vector strips / painter's-order concentric cubic-Bezier circles spanning every distinct 8-bit RGB level across the ramp, `<= 1/255` step delta = sub-LSB in 24-bit color, `grestore`).
     - **Why this double-locks zero rasterization everywhere:**
       1. **Adobe Illustrator 10–30.8.2** opens `%AI9_PrivateDataBegin` natively as **1 single live vector object + 1 live radial/linear gradient swatch + live editable strokes**.
       2. **Ghostscript / macOS Preview / CUPS / CorelDRAW / Affinity / Inkscape / even `MPSParser.aip`** see **100% pure Level-2 vector paths (`0` `shfill`, `0` `/ImageType`, `0` `/Subtype /Image`)** and render smooth pixel-accurate output with **zero possibility of raster image synthesis in any application on Earth**.

---

## 4. Two-Tier Fail-Closed Raster & Native-Vector Verification Design

### Tier 1 — Production Runtime Verifier (`epscheck.ts` + `epsaicheck.ts` -> `verifyEps` & `verifyEpsDocument`)
Every EPS produced by `writeEps`, `builtinConverter`, or `inkscapeConverter` (and validated at `exportvalidate.ts` / `exportcommit.ts`) MUST pass ALL of the following checks — **if ANY check fails, the production export immediately fails with an explicit diagnostic error**:

1. **Outer PostScript Zero-Raster & Zero-`shfill` Gate (`findRasterOperators`):**
   - Scans all executable outer PostScript tokens (stripping comments, literal strings, hex strings, and XMP packets) and hard-rejects:
     - Raw bitmap operators: `image`, `colorimage`, `imagemask`, `cairo_image`, `cairo_imagemask`, `/ImageType`, `/DCTDecode`, `/JPXDecode`, `/CCITTFaxDecode`, `/JBIG2Decode`
     - AI raster / placed-image operators & blocks: `XI`, `XG`, `Xh`, `XH`, `%AI5_BeginRaster`, `%AI5_BeginPlace`, `%AI26_BeginPlacedObjectPreview`
     - `MPSParser`-rasterizing PostScript smooth-shading tokens: `shfill`, `/ShadingType`
2. **Executable PostScript Stack & Path Verifier (`checkPostScript`):**
   - Executes every outer PostScript token through the typed operand-stack / dictionary / `gsave`–`grestore` / current-path state machine with zero errors and empty terminal stack.
3. **Decompressed Native Adobe Illustrator Stream Verifier (`verifyAiPrivateStream` in `src/lib/upload/epsaicheck.ts`):**
   - For built-in EPS exports (`verifyEps`) — and whenever `%AI9_PrivateDataBegin` is present in `verifyEpsDocument`:
     1. Verifies outer Illustrator dispatch headers (`%%Creator: Adobe Illustrator(R)`, `%ADOBeginClientInjection: DocumentHeader "AI11EPS"`, `%%AI8_CreatorVersion:`, `%AI9_PrintingDataBegin`).
     2. Extracts the uncompressed header between `%AI9_PrivateDataBegin` and `%AI9_DataStream`, decodes ASCII85 (`~>`), inflates the RFC 1950 zlib stream, and verifies the concatenated document starts with single `%!PS-Adobe-3.0 EPSF-3.0`, `%%Creator: Adobe Illustrator(R) 10.0`, `%%BoundingBox:`, `%%HiResBoundingBox:`, and `%AI5_FileFormat` (rejecting duplicate `%!PS-Adobe-3.0` headers!).
     3. Scans the **decompressed** AI stream with `findRasterOperators` so no compressed `%AI5_BeginRaster` / `XI` bitmap can ever hide inside zlib.
     4. Executes a **full strict AI 9–30.8 stack & block state-machine interpreter** across every line (including `%_` lines!), enforcing exact C++ operand arities (`7`-arg `Xa`/`XA`, `13`-arg `Bg`, `4`-arg `Bh`, `6`-arg `Xm`/`Bm`, `12`-arg `Bs`, `14`-arg `Lb`, `5`-arg `Xy`, `1`-arg `BB`/`XR`/`O`/`R`/`A`/`Xw`/`J`/`j`/`w`/`M`/`D`/`Bn`/`Ln`, `2`-arg `d`/`m`/`l`/`L`, `6`-arg `c`/`C`, `3`-arg `Bd`), verifying balanced `%AI5_BeginGradient`..`%AI5_EndGradient`, `%AI5_BeginLayer`..`LB`..`%AI5_EndLayer--`, `*u`..`*U`, `u`..`U`, `q`..`Q`, verifying every `Bg` swatch name was defined in `%AI5_BeginGradient`, verifying every path is painted before the next `m` or `*U`/`LB`, and returning the parsed live vector DOM (`layers`, `gradients`, `objects`, `embeddedRasterCount === 0`)!

### Tier 2 — Automated End-to-End Export & Multi-Engine Verification Test Suite (`tests/upload_eps_illustrator_verify.test.ts`)
1. **Real Fixture Export (`tests/assets/svg to EPS/icon-handshake-heart_7_01_v2.svg`):**
   - Runs `writeEps`, `builtinConverter.convert`, `verifyEps`, `verifyEpsDocument`, and `runExport` on `icon-handshake-heart_7_01_v2.svg`.
   - Asserts `embeddedRasterCount === 0`, native AI dispatch (`mpsParserFallback === false`), **1 live radial `<Gradient>` swatch** (`3` stops: `#000` op `1` at `0%`, `#1f1f1f` op `0.25` at `64.9%`, `#474747` op `0` at `100%`), **1 live shadow `<Path>`** with `opacity = 0.2` and exact elliptical geometry (`rx = 135.651 pt`, `ry = 15.84975 pt`, aspect `0.116842`), and **live editable stroke paths** (`6 pt`, `0.9555 pt`, `1.911 pt`, `1.311 pt`) with mixed open (`S`) + closed (`s`) subpaths preserved.
2. **Real Ghostscript 10.06 WASM PDF XObject Raster Audit (`-sDEVICE=pdfwrite`):**
   - Distills exported `.eps` -> `.pdf` via `@okathira/ghostpdl-wasm` and asserts **`0` `/Subtype /Image` XObjects** exist anywhere in the generated PDF.
3. **Real Ghostscript 10.06 WASM Pixel Verification Against `tests/assets/svg to EPS/icon-handshake-heart_7_03_v2.jpg` (`-sDEVICE=bmp16m`):**
   - Renders the exported `.eps` at `1200x650` and verifies both full-canvas pixel fidelity (`MAE < 0.015` across all `780,000` pixels against the JPEG reference) AND smooth monotonic horizontal/vertical falloff inside the `cx=600, cy=533, rx=181, ry=21` elliptical shadow band.
4. **Negative Fail-Closed Regression Tests:**
   - Proves that:
     - `2769702d`-style `shfill` EPS fails `verifyEps`, `verifyEpsDocument`, and `builtinConverter.convert`!
     - Any EPS containing `image` / `colorimage` / `imagemask` / `cairo_image` / `/ImageType` fails both export and tests!
     - Any EPS containing `%AI5_BeginRaster` / `XI` hidden inside compressed `%AI9_DataStream` fails both export and tests!
     - Any EPS missing outer AI headers, containing duplicate `%!PS-Adobe-3.0` inside `%AI9_DataStream`, or having wrong `Bg`/`Xa` arity fails `verifyEps` and fails export!

---

## 5. File-by-File Implementation Plan (All Files Strictly Within `<= 250` Code-Line Quality Budget)

| File | Responsibility |
|---|---|
| `src/lib/upload/epsdoc.ts` | Assemble outer Illustrator-compatible Level-2 EPS document (`%%Creator: Adobe Illustrator(R) 24.0`, `%%For: (IconSplitter) ()`, `%%LanguageLevel: 2`, `AI11EPS` client injection + `%AI9_PrintingDataBegin`, `%AI5_ArtSize`, `%AI3_TemplateBox`), run `findRasterOperators` + `checkPostScript` + `verifyAiPrivateStream` in `verifyEps` / `verifyEpsDocument`. |
| `src/lib/upload/epsai.ts` | Emit byte-faithful `%AI9_PrivateDataBegin` + zlib/ASCII85 `%AI9_DataStream` (no duplicate `%!PS-Adobe-3.0`, `%AI5_FileFormat 14.0`, `<00FF>\n0` + `%_... 2 <opacity> 6 50 <ramp> Bs` live stop opacities, `0 <alpha> 0 0 0 Xy` live object transparency, `7`-arg `Xa`/`XA`, `13`-arg `Bg` + `Xm` + `Bm` + `Bh`, lowercase `m`/`l`/`c`, per-subpath `f`/`F`/`s`/`S`/`b`/`B`). |
| `src/lib/upload/epsshading.ts` | Pure-vector Level-2 PostScript gradient emitter (`0` `shfill`, `0` `/ShadingType`): exact SVG gradient matrix resolution + adaptive sub-LSB clipped vector strips (linear) and painter's-order concentric cubic-Bezier circles (concentric, elliptical, and focal radial) + cubic-Bezier gradient-stroke expansion. |
| `src/lib/upload/eps.ts` | Walk SVG DOM, pass **unbaked** gradient stop colors + stop opacities + element `fillOpacity`/`strokeOpacity` to `AiStreamBuilder` so native Illustrator swatches retain 100% live translucency, while passing `bg` flattening to pure-vector outer PostScript rendering. |
| `src/lib/upload/epscheck.ts` | Block all raster AND `shfill`/`/ShadingType` tokens in `findRasterOperators`; remove `shfill` from `POPS` so executable PostScript check rejects `shfill` as well. |
| `src/lib/upload/epsaicheck.ts` | **(New)** Decompress `%AI9_PrivateDataBegin` / `%AI9_DataStream` (pure-TS RFC 1951/1950 inflate + ASCII85 decode so it works in browser + Node with zero Node-only `node:zlib` runtime dependency!), scan inflated stream for raster tokens, and execute strict AI 9–30.8 stack & block state machine returning structured `AiInspection`. |
| `src/lib/upload/epszlib.ts` | Pure-TS RFC 1950 zlib + ASCII85 encoder **plus** pure-TS RFC 1950/1951 inflate + ASCII85 decoder (`decodeAiDataStream`) used in browser & Node production runtime verification. |
| `src/lib/upload/epsconv/builtin.ts` | Bump cache version to `"builtin-subset-5"`. |
| `tests/upload_eps_illustrator_verify.test.ts` | **(New)** Full end-to-end export + raster/vector gate verification on `tests/assets/svg to EPS/icon-handshake-heart_7_01_v2.svg` + `icon-handshake-heart_7_03_v2.jpg` + Ghostscript 10.06 WASM PDF XObject & BMP pixel verification + fail-closed negative tests. |
