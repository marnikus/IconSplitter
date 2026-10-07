# SVG to upload — design (2026-10-07)

Status: implemented by the phased TDD plan in §10. Tab id: `svgUpload`, label
"SVG to upload", placed after "Generate SVG" in `src/ui/Workbench.tsx`.

## 1. Goal and scope

Prepare approved SVG icons for external websites (stock-site style packages):
configure padding / background / stroke, generate conceptual metadata with
Google Gemini (`gemini-3.1-flash-lite`), optimize the SVG with SVGO, raster a
~15.1 MP JPEG, optionally write genuine EPS, and commit a per-icon export
package (`export/` folder + `export.json`) beside the pair. No automatic
website uploading. The approved source SVGs and the pair files are never
modified.

## 2. Research findings — what is reused, what is new

### 2.1 Reused from the existing app (verified by reading the code)

| Need | Reused module | Why |
|---|---|---|
| Recursive scan, pairing, decisions | `lib/scan.ts`, `lib/pairing.ts`, `selection/pairstore.ts` | The Generate SVG discovery (`svg/sources.ts`) already walks the root, pairs faces and loads every pair file — the new tab lists the SAME pairs, one row per approved SVG version choice. |
| Approved-version choice | `lib/pairpreferred.ts`, `lib/svgmodel.ts` (`SvgVersion.review`) | `preferred` + per-version `review` decide which SVG the row exports. |
| Root picking, path capture, folder control | `ui/pickroot.ts`, `ui/FolderBar.tsx`, `lib/rootpath.ts`, `ui/knownroots.ts` | One green Open-folder button + read-only full-path row per tab (I-35…I-46). |
| Scan sequencing | `lib/scanseq.ts` | Only the newest scan commits. |
| Secret storage pattern | `svg/keystore.ts` + `batch/store.ts` IndexedDB `secrets` store | Gemini key: same store, new key id `gemini-api-key`; masked, redacted, never persisted anywhere else. |
| Request pattern | `lib/svgrequest.ts` (injectable `fetch`, classified errors, no auto-retry on unknown outcome) | `lib/geminireq.ts` follows the same shape for the Google generateContent API. |
| Preview pipeline | `lib/svgpreview.ts` (parse → sanitize → fit → inline shadow DOM) | The row preview and the export preview reuse the sanitizer; nothing is recoloured (I-17/I-21). |
| Background presets | `lib/svgbackground.ts` | Same presets + custom picker for the export background. |
| Zoom | `lib/zoom.ts` | `svg-thumb` is one value shared with Generate SVG (I-55); the new tab mounts the same box rule. |
| Log | `log/logstore.ts` `log()` | One log, sanitised on write and read (I-23…I-26). |
| Undo timeline | `state/apply.ts` + `svg/reviewact.ts` pattern | "Apply settings to selected" pushes ONE history entry; a new entry type `uploadSettings` restores per-icon overrides. |
| FS adapter | `lib/fs.ts` (`ensureDirPath`, `writeFileNew`, `writeFileOverwrite`, `tryGetFile`) | Atomic-per-file writes; no-overwrite for first export, overwrite on re-export commit. |
| State/session | `state/appstore.ts`, `lib/session.ts` | New `TabId`, new session slice (checked ids + view prefs), validated on read. |

### 2.2 New modules (owned by this feature)

Pure rules in `src/lib/` (RULE 1/3; coverage-gated), IO/UI wiring in `src/upload/`:

