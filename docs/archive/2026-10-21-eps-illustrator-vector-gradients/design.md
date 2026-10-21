# Architectural Design: Lag-Free Optimized Native Adobe Illustrator 30.8.2 EPS Export & Hard Raster/Bloat Verification (`builtin-subset-6`)

**Date:** 2026-10-21  
**Status:** Design Approved & Implemented (`Design Doc First -> Implement Solve`)  
**Scope:** `src/lib/upload/{eps.ts,epsdoc.ts,epsai.ts,epsbands.ts,epsinflate.ts,epszlib.ts,epscheck.ts,epsailex.ts,epsaistate.ts,epsaicheck.ts,epsconv/builtin.ts,epsconv/inkscape.ts}`, `tests/assets/svg to EPS/{icon-handshake-heart_7_01_v2.svg,icon-handshake-heart_7_03_v2.jpg}`, `tests/upload_eps_illustrator_verify.test.ts`

---

## 1. Problem Statement & User Acceptance Criteria

Two real-world Adobe Illustrator 30.8.2 failures occurred across iterations on `tests/assets/svg to EPS/icon-handshake-heart_7_01_v2.svg` (`8,670` bytes, `14` vector shapes including `<ellipse cx="600.001" cy="532.866" fill="url(#a)" fill-opacity=".2" rx="180.868" ry="21.133"/>` and `"EDITABLE STROKE WIDTH"` strokes):

1. **`2769702d` (`builtin-subset-4`) — Raster `<Image>` in Illustrator:**
   Opening exported `.eps` in `Adobe Illustrator(R) 30.8.2` dispatched the file through `MPSParser.aip` and rasterized PostScript `shfill` smooth shadings into embedded bitmap `<Image>` objects inside `<Clip Group>` containers instead of vector gradients.
2. **`bc29975d` (`builtin-subset-5`) — Huge Lag & Unoptimized Objects in Illustrator:**
   While `bc29975d` eliminated `shfill` and raster bitmaps, opening the `.eps` in `Adobe Illustrator(R) 30.8.2` suffered severe multi-second lag and produced unoptimized compound/clipped paths because Illustrator **still** rejected the native `%AI9_PrivateDataBegin` section and fell back to `MPSParser.aip` over `53` stacked `48`-vertex polygons (`>2,750` anchor points and `53` duplicated compound clipping groups for a single `14`-shape SVG).

### Hard Acceptance Criteria
1. **Instant, Lag-Free Native Open in Adobe Illustrator 30.8.2+:** Exported `.eps` files MUST open instantaneously in Adobe Illustrator via its native `AIFileFormat` reader (`0` lag, `1` live native `<ellipse>`/`<path>` per gradient shape, `1` live translucent Gradient Swatch in the Swatches panel, `100%` live editable stroke widths, `0` banded duplicates, `0` raster `<Image>` objects).
2. **Byte-Exact Wrapper & Stream Parity with Real `Adobe Illustrator(R) 30.8.2` (`design temp/two eps to compare/icon-award-ribbon_8_02.eps`):** Both the outer PostScript/DSC wrapper AND the compressed `%AI9_DataStream` MUST match ground-truth `Adobe Illustrator(R) 30.8.2` output so native AI loading succeeds on the first pass with zero fallback.
3. **Compact, Optimized Outer PostScript Page Budget (`~11 KB` vs `50+ KB`):** The outer Level-2 PostScript print/preview page MUST ALSO be clean, compact, and optimized: `\r\n` CRLF lines, `<= 16` pure `4`-anchor cubic-Bezier ellipses (`0` `48`-gon polyline tessellations, `0` `shfill`, `0` raster operators), keeping total `.eps` size compact (`~11 KB` for `icon-handshake-heart_7_01_v2.svg`) and fast (`< 5 ms`) even in pure PostScript viewers.
4. **Hard Fail-Closed Gate in Both Production Export AND Vitest:** Both `verifyEps` / `verifyEpsDocument` / `inspectAiEps` / `runExport` **and** `tests/upload_eps_illustrator_verify.test.ts` MUST fail hard if any raster token, `shfill`, missing `%AI9_PrintingDataEnd` / `ai9_skip_data`, wrong `%AI5_FileFormat`, malformed `Bd ... BD` stack, or unoptimized outer PostScript band/vertex explosion is present.

