# SVG to upload — verify accepted metadata in reusable outputs

Status: implemented after TDD on 2026-10-09.

## Report and root cause

A newly exported EPS was reported without XMP (`%%DocumentData: Clean7Bit`, no
`%ADO_ContainsXMP: MainFirst`, packet, or pdfmark blocks); the output SVG also
lacked its accepted Title, Description, and Tags. The writer and SVG embed stages
already insert metadata when accepted metadata reaches them. The planner's
no-op path, however, checked only whether the three output handles existed. A
committed record with the same source/settings/metadata fingerprints could thus
reuse an older or damaged SVG/EPS indefinitely, with no output readback.

The regression test reproduced this before the fix: it committed accepted
metadata, replaced the SVG with metadata-free source text and the EPS with a
`Clean7Bit` document, retained the matching `export.json`, and the next run
returned `stages: []`.

## Decisions

1. When an existing record's metadata fingerprint matches the currently
   accepted metadata, inspect the existing export SVG and (only when requested)
   EPS. A readback counts as valid only when Title, Description, and Tags match
   exactly. Missing, unreadable, malformed, or mismatched metadata means that
   artifact is stale.
2. `src/upload/exportmetadata.ts` owns the narrow readback probe used by the
   planner. Rebuild only the stale SVG and/or requested EPS. The SVG path
   prepares and embeds without rasterizing; EPS reconverts from the optimized
   SVG and embeds the same accepted XMP. Never rebuild or re-embed the JPEG as a
   side effect of repairing SVG/EPS metadata. An ordinary accepted-metadata edit
   retains its existing behavior: it re-embeds the SVG and JPEG, and the
   requested EPS.
3. If the current metadata fingerprint differs from the record, let the existing
   metadata-delta planner handle it; do not mistake the expected old packet for
   a damaged artifact. If accepted metadata is absent, do not infer or copy
   metadata from source files.
4. Put relative filesystem reads in `src/lib/fs.ts`, their existing adapter
   owner; use the shared `readBytesAt` from export commit, render reuse, download,
   and row assembly instead of duplicate reads or imports from `runexport.ts`.

## TDD and scope

- First add the end-to-end stale-artifact regression to
  `tests/upload_runexport.test.ts`; observe the no-op failure before production
  changes.
- Cover planner outcomes for SVG-only, EPS-only, and both stale metadata flags;
  assert JPEG is not marked for rebuild.
- Test shared filesystem reads for present, missing, and unreadable files.
- Keep JPEG metadata writing, JPEG readback, metadata packet format, record
  schema, and accepted-metadata sourcing unchanged.

## Verification

The end-to-end regression must read back exact metadata from both repaired
artifacts, assert no raster render, and compare the JPEG bytes before/after. Run
the focused export/filesystem suites, then `npm run verify`; recheck RULE 16 and
RULE 18 and append the outcome to `docs/current/QUALITY_RECHECK.md`.