| Module | Owns |
|---|---|
| `lib/upsettings.ts` | Export settings: defaults, per-icon overrides, effective values, clamping, override flags, reset |
| `lib/upmeta.ts` | Metadata model, word counting (one rule), validation (title 5-7 + 3-5, description 7-15, exactly 40 unique tags incl. 7 mandatory), labelled-text + JSON parsing, style-phrase warnings |
| `lib/upprompt.ts` | The default metadata prompt (verbatim from the request), prompt build/reset |
| `lib/uppath.ts` | SVG path `d` parser (all commands; arcs → cubics) |
| `lib/upgeom.ts` | SVG scene: elements, transforms, minimal class/tag CSS cascade, stroke-aware visible bounds |
| `lib/upfit.ts` | Artboard + fit math: padding, proportional scale, centring, pt→unit stroke sizing after scaling |
| `lib/upprepare.ts` | Build the export SVG copy (viewBox, background rect, transform group, normalised strokes, embedded metadata) |
| `lib/upraster.ts` | Integer pixel dimensions for a target MP, JPEG encode/verify orchestration (injectable canvas/encoder), decode verification |
| `lib/upmetaxml.ts` | XMP packet, IPTC IIM record, SVG `<metadata>` RDF — one escaping rule |
| `lib/upjpegmeta.ts` | JPEG APP1/APP13 segment surgery (embed + read back) |
| `lib/upsvgo.ts` | SVGO v4 (`svgo/browser`) config that must preserve viewBox/strokes/metadata, version + size/hash record, render-compare gate |
| `lib/upeps.ts` | Genuine EPSF-3.0 PostScript writer from the parsed scene; unsupported-feature preflight |
| `lib/gemconfig.ts` | Gemini provider config (endpoint, model, timeout, retries, concurrency) + validation |
| `lib/geminireq.ts` | generateContent request build, response parse, token/cost handling, classified errors |
| `lib/upexport.ts` | `export.json` schema v1: build, validate, tolerant read |
| `lib/upfinger.ts` | Source/settings/metadata fingerprints + the selective re-export stage plan |
| `upload/sources.ts` | Approved-SVG discovery (one row per pair, chosen approved version, exclusions, export-folder loop prevention) |
| `upload/statemodel.ts` | Plain model + table reducer (rows, settings, checked, filters, progress, toast) |
| `upload/stores.ts` | localStorage: defaults, prompt, view prefs, Gemini config; accepted-metadata cache |
| `upload/gemkey.ts` | Gemini API key in the IndexedDB secrets store |
| `upload/exportio.ts` | `export/` folder IO: read committed package, staged commit (files then export.json) |
| `upload/runner.ts` | Job state machine per icon, bounded concurrency, cancel, stage progress |
| `upload/actions.ts`, `upload/ctx.ts`, `upload/useUpload.ts` | Wiring only (mirrors `svg/actions` pattern) |
| `upload/UploadPanel.tsx` + row/controls/bulk/dialog components | The tab UI, adapted from the Generate SVG interface |

### 2.3 External research (verified 2026-10-07)

* **`gemini-3.1-flash-lite` exists and is stable** (model code exactly
  `gemini-3.1-flash-lite`, released 2026-05-07, input text/image, output text,
  structured outputs supported, 1,048,576-token input / 65,536-token output) —
  ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite and
  firebase.google.com/docs/ai-logic/models. No substitution is made; the model
  id is configurable. `gemini-3.5-flash-lite` is newer but is NOT silently
  used. The Interactions API (2026-06) is the new Google default while
  `generateContent` remains supported — this build uses `generateContent`
  (documented; endpoint configurable).
* **Pricing**: Google publishes $0.25 / $1M input and $1.50 / $1M output for
  this tier (typingmind model page, 2026-10). The API returns token counts but
  no cost, so every cost number this tab shows is **Estimated** with a
  `pricing` version string; provider-reported tokens are shown as reported.
* **SVGO v4** ships an official browser entry (`svgo/browser`) — added as a
  runtime dependency. `preset-default` is used with explicit plugin overrides
  (see §6.4).
* **Canvas limits**: Chrome allows 32,767 px per edge and 268,435,456 px area,
  so a 15.1 MP raster (e.g. 3886×3886) is comfortably inside the limits; the
  raster runs one icon at a time (bounded concurrency) to keep memory sane.
* **JPEG metadata**: there is no native browser API; XMP is a UTF-8 XML packet
  in an APP1 segment (`http://ns.adobe.com/xap/1.0/\0`), IPTC IIM datasets sit
  inside the Photoshop 8BIM 0x0404 resource in APP13. This build writes those
  segments itself (pure byte surgery) and reads them back for verification —
  no re-encoding, pixels untouched.
