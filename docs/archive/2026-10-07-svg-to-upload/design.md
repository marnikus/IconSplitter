# SVG to upload — preparing approved icons for the web (2026-10-07)

Feature (verbatim scope from the request): a new tab **after Generate SVG** that
turns the *preferred, approved* SVG of each icon into an upload-ready package —
padded/fitted artboard, chosen background, declared stroke width, conceptual
metadata from Gemini, SVGO-optimised SVG, a **15.1 MP JPEG**, an optional EPS,
and one **per-icon `export.json`** — with **no automatic website uploading**.

This document is the research + design half of the request (its §1 and §20.1) and
the contract the implementation is held to. Production code starts only after the
decisions below.

---

## 1. What already exists (reuse map — verified by reading the code)

| Need (request §) | Reuse | Where | Verdict |
|---|---|---|---|
| Approved-source discovery (§2) | `discoverApprovedSources(root)` → `Discovery { sources, problems, excluded, audit, metas, corruptFiles }` | `src/svg/sources.ts` | **reuse as-is** — the new tab calls the same function; the exports it must hide are excluded by extending `sourcelist`/`splitscope`, never by a second walker |
| Folders / full path / Rescan (§3) | `FolderBar`, `pickroot.pickFolderFor`, `rootcapture`, `rootpath.loadRootPathInfo`, `rootsource` | `src/ui/*`, `src/lib/rootpath.ts`, `src/selection/rootsource.ts` | **reuse as-is** (one control for every tab; no second picker) |
| The chosen version per icon (§2/§3) | `chosenVersion(versions, preferred)`, `preferredVersion`, `showVersion` row rule, `VersionsDialog` | `src/lib/svgfile.ts`, `src/svg/rowmodel.ts`, `src/svg/VersionsDialog.tsx` | **reuse** — "chosen version" in the new tab means exactly `chosenVersion` |
| Pair JSON as the link (§2 "use .Jsons to link all correct") | `PairMeta` + `loadMetaAt` / `saveMetaAt` (tmp → verify → overwrite) | `src/lib/pairmeta.ts`, `src/selection/pairstore.ts` | **reuse the reader**; new per-icon export state is written by the same atomic writer pattern |
| SVG rendering + preview (§6) | `buildSvgPreview` (parse, sanitise, ratio), `SvgPreviewBox` (shadow root), `previewFrame`/`PreviewBackground` | `src/lib/svgpreview.ts`, `src/svg/SvgPreview.tsx`, `src/lib/svgbackground.ts` | **reuse** — the row's SVG thumbnail is the existing preview box, one per row |
| Row list, filters, sort, search, checkboxes, active row, hotkeys (§3) | `svglist.visibleRows`, `statemodel` action/reducer pattern, `SvgHotkeys`, `SvgBulkBar` layout | `src/svg/*` | **reuse the patterns and CSS language**; the new tab gets its own small model (its states are different) rather than growing `SvgModel` |
| Thumbnail zoom (§3) | `lib/zoom` (`zoomBox`, `clampZoom`, 48–800) + `ui/PairedThumbs` | `src/lib/zoom.ts`, `src/ui/PairedThumbs.tsx` | **reuse** — one thumbnail per row, so a single slot box from `zoomBoxRatio` |
| Undo (§4 bulk "one undoable settings action") | `HistoryProvider` + `hist.push({type, label, origin, before, after})` and the apply registry | `src/state/HistoryProvider.tsx`, `src/state/apply.ts` | **reuse** — settings edits push one entry, sourced from this tab |
| Job states, queue, cancel, no duplicate paid work (§8/§16) | `runqueue` (pure) + `runcontrol` (async, refs authority) + `journal` (in-flight) | `src/svg/runqueue.ts`, `src/svg/runcontrol.ts`, `src/svg/journal.ts` | **reuse the pattern**: metadata requests get their own journal entries; exports run under the same one-in-flight discipline |
| Provider, key, streaming, usage/cost (§8) | `buildChatRequest` (`ContentPart { type:"image_url" }`), `sendChat`, `readUsage`, `classifyHttp`, `classifyTransport`, `readJsonResponse`, `streamChat`, `keystore`, `catalog.refreshCatalog`, `modelcaps`, `svgpricing` | `src/lib/svgrequest.ts`, `src/lib/svgstream*.ts`, `src/svg/{keystore,catalog}.ts` | **reuse almost entirely** — Gemini is reached through the same OpenAI-compatible transport; only the model id is verified against `/v1/models` |
| Settings persistence (§4) | `state/safestorage.readKey/writeKey`, the `prefsstore` shape (`DEFAULT_*`, `parse*`, `load*`, `save*`) | `src/state/safestorage.ts`, `src/svg/prefsstore.ts` | **reuse the pattern** — one `svgupload/settingsstore.ts` with validated parse |
| Logging (§18) | `log({ level, feature, action, detail, data })`, `feature` union | `src/log/logstore.ts` | **reuse**; a new `feature: "upload"` |
| Atomic file writes, directories (§14) | `ensureDirPath`, `writeFileOverwrite`, `writeFileNew`, `probePath`, `tryGetFile` | `src/lib/fs.ts` | **reuse** |
| Tab shell (§3) | `TABS` in `ui/Workbench.tsx`, `TabId` in `lib/session.ts`, `AppState` in `state/appstore.ts` | — | extend all three (one id: `svgUpload`) |

