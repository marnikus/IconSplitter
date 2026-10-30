# JPEG/EPS XMP + IPTC-IIM protocol contract — plan before implementation

## Understanding

The user explicitly requires the XMP and IPTC-IIM protocols in BOTH exports,
listing Title, Description, Keywords and the optional IPTC Creator/Copyright.
JPEG APP1 (FFE1) must have `http://ns.adobe.com/xap/1.0/\0`; APP13 (FFED)
carries Photoshop 3.0 image resources with IPTC-IIM resource0404. Those marker
bytes belong to JPEG, NOT EPS. EPS uses document-level XMP/pdfmark and Photoshop
hex resource comments. Current writers already embed the three core fields in
both formats. Do not pretend they did not, or put JPEG markers into EPS.

## Implementation steps

1. Add failing byte-protocol and actual-export tests: JPEG APP1 exact identifier,
   APP13 Photoshop/8BIM/resource0404; EPS resources0404 (IPTC) and0424 (XMP)
   alongside its canonical document-level XMP. Assert real IIM dataset IDs,
   UTF8 charset, all core fields and optional user-provided Creator/Copyright.
2. Extend the metadata domain with optional creator/copyright, editable under
   each row's metadata fields. Never generate authorship or copyright claims.
   Preserve these fields in accepted cache/export record/reload/fingerprints;
   absent/blank optional fields retain historical fingerprints.
3. Use one shared XMP packet and one shared IIM encoder in both carriers.
   Creator -> dc:creator Seq and IIM2:80 (32bytes); Copyright -> dc:rights Alt
   and IIM2:116 (128bytes). Keep full values in XMP; legacy limits only in IIM.
   Add EPS Photoshop XMP resource0424, keeping the document stream too.
4. Verify all provided fields before/after commit and before cached reuse.
   Fix SVG keyword readback to scope its list to dc:subject so optional creator
   entries cannot become tags. Preserve full metadata in SVG as well.
5. Add UI/persistence/update/clearing/corruption tests, use the actual supplied
   SVG and EPS, independent ExifTool/renderer probes where available. Keep
   strict EPS vector-only canonical-envelope validation and pixel preservation.
6. Update owning docs/handles/tests, run fast/full gates, append measured ledger
   without reading it, commit/push only scoped files (not dist).

## Acceptance boundary

Protocol conformance and independent readback are locally checkable. No claim
that this resolves the unobserved Adobe import problem without a new live
Adobe upload. Creator/Copyright must be supplied by the user, never invented.

## Results

Implemented and verified on 2026-10-22. Existing three-field XMP/IIM support in
BOTH formats was preserved; missing optional identity and EPS XMP IRB support
were added, not misrepresented as a previously JPEG-only implementation.

- TDD: first 7 carrier/lifecycle/UI tests failed, then passed. Independent
  reader and regeneration identity tests additionally failed before their fixes.
- Focused protocol/domain/cache/export/page suite: 102/102 across 8 files.
- Fast gate: all 5 lanes passed; full sequential gate: all 6 lanes passed,
  2479 tests / 233 files, overall line coverage 97.99%. Full lane timings:
  types14.5s, lint11.4s, quality0.7s, native2.6s, coverage183.6s, build7.1s.
- One earlier full attempt incorrectly overlapped the fast gate: coverage lock
  and native timing failure. Not counted as success; sequential full rerun
  passed unchanged budgets. No tests/thresholds were weakened.
- Independent current-source exports: actual user SVG -> real Resvg/JPEG
  render/encode/decode and EPS through real commit pipeline; original supplied
  EPS -> canonical metadata embedding. Two supplemental artwork variants too.
- ExifTool13.59 independently read all five fields exactly in BOTH XMP and IIM
  from 7 JPEG/EPS files. Ghostscript9.56 executed all4 EPS with image/colorimage/
  imagemask guards (exit0, no raster guard hit). Original EPS issued only its
  existing page clipping/BoundingBox warning.
- Headless Chromium uploaded those7 files to the local independent test page;
  both protocols/all5 fields exact, corrupt replacement clears stale fields,
  390px viewport has no overflow, no page errors. This is NOT Adobe ingestion.
- Plan, ownership/selector docs and tests updated; generated dist, dependencies,
  temporary probe scripts/artifacts and supplied artwork remain out of commit.

Live Adobe ingestion: NOT RUN. This change does not establish that the reported
Adobe import failure is resolved; that still requires a fresh authenticated
upload of the exact failing exported bytes using the existing live validator.
