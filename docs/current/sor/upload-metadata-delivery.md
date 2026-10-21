# Metadata embedded in JPEG and EPS at export — plan and steps

## Problem

When the user exports icons for stock upload (the **SVG to upload** tab), the accepted metadata — **Title, Description, Tags** — must travel *inside* the delivered files, not only in `export.json`. When the image, the SVG or the EPS is then uploaded to a stock website, the stock site must be able to read the metadata straight from the file: from the **EPS** at upload, or from the **JPEG** likewise.

## Requirement (acceptance)

1. On export, the accepted Title, Description and Tags are written **directly into the JPEG image** — not a sidecar, not the record only.
2. On export, the same three fields are written **directly into the EPS file**.
3. The SVG carries the same metadata as well (`<title>`, `<desc>`, Dublin Core `<metadata>`).
4. Each output's metadata is **read back and verified** before the export is committed; a mismatch fails the stage, never ships silently.
5. A metadata-only edit re-embeds the JPEG and refreshes the EPS with **no AI call and no re-render**.
6. Delivery is atomic: `tmp → verify → overwrite → cleanup`, `export.json` written last as the commit marker.

## Design decisions

| Decision | Reason |
|---|---|
| Single carrier: XMP, Dublin Core vocabulary (`dc:title`, `dc:description`, `dc:subject` as an `rdf:Bag`) | The modern, stock-site-readable carrier; one packet shared by JPEG and EPS so both read back identically |
| JPEG: XMP packet as the first `APP1` segment after `SOI` (id `http://ns.adobe.com/xap/1.0\0`), idempotent re-embed | Standard JPEG metadata container; re-embedding replaces any previous packet, never duplicates |
| EPS: XMP packet as a pdfmark metadata stream (`%ADO_ContainsXMP: MainFirst`, `%%DocumentData: Clean8Bit`, bracketed by `BDC`/`EMC` around the drawing) | Adobe XMP Part 3 §1.6.2.1.3 embedding for EPS; converter-neutral — works for the built-in writer and Inkscape output alike |
| Write-then-verify: readback of Title/Description/Tags from the bytes before commit | Stock sites read the file, so the file must provably contain what was accepted |
| Selective re-export: metadata change touches only `embed` + `eps` stages | No re-render, no provider call, untouched outputs keep their bytes |

## Where it lives — implementation map

| Requirement | File | Function / stage |
|---|---|---|
| Shared XMP packet (title, description, tags) | `src/lib/upload/xmp.ts` | `buildXmpPacket`, `readXmpPacket` |
| Metadata written **into the JPEG** | `src/lib/upload/jpeg.ts` | `embedXmpMetadata`, `readXmpMetadata`, `verifyJpeg` |
| Metadata written **into the EPS** | `src/lib/upload/epsmetadata.ts` | `embedXmpMetadataInEps`, `readXmpMetadataFromEps`, `verifyEpsMetadata` |
| Metadata written **into the SVG** | `src/lib/upload/embed.ts` | `embedMetadataInSvg`, `readEmbeddedMetadata` |
| Embed JPEG + EPS during export | `src/upload/exportstages.ts` | `buildJpegArtifact`, `buildEps` |
| Readback gates before commit | `src/upload/exportvalidate.ts` | `validateArtifacts` (`jpeg`, `eps`, `readback`) |
| Atomic commit with readback verify | `src/upload/exportcommit.ts` | `commitExport` (`jpegVerifies`, `epsVerifies`) |
| Selective re-export on metadata edit | `src/lib/upload/exportplan.ts` | `planStages` (`planMetadataDelta`) |
| Record: metadata block + fingerprint | `src/lib/upload/export.ts`, `src/upload/exportrecord.ts` | `metadataBlock`, `metadataBlockOf` |

## Verification steps

1. Generate/accept metadata for an icon in the **SVG to upload** tab (provider request only on explicit confirmation).
2. Switch **EPS** on in the Export settings and choose a converter (`builtin` or Inkscape helper).
3. Export the icon. The committed package contains `<stem>.jpg` with an XMP `APP1` segment and `<stem>.eps` with an XMP pdfmark stream; `export.json` names both and records `validation.jpeg`, `validation.eps`, `validation.readback`.
4. Read the metadata back from the file: `readXmpMetadata(jpeg)` for the JPEG, `readXmpMetadataFromEps(eps)` for the EPS — both return the accepted Title, Description, Tags.
5. Upload the JPEG, SVG or EPS to a stock site: the site reads the fields from the file's XMP (EPS: pdfmark stream; JPEG: APP1 segment; SVG: `<metadata>` RDF block).

## Test coverage

- `tests/upload_jpeg.test.ts` — JPEG XMP embed/read round-trip, idempotency, `verifyJpeg` (SOI/EOI, dimensions, XMP readback)
- `tests/upload_epsmetadata.test.ts` — EPS XMP embed/read, `verifyEpsMetadata`
- `tests/upload_export.test.ts` — `planStages`: metadata edit re-embeds SVG+JPEG (+EPS when requested) without render; missing SVG/EPS metadata repaired without touching the JPEG
- `tests/upload_runexport.test.ts` — end-to-end: JPEG XMP readback verified at commit, EPS XMP readback after conversion, metadata edit updates EPS XMP without rendering, SVG readback

All upload tests pass (824 tests, 61 files) at the current HEAD; the feature is **implemented and green — no code gap found**. This document records the plan and its implementation; no new code is required. If the embedding behaviour needs to change (carrier, fields, or gate), that change goes through the files in the implementation map above with TDD (red test → implement → green) and the usual verify gates before push.