**Not reused, deliberately:** `SvgBatchStrip`/`SvgQueue` (a run's request record —
the new tab's units are icons, not requests), `PairedThumbs` for anything but the
thumbnail (§2: "no AI reference alongside it" — one preview, so `PairedThumbs`
is used with a single slot box, or the plain `zoomBoxRatio` box).

## 2. What is new (module ownership)

```
src/lib/svgupload/            pure rules — no DOM, no IO (RULE 3/5)
  units.ts        pt → user units, DPI declaration, unit parsing ("2.2 pt")
  fit.ts          visible bounds + padding → translate/scale, aspect preserved
  target.ts       15.1 MP integer dimensions + actual MP, ratio preserved
  metaprompt.ts   the default prompt + the strict parser/validator
  mime.ts         SVG title/desc/metadata embedding (XML-escaped, Unicode safe)
  jpegseg.ts      JPEG segment reader/writer: APP1 XMP, APP13 IPTC-IIM (+verify)
  optimize.ts     SVGO wrapper (svgo/browser) with the metadata-preserving plugin set
  exportjson.ts   the export.json schema (build + parse + version)
  states.ts       job states, fingerprinting, selective re-export decisions

src/svgupload/                wired halves
  settingsstore.ts   defaults + per-icon overrides (persisted, validated)
  sourceindex.ts     approved + preferred source resolution (uses pair JSONs)
  prepare.ts         renders the padded/fitted artboard (measurement seam)
  raster.ts          canvas rasterisation at the computed dimensions
  metadata.ts        the Gemini call (reuses svgrequest/svgstream)
  exporter.ts        per-icon pipeline: prepare → optimize → render → embed → JSON
  jobctl.ts          one export in flight at a time; cancel; per-item progress

src/svgupload/ (UI)
  UploadPanel.tsx    the tab shell (FolderBar, controls, bulk bar, list)
  UploadControls.tsx settings (global defaults) + provider card
  UploadBulk.tsx     selection + Apply/Generate/Export/Retry + counts + zoom
  UploadRow.tsx      one icon: preview, path, version, states, actions, warnings
  UploadMetadata.tsx the editable/metadata fields under the row (§10)
  UploadDialogs.tsx  preview / settings / prompt-preview / confirm
```

Every module above is a candidate for the RULE 18 budget (file 150–300 lines,
function ≤ 30 lines / ≤ 4 params / CC ≤ 10 / nesting ≤ 4); §7 splits anything
that grows past it.

## 3. Research findings (verified 2026-10-07)

1. **`gemini-3.1-flash-lite` is a real, stable model id.** Google's model page
   (`ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite`) lists model code
   `gemini-3.1-flash-lite`, stable, latest update May 2026: **input** text / image
   / video / audio / PDF, **output** text, 1,048,576 input tokens, 65,536 output
   tokens, **structured outputs supported**, thinking supported. Vision input is
   therefore supported — the guide's premise holds. `…-preview` also exists; the
   stable id is what we default to, and the *actual* id sent is the one verified
   against the provider's own `/v1/models` list (never a silent substitution —
   if the exact id is absent the tab refuses with the reason, per §8).
2. **The transport already fits.** Requesty is OpenAI-compatible
   (`https://router.requesty.ai/v1`, `chat/completions` with `image_url` data
   URLs — `docs.requesty.ai`). Gemini itself is OpenAI-compatible too
   (`generativelanguage.googleapis.com/v1beta/openai/`), so the *same*
   `buildChatRequest`/`sendChat`/stream machinery serves both, and the base URL
   stays configurable. No new HTTP client, no new key store.