---

## 2. Complete Root-Cause Diagnosis (`bc29975d` vs Ground-Truth `icon-award-ribbon_8_02.eps`)

Byte-for-byte inspection of the outer PostScript stream and zlib-inflated `%AI9_DataStream` of `design temp/two eps to compare/icon-award-ribbon_8_02.eps` (saved directly by `Adobe Illustrator(R) 30.8.2` on Windows) plus independent AI 9–30.x parsers exposed **four exact root causes** in `bc29975d`:

| # | Defect in `bc29975d` (`builtin-subset-5`) | Exact Effect in `Adobe Illustrator(R) 30.8.2` | Ground-Truth Fix (`icon-award-ribbon_8_02.eps`, AI 30.8.2) |
|---|---|---|---|
| **BUG-A** | **Missing `%%PageTrailer` + `%%EOF` + `%AI9_PrintingDataEnd` + `ai9_skip_data` before `%AI9_PrivateDataBegin`, and LF `\n` instead of CRLF `\r\n` (`epsdoc.ts`).** | Illustrator's `AIFileFormat` C++ reader scans forward from `%AI9_PrintingDataBegin` for `%AI9_PrintingDataEnd`. Because `%AI9_PrintingDataEnd` was completely absent, Illustrator scanned to EOF, aborted native AI stream loading before reading `%AI9_DataStream`, and routed the file into **`MPSParser.aip`**. | Emit `\r\n` throughout outer PS and close printing PS with `%%Page: 1 1` ... `%%PageTrailer` -> `gsave annotatepage grestore showpage` -> `%%Trailer` -> `%%EOF` -> `%AI9_PrintingDataEnd` -> `userdict /AI9_read_buffer 256 string put ... userdict /ai9_skip_data get exec` -> `%AI9_PrivateDataBegin` -> `%AI9_DataStream` -> `%Gb!...~>` -> `%AI9_PrivateDataEnd`. Also stop `decodeAiDataStream` cleanly at `~>`. |
| **BUG-B** | **Inner `%AI9_DataStream` header version `%AI5_FileFormat 14.0` instead of `%AI5_FileFormat 6.0`, LF `\n`, missing `%AI9_BeginArtStyles` / `%AI5_BeginPalette`, and orphan `<00FF>\n0` inside `Bd ... BD` (`epsai.ts`).** | Inside `%AI9_DataStream`, real `Adobe Illustrator(R) 30.8.2` (`02.eps` line `[I4]`) writes **`%AI5_FileFormat 6.0`** (whereas `14.0` is PDF `.ai`). Furthermore, `<00FF>\n0` inside `Bd ... BD` without `%_Br` left two orphan items on the AI parser stack and omitted `%_BS` and `%AI5_BeginPalette ... PB %AI5_EndPalette`. | Emit `\r\n` throughout `%AI9_DataStream`, `%AI5_FileFormat 6.0`, `%AI9_BeginArtStyles ... %AI9_EndArtStyles`, gradient defs with `N - 1` `<ink> 4 %_Br` ramp segments + paired `<tok> %_BS` / `%_<tok> Bs` stops (`0 -> 100` radial, `100 -> 0` linear, `0` orphan stack operands), and `%AI5_BeginPalette` swatch cells (`Bb` / `2 (Name) 0 0 0 1 1 0 0 1 0 0 1 Bg` / `0 BB` / `(Name)` / `Pc` / `PB`). |
| **BUG-C** | **Outer PostScript `epsbands.ts` emitted `53–128` stacked `48`-vertex polygons inside a Bezier `clip` scope (`>50 KB`, `>2,750` anchor points).** | Even small `0.2`-opacity shadows spanned `51` 8-bit levels, and whenever any transformed Bezier control handle touched outside `box` by `1e-5` px, `radialRingPs` fell back to a `48`-gon polyline **on top of PostScript's already-active `clip` path**. In `MPSParser.aip`, every `fill` inside `clip` duplicates the full clipping Bezier into a separate compound clip group (`53` nested clip groups -> multi-second UI freeze). | Hardware `clip`/`eoclip` **already clips cleanly in PostScript**: NEVER tessellate circles to `48`-gons — EVERY radial preview ring is **always** a `4`-anchor cubic Bezier (`1 moveto + 4 curveto`), deduplicated to `<= 16` perceptual steps (`<= 20` convex `3–6` vertex slabs for linear). Cuts outer gradient segments **`40x` (`2,544 -> <= 64`)** and `.eps` file size **`4.5x` (`50 KB -> ~11 KB`)** while preserving `< 0.005` MAE vs reference JPEG. |
| **BUG-D** | **Verifier allowed missing `%AI9_PrintingDataEnd`, `%AI5_FileFormat 14.0`, `<00FF>` orphans, and `53 x 48`-gon outer bloat.** | `verifyEps` and `inspectAiEps` let `bc29975d` pass despite missing `%AI9_PrintingDataEnd` and outer path bloat. | Tighten `inspectAiEps`, `epsaistate.ts`, and `verifyEps` so EVERY check above (outer `%AI9_PrintingDataEnd` + `ai9_skip_data`, inner `%AI5_FileFormat 6.0` + `%AI5_BeginPalette` + `%_Br`/`%_BS`/`Bs` clean stack, zero raster/`shfill`, AND outer clip-fill & polygon-vertex optimization budget) fails hard in BOTH export AND tests! |

