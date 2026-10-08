# Stock-submission hygiene for the export SVG + a user-chosen stroke colour — plan (2026-10-08)

**Plan of record. This change ships documentation only — no `src/` code.**
Source: the user's "report to fix" (five stock-reviewer findings + feature
request 7), re-verified here against this branch (`c075a9d`) with the
repository's own pipeline, in a warm Linux sandbox, Node v22.22.3.

Every numbered finding below was reproduced by running the REAL stages
(`prepareExportSvg` → `optimizeSvg` → `enforceExportSvg` →
`embedMetadataInSvg`) over a synthetic source, not by reading the code. Where
the report's suggested fix does not survive contact with this pipeline, the
probe that proves it is quoted.

---

## 1. The report, re-verified

Reproduction input (the probe's source, deliberately shaped like the user's
file): root `viewBox="0 0 1400 800" width="1400" height="800"`, inherited
`fill="none" stroke="#111" stroke-linecap="round" stroke-width="8"`, one group
at `translate(24 24) scale(0.99998825)`, settings `strokePt: 2.2` + artboard
preset `1024`, everything else default. The pipeline reported `fit.scale =
1.407084603273191`, `artW = artH = 1024`, and `verifyExportSvg` on the shipped
text returned `[]` (the file that ships today passes the clean gate).

