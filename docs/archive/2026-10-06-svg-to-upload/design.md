# Design — "SVG to upload" tab (2026-10-06)

New tab after **Generate SVG**: prepares *approved* SVG icons for external
stock/print websites. Discovers approved SVG versions through the existing
pair sidecars, applies padding/background/stroke settings, generates
conceptual metadata with Gemini, optimizes the SVG, renders a 15.1 MP JPEG,
optionally writes a genuine EPS, and commits a validated per-icon package
(`export/` beside the pair + one `export.json`). **No automatic website
uploading.**

This document is the phase-0 research record the feature prompt asks for:
what is reused, what is new, which contradictions in the guidance were
resolved how, the module map, the export schema, the failure policy and the
phased TDD plan. Current behaviour is summarised into
`docs/current/SYSTEM_OF_RECORD.md` in the same change (RULE 17).

---

## 1. Research — what exists and what is reused

| Capability | Existing owner | Reuse decision |
|---|---|---|
| Folder picking + full-path row | `ui/pickroot.ts`, `ui/FolderBar.tsx` (`OpenFolderButton`, `FolderPathRow`), `lib/rootpath.ts` | **Reused verbatim** — one green `Open folder`, one read-only path row (`up-folder-path`), I-35/I-44/I-46 behaviour included |
| Recursive scan + canonical order | `lib/fs.readDirTree`, `lib/scan.walkTree`, `lib/scanseq` (ticket) | **Reused** — with `ignore: ["export"]` so export output is never discovered (no duplicates, no export loops) |
| Pairing + split-output scope | `lib/pairing.pairEntries`, `lib/splitscope.scopeOf/pairInSplitScope` | **Reused** — I-38/I-47 scope rules apply unchanged |
| Pair sidecars (`.svg.json`) | `selection/pairstore.loadPairDecisions`, `lib/pairmeta` | **Reused read-only** — the sidecar is the authority for approval; this tab never writes it |
| Approved/chosen version | `lib/svgfile.approvedVersion`, `chosenVersion`, `newestValid` | **Reused** — the export source is the newest **approved** valid version |
| Thumbnail zoom | `lib/zoom.ts` (ONE control, I-55) | **Reused** — `up-thumb` slider, same range/clamp |
| Preview background presets | `lib/svgbackground.ts` | **Reused** for the preview frame only (never written into artwork, I-17/I-21) |
| Secret hygiene | `lib/svgsecret.ts` (`maskKey`, `redact`, `authHeader`), IndexedDB `iconSplitter/secrets` via `batch/store.idb*` | **Reused** — Gemini key under its own id `gemini-api-key`; masked in UI, redacted in logs/exports (RULE 20, I-24) |
| Logging | `log/logstore.log()` | **Reused** — `feature: "upload"` entries, sanitised by `lib/log` |
| Global undo timeline | `state/HistoryProvider`, `lib/history`, `state/apply.ts` | **Extended** — one new entry type `uploadSettings` (see §6) |
| Session slice | `lib/session.ts`, `state/appstore.ts` | **Extended** — `TabId` gains `"upload"`; new `SessionUpload { checked, activeId }` slice |
| SVG validation | `lib/svgvalidate.parseSvg/validateSvg` | **Reused** for preflight of the approved source |
| Atomic write protocol | `selection/pairstore.saveMetaAt` (tmp → verify → overwrite → cleanup) | **Reused pattern** for export files and `export.json` |
| FS adapter | `lib/fs.ts` (`writeFileNew`, `writeFileOverwrite`, `ensureDirPath`, `probePath`) | **Reused** |
| Provider transport patterns | `lib/svgrequest.ts` (injectable fetch, failure classification, retry policy) | **Pattern reused** for Gemini (different wire format, see §3.2) |
| In-flight journal | `svg/journal.ts` pattern | **Reused pattern** — `upload/journal.ts` for metadata requests |

**New** (no existing owner): export geometry/units, export SVG preparation,
15.1 MP rasterization, metadata prompt/parse/validate, Gemini client, SVG/JPEG
metadata embedding + readback, SVGO wrapper, genuine EPS writer, export
record schema + stage planner, the two pipelines, the tab UI.

