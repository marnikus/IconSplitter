# Stock-ready SVG cleanup + stroke color — design proposal (2026-10-08)

**Status: design only.** This document records the repository findings and a
TDD implementation plan. No production code or tests have been changed. The
background-rectangle choice in §3.3 needs confirmation before implementation.

## 1. Request and scope

Make the SVG produced by **SVG to upload** cleaner for stock submission, and
add a manually chosen stroke color to export settings:

1. Put Dublin Core/RDF namespace declarations on the SVG root once, not inline
   on each metadata element.
2. Emit whole-number `stroke-width` values (for example `2.806` → `3` and
   `7.999906` → `8`).
3. Keep a scalable `viewBox`, without fixed root `width`/`height` attributes.
4. Remove a terminal period from the stock-facing title.
5. Remove the exporter-generated white background rectangle (scope to confirm).
6. Let users select a stroke color in global settings or per-icon settings.

This concerns the **export copy** only. Approved source SVGs remain untouched;
there is no direct stock-site upload and no promise that any particular site's
validator will accept every artwork.

## 2. Repository findings (verified before implementation)

* The upload pipeline already has a clean-SVG gate: `src/lib/upload/clean.ts`
  checks SVG 1.1, `viewBox`, raster content, editor attributes and naming;
  `src/upload/exportvalidate.ts` validates the text that will be committed.
* `src/lib/upload/embed.ts` constructs `dc:*` and `rdf:*` elements with
  `createElementNS` but does not put their declarations on the root. The XML
  serializer therefore emits declarations inline in the metadata subtree.
  The cleaner currently exempts that subtree, so it does not catch the
  placement problem.
* `src/lib/upload/prepare.ts` sets root `width` and `height` and inserts an
  exporter-owned background rectangle. JPEG and EPS generation already receive
  their dimensions/background separately; those outputs need not depend on
  those SVG root dimensions or on an SVG backplate.
* `strokePt` is currently a width override (0 means leave source widths alone),
  and `geom.ts` formats general SVG numbers to three decimals. The current
  settings model supports global defaults, per-icon overrides, storage,
  fingerprints and undo, but not stroke color.
* `UploadSettingsDialog.tsx` is already **292 lines**. Adding the color control
  inline risks crossing RULE 16's 300-line file limit; the control needs a
  cohesive extraction rather than a longer dialog.
* The sample root paint attributes (`fill="none"`, `stroke="#111"`, round
  caps/joins, a default width of 4) are illustrative, not safe universal
  defaults. Applying them to every source could change fills and artwork.

## 3. Proposed output contract

### 3.1 Namespaces and metadata

When metadata is embedded, the root declares the SVG namespace and declares
`xmlns:rdf` and `xmlns:dc` **once each**. No metadata descendant carries its own
copy. The final validator checks the placement as well as namespace URI;
`cleanExportDom` allows these two vocabularies only for the metadata that uses
them, while continuing to strip unrelated editor namespaces. Keep SVG 1.1 and
the root-level `<title>`, `<desc>` and `<metadata>` readback contract.

### 3.2 Scalable root dimensions

The final SVG root keeps its four-number `viewBox` and omits root `width` and
`height`. Do not remove width/height attributes from actual artwork elements
(such as a source `<rect>`), and do not round viewBox coordinates as part of
stroke cleanup. Artboard calculations, JPEG pixel dimensions and EPS bounds
continue to use the existing fit/settings data, not inferred root dimensions.

### 3.3 Background rectangle — decision required

The request says to remove the white background rectangle. Today the exporter
adds a rectangle for **every** configured background, and the current contract
says the background is painted into the SVG as well as flattened into the JPEG.
Removing it changes that contract.

**Recommendation:** stop adding the exporter-owned rectangle to the SVG for
all background colors, so the stock SVG is transparent. Keep the chosen color
for JPEG flattening and EPS output. Do not heuristically delete a white
rectangle that belongs to the source artwork. This is simpler and consistent;
removing only white would make SVG opacity depend on the selected color.