3. **SVGO is browser-ready.** SVGO **4.1.0** ships an official browser entry —
   `import { optimize } from "svgo/browser"` (the v4 migration renamed
   `svgo/dist/svgo.browser.js` to the `svgo/browser` subpath and made everything
   a named export). Config is plain data: `optimize(svg, { path, multipass,
   plugins })`. **Risk found:** `preset-default` includes removers that can strip
   exactly what §11/§12 require (`removeTitle`, `removeDesc`, `removeMetadata`,
   plus `collapseGroups`/`convertPathData` touching geometry). The wrapper
   therefore pins the plugin list explicitly, and a test renders before/after and
   asserts `<title>`, `<desc>`, `<metadata>`, colours, stroke attributes and the
   `viewBox` all survive (and that no stroke becomes a fill).
4. **JPEG metadata has no browser API — it is byte surgery, and that is settled
   practice.** XMP lives in an **APP1** segment and IPTC-IIM in an **APP13**
   Photoshop IRB; both are inserted before `SOS` (`0xFFDA`) (Adobe/RidgeRun
   segment layout, the widely used in-browser inserter approach). We implement it
   as a pure module: parse segments → replace-or-insert → re-serialise, then
   **read the bytes back** and compare the values (§11 "reopen and verify").
   A JPEG from `canvas.toBlob` carries JFIF only, so there is nothing to preserve
   but the image data itself. Note: canvas files are **96 dpi** by spec, and
   browsers embed no ICC profile — the export JSON records the colour profile as
   *implied sRGB* and says so honestly (§7's "configured profile" cannot be
   promised beyond that without shipping an ICC blob; documented limitation).
5. **EPS cannot be produced honestly in a browser.** CairoSVG does not write EPS.
   Genuine EPS needs Inkscape (`--export-ps-level=3`) or Ghostscript's
   `epswrite` on a PostScript/PDF intermediate (`gsvg` was removed from
   GhostPDL), and EPS itself cannot represent transparency or (in PS level 2)
   gradients — converters rasterise or refuse. **Decision:** EPS is a
   *converter-gated* output. The tab preflights for a configured converter
   endpoint; with none, an EPS-requested export produces SVG+JPEG and is
   reported **Partial** with the exact reason (§13), and the UI never writes a
   `.eps` that is not a real EPS.
6. **15.1 MP is safe for canvas.** Chromium's canvas limits (max dimension
   16,384; total area far above 15.1 M) accommodate the target; `drawImage` from
   an SVG blob URL, then `canvas.toBlob("image/jpeg", q)`, is the supported path
   (MDN). `toBlob` (not `toDataURL`) keeps a 15 MP image off the string path.
   Alpha is flattened by filling the canvas with the chosen background first.

## 4. Contradictions resolved (request §9 "resolve before implementation")

| # | Contradiction | Decision (and why) |
|---|---|---|
| C1 | "Notes request 50 keywords, the detailed prompt/example use 40" | **40** — the default prompt, the template, the validator and the UI counter all say 40. One rule, enforced at parse time; a 50-tag answer is invalid and is shown to the user for correction, never silently accepted |
| C2 | The example second sentence ("The Vector Icon of X and Y") is 7–9 words, outside the stated 3–5 | The **3–5 word** limit is the rule; the example is illustrative only, and the validator counts words, not wishes. The doc no longer claims the example satisfies its own limit |
| C3 | "formally valid" metadata vs "legal/IP clearance" | Validation is **structural only** (counts, required terms, banned patterns, duplicates, truncation). The UI says "checked against the rules", never "cleared" |
| C4 | Padding "in pt" while the SVG/raster work in user units | One **declared document DPI** (CSS: 96 px/in, 72 pt/in ⇒ 1 pt = 4/3 px). The setting stores value **and** unit; the export JSON records the unit, the DPI and the resolved px. Nothing is "unexplained px" |
| C5 | "stroke width 2.2 pt" vs an icon that already has strokes | The setting is the **desired output stroke width**; the pipeline computes a per-document stroke-scale factor (target ÷ measured median stroke) and records both. Non-scaling strokes (`vector-effect`) and transformed paths are measured after transforms, and are never silently rewritten |
| C6 | "Include selected background in exported SVG" vs "never recolour the artwork" | Background is emitted as a **full-frame rect behind the artwork** inside the export copy (plus the JPEG flatten). The document's own strokes/fills are byte-identical; the check is a before/after comparison test |
| C7 | "Green processed check" vs EPS/Partial | Green only when **every requested output** is written AND its JSON validates AND the package committed. Requested-EPS-without-converter = **Partial** (never green) |
| C8 | "Metadata field below each item" (§10) vs the existing row density | The row gains a compact metadata strip (title · description · tag count · state) with a **Preview/Edit dialog** for the full editable, copyable fields. Empty until generated. The strip is a `<details>`-free single line so 800 px thumbnails stay usable |
| C9 | "Use .Jsons to link all correct" vs exports creating more JSON | The **pair JSON is the identity link**: source path, chosen version, approval and fingerprints all come from it. `export.json` only *references* the pair (never copies authority), and the export folder is excluded from discovery so a re-scan cannot treat exports as sources (loop prevention, §2) |
| C10 | Guidance says "CairoSVG-based pipeline" | Rejected: CairoSVG has no EPS writer. A real converter is required and the design treats it as an external capability (research finding 5) |

