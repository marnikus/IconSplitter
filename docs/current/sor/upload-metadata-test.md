# Metadata written to JPEG and EPS at export — test plan and steps

## Problem

When the user exports icons for stock upload (the **SVG to upload** tab), the accepted
metadata — Title, Description, Tags — must be written **directly into** the exported
JPEG **and** the exported EPS in **both** carriers stock sites read: XMP **and**
IPTC-IIM. Adobe Stock does not reliably read XMP pdfmark from inside an EPS — it
generates its own JPEG preview and reads that preview's metadata — so IPTC-IIM must
be embedded in both carriers for both file types: JPEG gets XMP in APP1 plus IPTC-IIM
in APP13; EPS gets XMP in the pdfmark stream plus IPTC-IIM in a hex-encoded comment
block. The file, not a sidecar, is what gets read at upload.

The library writers (`src/lib/upload/jpeg.ts`, `src/lib/upload/epsmetadata.ts`,
`src/lib/upload/embed.ts`) and the end-to-end pipeline (`src/upload/runexport.ts`,
`src/upload/exportstages.ts`, `src/upload/exportcommit.ts`) already implement this.
What was missing is **verifiable end-to-end evidence**:

1. No SVG **test assets** exist that get exported end-to-end to JPEG and EPS with
   known Title/Description/Tags.
2. No **test webpage** exists where an exported JPEG or EPS file can be loaded and
   its Title / Description / Tags read back from the file and displayed.
3. No dedicated tests exercise the full "SVG source → export → JPEG+EPS with
   readable metadata → read back from file" flow using those assets.

This change adds exactly that: test assets, two test webpages, and tests.

## Requirement (acceptance)

1. Two SVG source files live under `tests/assets/SVG to JPEG or EPS export tests/`,
   each a valid minimal icon SVG to be exported to JPEG and EPS respectively.
2. A test webpage loads an exported JPEG or EPS file (file input), parses its XMP
   metadata, and displays **Title, Description and Tags** read straight from the file.
3. An Adobe Stock upload simulation page (`adobe-stock-upload.html`) demonstrates
   exactly what a stock website reads from the uploaded file.
4. Vitest tests export each SVG asset to JPEG and EPS through the real pipeline
   (with accepted metadata), then read the metadata back from the committed file
   bytes and assert Title/Description/Tags match the test values.
5. Tests also replicate the **exact XMP parsing logic used by the webpages**
   (raw JPEG APP1 segment scan; raw EPS xpacket scan) and validate it against
   real exported bytes — so the webpages are proven to work, not just the library.
6. JPEG read-back uses the XMP APP1 segment **and** the IPTC-IIM APP13 segment;
   EPS read-back uses the XMP pdfmark stream **and** the IPTC-IIM hex comment block.
   Every carrier must return exactly the accepted Title/Description/Tags, and
   `verifyJpeg` / `verifyEpsMetadata` must pass on the committed file bytes.

## Critical implementation detail

The JPEG APP1 XMP identifier (`src/lib/upload/jpeg.ts`, `XMP_ID`) is
`"http://ns.adobe.com/xap/1.0/\0"` — note the trailing `/` before the NUL byte.
Any webpage or test that parses JPEG XMP must use this exact identifier, or the
APP1 segment match will fail and metadata will appear missing. Both test webpages
and the validation test use this exact constant.

## Implementation map