| # | Report finding | Reproduced here | Root cause in this code |
|---|---|---|---|
| R1 | `xmlns:dc` repeated inline on `dc:title` / `dc:description` / `dc:subject` | **yes** — 3 inline declarations in the shipped text, plus `xmlns:rdf` on `<rdf:RDF>` | `lib/upload/embed.metadataElement` builds the block with `createElementNS` and hands it to `XMLSerializer`, which emits a declaration for each prefix at the first element that needs it |
| R2 | `stroke-width="2.806"` / `"7.999906"` — "export garbage" | **yes, two independent causes** — shipped text carried `stroke-width="2.085"` (= `ptToPx(2.2)` ÷ 1.407084603273191, `fmt`'d to 3 dp) next to the source's own inherited `stroke-width="8"`; a separate SVGO probe produced `stroke-width="2.6376399999999998"` | (a) `prepare.normalizeStrokes` divides the output-px width by the artboard scale, so a pinned artboard always yields a non-integer; (b) SVGO 4.1.0 folds a group transform into the geometry and multiplies the live stroke width, and `floatPrecision: 3` is **not** applied to that product |
| R3 | the white background rect | the rect is deliberate policy (`prepare.backgroundRect`, SOR §2) | not a defect — a missing user-facing choice |
| R4 | `width="1400" height="800"` in px, redundant beside the viewBox | **yes** — `width="1024" height="1024"` in the shipped text | `prepare.applyArtboard` writes both from `fit.artW/artH` |
| R5 | `<title>` ends with a period | **yes** — `Unity and Compassionate Human Connection.` in BOTH `<title>` and `dc:title` (and in the JPEG XMP) | the documented default prompt asks for "a descriptive sentence", the model answers with a full stop, and `meta.parseMetadata` keeps the text verbatim |
| R7 | *feature*: let the user set the stroke colour in settings | absent — `strokePt` sets a width only; the paint is whatever the artwork carries | no paint field exists in `UploadSettings` |

Two claims in the report needed checking before they could be acted on, and
both matter:

* **R1's suggested fix does not work as written.** Setting `xmlns:dc` on the
  root with `setAttribute` and then serializing still produced one inline
  `xmlns:dc` per element (probe B). `importNode` of a parsed block is worse:
  the prefixes disappear and every element falls back to a default `xmlns`
  (probe D). The form that produces the wanted file is a document whose root
  declaration came from *parsing* (probe C). Conclusion: the block has to be
  built as TEXT, not as DOM nodes.
* **R1's fix also breaks this pipeline as it stands.** `verifyExportSvg` on a
  root that declares `xmlns:rdf`/`xmlns:dc` returns
  `["the namespace declaration xmlns:rdf (…) is editor bloat", "the namespace
  declaration xmlns:dc (…) is editor bloat"]` (probe F) — and
  `upload/exportvalidate.svgCheck` runs that check on the FILE THAT SHIPS, so
  the export would be refused, not fixed. `clean.namespaceViolations` exempts
  elements inside `<metadata>` but never the root.
* **A root-declared DC block must never meet the optimizer.** SVGO with this
  repo's recorded `OPTIMIZE_CONFIG` deletes the contents of a root-declared
  block: `<metadata><rdf:RDF><rdf:Description/></rdf:RDF></metadata>` — with
  `removeUnknownsAndDefaults: false` as well. The same block survives intact
  in today's inline form. The pipeline is safe only because `embedSvg` runs
  AFTER `enforceExportSvg`; that ordering becomes an invariant (I-58), not a
  coincidence.

## 2. Decisions

**D-1 · one namespace declaration, on the root, built as text.**
`lib/upload/metablock.ts` (new) renders the `<title>`, `<desc>` and
`<metadata>` block — and the two root declarations — as escaped text, the way
`lib/upload/eps.ts` renders PostScript. `embed.embedMetadataInSvg` composes
`<svg` + the root's own attributes + the two declarations + the block + the
rest of the serialized document, then the result is re-parsed and read back
(`readEmbeddedMetadata` is unchanged and stays the proof). `clean.ts` gains
one narrow exemption: `xmlns:rdf` and `xmlns:dc` on the ROOT are allowed when
a `<metadata>` subtree actually uses those prefixes; every other `xmlns:*`,
and an unused one of these two, stays bloat.

**D-2 · numbers: two tiers, and the visible one is opt-in.**

* *Tier A, always on* — after the optimizer, every presentation number in the
  export copy is re-formatted through `geom.fmt` (3 dp). This is what removes
  SVGO's `2.6376399999999998`; the largest change it can make to any value is
  0.0005 user units, and the test asserts that bound instead of trusting it.
  It lives in the clean/rebuild stage so the check and the fix stay one list
  (`clean.ts` keeps judging, `cleandom.ts` keeps rebuilding).
* *Tier B, opt-in* — a new `roundStrokes: boolean` (default **off**) quantizes
  normalized stroke widths to whole px in output space, which is what turns
  `2.085` into `2`. It changes the picture (here by 4 %), so it is the user's
  decision, it is in the fingerprint, and the row states the real pt.
* *Rejected*: silently rounding `2.806` → `3` as the report asked. That is a
  6.9 % stroke change nobody asked for, and RULE 3 forbids guessing at the
  artwork. The honest version of the same wish is Tier B.
* *Cosmetic, recorded not fixed*: when strokes are normalized the source's own
  inherited `stroke-width` on the root survives (it paints nothing any more).
  Removing it is a follow-up, because "nothing inherits it" is a claim about
  the whole tree and deserves its own test.

**D-3 · the root carries no pixel size unless the user asks.**
New setting `rootSize: "none" | "px" | "percent"`, default `"none"` (viewBox
only — the report's recommendation). Verified harmless: our own raster never
reads them (`raster.renderSvg` calls `drawImage(img, 0, 0, target.width,
target.height)` with explicit dimensions), the EPS writer sizes itself from
`viewBoxOf(root)` only, `geom/bounds` computes from SHAPES (the root `<svg>` is
never one), and `verifyExportSvg` accepts a dimensionless root (probe F, case
3). `"px"` keeps today's bytes for anyone whose buyer needs them.

**D-4 · the title loses its trailing punctuation, in one place.**
`meta.parseMetadata` strips trailing sentence punctuation (`.`, `!`, `?`, `;`,
`,`, `…`) and whitespace from the TITLE only; the description keeps its own
punctuation because it is prose. One entry point, so `<title>`, `dc:title`,
the JPEG XMP and `export.json` cannot disagree. Word-count validation runs on
the stripped text (a trailing period was never a word).

**D-5 · the background rect becomes a choice, not a policy.**
New setting `svgBackground: "paint" | "transparent"`, default `"paint"`
(today's behaviour stays the default). `transparent` omits the rect from the
export SVG. The JPEG is byte-identical either way — `raster.renderSvg`
pre-fills the canvas with the background before drawing — and the UI says so.
Stated consequence: `eps.writeEps` walks the SVG's shapes and paints no
backdrop of its own, so a transparent SVG also yields a transparent EPS.

**D-6 · the stroke colour is a setting (feature 7).**
`strokeColor: string` — the sentinel `"artwork"` (default) or a normalized
`#rrggbb`. Applied in `prepare`'s existing stroke walk, beside the width
normalization, so there is one definition of "the stroke in effect at this
element" (`lib/upload/geom/stroke.ts`) and one pass over the tree. Rules:

* only SOLID paints are replaced — hex, `rgb()`/`rgba()`, the 16 basic names
  and `currentColor`;
* a paint server (`url(#…)`) or `stroke="none"` is left alone and counted, and
  the count is reported ("3 strokes kept their gradient"), because flattening
  a gradient would change the picture — never guessed (RULE 5);
* `fill` is never touched, and the background rect keeps `stroke="none"`, so
  no colour can leak into a border around the artboard;
* JPEG and EPS inherit the colour from the document — no extra code.

**D-7 · all four new settings land in ONE change.** `rootSize`,
`strokeColor`, `svgBackground` and `roundStrokes` each enter
`settingsFingerprint`, so each would mark committed packages `stale`. Shipping
them together costs the user ONE re-export instead of four. Precedent: the
`jpegMatchArtboard` entry of 2026-10-08.

## 3. New invariants (SOR §5 — next free number is I-57)

* **I-57** the export SVG declares every namespace exactly once, on the root;
  a declaration the metadata block does not use is still bloat.
* **I-58** the optimizer never runs after the metadata block exists, and the
  shipped file's numbers are quantized to 3 dp after it; anything coarser is
  an explicit setting.
* **I-59** the export root carries `width`/`height` only when the user chose
  `px` or `percent`; the viewBox is the only geometry any output depends on.
* **I-60** the title carries no trailing sentence punctuation in any copy
  (`<title>`, `dc:title`, XMP, `export.json`); the description keeps its own.
* **I-61** a chosen stroke colour replaces solid paints only; a paint server or
  `none` is skipped, counted and reported, never flattened.
* **I-62** a transparent SVG background never changes the JPEG.

## 4. Change inventory (planned)

`src/lib/upload/settings.ts` is **275 / 300** lines and
`src/upload/UploadSettingsDialog.tsx` is **292 / 300**, so both must shrink
before they can grow (RULE 16's hard file line, RULE 18's 150–300 ideal).
Neither file appears in `tools/quality_baseline.json` (checked), so no legacy
maximum is recorded for them — the hard line applies directly.

**New** (each 40–100 lines, pure logic first, tests required):

| File | Owns |
|---|---|
| `src/lib/upload/metablock.ts` | the metadata block as text: escaping, the two root declarations, the block's placement string |
| `src/lib/upload/numbers.ts` | the post-optimize quantizer + the measured max-delta bound |
| `src/lib/upload/strokecolor.ts` | the `"artwork"` sentinel, `clampStrokeColor`, solid-vs-paint-server classification, the preset list |
| `src/lib/upload/artboard.ts` | the artboard clamps moved out of `settings.ts` (≈ 60 lines) — the space the new fields need |
| `src/upload/settingsrows.tsx` | the stroke-colour row, the root-size row, the SVG-background row, and the existing `BackgroundRow` moved out of the dialog |

**Edited**: `settings.ts` (four fields, `SETTINGS_FIELDS`, equality,
fingerprint, readers) · `prepare.ts` (root size, background choice, stroke
colour, stroke rounding) · `embed.ts` (text composition instead of DOM
nodes) · `clean.ts` + `cleandom.ts` (the namespace exemption, the quantizer
hook) · `meta.ts` (title punctuation) · `exportstages.ts` (pass the settings
through; keep embed after the optimizer) · `UploadRow.tsx` (the settings line
at line 136 gains the colour) · `rowmodel.ts` (if the count needs a home).
**Unchanged on purpose**: `settingsstore.ts` (fields flow through
`normalizeSettings`/`parseOverrides`, key stays
`iconSplitter.upload.settings.v1`, a v1 payload with an unknown field is
tolerated), `uploadundo.ts` (derives from `SETTINGS_FIELDS`), `raster.ts`,
`eps.ts`, `optimize.ts`.

## 5. TDD plan (written first, watched red)

Characterization at the seams that already exist — source text in, file text
out — so a wrong decision fails a test rather than a buyer's upload:

* `tests/upload_metablock.test.ts` — the block carries one `xmlns:dc` and one
  `xmlns:rdf`, on the root; text is escaped (`&`, `<`, `>`, quotes, a tag name
  inside a title); the output re-parses and `readEmbeddedMetadata` returns the
  input exactly; idempotent (embedding twice never duplicates).
* `tests/upload_clean.test.ts` (extend) — a root-declared pair used by a
  `<metadata>` subtree passes; an unused `xmlns:dc` on the root still fails;
  any other `xmlns:*` on the root still fails; elements inside `<metadata>`
  stay exempt.
* `tests/upload_numbers.test.ts` — `2.6376399999999998` → `2.638`; the
  max-delta assertion (≤ 0.0005 user units) over a table of values; idempotent;
  geometry attributes and paint strings untouched.
* `tests/upload_prepare.test.ts` (extend) — `rootSize` none/px/percent produce
  exactly the documented root attributes; `svgBackground: transparent` writes
  no rect while the rest of the tree is unchanged; `strokeColor` recolours
  hex/`rgb()`/named/`currentColor` strokes, leaves a `url(#…)` stroke and
  counts it, never touches `fill`; `roundStrokes` on/off; the stroke walk
  still reports `strokesNormalized`.
* `tests/upload_meta.test.ts` (extend) — trailing `.!?;,…` and whitespace
  stripped from the title only; descriptions keep theirs; the word count is
  computed after stripping; the fingerprint of a stripped title differs from
  the punctuated one (so the re-embed is honest).
* `tests/upload_settings.test.ts` (extend) — defaults, `clampStrokeColor`
  (bad hex → `"artwork"`, corrupt payload → defaults), the four fields in
  `SETTINGS_FIELDS`, equality and fingerprint sensitivity per field.
* `tests/upload_runexport.test.ts` (extend) — end to end: the committed SVG
  has no inline `xmlns:dc`, no `width`/`height` at the default, a
  punctuation-free title, and a JPEG whose SOF dimensions are unchanged when
  the background goes transparent (I-62).
* `tests/upload_ui.test.tsx` (extend) — the new rows render, mark
  inherited/overridden, and hand the decision back; the colour picker and the
  "keep the artwork's colours" checkbox are mutually consistent.

## 6. Implementation steps (RULE 19 order, each step independently verified)

1. `artboard.ts` extraction + the `settings.ts` field plumbing (no behaviour
   change; the suite must stay green — this is the refactor that buys room).
2. `metablock.ts` + `embed.ts` composition + the `clean.ts` exemption (R1).
3. `numbers.ts` + the `cleandom` hook (R2 Tier A).
4. `rootSize` in `prepare.ts` (R4) — smallest user-visible change, and it
   proves the settings plumbing end to end.
5. `svgBackground` (R3) + the I-62 JPEG assertion.
6. Title punctuation in `meta.ts` (R5).
7. `strokecolor.ts` + the `prepare` paint pass (R7) + the row/UI.
8. `roundStrokes` (R2 Tier B) last, because it is the only step that changes
   the artwork.
9. Docs in the same commit as each step (RULE 17): SOR §2 rows + §5
   invariants, `UI_SELECTORS.md` §R handles, this file's row in
   `docs/README.md`, one dated `QUALITY_RECHECK.md` entry with the measured
   gate numbers.

## 7. UI and handles

`upload-set-stroke-keep` (keep the artwork's colours) ·
`upload-set-stroke-color-<preset>` · `upload-set-stroke-color-custom` ·
`upload-set-stroke-color-value` · `upload-set-rootsize` ·
`upload-set-svg-background` · `upload-set-round-strokes` ·
`upload-set-marker-strokecolor` (and the existing marker pattern for the rest).
The row's settings line becomes `pad 8 % · #ffffff · 2.2 pt #111111`, and
`artwork strokes` stays the wording when `strokePt` is 0.

## 8. Acceptance (RULE 16.7, applied when the code lands)

1. Tests red before each module, green after; whole suite green
   (today's baseline: **128 files / 1376 tests**, 82.2 s).
2. `npm run verify:fast` clean, `npm run verify` before push;
   `npx tsc --noEmit` and `npm run lint` clean (today: 0 errors, 9 legacy
   warnings).
3. The shipped file of the reproduction input has: zero inline `xmlns:dc`,
   every number ≤ 3 dp, a dimensionless root at the default, and a title
   without a full stop — asserted, not eyeballed.
4. No function > 30 lines, no file > 300 lines, params ≤ 4, CC ≤ 10,
   nesting ≤ 4 in anything this change adds.
5. A package committed before this change reads `stale` exactly once, and the
   planner re-embeds without a paid request when only the title changed.

## 9. Risks, deferred, out of scope

* **Fingerprint churn** — four new fields mark existing packages `stale`.
  Intentional (D-7), and it is why they ship together.
* **Serializer differences** — the text builder removes the dependency on
  `XMLSerializer`'s prefix handling; the probes above were run in happy-dom
  20.14.5, and a real-browser probe (`CODE_VERIFICATION.md` §9, optional) is
  the way to confirm Chrome agrees. The readback check runs in both.
* **Deferred**: dropping the now-uninherited `stroke-width` on the root
  (D-2's cosmetic note); a `stroke-opacity`/dash policy for recoloured
  strokes; any per-colour contrast check against the chosen background (the
  preview frame already has one for the artwork, and reusing it here is a
  separate decision).
* **Not in scope**: anything that uploads; the metadata prompt's wording
  beyond the title rule; the EPS subset.