**Dependency added:** `svgo@^4.1.0` (pure JS, browser-safe; verified
`import { optimize } from "svgo"` loads and the single-file build stays
offline-capable). Recorded with its version + config in every export record.

---

## 2. Guidance validation — contradictions resolved BEFORE code

The feature prompt was checked against the repo and current web research
(2026-10-06). Resolutions:

1. **Tags: 40, not 50.** The notes line says "50 keywords"; the detailed
   prompt, the output constraints and the example all say **40**. One rule,
   used everywhere: exactly 40 tags, including the 7 mandatory terms
   (`icon, pictogram, vector, stroke, line, editable, web`), no duplicates.
2. **The second title sentence.** The example "The Vector Icon of X and Y"
   exceeds the 3–5 word limit it illustrates. Resolution: the Title line is
   **two sentences** — sentence 1: 5–7 words (the abstract concept);
   sentence 2: **3–5 words naming at least two of the 40 tags**. The exact
   phrase "The Vector Icon of …" is *illustrative, not mandated* — a sentence
   like "Speed and growth pictogram" satisfies the rule; the literal example
   would not, and the validator never requires it.
3. **Word counting** (defined once, `lib/uploadmeta`): whitespace-separated
   tokens; hyphenated compounds count as ONE word; the two title sentences are
   split on the first `". "`.
4. **RULE 20 vs sending the icon to Gemini.** RULE 20 says images never leave
   the browser; the app already carries exactly one opt-in exception
   (Generate SVG → Requesty, only when the user asks). Gemini metadata
   generation is the same class: **user-configured provider, user-initiated
   per item/bulk action, key stored locally, image bytes sent only inside that
   one request, never logged, no automatic uploading, no background sync.**
   The provider card states this plainly. Nothing else in the app phones home.
5. **EPS.** CairoSVG does not export EPS and no maintained pure-JS SVG→EPS
   converter exists (web research 2026-10-06: only hand-rolled online tools).
   Resolution: a **genuine EPS writer for a documented subset** (path/rect/
   circle/ellipse/line/polyline/polygon; solid fill/stroke; dash; transforms;
   opacity flattened onto the export background; `%!PS-Adobe-3.0 EPSF-3.0`
   header + `%%BoundingBox`). Anything outside the subset (gradients, text,
   filters, clips, images) fails the EPS stage **honestly** → row status
   `partial`; SVG/JPEG remain committed. Never a renamed PS/PDF.
6. **JPEG metadata.** IPTC-IIM is a legacy binary form; XMP (APP1) is the
   compatible modern carrier for Title/Description/Keywords
   (`dc:title` / `dc:description` / `dc:subject`). Resolution: **XMP APP1**,
   written and read back for verification; full metadata always also lives in
   `export.json` (format limitations documented).
7. **UI template.** `design temp/SVG to upload/` does **not** exist in this
   checkout (only `SVG tab generation/` and `selection tab V2/`). The prompt
   itself says "Reuse the Generate SVG interface", so the new tab reuses the
   Generate SVG layout/components patterns rather than a missing template.
8. **Gemini model id verified:** `gemini-3.1-flash-lite` is a real, stable
   model id (ai.google.dev model page, "Stable: gemini-3.1-flash-lite",
   updated May 2026; inputs Text+Image, output Text). Endpoint
   `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`,
   auth via the `x-goog-api-key` **header** (never the URL query — keys stay
   out of logs), body `{ contents: [{ role: "user", parts: [{ text },
   { inlineData: { mimeType, data } }] }] }` (camelCase per the REST reference),
   answer at `candidates[0].content.parts[].text`, tokens at
   `usageMetadata.{promptTokenCount,candidatesTokenCount,totalTokenCount}`,
   refusal at `promptFeedback.blockReason` / `finishReason: "SAFETY"`.
   Gemini reports **no cost** → tokens recorded as real, cost shown as "—"
   (never invented; "Estimated" labelling reserved for calculated numbers).
9. **15.1 MP.** 15.1 × 10⁶ px target. Integer W×H preserving the artboard
   aspect ratio; a square artboard gives 3886 × 3886 = 15 100 996 px
   (15.10 MP, shown with its real dimensions and MP). Rendered **from the
   vectors** at that size — never an upscaled thumbnail.