---

## 3. Exact Dual-Stream Architecture (`builtin-subset-6`)

### 3.1 Outer EPS Wrapper (`src/lib/upload/epsdoc.ts`, CRLF `\r\n`)
```postscript
%!PS-Adobe-3.0 EPSF-3.0
%%Creator: Adobe Illustrator(R) 24.0
%%For: (IconSplitter) ()
%%Title: (icon-handshake-heart_7_01_v2.eps)
%%CreationDate: (...)
%%BoundingBox: 0 0 900 488
%%HiResBoundingBox: 0 0 900 487.5
%%CropBox: 0 0 900 487.5
%%LanguageLevel: 3
%%DocumentData: Clean7Bit
%ADOBeginClientInjection: DocumentHeader "AI11EPS"
%%AI8_CreatorVersion: 24.0.0
%AI9_PrintingDataBegin
%ADOEndClientInjection: DocumentHeader "AI11EPS"
%%Pages: 1
%AI5_ArtSize: 487.5 900
%AI3_TemplateBox: 450 243.75 450 243.75
%%EndComments
%%BeginProlog
/annotatepage {} bind def
%%EndProlog
%%BeginSetup
%%EndSetup
%%Page: 1 1
%%BeginPageSetup
%%EndPageSetup
[0.75 0 0 -0.75 0 487.5] concat
... compact pure-vector Level-2 PS page (<= 16 4-cubic Bezier rings, 0 shfill, 0 image) ...
%%PageTrailer
gsave annotatepage grestore showpage
%%Trailer
%%EOF
%AI9_PrintingDataEnd

userdict /AI9_read_buffer 256 string put
userdict begin
/ai9_skip_data
{
	mark
	{
		currentfile AI9_read_buffer { readline } stopped
		{
		}
		{
			not
			{
				exit
			} if
			(%AI9_PrivateDataEnd) eq
			{
				exit
			} if
		} ifelse
	} loop
	cleartomark
} def
end
userdict /ai9_skip_data get exec
%AI9_PrivateDataBegin
%!PS-Adobe-3.0 EPSF-3.0
%%Creator: Adobe Illustrator(R) 10.0
%%AI8_CreatorVersion: 24.0.0
%%For: (IconSplitter) ()
%%Title: (icon-handshake-heart_7_01_v2.eps)
%%Canvassize: 16383
%AI9_DataStream
%Gb!...~>
%AI9_PrivateDataEnd
%%EOF
```