| Piece | Path | What it does |
|---|---|---|
| JPEG XMP + IPTC-IIM write + read | `src/lib/upload/jpeg.ts` | `embedXmpMetadata` (APP1 XMP + APP13 IPTC-IIM), `readXmpMetadata`, `readIptcMetadata`, `verifyJpeg` (checks both carriers) |
| EPS XMP + IPTC-IIM write + read | `src/lib/upload/epsmetadata.ts` | `embedXmpMetadataInEps` (pdfmark XMP + hex-comment IPTC-IIM), `readXmpMetadataFromEps`, `readIptcMetadataFromEps`, `verifyEpsMetadata` (either carrier sufficient) |
| SVG XMP write + read | `src/lib/upload/embed.ts` | `embedMetadataInSvg`, `readEmbeddedMetadata` |
| End-to-end export | `src/upload/runexport.ts` | `runExport` over a fake folder, commits JPEG+EPS+SVG |
| Fake binary FS | `tests/helpers/binfakefs.ts` | `BinDir`/`BinFile` — byte-exact JPEG round-trip |
| Test assets | `tests/assets/SVG to JPEG or EPS export tests/` | 2 SVG source files |
| Test webpage (metadata reader) | `tests/assets/SVG to JPEG or EPS export tests/read-exported-metadata.html` | loads JPEG/EPS, displays Title/Description/Tags |
| Adobe Stock simulation page | `tests/assets/SVG to JPEG or EPS export tests/adobe-stock-upload.html` | stock-site-style upload flow with metadata read-back |
| Tests | `tests/upload-metadata-export.test.ts` | end-to-end export → JPEG/EPS → read back metadata, incl. webpage-logic replication |

## Test assets (2 SVG source files)

| File | Intended export | Test metadata (temp words; tags include the 7 mandatory terms) |
|---|---|---|
| `source-for-jpeg.svg` | JPEG | title: `Test icon for JPEG export`; description: `A minimal line icon used to verify JPEG metadata`; tags: `icon, pictogram, vector, stroke, line, editable, web, jpeg, test, metadata` |
| `source-for-eps.svg` | EPS | title: `Test icon for EPS export`; description: `A minimal line icon used to verify EPS metadata`; tags: `icon, pictogram, vector, stroke, line, editable, web, eps, test, metadata` |

Each SVG is a simple `<svg viewBox="0 0 24 24">` with stroked geometry — inside the EPS subset and JPEG-renderable.

## Test webpages

**`read-exported-metadata.html`** — lightweight metadata reader. Choose an exported
`.jpg`/`.jpeg`/`.eps` file; it parses the XMP (JPEG: APP1 segment after SOI; EPS:
xpacket in the pdfmark stream) and displays Title, Description and Tags.

**`adobe-stock-upload.html`** — Adobe Stock upload simulation. Same parsing logic,
plus a "Continue to submit" button enabled only when metadata is readable, an alert
showing exactly what the stock site would receive, and clear success/warning states.
Both pages are dependency-free (plain DOM + `TextDecoder`/`TextEncoder`), open
directly in a browser, need no build step.

## Test steps (automated)

For each of the 2 SVG assets:

1. Build a fake folder containing the SVG source + its approved sidecar (as `runExport` expects).
2. Call `runExport` with accepted metadata and `includeEps: true`, using a fake raster that encodes a real minimal JPEG of the target size.
3. Assert status `processed` and outputs `{ svg, jpg, eps }` all present.
4. Read the committed JPEG bytes; `readXmpMetadata(jpeg)` and `readIptcMetadata(jpeg)` must each equal the test metadata; `verifyJpeg(...).ok` must be true (both carriers checked).
5. Read the committed EPS text; `readXmpMetadataFromEps(eps)` and `readIptcMetadataFromEps(eps)` must each equal the test metadata; `verifyEpsMetadata(eps, meta)` must be true (either carrier sufficient).
6. Replicate the webpage's exact XMP parsing (raw APP1 segment scan for JPEG; raw xpacket scan for EPS) against the committed bytes — asserts the webpages will read the metadata correctly.
7. Negative cases: JPEG without XMP → null; EPS without XMP → null.
8. (Metadata edit) Re-export with a changed title; assert the JPEG and EPS read back the **edited** title without re-rendering.

## Verification

* `npx tsc --noEmit` — clean.
* `npm run lint` — 0 errors in touched files.
* `npm run quality:changed` — gate passed.
* New vitest suite `tests/upload-metadata-export.test.ts` — green (7 tests).
* Full upload suite stays green (835 tests, 63 files, no regressions).
* The HTML test webpages open in a browser and display Title/Description/Tags when an exported JPEG/EPS is chosen.