10. **Stroke width units.** 1 pt = 1/72 in; the CSS/SVG px = 1/96 in, so
    **1 pt = 4/3 px at the documented 96 DPI** (2.2 pt = 2.93 px — never a
    silent "2.2 px"). Stroke sizing is applied **after scaling**: the export
    viewBox is in output px, the artwork is fitted by scale `s`, so a
    configured `w` pt renders at `w·4/3` output px and the user-unit
    `stroke-width` is set to `(w·4/3)/s`. `vector-effect="non-scaling-stroke"`
    is honoured as "final size = configured width" (explicit user-unit width
    `w·4/3`, because the export renders at its intrinsic size). Transformed
    paths are handled through the same CTM math as the bounds computation.
11. **Padding.** Percent of the fitted artwork's largest side, **uniform on
    all four sides**, range 0–50 %, default 8 %. (Uniform-only: per-side
    padding was considered and rejected — it multiplies the settings surface
    without a stock-upload use case; recorded here as a decision.)
12. **Thumbnail zoom is display-only** — it never feeds the output scale
    (output scale is the 15.1 MP target + fit).
13. **Metadata fields under each row** are editable and copiable; empty
    before generation. Accepted metadata persists in the per-icon
    `export.json` (stage `metadata`), so a restart keeps it; the pair sidecar
    and the approved SVG are never touched.
14. **Geometry-honesty extensions** (implemented in Phase 1/2, same
    "never guessed" principle as the unsupported list): a `<style>` block
    whose CSS mentions `stroke`, `transform`, `display`, `clip` or `mask`
    is named `unsupported` (it could move or restyle geometry invisibly to
    the analytic bounds); a fill-only `<style>` is fine. A `transform` on
    the root `<svg>` fails preparation as `unsupported` (viewBox/CTM
    semantics get ambiguous). Stroke normalization (configured pt width)
    applies to geometry-bearing shapes only — containers inherit, they do
    not paint — and divides by the accumulated CTM scale so the device
    stroke is exactly `w·4/3` output px under any transform.

---

## 3. Module map (ownership)

### 3.1 New pure modules — `src/lib/` (RULE 1/3: pixel/math rules live here)

| File | Owns |
|---|---|
| `hash.ts` | `sha256Hex(bytes)` (crypto.subtle) — output fingerprints |
| `svgmatrix.ts` | Affine matrices: multiply, scaleOf, apply, `transform` attribute parsing (table-driven), rotate |
| `svgseg.ts` | The shared segment primitive (`Seg` + end tangents) + flat-point transform |
| `svgpath.ts` | SVG path data (full grammar M/L/H/V/C/S/Q/T/A/Z) → geometry: hull + subpaths with end tangents |
| `svgarc.ts` | SVG arc command → geometry: center conversion (F.6.5), sweep extrema, end tangents |
| `svgbounds.ts` | **Visible bounds incl. stroke width/caps/joins and CTM transforms** (per-join miter reach beveled past the miter limit; square caps; unsupported elements named, never guessed) + `strokeHits` (every element with its CTM and inherited stroke state) |
| `svgstroke.ts` | Stroke inheritance: the presentation-attribute + inline-style cascade (paint/width/cap/join/miterlimit) shared by bounds and stroke normalization |
| `uploadgeom.ts` | Units (pt→px @96 DPI), SVG length parsing, artboard fit (padding %, centred, no stretch/crop); re-exports the bounds API |
| `uploadsettings.ts` | `UploadSettings` domain type, defaults, clamps/validation, `effectiveSettings(defaults, overrides)`, override set/reset, settings fingerprint |
| `uploadprepare.ts` | The export SVG **copy**: re-rooted viewBox = padded artboard, artwork translated/scaled, explicit background rect (output policy: **background is included**), stroke-width normalization after scaling (incl. `non-scaling-stroke`), artwork otherwise untouched |
| `uploadmeta.ts` | The exact default prompt, deterministic labeled-text parser, validation (one tag rule = 40, title/description word counts, required terms, duplicates, truncation), restricted-content warnings, metadata fingerprint |
| `geminiclient.ts` | Gemini config (verified endpoint + model), `generateContent` URL, `x-goog-api-key` auth header, request builder (`inlineData`), response readers (text/usage/blockReason), failure classification, single-attempt send with injectable fetch + timeout |
| `uploadjpeg.ts` | XMP APP1 embed (`dc:title/description/subject`), XMP readback, JPEG SOF dimension reader, `verifyJpeg` |
| `uploadembed.ts` | SVG `<title>`/`<desc>`/`<metadata>` (Dublin Core RDF) embed + readback, XML escaping, idempotent replace |
| `uploadoptimize.ts` | SVGO wrapper: recorded config (preset-default with `removeMetadata/removeTitle/removeDesc/removeViewBox: false`, floatPrecision 3), before/after size + hash, svgo version |
| `uploadeps.ts` | Genuine EPS writer (subset, §2.5) + `verifyEps` (header + bounding box) |
| `epspath.ts` | EPS geometry: the subset's shapes + path data → PostScript path construction (arcs/quads as cubics) |
| `uploadraster.ts` | 15.1 MP integer dimensions, SVG→canvas→JPEG render with background flatten, decode-back verification, bytes+hash record |
| `uploadexport.ts` | `export.json` schema v1 (serialize/parse, RULE 13 tolerant), **stage planner** for selective re-export, output records |
| `uploadlist.ts` | Row filter/sort/counts for the tab (search, metadata state, export state, sort orders) |

