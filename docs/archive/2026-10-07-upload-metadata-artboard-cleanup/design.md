# Design — relaxed upload metadata, fixed artboards, clean SVG output (2026-10-07)

## Request and scope

The SVG-to-upload workflow must stop enforcing 40 keywords, a 5–7-word first
sentence plus another sentence, and a 7–15-word description. It must accept at
least 10 tags, a title of at least 5 words total, and a description of at least
7 words. The export needs common final artboard dimensions in px plus a custom
width/height ratio. Stroke-based artwork must not get a background rectangle;
fill-only artwork may get the selected SVG background. The final optimized SVG
must explicitly be SVG 1.1 and meet the requested clean-file contract.

## Decisions

1. **Metadata limits:** tags are at least 10 and unique; the existing seven
   mandatory tags and lowercase generation guidance remain. Title is at least
   5 whitespace-separated words over the whole value; sentence count, maximum
   and tag-name subrules are removed. Description is at least 7 words with no
   maximum. Restricted-content checks remain warnings.
2. **Artboard:** one persisted `artboard` setting contains a preset id and
   dimensions. Default is 512×512 px. Presets include common square sizes
   (128, 256, 512, 1024, 2048) plus 4:3, 3:2, 16:9 and 9:16 canvases. `Fit`
   keeps the previous content-sized behaviour; `Custom aspect ratio` exposes
   bounded width and height fields. Artwork is uniformly scaled to fit inside
   the selected board and is centered; it is never stretched or cropped. The
   selected px dimensions become the SVG `width`, `height`, and `viewBox`.
   Raster JPEG megapixel sizing continues to preserve this final board ratio.
3. **Background/stroke policy:** SVG background is one full-board `rect` with
   `fill` only and `stroke="none"`, and is added only when no visible artwork
   stroke exists. Existing artwork strokes are never recolored; an explicit
   stroke-width setting only normalizes strokes already in the source. JPEG
   remains opaque and is flattened onto the selected background independently.
4. **Clean SVG:** always clean the export copy, whether SVGO compaction is on or
   off. Require one SVG root and a positive four-number viewBox; set
   `version="1.1"` and the SVG namespace; remove XML comments, source title/
   description/metadata, editor/layer namespaces and attributes, classes and
   object IDs. Accepted upload metadata is embedded afterwards as the product's
   title/description/keyword metadata, not as editor/layer naming. Reject
   `image` elements or embedded raster data instead of silently dropping
   visible artwork. If a source has a local `#id` paint/use reference that would
   break when IDs are removed, fail closed with a named unsupported-content
   message; do not ship a visually broken no-ID SVG.
5. **One owner:** `lib/upload/settings` owns artboard defaults, parsing,
   clamping, equality and fingerprints. `lib/upload/geom` owns exact output
   fitting. `lib/upload/svgclean` owns SVG export normalization; the optimizer
   calls it on both the SVGO and pass-through paths. The metadata prompt and
   validator remain owned by `lib/upload/meta`.

## TDD order and observable gates

1. Update `tests/upload_meta.test.ts` first: exactly 40 is no longer required;
   10 unique tags succeed and 9 fail; title with ≥5 words succeeds without two
   sentences; short titles fail; descriptions at 7+ succeed beyond 15 and
   under 7 fail; prompt/UI instructions match.
2. Update `tests/upload_settings.test.ts` first: default 512×512, common presets,
   custom dimensions clamped and persisted, override merge/reset, corrupt-read
   fallback, and artboard-sensitive fingerprint/equality.
3. Update `tests/upload_prepare.test.ts` first: preset/custom dimensions are
   exact in width/height/viewBox; aspect is preserved and centered; padding is
   respected; the fill-only background has no stroke; stroked icons get no SVG
   background; stroke normalization still acts only on existing strokes.
4. Add `tests/upload_svgclean.test.ts` first: actual SVG 1.1 root/version,
   positive viewBox, zero image/data-raster payloads, zero IDs/layer labels,
   editor namespace/comment removal, generated metadata remains after embed,
   and local-reference inputs fail rather than losing appearance.
5. Extend optimizer + UI tests: both optimize modes satisfy the clean contract;
   the settings dialog exposes presets and custom ratio live, the output record
   fingerprint changes, and the export SVG uses the chosen artboard dimensions.
6. Implement only after the new assertions have been observed failing. Run the
   targeted suites after each module, then `npm run verify`, full quality gate,
   jscpd/knip where the sandbox supports them, and recheck this design against
   RULE 18 before reporting completion.

## Compatibility and docs

The local settings payload stays at v1: newly added fields normalize from
missing old values to the new 512×512 default. Existing package records still
parse; their old settings fingerprints naturally trigger a re-export. Update
`SYSTEM_OF_RECORD.md`, `UI_SELECTORS.md`, `docs/README.md`, and append a dated
quality re-check entry only after the final lanes are measured. No generated
build or dependency artifacts are to be committed.