* **EPS**: CairoSVG is Python and cannot run in a browser app. A genuine
  EPSF-3.0 writer (real PostScript path operators, `%%BoundingBox`,
  `setlinewidth`, bezier curves preserved) is implemented in `lib/upeps.ts`
  from the parsed SVG scene — the same approach verified browser SVG→EPS
  converters use. Renaming a PDF/PS file is never done. Unsupported features
  (text, raster images, gradients, filters, masks, patterns, clip paths) fail
  EPS preflight clearly; SVG/JPEG-only exports remain available (user decision
  2026-10-07).

### 2.4 Decisions confirmed by the user (2026-10-07)

1. UI: adapt the existing Generate SVG interface (the referenced
   `design temp/SVG to upload` folder does not exist in the repo).
2. Gemini: direct Google API, user's own key.
3. EPS: built-in genuine PostScript writer with documented subset limits.
4. Tags: **exactly 40** everywhere (the 7 mandatory terms among them).

## 3. Contradictions resolved

| Conflict in the request | Resolution |
|---|---|
| 50 keywords (notes) vs 40 (detailed prompt + template) | **40**, confirmed by the user; single rule in `lib/upmeta.ts` used by prompt, validation and UI. |
| Title template phrase "The Vector Icon of 'tag 1' and 'tag 2'" exceeds 3-5 words | The phrase is advisory style for the second segment; the enforced rule is segment word counts (5-7 and 3-5). Formal word-count validation wins over example wording. |
| "Metadata rules help avoid restricted content" vs "IP-compliant" | The UI states that model output is NOT legal/IP clearance; a style-phrase check warns; validation never promises compliance. |
| CairoSVG named as conversion pipeline | CairoSVG is Python-only (browser app); replaced by the built-in genuine EPSF writer per user decision. |
| `gemini-3.1-flash-lite` "verify, do not substitute" | Verified stable at ai.google.dev; used verbatim; configurable in the provider card. |
| Stroke "2.2 pt" must not become unexplained "2.2 px" | 1 pt = 96/72 px (CSS/SVG reference DPI 96); the conversion is stated in the UI and recorded in export.json (`dpi: 96`). |

## 4. Source eligibility (one row, one icon)

* Discovery runs the SAME walk/pair/decision load as Generate SVG
  (`svg/sources.discoverApprovedSources`), with one difference: directories
  named `export` are ignored during the walk, so this feature's own outputs
  can never be discovered as sources (no export loops, no duplicate rows).
* A row exists for every approved pair that has at least one **generated AND
  review-approved** SVG version on disk. The chosen version is the pair's
  `preferred` when that version is approved, else the highest-numbered
  approved generated version.
* Approved pairs without an approved SVG version are *reported* (exclusion
  reason `no-approved-svg`), never listed. A missing SVG file on a listed row
  is a row problem (warning), never a silent removal or substitution.
* One row shows ONE SVG thumbnail (the chosen version) — no AI reference
  beside it (this tab prepares the SVG itself).
* The row shows filename, full path, chosen version, metadata state, export
  state and warnings; the committed `export.json` (when present and valid)
  supplies the export state at scan time.

## 5. Settings — defaults, overrides, effective values

`lib/upsettings.ts` owns the model:

```
ExportSettings = {
  paddingPct:   number      // 0–40, default 8   (uniform, % of artboard side)
  background:   PreviewBackground  // reused presets + custom (default white)
  strokePt:     number      // 0.2–8, default 2.2, unit "pt" at DPI 96
  jpegMpx:      number      // 1–30, default 15.1
  jpegQuality:  number      // 0.5–0.98, default 0.92
  optimizeSvg:  boolean     // default true
  includeEps:   boolean     // default false
}
```

* Global defaults live in the tab's settings bar and persist in
  `localStorage iconSplitter.upload.defaults.v1`.
* Per-icon overrides store ONLY the fields the user set (a partial record,
  `iconSplitter.upload.overrides.v1`, keyed by pair id); effective = defaults
  overridden per field. The UI marks inherited vs overridden fields; Reset
  clears the icon's overrides.