### 3.2 New feature modules — `src/upload/`

| File | Owns |
|---|---|
| `types.ts` | `UploadRow`, job states, metadata state, dialog shapes |
| `discovery.ts` | Approved-SVG discovery: walk (ignore `export`), pair sidecars, split scope, one row per pair with an approved valid SVG version, exclusions with reasons, audit counts |
| `scan.ts` | Scan orchestration: ticket, snapshot key, one commit, log/report (mirrors `svg/scan.ts`) |
| `settingsstore.ts` | Global defaults persistence (localStorage, validated on read) |
| `prefsstore.ts` | View prefs (thumb zoom, provider card open) |
| `keystore.ts` | Gemini API key (IndexedDB secrets, id `gemini-api-key`), mask + log hygiene |
| `journal.ts` | In-flight metadata-request journal (restart → `interrupted`, never auto-resent) |
| `rowmodel.ts` | Row assembly, counts, visible rows, header checkbox, prune checked |
| `runmetadata.ts` | Metadata pipeline: preview render → Gemini request (bounded concurrency, cancel) → parse/validate → accept/edit → `export.json` metadata stage |
| `runexport.ts` | Export pipeline: preflight → planner → stages → validate → atomic commit; stage planner drives selective re-export |
| `exportstages.ts` | The artifact-building stages: prepare → optimize → embed → render JPEG → EPS, per the plan's rebuild flags |
| `exportvalidate.ts` | The validation stage (before any commit): SVG parses + metadata readback, JPEG decodes to the recorded dims + XMP readback, EPS verifies |
| `exportcommit.ts` | The atomic commit: tmp → verify → overwrite → cleanup per output, `export.json` written last (the commit marker) |
| `uploadundo.ts` | Live applier binding for `uploadSettings` history entries (mirrors `svg/reviewundo.ts`) |
| `actions.ts`, `useUpload.ts` | Orchestration hook (reducer + actions, mirrors `svg/`) |
| `UploadPanel.tsx` + `UploadControls.tsx` + `UploadBulkBar.tsx` + `UploadList.tsx` + `UploadRow.tsx` + `UploadMetaFields.tsx` + `UploadSettingsDialog.tsx` + `UploadPreview.tsx` | The tab UI |

### 3.3 Edits to existing files

* `src/lib/session.ts` — `TabId += "upload"`, `SessionUpload`, tolerant parse.
* `src/state/appstore.ts` — `upload` slice + `patchUpload`.
* `src/state/apply.ts` — `ENTRY_TYPES += "uploadSettings"`, apply case.
* `src/ui/Workbench.tsx` — tab after `generateSvg` (`tab-upload`).
* `package.json` — `svgo` dependency.
* `docs/current/SYSTEM_OF_RECORD.md`, `docs/README.md`, `docs/current/UI_SELECTORS.md` — same-change updates (RULE 17).
* `src/index.css` — `.up-*` styles (reusing the `.svg-*` look).

---

## 4. Data schemas

### 4.1 Settings (global defaults + per-icon overrides)

