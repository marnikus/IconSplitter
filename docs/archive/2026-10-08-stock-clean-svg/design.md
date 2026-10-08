# Stock-clean export SVG — namespaces once, tidy strokes, no px size, no trailing period, transparent background, stroke colour (2026-10-08)

Source: the user's stock-submission review of one exported SVG (items 1, 2, 4, 5,
the "quick fix" block) plus feature request 7 ("user defines the stroke colour in
settings"). Scope: the **SVG to upload** tab only — `src/lib/upload/*` rules,
`src/upload/*` wiring and the settings dialog. Nothing here touches the approved
source SVG (the export is a COPY, as before) or any other tab.

Status: **design only — no production code written yet.** Phase 2 below is the
TDD plan; `docs/current/*` rows are updated in the implementation commit (RULE 17:
current docs state what is true today).

## 1. The report, measured against the code (what is really wrong)

| # | Reviewer sees | Root cause (verified in the repo) | Verdict |
|---|---|---|---|
| 1 | `xmlns:dc` repeated on `dc:title`, `dc:description`, `dc:subject` | `lib/upload/embed.ts` creates the DC elements with `createElementNS(DC_NS, "dc:*")` but declares no prefix on any ancestor; `XMLSerializer` therefore re-declares it on every element. Reproduced in happy-dom with a spike: identical output to the report. | Real. Fix in embed + the clean policy (§2 D1). |
| 2 | `stroke-width="2.806"`, `"7.999906"` | `prepare.normalizeStrokes` writes `ptToPx(strokePt) / fit.scale / ctmScale` to 3 decimals: the pt→px factor (4/3) and any artboard or source scale make the LOCAL value fractional by construction (`4 / 1.4255 = 2.806`; `8 / 1.0000117 = 7.999906`). | Real. Fix = a rounding rule (D3), not a unit change. |
| 3 | — | (not in the report) | — |
| 4 | `width="1400" height="800"` on the root | `prepare.applyArtboard` sets them from the fit; the rasterizer relies on the `<img>` intrinsic size they give. | Real. Drop them from the file; give the rasterizer its own copy with a size (D4). |
| 5 | `<title>…Connection.</title>` | The model's answer is used verbatim; nothing strips sentence punctuation. | Real. Normalize the title at parse, accept and cache read (D5). |
| QF | "Remove the white background rect" | `prepare.backgroundRect` always paints the configured background first (SOR: "the background IS part of the export"). | Becomes a user choice (D2). |
| 7 | "define stroke colour in settings" | No such setting; `strokeHits` + `setStrokeWidth` already visit exactly the elements a recolour must touch. | New setting (D7). |

Non-finding, recorded so it is not re-opened: the reviewer's suggested root
(`xmlns:rdf`/`xmlns:dc` on `<svg>`) contradicts today's clean policy
(`clean.ts` → "only the root may declare namespaces, and only a used `xlink`"),
which runs as the LAST gate before commit (`exportvalidate.svgCheck`). Doing what
the report says therefore needs a policy change, not just an embed change.

## 2. Decisions (taken with the user, 2026-10-08)

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | Where are `xmlns:rdf` / `xmlns:dc` declared? | **Once, on the root `<svg>`** (the user's choice over `<rdf:RDF>`). The policy rule becomes general: *a namespace declaration may live only on the root, and only for a prefix the document uses.* `xlink` stops being a special case. | The report's letter; one general rule instead of a special case + an exception. The check and the rebuild (`hoistNamespaces`) derive from the same predicate. |
| D2 | Background rect in the SVG/EPS | The **Background setting gains `transparent`** as a first-class value (`"transparent" \| "#rrggbb"`), default `transparent` for NEW installs (a stored `#ffffff` stays white). Transparent = no rect in the SVG, no background shape in the EPS; the JPEG — which has no alpha — flattens onto **white** (`flattenColor`). | User: "option: transparent or colour, as the export setting is set". One control for one decision (RULE 10); the JPEG fallback is explicit, never guessed. |
| D3 | Rounding of normalized stroke widths | **Fewest decimals within 10 % of the exact width** (`tidyStrokeWidth`): try 0, 1, 2, 3 decimals, take the first whose relative error ≤ 0.1. `2.806→3`, `7.999906→8`, `2.933→3`, `2.667→2.7`, `1.467→1.5`, `0.2→0.2`. | Widths live in LOCAL units under the artboard scale group: a blunt integer round would turn the `0.2` a 24-unit icon needs on a 512 px artboard into `1` (a 20 px stroke). Deterministic, never more than 10 % from the configured pt, never breaks thin strokes. |
| D3b | Apply it when Stroke width = 0? | **No.** `0` keeps meaning "the artwork's strokes untouched". | One rule, one owner; a user who wants tidy widths sets one. |
| D4 | Root `width`/`height` | **Never written.** New policy rule: *the root carries no `width`/`height` — the `viewBox` is the size.* The rasterizer stamps the target px onto ITS OWN copy before `Image.decode()`. | The reviewer's point + determinism: the JPEG stage must not depend on the browser's intrinsic-size heuristics for a size-less SVG. |
| D5 | Trailing period in the title | **Normalized away** (`cleanTitle`: trailing `. ! ; : , …` and whitespace; `?` kept) at the three places a title enters: model answer parse, Accept (the user's edit gate), accepted-metadata cache read. The default prompt also says "no trailing period". | The file, the XMP, `export.json` and the UI field must all show the same title (RULE 24, readback check in `exportvalidate`). |
| D7 | Stroke colour | New setting **`strokeColor: "artwork" \| "#rrggbb"`**, default `artwork`. When set, every shape with a visible stroke gets `stroke="<hex>"` (inline `style` stroke key stripped) — independent of `strokePt`. Fills are never touched. Global default + per-icon override, fingerprint, undo, like every other field. | The user's feature; the same element set the width normalization already owns (`strokeHits` ∧ `isShape` ∧ `!none`). |

Deliberately NOT done: changing the stroke unit from pt to px (the SOR contract
"2.2 pt stays 2.2 pt" survives, now "within 10 %"); baking the artboard scale
into path data (would make every width exact but rewrites all geometry);
recolouring fills (a different decision, not asked for).

## 3. Design by owner (RULE 1/3/18 — pure rules in `src/lib/upload`, wiring in `src/upload`)

### 3.1 Namespaces (D1) — `svgdom.ts`, `clean.ts`, `cleandom.ts`, `embed.ts`

* `svgdom.usedPrefixes(elements): Set<string>` — the prefix of every prefixed
  element name and attribute name (`xmlns` itself excluded).
* `clean.namespaceViolations` (rewritten, metadata subtree INCLUDED — the repeat
  the user saw is inside it): `xmlns:p` on a non-root element → *"must be
  declared on the root, not on `<el>`"*; on the root with `p ∉ usedPrefixes` →
  *"is unused"*. Nothing else about namespaces.
* `cleandom.hoistNamespaces(root)` replaces `dropUnusedNamespaces`: collect
  `prefix → uri` from every declaration below the root (first wins) and remove
  them there; on the root, declare every USED prefix (with `setAttributeNS(XMLNS_NS, …)`
  — the only form serializers treat as a declaration) and remove every unused one.
  Idempotent, like the rest of the pass.
* `embed.embedMetadataInSvg`: declare `xmlns:rdf` and `xmlns:dc` on the root with
  `setAttributeNS(XMLNS_NS, …)` before building the block; the DC elements are
  created as today. The serializer then finds the prefixes in scope and writes
  them nowhere else (spike-verified in happy-dom). Readback is unchanged
  (localName matching).

### 3.2 Background (D2) — `settings.ts`, `prepare.ts`, `exportstages.ts`, dialog

* `settings.ts`: `TRANSPARENT = "transparent"`, `BACKGROUND_DEFAULT = TRANSPARENT`,
  `FLATTEN_DEFAULT = "#ffffff"`, `readBackground(v): string | null`
  (`transparent` or a normalized hex), `isTransparent(bg)`, `flattenColor(bg)` →
  the hex a format without alpha paints (`bg` itself, or `FLATTEN_DEFAULT`).
  `normalizeSettings`/`parseOverrides` read through `readBackground`.
* `prepare.applyArtboard`: inserts `backgroundRect` only when `!isTransparent`.
  `PreparedSvg.background` carries `"transparent"` or the hex.
* `exportstages`: JPEG target and `writeEps` receive `flattenColor(settings.background)`
  (EPS mixes opacity onto it, paints no background shape; `writeEps` is unchanged).
* `raster.ts` keeps its own `normalizeHex ?? "#ffffff"` guard (defence in depth).

### 3.3 Stroke width + colour (D3, D7) — `geom/stroke.ts`, `prepare.ts`, `settings.ts`

* `stroke.tidyStrokeWidth(exact, tolerance = 0.1): number` — pure, documented table in
  its test. Widths that need more than 3 decimals keep today's `fmt` behaviour.
* `prepare.restyleStrokes(root, want: { widthPx: number | null; color: string | null }): { widths: number; colors: number }`
  replaces `normalizeStrokes`: one walk over `strokeHits`, same element predicate;
  width → `fmt(tidyStrokeWidth(widthPx / k))`, colour → strip the `stroke` style key,
  set the attribute. `PreparedSvg` gains `strokesRecolored` beside `strokesNormalized`.
* `settings.ts`: `STROKE_COLOR_ARTWORK = "artwork"`, `readStrokeColor(v)`,
  `strokeColor` in `UploadSettings`, `DEFAULT_UPLOAD_SETTINGS`, `normalizeSettings`,
  `parseOverrides` (one `readPaint(raw, key, sentinel)` helper serves background
  and stroke colour), `settingsEqual`, `SETTINGS_FIELDS`, `settingsFingerprint`.
  Undo equality derives from `SETTINGS_FIELDS` already (`uploadundo.ts`).

### 3.4 Root size (D4) — `clean.ts`, `cleandom.ts`, `prepare.ts`, `raster.ts`

* `clean.rootViolations` + *"the root must not fix a pixel size (width/height)"*;
  `cleandom.cleanExportDom` removes both on the root; `prepare.applyArtboard` stops
  writing them (the viewBox stays `0 0 W H` — pinned px exact, as today).
* `raster.withIntrinsicSize(svgText, width, height): string` — exported pure helper;
  `renderSvg` loads that copy. The shipped file is untouched by it. EPS reads the
  viewBox only (unchanged).

### 3.5 Title (D5) — `meta.ts`, `metaactions.ts`, `metacache.ts`

* `meta.cleanTitle(title)`; `parseMetadata` applies it; `DEFAULT_METADATA_PROMPT`
  Title line gains "no trailing period". `acceptMetadata` dispatches, remembers and
  exports the cleaned metadata (the field shows it at once — RULE 24). The cache
  reader applies it to entries written before this change.

### 3.6 UI — `UploadPaintSettings.tsx` (new), `UploadSettingsDialog.tsx`, `UploadRow.tsx`, `index.css`

`UploadSettingsDialog.tsx` is 292 lines; one more row would cross 300 (RULE 16
hard line). The two PAINT rows move to **`src/upload/UploadPaintSettings.tsx`**
(~110 lines): one `PaintPicker` (swatches + custom colour + value readout + a
"none" button) rendered twice — `BackgroundSetting` with the none button
**Transparent** (`upload-set-bg-transparent`, checkerboard swatch) and
`StrokeColorSetting` with the none button **Artwork's own**
(`upload-set-stroke-color-artwork`); presets reuse `BG_PRESETS`
(`upload-set-stroke-color-{white,black,gray,green,red}`), custom
`upload-set-stroke-color-custom`, readout `upload-set-stroke-color-value`,
marker `upload-set-marker-stroke-color`. Hints: background — "transparent = no
background in the SVG/EPS; the JPEG flattens onto white"; stroke colour — "every
visible stroke; fills are never touched". `UploadRow.SettingsCell` appends
`· stroke #hex` when set. Two CSS classes: `.svg-swatch.transparent`
(checkerboard), `.svg-swatch.artwork` (diagonal).

### 3.7 Size budget (RULE 16 gate, RULE 18 ideals)

| File | Now | After | Note |
|---|---:|---:|---|
| `lib/upload/settings.ts` | 275 | ~255 | the artboard block (`Artboard`, `ARTBOARD_*`, `CONTENT_ARTBOARD`, `clampArtboard`, `artboardSize`, `nearestPreset`, `clampEdge`, `fitIntoCeiling`) moves to **`lib/upload/artboard.ts`** (~75) and is re-exported, so no importer moves |
| `lib/upload/clean.ts` / `cleandom.ts` | 172 / 230 | ~180 / ~240 | rule rewrite, `hoistNamespaces` |
| `lib/upload/prepare.ts` | 164 | ~185 | `restyleStrokes`, transparent, no size |
| `lib/upload/geom/stroke.ts`, `raster.ts`, `meta.ts`, `svgdom.ts`, `embed.ts` | 55 / 99 / 144 / 87 / 95 | +10…20 each | one function each |
| `upload/UploadSettingsDialog.tsx` | 292 | ~245 | paint rows out |
| `upload/UploadPaintSettings.tsx` | — | ~110 | new |
| `upload/exportstages.ts`, `metaactions.ts`, `metacache.ts`, `UploadRow.tsx` | 128 / 271 / 111 / 180 | +1…3 each | call sites |

Every new function ≤ 20 lines aimed, CC ≤ 10, ≤ 4 params (the `want` object is a
domain type, not an options bag). No `fooPart` helpers.

## 4. Behaviour changes a user will notice (go into `SYSTEM_OF_RECORD.md` §2 "SVG to upload")

* New installs export a transparent SVG/EPS and a white-flattened JPEG; existing
  stored defaults keep their colour. Switching changes the fingerprint → affected
  rows become `stale` (honest: the output would differ).
* Normalized stroke widths are written tidy (D3); the pt contract is now "within 10 %".
* The export SVG has no `width`/`height`; the artboard is the `viewBox`.
* `xmlns:rdf`/`xmlns:dc` appear once, on the root, only when metadata is embedded.
* Titles never end in a period (model answers and edits alike).
* New setting Stroke colour, inherited/overridden like every other field.

## 5. Phase 2 — implementation steps (TDD: each step red → green → `npm run quality:changed`)

| Step | Test first (file · assertion that fails without the change) | Then code |
|---|---|---|
| 1 | `upload_embed.test.ts` · serialized text contains exactly one `xmlns:dc=` and one `xmlns:rdf=`, both on the root tag; readback still equal; re-embed stays one | `embed.ts` root declarations |
| 2 | `upload_clean.test.ts` · `verifyExportSvg` on today's embed output (inline repeats) names the non-root declaration; on step-1 output → `[]`; an unused `xmlns:dc` on the root → "unused"; `xmlns:xlink` unused still flagged. `upload_cleandom.test.ts` · `enforceExportSvg` hoists three inline `xmlns:dc` to one on the root, idempotent | `svgdom.usedPrefixes`, `clean.namespaceViolations`, `cleandom.hoistNamespaces` |
| 3 | new `upload_stroke.test.ts` · the D3 table + tolerance edge (`2.667→2.7`, `0.0625→0.06`, exact integers unchanged) | `stroke.tidyStrokeWidth` |
| 4 | `upload_prepare.test.ts` · existing `"2.933"`→`"3"`, `"1.467"`→`"1.5"`, the `toBeCloseTo` case → within 10 %; `strokesNormalized` counts unchanged; `strokePt: 0` leaves `7.999906` as is | `prepare.restyleStrokes` (width half) |
| 5 | `upload_settings.test.ts` · defaults carry `background: "transparent"`, `strokeColor: "artwork"`; `normalizeSettings` accepts `transparent`/hex/`artwork`, rejects junk per field; `parseOverrides` keeps both; `SETTINGS_FIELDS` lists `strokeColor`; two fingerprints differ on stroke colour alone; `flattenColor("transparent") === "#ffffff"`; artboard re-exports still resolve | `settings.ts` + new `artboard.ts` |
| 6 | `upload_prepare.test.ts` · transparent → no rect before the group, `background: "transparent"`; a hex → rect as today; `strokeColor` set → every stroked shape has that `stroke`, style key gone, fills unchanged, `strokesRecolored` = count, works with `strokePt: 0`; root has no `width`/`height` even when the source had them | `prepare.ts` (colour half, transparent, no size) |
| 7 | `upload_clean.test.ts` · root `width`/`height` is a violation; `upload_cleandom.test.ts` · the rebuild removes them | `clean.rootViolations`, `cleandom` |
| 8 | `upload_raster.test.ts` · `withIntrinsicSize` sets exactly `width`/`height` to the target, leaves everything else byte-identical when re-serialized, input untouched; the fake-render path receives the stamped text | `raster.ts` |
| 9 | `upload_runexport.test.ts` / `upload_eps.test.ts` · an export with `background: "transparent"`: SVG has no rect, EPS verifies and paints no background shape, JPEG stage receives `#ffffff`; a hex background behaves as today | `exportstages.ts` |
| 10 | `upload_meta.test.ts` · `cleanTitle` table (`"A B C D E."→"A B C D E"`, `"…?"` kept, `"x.. "`→`"x"`); `parseMetadata` strips; prompt contains "no trailing period". `upload_metacache.test.ts` · a cached entry with a period reads back clean. `upload_ui.test.tsx` · Accept on an edited `"Title."` shows and persists `"Title"` | `meta.ts`, `metaactions.ts`, `metacache.ts` |
| 11 | `upload_ui.test.tsx` · dialog: `upload-set-bg-transparent` sets `transparent` (readout shows it, `aria-pressed`); `upload-set-stroke-color-custom` sets a hex, `…-artwork` resets; icon scope shows `upload-set-marker-stroke-color` overridden; row cell shows `stroke #…`; the undo entry for a stroke-colour-only override is NOT swallowed | `UploadPaintSettings.tsx`, dialog, `UploadRow.tsx`, CSS |
| 12 | `upload_undo.test.ts` · `overridesEqual` differs on `strokeColor` alone (derives from `SETTINGS_FIELDS` — should pass after step 5; keep as the lock) | — |
| 13 | Full gates: `npm run verify:fast`, then `npm run verify` before push | — |
| 14 | Same commit (RULE 17): `SYSTEM_OF_RECORD.md` §2 SVG-to-upload bullets (clean export, settings, geometry/strokes, metadata), §6 storage row for `…upload.settings.v1` (new field + `transparent`), §7 module row (`artboard.ts`, `UploadPaintSettings.tsx`); `UI_SELECTORS.md` settings-dialog paragraph; `docs/README.md` row (added now); one dated entry appended to `QUALITY_RECHECK.md` with the measured lane numbers | — |

Commit: `feat(upload): stock-clean export SVG — namespaces once on the root, tidy stroke widths, no root px size, transparent background and stroke colour settings, titles without trailing period` + `Verified:` line.

## 6. Risks and how each is closed

| Risk | Closed by |
|---|---|
| A serializer that still repeats the prefix (Chrome vs happy-dom) | Declarations use `setAttributeNS(XMLNS_NS, …)` — the only form the DOM serialization algorithm recognises as in-scope; step 1 asserts on the serialized TEXT, and the final gate (`exportvalidate` → `verifyExportSvg`) refuses a repeat at commit time, so a browser difference fails closed, never ships. Optional Chrome probe per `CODE_VERIFICATION.md` §9. |
| Removing root `width`/`height` changes how Chrome rasterizes the `<img>` | The rasterizer never loads the shipped text — it loads `withIntrinsicSize(...)`, so the JPEG stage is independent of intrinsic-size rules. The decode-back SOF check (RULE 15) stays. |
| `tidyStrokeWidth` on a width that rounds to `0` | Impossible by construction: 0 decimals is accepted only within 10 % of a positive width; the ≤ 3-decimal fallback equals today's `fmt`. (A width < 0.0005 already became `0` before this change — pre-existing, out of scope, noted.) |
| Existing users' exports flip to `stale` | Only when THEY change the background/stroke colour; stored `#ffffff` is kept by `normalizeSettings`. |
| `settings.ts` crossing 300 lines | The artboard block moves out first (step 5), re-exported — gate-measured. |
| The stored prompt is the user's own text, so "no trailing period" may be absent | `cleanTitle` at parse/accept/cache is the guarantee; the prompt line is advice to the model only. |

## 7. As built (2026-10-08, after the 14 steps) — where the build departed from the plan

* **D1, the rebuild pass:** `cleandom` exempts the `<metadata>` subtree exactly as
  the check does (the embed step writes it, its own readback verifies it); the
  namespace rule still sees inside it, and `hoistNamespaces` walks the whole
  tree, so a declaration inside the block is hoisted, not left. Documented in
  SOR §2.
* **D2, one reader:** `readBackground` became `readPaint(value, sentinel)` — the
  background reads with `TRANSPARENT`, the stroke colour with
  `STROKE_COLOR_ARTWORK`; two parameters, one rule.
* **D2, the preview:** `runmetadata.renderPreviewDataUrl` flattens onto
  `FLATTEN_DEFAULT` (the shared constant, no literal): the SVG it rasterizes is the
  prepared export copy, which already carries its rectangle when a colour is set.
* **D5, the Accept race:** `acceptMetadata` → `acceptOne` passes the accepted state
  to `runExportBatch` as `freshMeta` — the cleaned title can differ from the row
  React has not re-rendered yet (the previous entry's lesson).
* **§3.6 split:** the dialog's per-row plumbing (`UploadSettingsDialogProps`,
  `SettingsFieldProps`, `Marker`, `change`, `changeMany`) is its own
  `src/upload/settingsfield.tsx` (55 lines) so `UploadPaintSettings.tsx` (76) and
  `UploadSettingsDialog.tsx` (232) import it instead of each other.
* **Tests adjusted, not weakened:** `foldInlineStyles` runs before the restyle, so
  an inline `style="stroke-width:…"` becomes attributes first (`style` reads null
  afterwards); the artwork-default stroke colour keeps the artwork's `stroke`; the
  preview UI test expects the drawn text WITH the pinned render size
  (`withIntrinsicSize`), and the overridden-field count reads 10.
* **Sizes landed:** `settings.ts` 242, `artboard.ts` 77, `prepare.ts` 198,
  `clean.ts` 179, `cleandom.ts` 244, `meta.ts` 158, `raster.ts` 117; gate `PASSED`.