* Editing a global default never erases an override (it changes only icons
  that inherit that field).
* "Apply settings to selected" writes overrides for the selected ids in ONE
  history entry (`uploadSettings`) showing the affected count; undo restores
  the previous overrides for every icon it touched.
* Values are clamped/validated on read (RULE 13); the effective settings are
  persisted inside each icon's `export.json`.
* Thumbnail zoom is display-only and never scales output (it is the shared
  `svg-thumb` value).

## 6. Geometry, units, rendering

### 6.1 Bounds

`lib/upgeom.ts` computes conservative visible bounds from the parsed scene:
every path control point (bezier hull contains the curve), every shape vertex,
transformed by the accumulated matrix; expanded per stroked element by
`strokeWidth/2 × (miter join ? miterlimit : 1)`. Non-scaling strokes are
treated as user units (documented limitation). Text elements (rare in
generated icons) are approximated by an em box (documented) and make EPS
preflight fail. The bound is a superset — nothing is ever clipped.

### 6.2 Artboard and fit (`lib/upfit.ts`)

* Default artboard: **square 1000×1000 units**; setting `artboard: "square" |
  "fit"` (default square; "fit" takes the content's aspect ratio).
* Padding `P%` is uniform on every side: the icon fits inside
  `(100 − 2P)%` of the artboard, centred, scaled by
  `min(availW/boundsW, availH/boundsH)` — proportional only, never stretched
  or cropped.

### 6.3 Stroke sizing after scaling (the pt rule)

The configured stroke is the physical stroke of the **output JPEG at its
rendered resolution**, at reference DPI 96 (1 pt = 96/72 px = 1.25 px):

```
R                  = jpegWidthPx / 1000            // px per artboard unit
strokeArtboardUnits = strokePt × (96/72) / R
strokeUserUnits     = strokeArtboardUnits / fitScale / elemTransformScale
```

`strokeUserUnits` is written onto each stroked element of the export copy (a
superset policy: only elements that already stroke get the new width; fills
are untouched). The exported SVG, EPS and JPEG therefore agree visually, and
an EPS page is emitted at the JPEG's 96-DPI physical size so the EPS
`setlinewidth` is exactly `strokePt`. Changing the JPEG **megapixel target**
changes R and therefore rebuilds the SVG+JPEG; changing only quality re-encodes
the JPEG without touching the SVG.

### 6.4 Optimization (`lib/upsvgo.ts`)

SVGO v4 `preset-default` with explicit overrides: `removeViewBox: false`,
`removeMetadata: false`, `removeTitle: false`, `removeDesc: false`,
`removeUselessStrokeAndFill: false`, `convertShapeToPath` allowed,
`cleanupIds` scoped. The optimizer runs on the export copy only. After
optimization the SVG is re-validated (well-formed, one root, viewBox intact,
title/desc/metadata present) and render-compared against the pre-optimization
copy at a small preview size with a documented tolerance; a failing compare
keeps the unoptimized copy and records the reason (RULE 9 — a failed optional
stage never stalls the pipeline). Optimizer version + config + before/after
size and hash are recorded in export.json.

### 6.5 Rasterization (`lib/upraster.ts`)

* Dimensions: integer w/h whose product is the closest match ≥/≤ the target MP
  (square default: side = round(√(mpx×10⁶)); "fit": from the artboard ratio).
  The row shows the exact dimensions and the actual MP.
* The prepared SVG is rasterized **from vectors at full size** (SVG → Image →
  canvas at exact target pixels) — never an enlarged thumbnail. Background is
  filled first (alpha flattening onto the opaque colour), antialiasing on.
* The JPEG blob is decoded again to verify format/dimensions/readability, then
  metadata segments are embedded, then bytes + SHA-256 hash are recorded.

### 6.6 Background

The background presets/custom picker (reused `lib/svgbackground.ts`) choose
the opaque colour flattened under the JPEG and emitted as an explicit
`<rect>` as the first child of the exported SVG (documented output policy:
the export SVG always carries the background). It never recolours strokes or
fills, never inverts, and applies no CSS/filter overrides (I-17/I-21 hold for
exports too).

## 7. Gemini provider

* Config (`lib/gemconfig.ts`): endpoint
  `https://generativelanguage.googleapis.com` (editable), model
  `gemini-3.1-flash-lite` (editable), timeout 5–900 s (default 120),
  retries 0–5 (default 2, CONFIRMED failures only), concurrency 1–4
  (default 2). Persisted in `iconSplitter.upload.gemini.v1`, clamped on read.
* Key: `upload/gemkey.ts` — IndexedDB `secrets` store, key id
  `gemini-api-key`; masked in the UI; excluded from presets, exports,
  reports, logs and Git (RULE 20). A failed auth check never clears the
  provider choice.
* Request (`lib/geminireq.ts`): POST
  `{endpoint}/v1beta/models/{model}:generateContent` with header
  `x-goog-api-key`, body `contents:[{parts:[{text: prompt},
  {inline_data:{mime_type:"image/png", data: <base64 of the rendered icon
  preview>}}]}]`, `generationConfig.response_mime_type:"application/json"` +
  `response_schema` for `{title, description, tags[]}`. The confirmation
  dialog shows the exact final request (image payload redacted to a length
  note) before anything is sent.
* Failures are classified: `network` (outcome unknown — NEVER auto-resubmitted,
  reported with request id), `timeout` (unknown outcome, same rule),
  `rate-limit` (retry-after honoured, retry allowed), `refusal`
  (SAFETY/RECITATION/prohibited content), `invalid-key`, `bad-request`,
  `malformed` (unparseable body), `truncated` (MAX_TOKENS), `no-answer`.
  Truncated/malformed/refused answers are never parsed into metadata.
* Tokens come from `usageMetadata` (reported as reported); cost is always
  Estimated from the versioned rate card and labelled as such.

## 8. Metadata: prompt, parsing, review, embedding

Default prompt = the request's text verbatim (40 tags, 7 mandatory terms:
icon, pictogram, vector, stroke, line, editable, web), editable and persisted
(`iconSplitter.upload.prompt.v1`), resettable to default.