```ts
interface UploadSettings {
  paddingPct: number;      // 0..50, uniform, % of fitted artwork's max side (default 8)
  background: string;      // normalized #rrggbb (default #ffffff)
  strokePt: number;        // 0..24 pt at 96 DPI; 0 = leave artwork strokes untouched (default 0)
  jpegMegapixels: number;  // 1..64 MP, default 15.1
  jpegQuality: number;     // 0.5..1, default 0.92
  optimizeSvg: boolean;    // default true
  includeEps: boolean;     // default false
}
type Overrides = Partial<UploadSettings>;   // per pair id; absent = inherited
```

Effective settings = defaults + overrides; `Reset to defaults` deletes the
override. Global edits never erase overrides (they only change the inherited
base). Thumbnail zoom is **not** part of settings (display-only, I-16).

### 4.2 Row / job states

```
discovered → preflight → prepare → metadata(pending|generated|invalid|accepted)
           → render → optimize → embed → eps(optional) → validate → commit → processed
states: processed | partial | failed | cancelled | stale | interrupted(needs review)
```

* `processed` (green) only when **every requested output validates and
  commits** and `export.json` is written.
* `partial` = some requested outputs committed (e.g. EPS failed after SVG+JPEG
  committed).
* `stale` = fingerprints moved (source/settings/metadata changed since the
  last commit) — shown until re-export.
* Source approval, metadata readiness and export-package status are three
  independent flags on the row.

### 4.3 `export.json` (one per icon, in `<pair-folder>/export/`)

```jsonc
{
  "v": 1,
  "pair": { "id": "pair_<hash>", "base": "fog", "suffix": "", "dir": "cat/split_01" },
  "source": { "svgPath": "cat/split_01/fog_AI.svg", "version": 2,
              "approval": "approved", "fingerprint": "sha256:…" },
  "settings": { "defaults": {…}, "overrides": {…}, "effective": {…},
                "fingerprint": "sha256:…" },
  "jpeg": { "width": 3886, "height": 3886, "megapixels": 15.1,
            "quality": 0.92, "profile": "baseline" },
  "tools": { "svgo": { "enabled": true, "version": "4.1.0", "config": "…",
                       "beforeBytes": 0, "afterBytes": 0, "beforeHash": "…", "afterHash": "…" },
             "eps": { "enabled": false, "writer": "builtin-subset-1" } },
  "metadata": { "state": "accepted", "title": "…", "description": "…", "tags": ["…"],
                "prompt": "…", "provider": "Gemini", "model": "gemini-3.1-flash-lite",
                "requestId": "…", "usage": { "input": 1, "output": 2, "total": 3 },
                "cost": null, "costBasis": "none", "fingerprint": "sha256:…",
                "validation": { "ok": true, "errors": [] } },
  "outputs": { "svg":  { "path": "export/fog.svg", "bytes": 0, "hash": "sha256:…" },
               "jpg":  { "path": "export/fog.jpg", "bytes": 0, "hash": "sha256:…",
                         "width": 3886, "height": 3886 },
               "eps":  { "path": "export/fog.eps", "bytes": 0, "hash": "sha256:…" } },
  "stage": "committed", "status": "processed",
  "validation": { "svg": true, "jpeg": true, "eps": true, "json": true, "readback": true },
  "error": null, "recovery": "none",
  "timestamps": { "preparedAt": "…", "committedAt": "…" }
}
```

Relative paths, atomic writes (tmp → verify → overwrite → cleanup), corrupt or
missing JSON never destroys valid output files (it is rebuilt on next export).

### 4.4 Fingerprints and selective re-export

`planStages(record, current)` compares: source SVG hash, settings fingerprint,
metadata fingerprint, per-output presence/hash.

| Change | Stages re-run |
|---|---|
| metadata text edited (accepted again) | embed → validate → commit (no AI, no render) |
| padding / background / stroke / MP / quality | prepare → render → optimize → embed → validate → commit |
| optimize toggle | optimize → embed → validate → commit (JPEG kept) |
| EPS toggle | eps → validate → commit only |
| source SVG changed | everything |
| output file missing/corrupt | only the missing outputs rebuild |
| nothing changed | nothing (no AI request, no render) |

---

## 5. Failure policy