## 5. Data ownership and schemas

**Per-icon settings** (persisted in `iconSplitter.upload.settings.v1`):
`{ defaults: UploadDefaults, overrides: Record<pairId, Partial<UploadDefaults>> }`.
A field is *inherited* until the user edits it for that icon; editing writes only
that field into the override. `Reset to defaults` deletes the override entry.

```ts
interface UploadDefaults {
  padding: { value: number; unit: "pt" | "px" | "%"; perSide?: [n,n,n,n] };
  outputScale: number;              // 1 = artboard = padded bounds
  background: PreviewBackground;    // reuse of the existing validated type
  stroke: { value: number; unit: "pt" | "px"; enabled: boolean };
  jpeg: { targetMp: 15.1; quality: 0.9; profile: "sRGB-implied" };
  optimizeSvg: true;
  includeEps: false;
}
```

**Per-icon export record** (`export/export.json`, schema version 1) — every field
the request's §15 names: schema version; pair/source/version ids; source
path + approval + fingerprint; effective settings with their origin
(`default`/`override` per field); resolved px values + DPI; JPEG dims/MP/quality/
profile; flags + tool versions (`svgo 4.1.0`, converter, app); accepted
title/description/tags + the validation policy id; the exact prompt, provider,
model, request id, tokens, actual-or-estimated cost; per-output path/format/
bytes/hash/dimensions; timestamps per stage; status; validation results; a
redacted error; and the recovery fingerprint. Relative paths inside the package;
atomic write (write `export.json.tmp` → verify parse → overwrite → remove tmp);
a corrupt or missing `export.json` never deletes valid outputs (§15/§18).

**Job states** (§16): `discovered → preflight → prepare → metadata →
render/optimize → embed → eps → validate → commit → processed`, with `failed`,
`partial`, `cancelled`, `stale` as terminal/invalidating states. Details worth
pinning down now:
* metadata is generated **once** and carried through optimisation and embedding —
  SVGO runs with the metadata-preserving plugin set, and the embedded values are
  verified against the accepted fields *after* the write;