Parsing (`lib/upmeta.ts`): a JSON body is preferred (requested via
response_schema); a labelled `Title:/Description:/Tags:` text body is parsed
deterministically. Word counting: whitespace-split, hyphenated compounds are
one word, surrounding punctuation stripped. Validation (fail-closed):

* Title: two period-separated segments, 5–7 and 3–5 words.
* Description: 7–15 words.
* Tags: exactly 40, comma-separated, non-empty, unique (case-insensitive),
  containing all 7 mandatory terms (case-insensitive).
* Style-reference phrases ("in the style of", artist-name patterns) produce a
  warning; the UI copy states the output is not legal/IP clearance.

The row shows the accepted (or generated-pending) metadata as **editable,
copyable fields under the SVG and JPEG previews** — empty until generated.
Edits re-validate live; invalid metadata cannot produce a processed export.
Accepted metadata is cached per source fingerprint
(`iconSplitter.upload.meta.v1`) so a crash never repeats paid AI work, and is
written into export.json on commit. A source change invalidates the cache for
that icon (fingerprint mismatch) and the metadata must be regenerated or
reconfirmed.

Embedding (`lib/upmetaxml.ts`, `lib/upjpegmeta.ts`):

* SVG: `<title>`, `<desc>`, and `<metadata>` carrying a Dublin Core RDF packet
  (title/description/subject keywords) — Unicode preserved, XML-escaped, tags
  as a list.
* JPEG: XMP APP1 (dc:title, dc:description, dc:subject) + IPTC IIM APP13
  (2:07 ObjectName, 2:25 Keywords ×40, 2:120 Caption) inserted after existing
  APP0/APP1 headers, ≤ 65 502 bytes per segment; pixels untouched.
* Both are re-read from the written files and compared field-by-field to the
  accepted values before commit; SVGO must preserve them (verified again
  after optimization).

## 9. Export package, states, recovery