* **Fail closed** (RULE 15): an output is committed only after it validates
  (SVG parses + metadata readback equals accepted fields; JPEG decodes at the
  declared dimensions with XMP readback; EPS header + bounding box).
* **Per-item isolation** (RULE 5): one icon's failure never touches another's
  package; the batch continues and reports.
* **Atomic commit** (RULE 23): tmp → verify → overwrite → cleanup per file;
  a crash mid-commit leaves the last valid package in place; unfinished work
  restores as `interrupted` / needs review, never auto-active.
* **Provider policy** (mirrors I-20): only provider-CONFIRMED failures
  (HTTP status / error payload) are retried automatically (configured 0–5);
  a timeout/abort/disconnect is *outcome unknown* — **never resent
  automatically** (no duplicate paid submission), journalled, offered as an
  explicit Retry. Cancel stops unsent/uncommitted work; completed packages
  stay.
* **Error classes** distinguished: api / parse / render / optimize /
  metadata / conversion(eps) / disk / commit — each with a safe redacted
  cause and a recommended action in the log (no keys, no payloads, I-24).
* Missing/corrupt `export.json` → rebuilt; never destroys outputs (RULE 13).
* Missing/changed source SVG → visible row warning; never silently substitute
  artwork.

---

## 6. Undo

One new history entry type **`uploadSettings`**: `{ overrides: { [pairId]:
Overrides | null } }` before/after. "Apply settings to selected" pushes ONE
entry (affected count shown first, armed like the V2 bulk bar). Per-icon
override set/reset pushes one entry each. Global-defaults edits are persisted
but **not** on the timeline (same class as presets — recorded in
SYSTEM_OF_RECORD §12.5's not-undoable column). The apply path lives in
`state/apply.ts` → `upload/uploadundo.ts` live-applier binding (a mounted
panel applies; unmounted applies straight to the store).

---

## 7. Phased TDD plan (every phase independently testable)

1. **Settings + geometry** — `upload_settings.test.ts`, `upload_geom.test.ts`
   (defaults/clamps/overrides/effective/reset/fingerprint; pt→px; bounds
   incl. stroke/caps/transforms; fit/padding).
2. **Metadata rules + Gemini client** — `upload_meta.test.ts`,
   `gemini_client.test.ts` (exact default prompt; parse/validate incl. the
   §2.1/2.2 resolutions; request shape; auth header; readers; classification;
   retry policy).
3. **Embed + optimize + EPS** — `upload_embed.test.ts`,
   `upload_jpeg.test.ts`, `upload_optimize.test.ts`, `upload_eps.test.ts`
   (SVG readback; XMP round-trip incl. Unicode; SVGO preserves
   viewBox/geometry/strokes/metadata; genuine EPS + honest subset failure).
4. **Raster + export record** — `upload_raster.test.ts` (15.1 MP integer
   dims, flatten, verify), `upload_prepare`+`upload_export.test.ts`
   (schema round-trip, corrupt rejection, stage planner, atomic writes).
5. **Discovery + scan** — `upload_discovery.test.ts` (approved-only, one row
   per pair, `export/` exclusion, sidecar linkage, splitscope, deterministic
   order), `upload_scan.test.ts`.
6. **Pipelines** — `upload_runmetadata.test.ts` (fake transport end-to-end,
   invalid metadata blocks export, failure isolation, cancel, journal),
   `upload_runexport.test.ts` (full package per icon, selective re-export
   does no redundant work, partial on EPS failure, restart recovery).
7. **Stores + undo** — `upload_settings_store.test.ts`,
   `upload_keystore.test.ts` (secret hygiene), `upload_journal.test.ts`,
   history apply tests.
8. **UI** — `upload_ui.test.tsx` (tab order, open folder → rows, counts, row
   actions, editable/copiable metadata fields, bulk apply = one undo entry,
   zoom, filters, previews).
9. **Gates + docs** — `npx tsc --noEmit`, `npm run lint`,
   `node tools/quality.mjs --changed --allow-legacy`, `npm test`,
   `npm run coverage` (src/lib ≥ 80%), `npm run verify`; SYSTEM_OF_RECORD /
   docs/README / UI_SELECTORS updated in the same change.

No phase rewrites Generate SVG; every reuse is an import, every new rule a
small tested module (RULE 16/18 budgets apply to all new code).
