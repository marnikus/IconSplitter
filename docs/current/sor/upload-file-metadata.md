# Embedded metadata in stock export files

[Upload](upload.md) · [Export validation](upload-export.md) ·
[Metadata acceptance](upload-metadata.md)

## File contract

Only accepted metadata is exported. Title, Description and Tags are written
INSIDE each file; no sidecar, app state or stock upload request is required.
SVG retains its existing RDF/DC metadata. JPEG and EPS each contain TWO carriers:

| Accepted field | Full XMP | Legacy IPTC-IIM (UTF-8 bytes) |
|---|---|---|
| Title | `dc:title`, `rdf:Alt`, `x-default` | ObjectName 2:5 (64), Headline 2:105 (256) |
| Description | `dc:description`, `rdf:Alt`, `x-default` | Caption-Abstract 2:120 (2000) |
| Tags | ordered `dc:subject` Bag | repeated Keywords 2:25 (64 per tag) |

IIM explicitly declares UTF-8 via CodedCharacterSet 1:90 (`ESC % G`) and record
version 4. Compatibility copies are Unicode-code-point-safe prefixes within
legacy field ceilings; full accepted values are ALWAYS kept exactly in XMP.
No acceptance-policy ceiling is added. Keywords retain their order. A JPEG
metadata segment exceeding 65533 bytes fails export honestly instead of
wrapping its length or silently discarding fields.

JPEG uses standard XMP APP1 and Photoshop 3.0 APP13 containing resource 0x0404.
Re-embedding replaces existing XMP/IPTC instead of duplicating; unrelated EXIF,
ICC, non-Photoshop APP13 and non-IPTC Photoshop resources survive. Stale IPTC
digest resources are removed. Parsing stops at SOS; compressed scan bytes are
never scanned for markers or altered. Metadata edits do not re-encode pixels.

EPS retains Adobe's document-level XMP stream/pdfmarks and adds a Photoshop
resource in ASCII-hex `%%BeginPhotoshop: 6` / `%%EndPhotoshop` comments. No raster
preview is added. The vector-only verifier removes ONLY a byte-for-byte
canonical generated metadata envelope before auditing executable artwork;
modified envelopes and other opaque Photoshop blocks fail closed. LF/CRLF/CR
are supported. Download all continues to copy these committed file bytes.

## Incremental repair and validation

When accepted metadata fingerprints match, the planner probes ALL existing
outputs, not merely export.json: SVG RDF, JPEG XMP + IPTC, requested EPS XMP +
IPTC. Old XMP-only, stripped or mismatched JPEGs are re-embedded from existing
bytes (embed/validate/commit only, no AI or raster render); only the affected
EPS is regenerated. An intact JPEG is not rewritten to repair SVG/EPS. No
change → no work. Metadata edits still update all enabled outputs.

Both metadata carriers are verified before delivery and on temporary/final
committed readback. XMP must equal accepted fields exactly; IIM must equal their
legacy projection. No metadata is invented for a run without accepted fields.
Embedding/delivery remains entirely in-browser.

Each stock site controls which formats/carriers/fields it imports. The app
cannot guarantee a particular site's automatic ingestion or bypass its review.
Use that site's JPEG/EPS workflow and verify its upload form. A local readback
is evidence about the FILE, not proof of acceptance by every stock service.

## Independent upload test page

`tests/assets/SVG to JPEG or EPS export tests/index.html` is a standalone,
static local page; its adjacent README gives HTTP launch instructions. Select
an exported JPEG/EPS (multiple allowed): it displays file name/type, carriers,
Title, Description and Tags, plus the legacy IPTC copy. Reads file bytes only,
never caches/sidecars/expected values. No network upload or EPS execution.
Unknown, corrupt, missing-metadata and >50 MB files show explicit errors;
new selection replaces old results. All text uses `textContent`, not HTML.

Handles: `#files` (`input[type=file]`, multiple), `#results` (`aria-live=polite`),
`article[data-state=reading|ready|error]`, `[data-field=title|description|tags]`;
legacy fields live inside `details`, the main canonical fields precede it.

The supplied fixtures are `icon-handshake-heart_7_03_v2.svg` and
`icon-handshake-heart_7_01_v2.eps`, preserved unchanged in that folder.
`upload_metadata_page.test.ts` exports the supplied SVG to BOTH JPEG and EPS
and uploads committed bytes through the real input event. It also embeds the
same temporary metadata into the supplied EPS, verifies its vector program
is unchanged and uploads the result. Fixture inventory is asserted; no skip.
Synthetic supplementary fixtures remain labeled. Automated tests inject the
raster transport; independent acceptance also uses real Resvg/JPEG encoding
and a Chromium file upload with the actual supplied artwork.

## Owners and tests

- Shared IIM and byte/resource rules: `lib/upload/{iptc,photoshop,metadatabytes}.ts`.
- JPEG carriers: `lib/upload/{jpeg,jpegiptc,jpegmarkers}.ts`.
- EPS carriers/envelope audit: `lib/upload/{epsmetadata,epsiptc,epscheck}.ts`.
- Reuse probes/plans: `upload/exportmetadata.ts`, `lib/upload/exportplan.ts`;
  build/validate/atomic readback remain in `upload/export{stages,validate,commit}`.
- `upload_stockmetadata.test.ts`: both carriers, bounds, update/idempotence,
  Unicode, unrelated-resource/pixel-byte preservation, malformed lengths,
  raster/program rejection, EOL variants and segment limits.
- `upload_stockrepair.test.ts`: old JPEG/EPS repair, mismatches, no redundant
  renders/rewrites and no-work reuse after repair.
- Independent test page reader/UI: `reader.mjs`, `page.mjs` beside the HTML;
  `upload_metadata_page.test.ts` exercises actual exported file uploads,
  escaping, long fields, carrier fallbacks, errors and fixture discovery.