### 3.2 Inner Compressed `%AI9_DataStream` (`src/lib/upload/epsai.ts`, CRLF `\r\n`)
- Header starts immediately at `%%BoundingBox:` -> `%%HiResBoundingBox:` -> `%%DocumentProcessColors: Cyan Magenta Yellow Black` -> **`%AI5_FileFormat 6.0`** -> `%AI3_ColorUsage: Color` -> `%AI7_ImageSettings: 0` -> `%%RGBProcessColor: 0 0 0 ([Registration])` -> `%AI3_TemplateBox` -> `%AI3_TileBox` -> `%AI5_ArtSize` -> `%AI5_RulerUnits: 2` -> `%AI9_ColorModel: 1` -> `%AI5_ArtFlags: 0 0 0 1 0 0 1 0 0` -> `%AI5_TargetResolution: 800` -> `%AI5_NumLayers: 1` -> `%AI5_OpenViewLayers: 7` -> `%%PageOrigin:0 0` -> `%AI9_Flatten: 1`.
- `%%BeginSetup ... %%EndSetup` defines:
  1. `%AI9_BeginArtStyles ... %AI9_EndArtStyles` (`[Default]` simple style)
  2. `%AI5_Begin_NonPrinting` / `Np` / `<N> Bn` / `%AI5_BeginGradient: (Gradient k)` with `N - 1` `<c> <m> <y> <k> <r> <g> <b> 4 %_Br` entries + paired `<tok> %_BS` and `%_<tok> Bs` stops (`0` orphan tokens on stack!)
  3. `%AI5_BeginPalette` / `0 0 Pb` / `[Registration]` + each gradient swatch cell (`Bb` / `2 (Name) 0 0 0 1 1 0 0 1 0 0 1 Bg` / `0 BB` / `(Name)` / `Pc`) / `PB` / `%AI5_EndPalette`
  4. `%AI9_BeginArtStyleList` / `([Default])` / `%AI9_EndArtStyleList`
- `%AI5_BeginLayer` ... `LB` / `%AI5_EndLayer--` emits **1 single live vector object per SVG shape** (`14` objects total on `icon-handshake-heart_7_01_v2.svg`), live `0 <opacity> 0 0 0 Xy`, exact `13`-operand `Bg` + `Xm` + `Bm` + `Bh`, and live editable stroke widths (`w`, `J`, `j`, `M`, `d`).

---

## 4. Verification Matrix

1. **Ground-Truth Calibration (`tests/upload_eps_illustrator_verify.test.ts`):**
   - `design temp/two eps to compare/icon-award-ribbon_8_02.eps` (real Illustrator 30.8.2): **`inspectAiEps().ok === true`**.
   - `design temp/two eps to compare/icon-award-ribbon_8_01.eps` (flattened Vectorfix): **`inspectAiEps().ok === false`**.
   - `bc29975d`-style missing `%AI9_PrintingDataEnd`, `%AI5_FileFormat 14.0`, `<00FF>` orphan gradient stack, or `>24`-band outer PS bloat: **HARD FAIL** in both `verifyEps` (`runExport` -> `status: "failed"`, `0` committed files) and Vitest.
   - `2769702d`-style `shfill` or any raster image (`image`, `colorimage`, `imagemask`, `XI`, `%AI5_BeginRaster`): **HARD FAIL** in both `runExport` and Vitest.
2. **Fixture Optimization & Fidelity (`icon-handshake-heart_7_01_v2.svg` vs `icon-handshake-heart_7_03_v2.jpg`):**
   - Total exported `.eps` byte size `<= 20,000` bytes (`~11 KB` for an `8.67 KB` SVG!).
   - Native Illustrator object count `=== 14` (`1` live radial gradient `<ellipse>` with `4` anchors + `13` crisp vector paths), `embeddedRasterCount === 0`, `mpsParserFallback === false`.
   - Ghostscript 10.06 WASM `pdfwrite`: **`0` `/Subtype /Image` XObjects**.
   - Ghostscript 10.06 WASM `bmp16m` (`1200x650`): full-frame MAE `< 0.015` vs `icon-handshake-heart_7_03_v2.jpg` + smooth radial falloff across shadow center-to-rim.
