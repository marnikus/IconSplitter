# Stock-readable JPEG/EPS metadata — understanding and implementation plan

## Understanding (written before implementation)

Accepted Title, Description and Tags must travel INSIDE each exported JPEG and
EPS, not only in export.json or an app cache. A website receiving the file alone
must be able to extract them. SVG already embeds RDF/DC metadata and must retain
that behavior. This is local file processing, not a provider request.

Existing exports already have XMP APP1 (JPEG) and an Adobe document-level XMP
stream (EPS). The compatibility gap is legacy IPTC-IIM, commonly extracted by
stock importers. Also the incremental planner probes SVG/EPS metadata but not
JPEG, so a stripped or old JPEG can be reused without repair.

User additionally requests a test webpage: upload an exported JPEG or EPS and
show Title, Description and Tags extracted from the file. Use the two SVGs in
`tests/assets/SVG to JPEG or EPS export tests` and arbitrary temporary metadata.
**Fixture availability:** that folder and the two SVGs are absent in this checkout
at planning time. Do not pretend synthetic drawings are the user's files.
The page and tests will accept these files when supplied; synthetic supplementary
fixtures test the implementation in the meantime. Record pending acceptance.

## Plan / steps

1. Add failing format tests for UTF-8 IPTC datasets and Photoshop resource blocks
   in JPEG APP13 and EPS `%%BeginPhotoshop` hex comments. Retain full XMP values,
   metadata order and immutable image/artwork bytes. Cover updates, corruption,
   segment sizes, unrelated metadata preservation and bounded legacy fields.
2. Share an IPTC-IIM/Photoshop encoder/reader across both carriers. Encode UTF-8
   explicitly (1:90); Title → ObjectName (2:5) and Headline (2:105), Description
   → Caption-Abstract (2:120), each Tag → repeated Keywords (2:25). Legacy byte
   limits apply ONLY to compatibility copies; full accepted fields remain in XMP.
3. Integrate both carriers into real export/validation/atomic readback. Preserve
   strict EPS no-raster grammar; metadata comments must never become an opaque
   raster/program bypass. Keep existing XMP APIs compatible.
4. Probe JPEG metadata too. Upgrade old XMP-only or stripped exports by embedding
   metadata in existing JPEG bytes, never AI calls or unnecessary rasterization;
   regenerate only the affected EPS. No unchanged-file rewrite.
5. Add a standalone local upload/readback webpage in the requested asset folder.
   Its independent test reader imports NO production metadata writers/readers;
   it reads only selected file bytes, never sidecars or expected test metadata.
   Show filename, detected type, carrier and extracted Title/Description/Tags;
   malformed, unsupported and missing metadata are explicit errors. No network,
   no PostScript/SVG execution, no HTML interpolation of metadata.
6. Test exported committed JPEG/EPS files through the page's actual file input,
   including Unicode/escaping, repeat uploads and error replacement. Fixture
   integration discovers the two supplied SVGs when present and documents their
   absence otherwise. Supplementary synthetic tests are clearly labeled.
7. Independently inspect exported bytes with ExifTool if available, update owning
   docs, run focused/types/lint/quality/fast/full verification, append measured
   ledger entry without reading it, commit/push scoped files excluding dist.

## Acceptance / limitations

- Normal stock-sized fields read identically from XMP AND IPTC in both files.
- Long Unicode fields remain exact in XMP; legacy mirrors are UTF-8-safe prefixes
  within IIM limits (ObjectName 64, Headline 256, Caption 2000, Keyword 64 bytes).
- No claim that every stock site imports every field: site-specific importers,
  upload workflows and manual review remain outside this app. No live stock
  upload is needed or authorized for local verification.
- SVG stays self-describing; EPS stays strictly vector-only. No EXIF dependency,
  standalone converter application, production dependency or metadata sidecar
  is required by the exported JPEG/EPS.

## Results