Alternatives for approval: (A) transparent SVG for every selected background
(recommended); (B) omit the generated rectangle only for white and retain it
for custom colors. The implementation will follow the user's choice.

### 3.4 Whole-number stroke widths

The exporter will write integer lexical values for stroke widths on its export
copy, using nearest-whole-number rounding. This covers both widths produced by
a configured `strokePt` and source widths when `strokePt` is zero; zero will
continue to mean “do not choose a new target width,” not “preserve fractional
source text byte-for-byte.” The examples `2.806 → 3` and `7.999906 → 8` are
acceptance cases.

Rounding is deliberately limited to `stroke-width`; do not round path data,
transforms, coordinates or unrelated numbers. It can change the rendered
stroke by up to half an SVG user unit (scaled by the element's transforms), so
TDD cases must include inherited strokes, CTMs, non-scaling strokes and the
configured-width path. Keep the approved source exact. Preserve source cap,
join, fill and stroke paint unless the new color setting is explicitly used.

### 3.5 Title punctuation

Canonicalize the metadata title before acceptance/export by trimming trailing
whitespace and terminal full stops. Use the same canonical value in the
editable accepted metadata, SVG `<title>`, `dc:title`, and `export.json`; never
rewrite only the SVG and then fail metadata readback. Apply the rule to AI
answers and manually edited titles, and state it in the prompt/UI hint. Do not
strip punctuation from descriptions/tags or change punctuation inside a title.

### 3.6 Stroke color setting

Add a `strokeColor` setting that is nullable: `null` means **Original artwork**
and is the existing/default behavior; a validated hex value is an explicit
custom color. Use the existing global-default + per-icon override model,
including inherited/overridden markers, reset, bulk apply and undo.

A custom color replaces paint only on shapes that already have a visible
stroke. It does not create outlines on un-stroked shapes, recolor fills or the
JPEG/EPS background, or recolor an explicit `stroke="none"`. Width and color
remain independent settings. Validate/canonicalize the hex value through the
existing color utility. Add the field to the one canonical settings field list
and fingerprint so changing color marks a package stale and triggers re-export.
Read existing v1 settings without the field as `null`; no migration should
silently recolor existing assets.

## 4. Likely ownership (keep responsibilities local)

| Concern | Existing owners to change | TDD proof |
|---|---|---|
| Root RDF/DC declarations and clean policy | `lib/upload/embed.ts`, `clean.ts`, `cleandom.ts` | `upload_embed`, `upload_clean`, `upload_cleandom` |
| Root dimensions, generated backplate, stroke quantization/color | `lib/upload/prepare.ts` and its geometry/stroke helpers | `upload_prepare`, `upload_clean`, raster/EPS regression tests |
| Stroke-color defaults, validation, overrides, equality/fingerprint | `lib/upload/settings.ts`, settings store and undo path | `upload_settings`, `upload_settings_store`, `upload_undo` |
| Settings control | `UploadSettingsDialog.tsx` plus a small extracted color-control component | `upload_ui` (semantic label/handle, live value, override, reset/undo) |
| Title canonicalization | `lib/upload/meta.ts` and the accept path in `upload/metaactions.ts` | `upload_meta`, `upload_ui`, `upload_embed` |
| Final package and documentation | export integration tests; then `SYSTEM_OF_RECORD.md`, `UI_SELECTORS.md`, `docs/README.md` | `upload_runexport` plus full verification |

Do not introduce a second validator, a second settings store, a broad string
rewrite, or a generic options bag. The SVG validator remains the final authority
for the exact committed file; the source is never mutated (RULES 3, 13, 15,
22–24).

## 5. TDD implementation steps (not started)

1. **Red — output policy:** add failing tests for one root `xmlns:dc` and
   `xmlns:rdf`, no inline copies, explicit SVG root namespace, no root
   `width`/`height`, preserved four-number `viewBox`, and no exporter-owned SVG
   background rectangle (once §3.3 is decided). Include negative cases proving
   actual source artwork rectangles survive. Run the focused clean/embed tests.
2. **Green — clean and embed:** implement the namespace placement/validation
   and root-size/background policy in the owning export modules. Re-run the
   focused tests; then add end-to-end verification of the exact SVG text at
   `exportvalidate`/commit.
3. **Red — stroke domain and UI:** first test settings default/validation,
   v1 storage compatibility, equality/fingerprint, override markers, custom
   color on visible strokes only, source-color default, `stroke="none"`, fill
   preservation, and undo/reset. Also test integer outputs for both reported
   values and transformed/inherited strokes.
4. **Green — stroke settings and preparation:** implement the nullable color
   field through the canonical settings list and apply it in the export-copy
   preparation. Add the extracted accessible color control; keep the existing
   settings dialog at or below 300 lines. Update the row summary only if it can
   report the effective value without duplicating the settings rule.
5. **Red/green — stock title:** test AI-parsed and manually edited titles with
   terminal periods, stable fingerprints, and exact equality across UI state,
   SVG title/DC metadata and the export record; implement one idempotent
   canonicalizer before accept/export.
6. **Integration:** prove one real `runExport` writes a clean, scalable SVG,
   its metadata reads back exactly, JPEG remains flattened against the selected
   color, EPS retains its selected background, source bytes are unchanged, and
   all artifacts still commit atomically. Re-export after a stroke color change
   must be stale then cleanly processed.
7. **Docs and gates:** update the upload behavior/storage row in
   `docs/current/SYSTEM_OF_RECORD.md`, add the new selector to
   `docs/current/UI_SELECTORS.md`, map this archive doc in `docs/README.md`, and
   append the dated quality-recheck entry only after measuring the real gates.
   Do not raise/regenerate the baseline for this feature.

Each production behavior follows a red test → implementation → green focused
test loop. Tests execute the real pure functions and upload pipeline (RULE 8);
no `src/lib` mocks.

## 6. Acceptance checklist

* Metadata prefixes are declared once on the root; serialized DC fields have no
  inline namespace declarations and still read back exactly.
* SVG 1.1 + default SVG namespace + valid four-number `viewBox`; no root
  width/height; no accidental removal of width/height belonging to artwork.
* Exporter-owned background rectangle behavior matches the choice in §3.3;
  JPEG/EPS background behavior remains covered; original source art remains.
* Exported stroke-width strings are whole numbers for both examples and the
  tested transform/inheritance cases; only stroke widths are quantized.
* A custom stroke color persists, inherits/overrides, affects visible strokes
  only, participates in staleness/fingerprinting and can be undone/reset.
* No accepted/exported stock title ends in a period; the editable text, SVG,
  DC metadata and record agree.
* No partial or invalid file can commit; the source SVG remains byte-identical.
* RULE 16: new functions ≤30 LOC, ≤4 parameters, CC ≤10, nesting ≤4; new files
  ≤300 lines; no new uncovered lib function; `src/lib` line coverage remains
  ≥80%; no new duplication/dead code. RULE 19 remediation order applies.

## 7. Size and verification plan (RULES 16 and 18)

Prefer small domain helpers (4–20 lines), one responsibility per file and
cohesive modules. The settings dialog's measured 292 lines makes extraction a
requirement, not an excuse to compress code or add a size override. Keep each
new file below 300 lines and keep the design doc focused on decisions/steps.

After each green phase, run its targeted Vitest files. Before claiming the
implementation complete, run `npx tsc --noEmit`, `npm run lint`,
`npm run quality:changed`, and `npm run verify:fast`. Before push run
`npm run verify`; run the review lanes (`npx jscpd src --min-tokens 60` and
`npx knip`) and record any sandbox/tooling limitation honestly. Append measured
results to `docs/current/QUALITY_RECHECK.md` only after those runs. No code or
test command is claimed as run in this documentation-only phase.

## 8. Rules applied

This plan follows `docs/current/AGENT_RULES.md` RULES 3, 4, 8, 10, 13, 15–19,
21–24 and the verification workflow in `docs/current/CODE_VERIFICATION.md`.
The current contract remains the source of truth until implementation ships;
this proposal does not pre-emptively change current behavior documentation.
