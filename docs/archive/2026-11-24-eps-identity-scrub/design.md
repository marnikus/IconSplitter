# No Programmatic Names, Hashes or Fake Illustrator Comments in Exports (2026-11-24)

## User mandate (extends RULE 26)

A shipped EPS was read back by a reviewer as the output of a batch script:

```
%%Title: icon-sheet_sheet_14_icons_orange_black_palette_id48996_v1.eps
%%BoundingBox: 0 0 6223 2571
%AI5_ArtSize: 2570.328 6223
...
/MetadataDict_dd3a80ee4442f029 8 dict def
```

* **Programmatic naming & hashing** — the internal work name (template, sheet
  index, palette, id, version) in `%%Title`, and a 16-hex hash in the metadata
  dictionary / stream / packet-marker names, read as bulk generation.
* **Fake Illustrator headers** — `%AI5_ArtSize` / `%AI3_TemplateBox` claim an
  Illustrator origin the file does not have (and AI5 stores height before
  width, which looks like a swapped bug to anyone comparing it with
  `%%BoundingBox`).

The user's rule: remove all of it from the final EPS **and** SVG; do not fake
Illustrator; no migration machinery — just clean the file before it is written.

## Root causes

| # | Where | What it wrote |
|---|---|---|
| 1 | `src/lib/upload/epsdoc.ts` `commentLines` | `%%Title: <workName>.eps` |
| 2 | `src/lib/upload/epsdoc.ts` `illustratorArtboard` | `%AI5_ArtSize`, `%AI3_TemplateBox` |
| 3 | `src/lib/upload/epsmetadata.ts` `setupBlock` / `trailerBlock` / `uniquePacketMarker` | `MetadataDict_<16 hex>`, `MetadataStream_<16 hex>`, `%EndPacket_<16 hex>` |
| 4 | `src/upload/exportstages.ts`, `src/svgBuilder/sheetpackage.ts` | pass `title: <workName>.eps` to every converter |
| 5 | `src/upload/renameexport.ts` `scrubEpsTitle` | rewrites `%%Title` to the work name on rename |
| 6 | external converters (Inkscape/cairo) | their own `%%Title` (`in.svg`), only producer lines were stripped |
| 7 | `src/svgBuilder/sheetpackage.ts` with *Clean the saved files* **off** | hashed `b<fnv>-<id>` ids from `svgAsset.scopeLocalIds` survive in the SVG |

The SVG with *Clean the saved files* **on** (default) is already free of names and
hashes: `cleanExportDom` drops `data-*`/`role`/`class`, renames referenced ids to
`a, b, c…` and removes unreferenced ids. `<title>`/`<desc>` carry only the
accepted metadata (or the user's own banner title), never a file name.

## Implementation steps

1. **Writer stops faking (`epsdoc.ts`).** The DSC block is exactly
   `%!PS-Adobe-3.0 EPSF-3.0`, `%%BoundingBox`, `%%HiResBoundingBox`,
   `%%DocumentData: Clean7Bit`, `%%LanguageLevel: 3`, `%%EndComments`, Prolog,
   Setup. No `%%Title`, no `%AI*_` comment. `EpsOptions.title` and
   `EpsConvertInput.title` are removed with their callers. Writer id bumps
   `builtin-vector-4` → `builtin-vector-5` so stale EPS files are rebuilt by the
   planner on the next export.
2. **One always-on identity scrub (`epsclean.ts` `stripEpsIdentity`).** Replaces
   `stripEpsProducerLines`. Removes from ANY EPS, whoever wrote it:
   `%%Title`, `%%Creator`, `%%CreationDate`, `%%For`, `%%Copyright*`, every
   Illustrator private comment `%AI<n>_<Key>…`, and renames a legacy hashed
   envelope (`MetadataDict_<hex>`/`MetadataStream_<hex>`/`%EndPacket_<hex>`) to
   the neutral names. Idempotent; non-EPS text is returned untouched.
3. **Neutral, fixed envelope names (`epsmetadata.ts`).** `MetadataDict`,
   `MetadataStream`, `%EndPacket` (an `_` is appended only if the packet text
   itself contains the marker). Name isolation is what `[/NamespacePush` /
   `[/NamespacePop pdfmark` already provide, so no per-file hash is needed. The
   artwork audit (`verifiedEpsArtwork`) still re-derives the envelope
   byte-for-byte; a legacy file with ONE consistent hashed id is normalised
   before the comparison, so packages exported before today keep verifying.
4. **Apply the scrub at every point an EPS leaves the app:** the Upload EPS stage
   (`exportstages.ts`), the Builder sheet package (`sheetpackage.ts`), rename of
   an existing package (`renameexport.ts`, replacing `scrubEpsTitle`; bytes/hash
   in `export.json` updated as before), the stock-upload metadata copy
   (`lib/stockupload/sendmeta.ts`) and the metadata re-embed
   (`stockupload/metaembed.ts`). Older files on disk are therefore cleaned on
   rename and on upload without a migration pass.
5. **SVG with clean off (`sheetpackage.ts`).** The clean-off path also renames
   referenced ids to `a, b, c…` and drops unreferenced ids (the shared
   `renameReferencedIds` from `cleandom.ts`), so hashed id prefixes never ship.
6. **Kept on purpose.** `%ADO_ContainsXMP` and `%%BeginPhotoshop` are written only
   by the legacy two-carrier envelope (*clean* off). They are the Adobe XMP
   spec's documented EPS carriers for any writer, not an Illustrator claim; the
   clean default never writes them. XMP `dc:title` is the accepted human title.
7. **Tests (TDD):** writer header has no `%%Title`/`%AI`; envelope has no hex
   suffix; scrub removes title/AI/producer lines from converter output and
   normalises a legacy envelope that still verifies; rename no longer writes
   `%%Title`; package EPS (Upload + Builder) contains neither the work name nor a
   hex-suffixed identifier; Builder clean-off SVG has no hashed ids.
8. **Docs:** RULE 26 lists programmatic names/hashes and fake Illustrator
   comments; `sor/upload-eps.md`, `sor/upload-rename.md`,
   `sor/upload-eps-gradients.md`, `sor/upload-stroke-endpoints.md` follow.