Implemented steps 1–7. JPEG exports now embed XMP APP1 **and** UTF-8 IPTC
Photoshop APP13. EPS exports keep their canonical XMP/pdfmark stream and carry
the same IPTC resource as hex comments, with no executable/raster addition.
Shared IIM/resource/byte helpers avoid duplicating format logic. Re-embedding
preserves pixel scan bytes, EXIF/ICC and unrelated Photoshop resources. Full
accepted text remains in XMP; only legacy compatibility copies have byte limits.

The planner probes JPEG metadata as well as SVG/EPS. A stripped or legacy
XMP-only JPEG is re-embedded from existing bytes without render or model calls;
old EPS metadata is upgraded independently. Intact files remain untouched and
an unchanged subsequent run has no stages. Both carriers validate before and
on atomic delivery readback. Canonical EPS metadata verification remains
strict, and unverified Photoshop opaque blocks are rejected.

### Verification

- TDD: JPEG/EPS compatibility assertions failed before wiring the carriers;
  two real-runner JPEG repair tests failed before changing the planner. The
  independent page suite could not load its not-yet-created modules, then
  exposed an XML namespace lookup incompatibility in the happy-dom harness;
  namespace-aware element traversal now works in both harness and Chromium.
- Final focused run: **129 passed + 1 skipped in 8 files**. New coverage includes
  Unicode, XML/HTML escaping, long fields, duplicate/update/idempotence,
  unrelated APP resources and pixel scan preservation, malformed/oversized
  segments, LF/CRLF/CR, tampered EPS metadata and metadata-only reuse repair.
- **`npm run verify:fast`: all five lanes passed.**
- **`npm run verify`: ALL SIX LANES PASSED.** Types **14.6 s**, lint **11.0 s**,
  changed quality **0.7 s**, native performance **2.6 s**, coverage **174.1 s**,
  build **7.0 s**. **2451 passed, 1 skipped, 230 test files**. Library line
  coverage **97.96%** (up from 97.81%). All six new library modules have **100%
  lines and functions covered**. No thresholds were weakened.
- The standalone page's actual file input receives committed JPEG/EPS bytes in
  automated tests. The reader imports no production metadata code; it extracts
  both carriers separately. Missing/invalid metadata, later uploads, and long
  XMP vs bounded IIM are tested.
- Independent optional probe: real SVG rasterization with Resvg **2.6.2** and
  JPEG encoding/decoding with `jpeg-js` **0.4.4**, injected as the pipeline's
  transport, exported two clearly labeled supplementary SVGs. All four actual
  committed files (two JPEG + two EPS) passed a **Chromium 153** HTTP page upload
  through Playwright, with exact Title/Description/Tags and both carriers,
  bad-file replacement, no page errors and no horizontal overflow at 390 px.
  Browser dependencies and artifacts stayed in `/tmp`, not the repo. Initial
  Chromium launch needed its bundled NSS/NSPR libraries extracted; the final
  probe passed with those bundled libraries.
- **ExifTool 13.59**, independent parser, extracted XMP Title/Description/Subject
  and IPTC ObjectName/Headline/Caption-Abstract/Keywords from all four files;
  every field and ordered keyword list matched the expected temporary metadata,
  including Unicode; CodedCharacterSet read UTF8. Source checkout SHA
  `2200871d9cef988051d2a99d67df3bda6cbb30a8`.
- **Ghostscript 9.56.0** independently executed both EPS outputs with image,
  colorimage and imagemask trapped: exit **0** for both, no raster execution.
- Current contract/owners/tests/handles/router updated in the same change;
  generated dist remains excluded. No production or repository dependency added.

### Remaining user-fixture acceptance

The exact two SVGs at the user's Windows-relative path are **still absent** in
this checkout. This is the one explicitly skipped acceptance case, not a passing
substitute. The implementation and independent probes use labeled supplementary
fixtures only. Add the two actual `.svg` files to
`tests/assets/SVG to JPEG or EPS export tests/`; the suite automatically exports
both formats and uploads their committed bytes to the test page. The real
stock site's ingestion still requires that site's own workflow check.
