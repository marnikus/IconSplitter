# Local JPEG / EPS metadata upload test

## Open the page

From the repository root, run:

```sh
python3 -m http.server 4173 --bind 0.0.0.0 --directory "tests/assets/SVG to JPEG or EPS export tests"
```

Open the server's address in a browser (locally `http://localhost:4173`). Or run
`npm run dev -- --host 0.0.0.0` and visit
`/tests/assets/SVG%20to%20JPEG%20or%20EPS%20export%20tests/` on that server.
Use HTTP: browsers generally block ES modules opened through `file://`.
The Python server serves static files only; selecting a JPEG/EPS never sends it
to that server. No provider or stock-site requests are made.

1. Export an approved SVG in **SVG to upload**, with accepted Title,
   Description and Tags, and **Include EPS** enabled.
2. On this test page choose its exported `.jpg` and `.eps`, together or one at
   a time. The file name, type, metadata carriers and all three fields appear.
3. Check the **IPTC compatibility copy** detail too. No `export.json`, cache,
   original SVG or expected metadata is supplied to this reader.
4. Repeat with the other SVG. A bad/metadata-free file shows an error instead
   of a previous file's values. File size is limited to 50 MB per file.

This is an independent test reader, not an uploader to a real stock site and
not an EPS interpreter. It never executes PostScript or inserts metadata as
HTML. Files remain in the browser. XMP carries complete fields; legacy IIM
copies use UTF-8 byte limits (Title ObjectName 64 / Headline 256, Description
2000, each keyword 64). Actual stock import behavior varies by site.

## The two supplied source files

The user's fixture commit supplies these exact originals (kept unchanged):

- `icon-handshake-heart_7_03_v2.svg`
- `icon-handshake-heart_7_01_v2.eps`

`tests/upload_metadata_page.test.ts` exports the actual supplied SVG through
both JPEG **and** EPS, commits the outputs and supplies their bytes as `File`s
to this page's actual input event. It also embeds temporary metadata into the
actual supplied EPS using the production EPS writer, verifies the executable
vector artwork is unchanged, and uploads that result to the same page. The
fixture inventory is asserted; there is no missing-fixture skip. The original
EPS has no metadata, so uploading THAT original instead of a newly embedded
export correctly reports missing fields.

As in other repository pipeline tests, the automated raster transport is
injected: this tests metadata and delivery rather than fixture pixel fidelity.
Separate independent acceptance probes use the actual supplied SVG with a
real Resvg/JPEG codec, then upload its actual JPEG/EPS (and the supplied EPS
with embedded metadata) through Chromium. Two labeled synthetic helper SVGs
provide additional edge-case coverage, not substitute acceptance.

```sh
npx vitest run tests/upload_metadata_page.test.ts tests/upload_stockmetadata.test.ts tests/upload_stockrepair.test.ts
```

Temporary test text uses "Temporary community & café test icon", a Unicode
description and 10 keywords. No model call is needed. `reader.mjs` and
`page.mjs` import no production metadata writers or readers. The automated test
checks XMP and IPTC independently, not merely the displayed preferred fields.

Adobe saved-page regression and opt-in LIVE upload validation (local reader is not Adobe acceptance): [validation guide](../../../../docs/current/sor/upload-adobe-validation.md).