Folder layout (pair folder = the folder holding the pair and its sidecar):

```
<pair-folder>/
  …images, approved SVG versions, pair metadata JSON (untouched)…
  export/
    <icon-base>.svg     optimized, metadata embedded
    <icon-base>.jpg     15.1 MP, XMP+IPTC embedded
    <icon-base>.eps     optional, genuine EPSF-3.0
    export.json         the per-icon record (LAST write = the commit)
```

`<icon-base>` = the pair's base name (the AI stem without `_AI`), so all
formats share one name and one approved source version.

Job states (per icon): `discovered → preflight → prepare → metadata →
render → embed → eps → validate → commit → processed`, with terminal
`failed`, `partial` (EPS requested but failed, or a mid-commit write failure),
`cancelled`, `stale` (source/settings changed vs the committed record),
`interrupted` (a non-committed export.json found at scan; restored as
needs-review, never auto-resumed). One icon's failure never touches another's
package. The green processed check appears only when every requested output
and export.json validate and commit.

Commit policy (RULE 23 adapted to the File System Access API, which has no
rename): every output is built and validated in memory first; the commit pass
writes the files (each FSA write is an atomic swap on close), `export.json`
last. A failure before the pass leaves the previous package fully intact; a
failure during it leaves the old export.json describing the last valid state
and the row reports partial + Retry. Corrupt/missing export.json never
deletes output files.

Selective re-export (`lib/upfinger.ts`): fingerprints (source content SHA-256,
effective visual settings, metadata, quality, flags) are compared with the
committed record: source change → everything incl. metadata reconfirmation;
visual settings change → SVG/JPEG/EPS rebuild, metadata kept but flagged for
reconfirmation; metadata-only change → segments re-embedded into the existing
JPEG bytes (no AI call, no raster); quality-only change → JPEG re-encode only;
optimize/eps flag change → only the affected outputs; missing/corrupt output
→ rebuild only the required stages. Nothing stale is ever silently reused.

Logging: every stage writes through `log()` with time, item id, stage, duration
and a safe cause — no key, no payload, no image bytes (I-23/I-24).

## 10. Phased TDD plan

Each phase lands tests-first and keeps `npm run verify` green:

1. **Pure rules**: `upsettings`, `upmeta`, `upprompt` (+ tests).
2. **Geometry**: `uppath`, `upgeom`, `upfit` (+ tests).
3. **Render/embed**: `upmetaxml`, `upjpegmeta`, `upraster` (+ tests).
4. **Optimize/EPS**: `upsvgo` (real SVGO), `upeps` (+ tests).
5. **Provider**: `gemconfig`, `geminireq` (+ fake-transport tests).
6. **Discovery/state**: `upload/sources`, `upload/statemodel`, `upload/stores` (+ tests).
7. **Pipeline**: `upexport`, `upfinger`, `upload/exportio`, `upload/runner` (+ tests).
8. **UI**: tab in Workbench + session/appstore, panel components, undo entry, UI tests.
9. **Integration + docs**: end-to-end package tests, `SYSTEM_OF_RECORD.md`,
   `UI_SELECTORS.md`, `QUALITY_RECHECK.md`.

## 11. Acceptance mapping

| Request §21 | Where |
|---|---|
| Only approved SVGs, one thumbnail per icon | `upload/sources.ts` (§4 above) |
| Global/local settings predictable | `lib/upsettings.ts` + one undoable apply |
| JPEG from vectors at declared MP | `lib/upraster.ts` (§6.5) |
| Valid conceptual metadata, one policy, embedded | `lib/upmeta.ts`, `lib/upmetaxml.ts`, `lib/upjpegmeta.ts` (§8) |
| Optimization preserves appearance/metadata; genuine EPS | `lib/upsvgo.ts`, `lib/upeps.ts` (§6.4, §2.3) |
| Per-icon export folder + JSON | `upload/exportio.ts` (§9) |
| Green = complete package committed | `upload/runner.ts` state machine (§9) |
| Selective regeneration | `lib/upfinger.ts` (§9) |
| Sources untouched | everything writes only into `export/` |