* per-item and per-stage progress, bounded concurrency (default 2 exports, one
  metadata request at a time — the transport's one-in-flight discipline);
* `cancel` stops unsent/uncommitted work, keeps completed packages;
* a green check appears only after the commit step validates the whole package.

**Selective re-export** (§17) is a pure function of fingerprints:

| Change | Rebuild |
|---|---|
| padding / scale / background / stroke | prepare → optimize → JPEG → embed → JSON (metadata text kept, relevance flagged) |
| metadata text only | embed (SVG + JPEG) → JSON (no AI request) |
| JPEG quality / target MP | raster → embed → JSON |
| optimizeSvg toggled | optimize → JPEG → embed → JSON |
| includeEps toggled | eps stage → JSON |
| source version / SVG hash | everything (including metadata relevance → `stale`) |
| missing / corrupt output | only the stages that produced it |

## 6. Failure policy (one table, so the code has one answer per case)

| Failure | Reported as | Package kept? |
|---|---|---|
| no full path captured | preflight warning; export still allowed (paths are root-relative) | yes |
| converter missing while EPS requested | **Partial** + reason, SVG/JPEG exported | yes (SVG+JPEG) |
| Gemini auth / model missing / refusal / truncated / malformed | metadata stage **Failed** with the provider's own reason; nothing embedded | no export written; prior package preserved |
| metadata invalid (counts, required terms, banned patterns) | item **Needs review**; user edits/regenerates | prior package preserved |
| unsent completion (timeout / lost stream) | journal entry, item `interrupted — needs review`, **no duplicate paid request** | prior package preserved |
| render/optimize error | stage Failed with the tool + reason | staging discarded; prior package preserved |
| disk full / write error | stage Failed; tmp removed; **last valid package intact** | yes |
| corrupt `export.json` found on scan | warning on the row; outputs listed from the filesystem; rebuild offered | yes (files untouched) |

## 7. Phased plan (TDD; each phase green and pushable)

| Phase | Deliverable | Tests first (names are the contract) |
|---|---|---|
| **A. cores** (this commit) | `units.ts`, `fit.ts`, `target.ts` + sources index | `svgup_units.test.ts` (pt/px/% parsing, 96-dpi conversion, 2.2 pt = 2.9333 px), `svgup_fit.test.ts` (bounds+padding → transform; proportional; centred; per-side; never cropped; stroke margin), `svgup_target.test.ts` (15.1 MP integer dims, ratio preserved, actual MP reported, never distorted) |
| **B. discovery + settings** | `sourceindex.ts`, `settingsstore.ts`, tab shell + row list + bulk counts | `svgup_sources.test.ts` (approved+preferred only; export folder excluded; missing/changed → warning), `svgup_settings.test.ts` (defaults→override→reset; validation; one undo entry for Apply-to-selected) |
| **C. prepare + raster** | `prepare.ts`, `raster.ts` | `svgup_prepare.test.ts` (geometry applied to the export copy only; background rect behind artwork; strokes not recoloured), `svgup_raster.test.ts` (real canvas in happy-dom? no — a seam: dimension math pure; browser probe asserts 15.1 MP decode) |
| **D. metadata** | `metaprompt.ts`, `metadata.ts`, provider card, prompt preview, review UI | `svgup_metaprompt.test.ts` (build + parse + every rejection: counts, required 7 terms, duplicates, truncation, mixed prose), `svgup_metadata.test.ts` (transport reuse, refusal/error mapping, journal, no duplicate submission) |
| **E. embed + verify** | `mime.ts`, `jpegseg.ts` | `svgup_mime.test.ts` (Unicode, escaping, readback equals accepted), `svgup_jpegseg.test.ts` (insert/replace/verify XMP+IPTC on real bytes; malformed input refused) |
| **F. optimize + EPS gate** | `optimize.ts`, converter preflight | `svgup_optimize.test.ts` (geometry/colours/strokes/metadata preserved; size recorded), `svgup_eps.test.ts` (missing converter → preflight refusal + Partial; a present converter is exercised through a fake endpoint) |
| **G. package + states** | `exportjson.ts`, `states.ts`, `exporter.ts`, `jobctl.ts` | `svgup_exportjson.test.ts` (schema round-trip, atomic write, corrupt file tolerated), `svgup_job.test.ts` (stage order, per-item independence, cancel, fingerprints/selective re-export matrix) |
| **H. integration** | panel wiring, browser probe | `svgup_ui.test.tsx` (row states, bulk actions, undo), probe: real OPFS tree, one icon end-to-end with a fake provider and a real 15.1 MP JPEG read back |

Phases A–C need no network; D–F need a provider (tests use the existing fake
transport); G–H are local only. **No Generate SVG code is rewritten** — the two
tabs share libraries, never state.

## 8. Acceptance mapping (§21 → where it is proven)

approved-only rows → `svgup_sources`; global/local settings → `svgup_settings`;
15.1 MP from vectors → `svgup_target` + probe; one metadata policy → `svgup_metaprompt`;
optimisation preserves appearance → `svgup_optimize`; genuine EPS or none →
`svgup_eps`; per-icon folder + JSON → `svgup_exportjson`; green = committed →
`svgup_job`; selective re-export → `svgup_job`; sources untouched →
`svgup_prepare` + probe.

## 9. Open limitations (declared, not hidden)

* **ICC profile** — JPEG output is sRGB *by convention*; browsers write no profile
  and the app ships none. Recorded as `sRGB-implied` in the JSON.
* **EPS** — needs an external converter; without one the output is Partial.
* **Fonts in SVG** — text elements render with the browser's fallback when the
  original font is unavailable; the tab warns when the chosen version contains
  `<text>` rather than pretending the raster is identical.
* **Tag policy** — 40 required, and the seven mandatory terms must appear; a
  provider answer that misses them is shown to the user, never auto-fixed.
