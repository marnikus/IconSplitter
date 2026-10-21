# Metadata written to JPEG and EPS at export — test plan and steps

## Problem

When the user exports icons for stock upload (the **SVG to upload** tab), the accepted
metadata — Title, Description, Tags — must be written **directly into** the exported
JPEG (XMP APP1 segment) and the exported EPS (XMP pdfmark stream), so that when the
file is uploaded to a stock website the stock reader can read the metadata straight
from the file itself — from the EPS at upload, or from the JPEG likewise.

The library writers (`src/lib/upload/jpeg.ts`, `src/lib/upload/epsmetadata.ts`,
`src/lib/upload/embed.ts`) and the end-to-end pipeline (`src/upload/runexport.ts`,
`src/upload/exportstages.ts`, `src/upload/exportcommit.ts`) already implement this.
What is missing is **verifiable end-to-end evidence**:

1. No SVG **test assets** exist that get exported end-to-end to JPEG and EPS with
   known Title/Description/Tags.
2. No **test webpage** exists where an exported JPEG or EPS file can be loaded and
   its Title / Description / Tags read back from the file and displayed.
3. No dedicated tests exercise the full "SVG source → export → JPEG+EPS with
   readable metadata → read back from file" flow using those assets.

This change adds exactly that: test assets, a test webpage, and tests.

## Requirement (acceptance)

1. Two SVG source files live under `tests/assets/SVG to JPEG or EPS export tests/`,
   each a valid minimal icon SVG to be exported to JPEG and EPS respectively.
2. A test webpage loads an exported JPEG or EPS file (file input), parses its XMP
   metadata, and displays **Title, Description and Tags** read straight from the file.
3. Vitest tests export each SVG asset to JPEG and EPS through the real pipeline
   (with accepted metadata), then read the metadata back from the committed file
   bytes and assert Title/Description/Tags match the test values.
4. JPEG read-back uses the XMP APP1 segment; EPS read-back uses the XMP pdfmark
   stream. Both must return exactly the accepted fields.

## Implementation map

| Piece | Path | What it does |
|---|---|---|
| JPEG XMP write + read | `src/lib/upload/jpeg.ts` | `embedXmpMetadata`, `readXmpMetadata`, `verifyJpeg` |
| EPS XMP write + read | `src/lib/upload/epsmetadata.ts` | `embedXmpMetadataInEps`, `readXmpMetadataFromEps`, `verifyEpsMetadata` |
| SVG XMP write + read | `src/lib/upload/embed.ts` | `embedMetadataInSvg`, `readEmbeddedMetadata` |
| End-to-end export | `src/upload/runexport.ts` | `runExport` over a fake folder, commits JPEG+EPS+SVG |
| Fake binary FS | `tests/helpers/binfakefs.ts` | `BinDir`/`BinFile` — byte-exact JPEG round-trip |
| Test assets | `tests/assets/SVG to JPEG or EPS export tests/` | 2 SVG source files |
| Test webpage | `tests/assets/SVG to JPEG or EPS export tests/read-exported-metadata.html` | loads JPEG/EPS, displays Title/Description/Tags |
| Tests | `tests/upload-metadata-export.test.ts` | end-to-end export → JPEG/EPS → read back metadata |

## Test assets (2 SVG source files)

| File | Intended export | Test metadata (temp words; tags include the 7 mandatory terms) |
|---|---|---|
| `source-for-jpeg.svg` | JPEG | title: `Test icon for JPEG export`; description: `A minimal line icon used to verify JPEG metadata`; tags: `icon, pictogram, vector, stroke, line, editable, web, jpeg, test, metadata` |
| `source-for-eps.svg` | EPS | title: `Test icon for EPS export`; description: `A minimal line icon used to verify EPS metadata`; tags: `icon, pictogram, vector, stroke, line, editable, web, eps, test, metadata` |

Each SVG is a simple `<svg viewBox="0 0 24 24">` with a single stroked path — inside the EPS subset and JPEG-renderable.

## Test webpage

`read-exported-metadata.html` — a single self-contained HTML page:

* File `<input accept=".jpg,.jpeg,.eps">` to choose an exported file.
* On choose, read the file bytes and parse XMP:
  * JPEG: find the `APP1` segment after `SOI` carrying the XMP id (`http://ns.adobe.com/xap/1.0\0`), extract the packet XML, read `dc:title`, `dc:description`, `dc:subject`/`rdf:li`.
  * EPS: find the `<?xpacket ... ?>` XMP packet inside the pdfmark stream, read the same three Dublin Core fields.
* Display **Title**, **Description**, **Tags** (comma-joined) read straight from the file — proving the stock-site reader can get them from the uploaded file itself.
* A "clear" button and a "no metadata found" state.

The page is dependency-free (plain DOM + `TextDecoder`/`TextEncoder`), so it opens directly in a browser and needs no build step.

## Test steps (automated)

For each of the 2 SVG assets:

1. Build a fake folder containing the SVG source + its approved sidecar (as `runExport` expects).
2. Call `runExport` with accepted metadata (Title/Description/Tags from the table above) and `includeEps: true`, using a fake raster that encodes a real minimal JPEG of the target size.
3. Assert status `processed` and outputs `{ svg, jpg, eps }` all present.
4. Read the committed JPEG bytes; `readXmpMetadata(jpeg)` must equal the test metadata; `verifyJpeg(...).ok` must be true.
5. Read the committed EPS text; `readXmpMetadataFromEps(eps)` must equal the test metadata; `verifyEpsMetadata(eps, meta)` must be true.
6. (Metadata edit) Re-export with a changed title; assert the JPEG and EPS read back the **edited** title without re-rendering.

## Verification

* `npx tsc --noEmit` — clean.
* `npm run lint` — 0 errors in touched files.
* `npm run quality:changed` — gate passed.
* New vitest suite `tests/upload-metadata-export.test.ts` — green.
* Full upload suite stays green (no regressions).
* The HTML test webpage opens in a browser and displays Title/Description/Tags when an exported JPEG/EPS is chosen.
