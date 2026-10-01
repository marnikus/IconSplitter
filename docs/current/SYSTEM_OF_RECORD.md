# System of Record — Icon Splitter

Current behaviour, invariants and flows. If code and this doc disagree, one of
them is wrong — fix the wrong one in the same change (AGENT_RULES RULE 17).
Adapted structure from `Process-Images-in-Areana/docs/current/SYSTEM_OF_RECORD.md`.

<!-- ideal-size: 357 lines reason=RULE 17 forbids a second current doc, so all four
     modes' authoritative behaviour lives in this one file; per-mode design detail
     stays in docs/archive/ instead of growing here. -->

## 1. What this is

A browser app with five modes (top tabs, `src/ui/Workbench.tsx`):

1. **Single sheets** — detect individual icons in a sprite sheet, review,
   resize and exclude them, export equal-size square PNGs (ZIP / downloads /
   folder / clipboard).
2. **Batch folders** (Chrome/Edge only, File System Access API) — pick a root
   folder, recursively scan every `*_AI*` image, review and select them, split
   each into its own organised output tree beside the sources, with presets
   and per-reference JSON status tracking.
3. **Selection** (Chrome/Edge only) — recursively scan a root, pair every
   original with its `_AI` result, review them side by side and store an
   approve/decline decision per pair in `review-decisions.json`.
4. **Selection V2** (Chrome/Edge only) — the same discovery, decisions and
   decision file as mode 3, presented as the template-driven
   `design temp/selection tab V2/v2 selection tab.html` design: a full-width
   **list review** with paired thumbnails, a thumbnail zoom slider, real
   multi-selection and bulk approve, plus a switchable **comparison** layout.
5. **Generate SVG** (Chrome/Edge only) — recursively scans the same root and
   keeps ONLY the pairs the Selection workflow approved, sends each approved
   AI image (alone or as a square contact sheet of up to 9) to Requesty's
   OpenAI-compatible chat endpoint, and saves one validated SVG per source
   beside that source's AI image, versioned (`_v2`, `_v3`…) with a per-file
   `<stem>.svg.json` sidecar. Nothing is uploaded anywhere; the API key lives
   only in this browser.

Stack: React 19 + Vite 7 + TypeScript + Tailwind 4, `jszip` for archives.
Production build is one self-contained `dist/index.html`
(`vite-plugin-singlefile`) that runs offline with no server (RULE 20).

## 2. Current behaviour (authoritative)

Single sheets:

* Drop or choose image files (PNG/JPG/WEBP). Non-images are filtered with a message.
* Each sheet is analyzed (background colour, ink mask, threshold) and icons are
  detected automatically; merge distance is adjustable per sheet with an auto default.
* Detected boxes render over the sheet preview; clicking a box toggles exclude/include.
* Export: every included icon becomes a centred square (largest icon side +
  padding %), optionally transparent, optionally fixed size; delivered as ZIP,
  individual downloads, folder save, or single-icon clipboard copy.

Batch folders:

* Pick a source root (readwrite handle). Recursively scans all images; the
  output folder `_split_output` is ignored during scans (configurable list).
* Only `name_AI.ext` images with an optional numeric tail (`name_AI_7.ext`,
  `name_AI_9_01.ext` — the shapes batch outputs use) are eligible; the reference
  `name.ext` is linked, never processed, and copied into every `split_NN`
  subfolder. Missing reference → warning + user may skip or continue.
* Review window: thumbnail, filename, relPath, status badge
  (unprocessed/processed/skipped/changed/missing/deleted), checkbox, Select/Deselect All.
* Presets store every configurable value (source/dest handles in IndexedDB,
  config in localStorage); last-used preset restores automatically.
* Processing: rescan runs before each batch; per-item progress, per-item
  failure isolation, Stop button honoured between items.
* Output tree: `<root>/_split_output/YYYY-MM/YYYY-MM-DD_HH-mm-ss/<src-hierarchy>/<src-stem>/split_NN/<stem>_NN.png`
  (+ reference copy), or the same structure directly inside a custom destination.
  Never overwrites; collisions get `_v02…` appended after any existing `_AI_7`.
* State JSON `<base>.json` lives beside the reference; refreshed after every
  scan and batch; corrupt payloads are rejected and rebuilt (RULE 13).
* "Open in File Explorer" is impossible from a browser — the action copies the
  path and says so honestly (RULE 4/9).

Selection:

* Recursive scan pairs `name.ext` with `name_AI.ext` incl. numeric tails
  (`name_AI_9_01.ext`; stable `pair_<hash>` ids, dir-scoped); unpaired files surface as
  "AI result missing" / "Original missing", never silently dropped.
* Review list: thumbnail, filename, relative folder, creation date, status
  chip with text + glyph; search, month / custom-range date filters, status
  filter, sorting by date/status/name/path in both directions, counters.
* Comparison: side-by-side panes with preserved aspect ratio, dims / format /
  size / path per side, 1:1 zoom with synced scrolling, hotkeys A/D/arrows/
  Space/Ctrl+K, auto-advance to the next pending after each decision.
* Decisions persist in `<root>/review-decisions.json` (atomic tmp-verify-
  overwrite protocol); missing file is created pending; corrupt file raises a
  warning and previous in-memory decisions are kept; write failures keep the
  change in memory with a Retry action.
* Rescan diffs added/renamed/removed/unchanged; decisions travel across
  renames via size+mtime identity; orphan records are retained so a
  transiently missing file never destroys a decision.
* A watcher re-scans every 30 s while a root is open (toggleable).

Selection V2 (adds to, never replaces, the rules above):

* Two layouts over one state: **List review** (full width, no comparison
  panel, one pair per row showing BOTH an Original and an AI result thumbnail,
  each labelled) and **Comparison** (the V1 `CompareView` panes + a pair
  picker). Layout, filters, selection and decisions survive switching.
* Thumbnail zoom: range slider **48–240 px, step 4, default 84** with a live
  "128 px" readout and both bounds shown; row and thumbnail height follow it
  while dragging, width comes from the image's own aspect ratio (never
  stretched, never upscaled past natural height). Persisted across restarts.
* Checkbox selection is separate state keyed by `pair_<hash>`, so sorting and
  filtering never lose it: header checkbox (checked / unchecked /
  indeterminate), Select visible, Deselect all, and live counts for selected,
  visible, checked-but-hidden and checked-but-incomplete.
* Bulk review — **Approve selected** / **Approve visible list**: the affected
  count is shown and the button arms before applying (Escape or Cancel
  disarms); one operation = one transition, one file write, one toast. A
  failed write keeps the change in memory with Retry.
* The **active row** (keyboard target, `aria-current`, scrolled into view) is
  distinct from a **checked row** (bulk target). `A` / `D` decide the active
  row; "Next pending after a decision" advances it.
* Extra filter: **Pairing** = all / complete / missing pair.

Everything above runs client-side; nothing is uploaded anywhere.

Generate SVG (adds to, never replaces, the rules above — and is the one mode
that makes a network call, only when the user asks it to):

* Discovery reuses the Selection scan and pairing: only pairs whose stored
  decision is **approved** become sources, keyed by the same stable
  `pair_<hash>` id (never a row index), in deterministic path order. Approved
  pairs whose AI image disappeared are reported as "lost their AI image";
  unreadable files are reported as skipped; a corrupt decision file warns and
  keeps the in-memory decisions.
* Generation: the editable prompt (stored locally, resettable to the
  documented default) is sent with the approved AI image as a data-URL
  `image_url` part. Batches of N images (1..9, default 4) are combined into
  ONE square PNG contact sheet — `columns = ceil(sqrt(n))` cells, equal
  squares, aspect preserved, centred, padded, unused cells empty — with an
  ordered "position — name" manifest in the prompt. The response is split
  into numbered SVG blocks and matched by **name AND SVG title**, never by
  appearance; duplicate/missing/unknown/out-of-range positions are reported,
  never guessed, and empty cells never produce output.
* Every result is validated (well-formed XML, exactly one `<svg>` root, valid
  `viewBox` or documented dimensions, no scripts/event handlers/unsafe
  external URLs/executable content, visible geometry) before anything is
  written. An invalid response stores a safe failure record and NO SVG file,
  and the previous valid version stays exactly where it was.
* Naming/versioning: the SVG sits beside the AI image with the same base
  name; the first version is the plain `<stem>.svg`, each
  regeneration takes the next free version from disk + sidecar and never
  overwrites. The newest VALID version is previewed by default; every version
  stays reachable through the history dialog.
* Previewing a saved SVG (`src/lib/svgpreview.ts`, rendered by
  `src/svg/SvgPreview.tsx`): the saved text is parsed with the real XML parser,
  repaired once when a namespace is missing, sanitized (no scripts, no event
  handlers, no remote URLs, no `<foreignObject>`), fitted (`viewBox` from the
  declared box or from px width/height, `width/height="100%"`,
  `preserveAspectRatio="xMidYMid meet"` so strokes scale uniformly and the art
  is centred), `currentColor` resolved the way a standalone document resolves it
  (the UA default, black — the app never recolours the artwork), id-scoped per
  document, and rendered INLINE inside its own open shadow root. The saved file
  is never modified. The row's preview and its Copy/Code actions read ONE target
  (`previewTargetOf` in `src/svg/rowmodel.ts`), so they can never show
  different versions, and `rootToken` (bumped on every pick and scan) forces
  every row to re-read the file it shows. Empty (no SVG yet) and broken
  (un-previewable file) are different states: the frame says "No SVG" or
  "Preview failed" + the reason. Design + root cause:
  `docs/archive/2026-10-01-svg-preview-rendering/design.md`.
* Per-file metadata: `<stem>.svg.json` beside the AI image (no global SVG
  decision file), written tmp → verify → overwrite → cleanup. Missing sidecar
  = pending; a corrupt sidecar warns and never destroys the SVG files. Each
  version records the source path/fingerprint, the SVG path/version, the
  generation and review status, the exact prompt, provider+model, request and
  completion timestamps, input/output/total tokens when reported, the cost with
  its currency, basis and **pricing version**, the validation result and a
  redacted error.
* Tokens & cost: every task/version shows tokens **and** the cost beside them —
  in the row, in the version history and in the run summary. A provider-reported
  number is shown as "reported"; a calculated one is always labelled
  **Estimated** and names its pricing version. The calculation is either the
  image's share of a batch total or, when no cost was reported at all, the
  versioned rate card (`lib/svgpricing`, verified Requesty rates). Neither is
  ever presented as provider-reported, and a missing number is shown as "—" and
  never invented.
* Preview background (prompt §16): the SVG preview sits in a frame whose colour
  the user picks — White / Black / Gray / Green / Red plus a custom colour —
  applied as a CSS background of the wrapper, so **no SVG document, fill,
  sidecar or export is ever modified** by it. The choice is persisted with the
  tab's view prefs and restored on the next visit. Where the chosen colour
  leaves black artwork under 3:1 contrast (WCAG non-text), the frame adds a
  light outline around the artwork so black strokes stay visible. Inside a
  frame the inline preview host paints nothing of its own, so the chosen colour
  is what the artwork is actually painted on.
* Review: a new valid SVG starts **pending**; Approve/Decline act on the
  selection (one history entry per gesture, undoable). The approved version
  is identified in the row; regenerating adds a new pending version without
  deleting old decisions or history.
* Failures: a failed request keeps the previous SVG; a rate limit reports its
  retry-after; cancellation stops unsent requests and keeps completed
  results; a restart marks an interrupted request as interrupted/unknown and
  never blindly resubmits; a save failure keeps the validated SVG recoverable.
* The API key is user-provided, stored in the browser's IndexedDB secret
  store (memory-only fallback), masked in the UI, redacted in every error and
  excluded from presets/reports/exports (RULE 20).

## 3. State model

One in-memory model, owned by `App`:

```
sheets: Sheet[]       Sheet = { id, name, base, url, img, an: Analysis,
                                boxes: Box[], autoFrac, usedFrac, manual,
                                excluded: number[] }
activeId              which sheet is shown
padding, size, transparent   export options (ExportOpts)
busy: string | null   progress surface (RULE 5)
toast: {msg, err}     honest reporting surface (RULE 2, RULE 4)
```

Detection state transitions per sheet: `loaded → analyzed → detected(auto) →
[redetected(manual frac)…]`. `excluded` is a flag set over intact `boxes`
(RULE 11); only sheet removal destroys detection work.

Batch model (`useBatch.ts`):

```
root, dest              FileSystemDirectoryHandles (dest null => auto)
rows: Row[]             Row = AiImageEntry + status + selected
keys: StateKey[]        which <base>.json files are known
preset                  Preset (split settings, ignore list, dest mode…)
busy / toast            progress + honest reporting surfaces
```

Status transitions per source record: `unprocessed → processed | skipped |
deleted`; file changed → `changed` (re-selectable); file gone at scan → `missing`
(retained in JSON); gone during processing → `deleted` (skipped safely, batch
continues).

Selection V2 model (`useSelectionV2` wraps `useSelection`, so decision,
filter and persistence state are V1's and stay single-owned):

```
core: SelectionApi      discovery, pairs + decisions, filter, sort,
                        active row (core.selectedId), write status
checked: string[]       checkbox selection (pair ids) — never a decision
prefs: ReviewPrefs      { mode: "list"|"compare", thumbHeight: 48..240 }
derived                 header check state, bulk scope
                        { affected, blocked, hidden }
```

## 4. Core flows

Single sheets:

* **Add sheets:** files → filter non-images → `loadImage` → `analyze` →
  `detect(an, null)` → sheet appended, first becomes active.
* **Review:** preview grid + SVG boundary overlay (`box-toggle-{i}`), merge
  slider re-runs `detect` with a manual fraction, `merge-reset` returns to auto.
* **Export all:** `collect()` loops sheets × included boxes → `renderIcon` →
  `canvasToBlob` (RULE 15 gate) → ZIP / sequential downloads / folder handles;
  `busy` reports `Rendering d/t…` per item (RULE 5); per-item failure is
  reported, never silently swallowed.
* **Single icon:** copy to clipboard or download one rendered blob.

Batch:

* **Scan:** root handle → `readDirTree` (ignore list) → `walkTree` →
  `collectAiImages` → `linkReferences` → `syncAndCollect` rewrites every
  `<base>.json` → rows render with statuses.
* **Process:** selection → rescan-derived items → `planBatch` (collision-safe
  folders) → per item: load → `splitSheet` → write `split_NN/<stem>_NN.png`
  via no-overwrite writes → copy reference per split dir → `applyOutcomes`
  persists statuses → UI mirrors (RULE 24). Stop is honoured between items.
* **Presets:** save/load/delete in localStorage; directory handles persisted
  in IndexedDB per preset name; last-used preset auto-restores on open.

## 5. Invariants

* **I-1 (RULE 6):** every export contains exactly the currently included boxes
  of currently loaded sheets.
* **I-2 (RULE 4):** "no icons detected" and "image could not be read" are
  distinct honest states — never a fake success.
* **I-3 (RULE 11):** exclusion never destroys detection work.
* **I-4 (RULE 15):** a blob is delivered only after canvas dims > 0, blob
  non-null, size > 0; otherwise the item is skipped with an error.
* **I-5 (RULE 20):** image bytes never leave the browser.
* **I-6 (RULE 22):** export names derive from one function: sanitized sheet
  base + `-icon-NN.png`, deterministic detection order.
* **I-7 (RULE 24):** every visible value mirrors current state at the moment
  of change — no value waits for another interaction to become visible.
* **I-8 (batch, RULE 23):** batch outputs never overwrite: dirs/files are
  probed `create:false` first; collisions take `_v02…`; existing `_AI_7`
  variant suffixes are preserved, never replaced.
* **I-9 (batch, RULE 6):** the `_split_output` tree is never scanned as input;
  filtered-out (missing/deleted) sources never enter a batch.
* **I-10 (batch, RULE 13):** state JSON is validated on read; corrupt payloads
  are replaced with fresh valid state, never fatal.
* **I-11 (batch, RULE 1/3):** pixel math in batch mode reuses `lib/detect` +
  `lib/render` through `splitSheet` — no second detection implementation.
* **I-12 (selection, RULE 13):** a corrupt or unwritable decision file never
  destroys decisions — in-memory records win, the user is warned, retry offered.
* **I-13 (selection, RULE 4):** "generated" never implies "approved"; a pair
  without a stored decision is pending, always.
* **I-14 (selection, a11y):** every status is text + glyph first; colour is
  reinforcement, never the only signal.
* **I-15 (selection V2, RULE 6/4):** a bulk decision touches exactly
  `checked ∩ visible ∩ complete`; hidden checks are counted and reported,
  never applied, and an incomplete pair is never approved silently.
* **I-16 (selection V2, RULE 24):** the zoom slider, the row height and the
  thumbnail height are one value; moving the slider changes all three in the
  same render, and the stored value survives a restart.
* **I-17 (SVG preview, RULE 3/14):** the preview background is an app setting —
  it lives in the frame around the preview and never in the SVG text, the
  sidecar or an export; the code dialog always shows the saved bytes.
* **I-18 (SVG cost, RULE 4):** a version's cost is either provider-reported or a
  labelled estimate; the two are never merged, never relabelled and never
  invented, and both survive a restart through the sidecar.

## 6. Storage map

| Where | What | Rules |
|---|---|---|
| localStorage `iconSplitter.presets.v1` | preset list (JSON) | validated on read (RULE 13) |
| localStorage `iconSplitter.lastPreset.v1` | last-used preset name | restores on boot |
| IndexedDB `iconSplitter/handles` | source/dest directory handles per preset | permission re-requested on restore |
| `<refDir>/<base>.json` | per-reference source status records | rewritten after every scan/batch; app-owned, overwrite allowed |
| `<root>/_split_output/…` or custom dest | batch outputs | never overwritten (I-8) |
| `<root>/review-decisions.json` | selection approve/decline records | atomic write; corrupt → warn + keep memory (I-12) |
| IndexedDB `iconSplitter/handles["__selection__"]` | selection root handle (shared by both Selection tabs) | permission re-requested on restore |
| localStorage `iconSplitter.selectionV2.prefs.v1` | V2 view prefs `{ mode, thumbHeight }` | validated + clamped on read (RULE 13) |
| IndexedDB `iconSplitter/handles["__svg__"]` | Generate SVG root handle | falls back to the Selection handle |
| localStorage `iconSplitter.svg.prefs.v1` | SVG tab view prefs `{ thumbHeight, providerOpen, previewBg }` | clamped/validated on read (RULE 13); a missing/non-boolean `providerOpen` keeps the model card open |
| localStorage `iconSplitter.svg.prompt.v1` | generation prompt | empty/missing → documented default |
| localStorage `iconSplitter.svg.config.v1` | provider settings (base URL, model id, timeout, retries, concurrency, images/request, max tokens) | clamped on read (RULE 13) |
| IndexedDB `iconSplitter/secrets` | Requesty API key | never in localStorage, presets, reports or Git (RULE 20); DB version 2 added this store — an install that predates it upgrades on first open, and a write that still fails falls back to a session-only key the UI names as such |
| `<dir>/<stem>.svg` | one generated SVG version | never overwritten; `_v2`, `_v3`… allocated from disk + sidecar |
| `<dir>/<stem>.svg.json` | per-source sidecar: versions, prompts, usage, cost, validation, review | atomic write; corrupt → warn, SVGs untouched |

Object URLs from user files are revoked on sheet removal (sheets mode).

## 7. Key modules and layers

| Layer | Files | Owns |
|---|---|---|
| Mode shell | `src/ui/Workbench.tsx`, `src/main.tsx` | Sheets/Batch tab switch |
| Sheets UI | `src/App.tsx`, `src/utils/cn.ts` | sheet state, controls, export paths |
| Detection | `src/lib/detect.ts` | `analyze` (mask), `detect` (boxes, auto radius, reading order) |
| Rendering | `src/lib/render.ts` | `squareInfo`, `cropRect`, `renderIcon`, `canvasToBlob` |
| Naming (batch) | `src/lib/naming.ts` | `_AI` parse, split names, variations, batch path |
| Scan (batch) | `src/lib/scan.ts` | tree walk, eligibility, ref linking, diff |
| State JSON | `src/lib/statefile.ts`, `src/batch/statewrite.ts` | model + merge + validation; file sync + outcomes |
| Output plan | `src/lib/output.ts` | month/timestamp layout, `_vNN` allocation |
| FS adapter | `src/lib/fs.ts`, `src/batch/picker.ts` | no-overwrite IO, tree read, folder picking |
| Batch split | `src/lib/batchsplit.ts`, `src/lib/dom.ts` | sheet→blobs orchestration; image loading |
| Batch UI | `src/batch/useBatch.ts`, `BatchPanel.tsx`, `ScanTable.tsx`, `PresetBar.tsx`, `store.ts` | orchestration, review window, presets, persistence |
| Selection logic | `src/lib/pairing.ts`, `reviewfilter.ts`, `reviewsort.ts`, `reviewmeta.ts`, `reviewfile.ts` | pairing, filters, sorts, status/hotkey semantics, decision records |
| Selection logic (V2) | `src/lib/reviewselect.ts`, `reviewbulk.ts`, `reviewprefs.ts` | checkbox selection, bulk scope/summary, persisted view prefs |
| Selection IO+UI | `src/selection/state.ts`, `reviewstore.ts`, `handles.ts`, `fmt.ts`, `thumbs.ts`, `hotkeys.ts`, `copypath.ts`, `Surfaces.tsx`, `useSelection.ts`, `SelectionPanel.tsx`, `FilterBar.tsx`, `PairList.tsx`, `CompareView.tsx`, `HeaderRow.tsx`, `StatusFooter.tsx` | reducers, atomic decision IO, bulk reducer, shared hotkeys/surfaces, review UI |
| Selection V2 UI | `src/selectionv2/useSelectionV2.ts`, `SelectionV2Panel.tsx`, `SourceBar.tsx`, `FilterGrid.tsx`, `BulkBar.tsx`, `ZoomSlider.tsx`, `ReviewList.tsx`, `ReviewRow.tsx`, `ThumbPair.tsx`, `SegButton.tsx`, `prefsstore.ts` | view + selection state, list review, bulk bar, zoom, prefs IO |
| SVG pure rules | `src/lib/svgconfig.ts`, `svgprompt.ts`, `svgbatch.ts`, `svgcomposite.ts`, `svgcanvas.ts`, `svgextract.ts`, `svgvalidate.ts`, `svgpreview.ts`, `svgicons.ts`, `svgfile.ts`, `svglist.ts`, `svgrequest.ts`, `svgusage.ts`, `svgpricing.ts`, `svgbackground.ts`, `svgsecret.ts`, `modelcaps.ts` | provider settings, prompt + manifest, batch plan, grid layout, canvas composite, response split/match, validation/security, preview pipeline (parse → sanitize → fit → inline markup), icon count, sidecar model + versioning + cost basis, list filters/sort/totals (reported vs estimated cost kept apart), request + error classification, token/cost formatting, the pricing table + the one cost decision, preview-background presets/validation/contrast rule, secret masking, per-model capability rules (temperature / token field / effort tiers) + value sanitising |
| SVG IO + state | `src/svg/sources.ts`, `sidecar.ts`, `keystore.ts`, `promptstore.ts`, `prefsstore.ts`, `composite.ts`, `saveversion.ts`, `runner.ts`, `scan.ts`, `rowmodel.ts`, `runstate.ts`, `reviewact.ts`, `sourceindex.ts`, `reviewundo.ts`, `statemodel.ts`, `ctx.ts`, `actions.ts`, `codeactions.ts`, `useSvgGen.ts`, `paramstore.ts`, `catalog.ts`, `modelparams.ts`, `keyactions.ts` | approved-source discovery, sidecar IO, key store, the generation run, row/event/review reducers, the undo bridge, per-model settings store (localStorage), the 24 h model-list cache + `GET /v1/models` fetch, the one resolve rule they all share, and the API-key actions |
| SVG UI | `src/svg/SvgPanel.tsx`, `SvgControls.tsx`, `SvgBulkBar.tsx`, `SvgList.tsx`, `SvgRow.tsx`, `SvgThumbs.tsx`, `SvgPreview.tsx`, `SvgBatchStrip.tsx`, `SvgDialogs.tsx`, `SvgHotkeys.ts`, `SvgSampling.tsx` | the tab shell, controls, bulk bar, list, rows, previews (AI thumb + inline SVG frame in the user's background), batch strip, dialogs, hotkeys, the three sampling controls |

Direction: UI → batch/selection → lib, never upwards (RULE 1, RULE 3).

## 8. Tests — what exists and what must exist (RULE 8)

Exists (`tests/`, 52 files / 452 tests; canvas shims serve synthetic pixels,
in-memory fakes implement the FS handle interfaces, happy-dom mounts the
Selection, Selection V2 and Generate SVG panels and drives them with hotkeys
and `data-testid` handles):

* `detect.test.ts` — box count, margins, radius merge/split, dust filter, reading order
* `analyze.test.ts` — background/threshold/mask/ink, transparency-as-white, downscale, analyze→detect end-to-end
* `render.test.ts` — squareInfo/cropRect geometry
* `render_icon.test.ts` — sizing/clamps, bg fill + neighbour wipe + restore, transparent pass, blob gate
* `naming.test.ts` — `_AI` parse, reference derivation, split/variation names, batch path
* `scan.test.ts` — recursive walk + ignore, eligibility, ref linking, scan diff
* `statefile.test.ts` — merge semantics, statuses, corrupt-payload rejection
* `presets.test.ts` — defaults, validation clamps, list round-trip, apply
* `output_plan.test.ts` — layout, `_vNN` collisions, existing-folder respect
* `fs.test.ts` — tree read, no-overwrite write, nested dirs, copy (fakes)
* `batchsplit.test.ts` — one blob per icon, honest empty sheet
* `process.test.ts` — full output tree, deleted/failed isolation, stop, ref copy
* `statewrite.test.ts` — per-reference JSON write, missing retention, corrupt replace
* `store.test.ts` — preset persistence, corrupt rejection, last-used name
* `pairing.test.ts` — nested pairing, variants, duplicates, unpaired sides, ids
* `reviewfilter.test.ts` — month/custom ranges (inclusive, either anchor), status+search
* `reviewsort.test.ts` — all sort modes × directions, status meta, hotkeys
* `reviewfile.test.ts` — corrupt/valid parse, orphans, rename carry, diff
* `reviewstore.test.ts` — missing/corrupt load, atomic write + failure path
* `selection_state.test.ts` — applyScan/withDecision/nextPending/counters
* `handles.test.ts`, `fmt.test.ts` — path resolution, formatters
* `selection_ui.test.tsx` — DOM smoke: pick → list → A/D hotkeys → text chips
* `reviewselect.test.ts`, `reviewbulk.test.ts`, `reviewprefs.test.ts`,
  `selection_bulk.test.ts`, `hotkeys.test.ts`, `copypath.test.ts` — V2 rules:
  selection incl. indeterminate, bulk scope + one summary line, zoom clamp /
  no-upscale / corrupt prefs, bulk reducer, shared hotkeys, path fallback
* `selectionv2_ui.test.tsx` — DOM: recursive scan + both thumbnails, layout
  switch, active row + A/D + auto-next, zoom bounds/value/persistence,
  selection across filter + sort, approve selected/visible, incomplete pairs
  out of scope, save failure + retry, empty/no-match, corrupt JSON, rescan,
  restart persistence, a11y labels
* `svg_lib.test.ts`, `svg_extract.test.ts`, `svg_send.test.ts`,
  `svg_canvas.test.ts` — the SVG pure layer: provider defaults + the verified
  model id, prompt/manifest text, response split + name/title matching,
  validation/security, icon count, sidecar model + versioning, batch plan,
  composite layout, request payload, error classification, usage formatting
* `svg_bg.test.ts`, `svg_cost.test.ts` — the preview-background rules (presets,
  hex validation, stored-payload fallback, the black-vs-background contrast
  rule) and the cost rules (verified rate card + version, provider-reported vs
  batch share vs rate card, the wording every surface uses, reported and
  estimated totals kept apart)
* `svg_cost_io.test.ts` — cost through the real write path: provider-reported
  numbers stored as reported, a batch share stored as Estimated, the rate card
  used only when nothing was reported, a charged-but-invalid result keeping its
  usage, the sidecar read back after a "restart", and a legacy record without
  cost reading as unknown instead of crashing a row
* `svg_io.test.ts` — the SVG IO layer: approved-only discovery + corrupt /
  missing / unreadable reporting, scan + remembered root, row model, the
  write order (validate first, never overwrite, failure records), runner
  events, the review decision + its undo patch, the state reducer, preview
* `svg_preview.test.ts` — the preview pipeline end to end: a document without
  `xmlns`, an XML prolog / doctype / comment, an unbound `xlink` prefix, px
  `width`/`height` with no `viewBox`, `%` sizes with no box, varied boxes
  (24×24 / 64×32 / 512×128 / negative origin), `currentColor` resolved as a
  standalone document resolves it (never an app-chosen ink — explicit colours
  and the author's own `color:` survive byte-for-byte), an author
  `style` that would fight the fit, script/`on*`/`javascript:`/remote-URL
  removal, safe vs importing `@import`/`url()` stylesheets, id scoping (in
  markup and inside `<style>`), and every failure reason (empty ≠ broken);
  plus `previewTargetOf` — the one version the row previews and copies
* `svg_ui.test.tsx` — DOM: approved rows only, newest SVG beside its source,
  bulk header checkbox + disabled bulk actions, filters, the code dialog and
  its Escape close, the confirm-before-send guard, approve + undo, and the
  preview frame: inline `<svg>` with `xmlns` + `100%` + `xMidYMid meet`, the
  frame's `data-version` equal to the version Copy hands over, "Preview
  failed" + reason for a malformed file, "No SVG" for a source with none

Must exist before the matching change ships:

* any new exported lib/batch function → a test that fails if it is deleted
* sheet/batch UI flows → component tests using `UI_SELECTORS.md` handles when first needed
* ZIP/folder export → assertion on names + count (I-6/I-8), not just "no throw"

## 9. Quality gates summary (RULE 16 — thresholds frozen)

| Gate | Fail line | Tool |
|---|---:|---|
| Function LOC | > 30 | `tools/quality.mjs` |
| Params | > 4 | same |
| Cyclomatic complexity | > 10 | same + eslint warn |
| Nesting | > 4 | same + eslint warn |
| File lines | > 300 (warn), ratchet growth fails | same |
| Coverage `src/lib` | lines ≥ 80%, never decrease | vitest v8 |
| Anti-gaming | `partN` helpers always fail | same |

Workflow and ratchet: `CODE_VERIFICATION.md`. Dated re-checks: `QUALITY_RECHECK.md`.

## 10. History of designs — pointers

* 2026-09-30 — rules adopted from `marnikus/Process-Images-in-Areana`
  `docs/current/*` (AGENT_RULES 24 rules, CODE_VERIFICATION, DOM_SELECTORS →
  UI_SELECTORS, QUALITY_RECHECK); metrics reports intentionally not ported.
* 2026-10-01 — batch processing designed TDD-first:
  `docs/archive/2026-10-01-batch-processing/design.md` (module map, browser
  constraints, rule budget, negative tests).
* 2026-10-01 — Selection review designed TDD-first:
  `docs/archive/2026-10-01-selection-review/design.md` (pairing model, atomic
  decision protocol, rename carry, hotkeys, a11y).
* 2026-10-01 — Selection review V2 designed TDD-first from the prepared HTML
  template: `docs/archive/2026-10-01-selection-v2/design.md` (layering, list
  review rows, zoom slider, selection vs decision state, bulk scope, a11y
  deviation from the template's `role="listbox"`).
* 2026-10-01 — Generate SVG designed TDD-first from the SVG-generation prompt:
  `docs/archive/2026-10-01-generate-svg/design.md` (approved-only discovery,
  contact-sheet batching, name+title matching, validate-before-write,
  per-source sidecar versioning, token/cost honesty, RULE 20 key handling).
* 2026-10-01 — preview background + task cost designed TDD-first:
  `docs/archive/2026-10-01-svg-preview-cost/design.md` (preview-only frame and
  the contrast rule, one cost decision with a versioned rate card, cost basis +
  pricing version in the sidecar).
* 2026-10-01 — SVG confirmation preview + global log **designed, not implemented**
  (TDD-first): `docs/archive/2026-10-01-svg-confirm-global-log/design.md` (one builder so
  the popup shows the exact request, a module-scope redacting log with a docked UI,
  module budgets, test plan). Nothing in this document changes until it ships.

## 11. Current UI — control inventory

Full handle reference with semantic fallbacks: `UI_SELECTORS.md`.

* Workbench: `tab-sheets`, `tab-batch`, `tab-selection`, `tab-selection-v2`,
  `tab-generate-svg`.
* Sheets mode: header (upload + 3 export buttons), Sheets, Export settings
  (padding/size/transparent), Detection (merge slider + reset), Boundary
  overlay, Result grid, busy overlay, toast.
* Batch mode: header controls (`batch-root`, `batch-refresh`, `batch-process`,
  `batch-cancel`), PresetBar (name/save/list/delete + split settings), Dest
  info, review window (`scan-table`, `select-all`, per-row checkbox/actions),
  reference warnings, busy overlay, toast.
* Selection mode: header (`sel-root`, `sel-rescan`, `sel-watcher`, counters,
  help), FilterBar (date modes + From/To, status, sort, order, clear), review
  list (`sel-list`, `sel-search`, `sel-row-*`), comparison (`sel-compare`,
  Approve/Decline, 1:1/SYNC, per-side Open-in-Explorer), status footer
  (`sel-footer`), write/corrupt banners, busy + toast.
* Selection V2 mode: source bar (`v2-root`, `v2-rescan`, `v2-watcher`,
  `v2-mode-list` / `v2-mode-compare`, `v2-count-*`), filter grid (`v2-date-*`,
  `v2-from` / `v2-to`, `v2-status`, `v2-pairing`, `v2-sort`, `v2-dir`,
  `v2-shown`, `v2-clear`), bulk bar (`v2-check-all`, `v2-selected-count`,
  `v2-scope`, `v2-blocked`, `v2-hidden`, `v2-select-visible`, `v2-deselect`,
  `v2-thumb` + `v2-thumb-value`, `v2-approve-selected`, `v2-approve-visible`),
  list (`v2-list`, `v2-rows`, `v2-row-*`, `v2-check-*`, `v2-thumb-src` /
  `v2-thumb-ai`, `v2-status-*`, `v2-open-{src,ai}-*`, `v2-decline-*` /
  `v2-approve-row-*`, `v2-autonext`, `v2-empty`, `v2-nomatch`), comparison
  (`v2-pair-picker` + the V1 `sel-compare` handles), shared surfaces
  (`v2-writewarn` / `v2-retry`, `v2-corrupt`, `v2-toast`, `v2-busy` and the
  shared `sel-footer` / `sel-diff` / `sel-retry-count`). Full table:
  `UI_SELECTORS.md` §N.
* Generate SVG mode: source bar (`svg-root`, `svg-choose-root`, `svg-rescan`,
  `svg-count-*`), prompt + provider card (`svg-prompt`, `svg-reset-prompt`,
  `svg-provider`, `svg-limits`, `svg-per-request`, `svg-model`, `svg-key-state`
  / `svg-key-input` / `svg-key-save`), filters (`svg-filter-generation`,
  `svg-filter-review`, `svg-sort`, `svg-search`, `svg-shown`,
  `svg-clear-filters`), bulk bar (`svg-check-all`, `svg-selected-count`,
  `svg-select-visible`, `svg-deselect`, `svg-thumb` + `svg-thumb-value`,
  preview background (`svg-bg`, `svg-bg-{white,black,gray,green,red}`,
  `svg-bg-custom`, `svg-bg-value`), `svg-estimate`,
  `svg-generate-selected`, `svg-approve-selected`,
  `svg-decline-selected`, `svg-cancel-run`), list (`svg-list`, `svg-rows`,
  `svg-row-*`, `svg-check-*`, `svg-ai-*` / `svg-prev-*`,
  `svg-prev-frame-*` (the coloured frame), `svg-status-*`,
  `svg-review-*`, `svg-usage-*`, `svg-persist-*`, `svg-generate-*`,
  `svg-approve-*`, `svg-decline-*`, `svg-location-*`, `svg-copy-*`,
  `svg-code-*`, `svg-history-*` + `svg-history-cost-{n}`, `svg-empty`),
  batch strip (`svg-batch`,
  `svg-batch-composite`, `svg-batch-grid`, `svg-batch-counts`), dialogs
  (`svg-confirm`, `svg-manifest`, `svg-composite`, `svg-code-dialog`,
  `svg-history-dialog`), banners (`svg-warn-*`), status bar
  (`svg-statusbar`), toast + busy (`svg-toast`, `svg-busy`); review undo goes
  through the shared `hist-*` handles. Full table: `UI_SELECTORS.md` §P.

## 12. Session restore, reset to pending & the global undo timeline (2026-10-01)

Design record: `docs/archive/2026-10-01-history-session/design.md`.

### 12.1 One store above the tabs

`Workbench` renders exactly one panel at a time, so panel-local `useState` is
destroyed on every tab switch. Everything a restart or a cross-tab undo must see
therefore lives in `src/state/appstore.ts` — a module-scope store bound to React
by `useAppState` / `useAppView` (`useSyncExternalStore`):

| slice | contents | persisted by |
|---|---|---|
| `tab` | the active tab | session |
| `sheets` | `padding`, `size`, `transparent` | session |
| `view` | `filter`, `sort`, `selectedId`, `collapsed`, `zoom`, `sync`, `autoNext` (shared by Selection and Selection V2) | session |
| `v2` | `checked`, `scrollY`, `anchorId` (the Shift anchor) | session |
| `prefs` | V2 `mode`, `thumbHeight` — held in memory only | `selectionv2/prefsstore` |

One owner per value, so the session file deliberately does **not** duplicate: the
last batch preset (`saveLastName`), a preset's `ignoreFolders` (`lib/presets`),
the V2 prefs (`prefsstore`), folder handles (IndexedDB via `batch/store`) or
decisions (`review-decisions.json`).

Restore happens in `state/boot.ts` **before** the first render, so no panel ever
paints defaults and then jumps. Autosave is debounced 250 ms
(`useSessionAutosave`) and prefs are written by `usePrefsAutosave`, both mounted
above the tabs so an undo applied while a panel is unmounted is persisted too.

### 12.2 The timeline

`lib/history.ts` is pure and holds the contracts (adapted from the reference
implementation, see the design doc): `{ entries, index }` with `index = -1`
meaning "before the first action", `MAX_HISTORY = 100`, `HISTORY_VERSION = 1`,
push truncates the redo branch, collapses a consecutive duplicate and drops the
oldest entry on overflow, `parseTimeline` validates and clamps on every read.
Each entry is `{ id, type, label, at, origin, ids[], before, after, v }` —
minimal before/after, never a full app snapshot.

`state/HistoryProvider.tsx` owns the clock/ids, persistence
(`state/historystore.ts` → `iconSplitter.history.v1`) and the shortcuts
`Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, `Ctrl/Cmd+Y` (ignored while typing in a
field). `ui/HistoryBar.tsx` shows the controls, the next-action label and a
read-only list of the timeline.

`pushGesture` coalesces one gesture (slider drag, search typing, arrow-key
navigation) into a single entry: the tip's `after` is replaced and the original
`before` kept.

### 12.3 The apply path and the failure rule

Every reversible change is applied through `state/apply.ts`, whether it came from
a click or from the timeline. A step returns the entry to apply and the new
cursor position separately (`stepBack` / `stepForward`), and the provider only
commits the cursor after the apply reported success — **a failed apply never
moves the cursor** and surfaces "That change could not be reversed".

Decisions go through `selection/offline.ts`: a mounted Selection/V2 panel binds
itself as the applier (so an undo lands in the same reducers a click uses); with
no panel mounted the stored `review-decisions.json` is patched directly from the
remembered root handle. Stale targets are skipped, never fatal.

### 12.4 Reset to pending

`withReset` is one transition for a whole batch, so a bulk reset is one history
entry and one summary line ("3 pairs reset to pending"). A pending pair owns no
record (I-13), the record is removed from the JSON, and pair identity, paths and
file metadata are untouched. Available for one item (`sel-reset` in the
comparison view) and for the selected / visible scope (`v2-reset-selected`,
`v2-reset-visible`).

### 12.5 Undoable vs not (documented and tested)

| undoable | not undoable (and why) |
|---|---|
| decisions: approve / decline / reset, single and bulk | batch processing — it writes files into the destination folder |
| checkbox selection, select visible, deselect all | ZIP / download / clipboard export — the file is already on disk |
| filters, sort, date mode and range | picking a folder — re-granting permission can be denied, so the app cannot promise it |
| view prefs (list/compare, thumbnail zoom), zoom, sync, auto-next, sidebar | switching tabs — navigation, restored on restart but not an edit |
| sheets padding / size / transparent | the folder watcher toggle — not persisted, so undoing it across a restart would be fiction |

Nothing in the right column is ever reported as reversed; the history simply does
not record it.

### 12.6 Storage map additions

| key | contents | owner |
|---|---|---|
| `iconSplitter.session.v1` | `{v, savedAt, tab, sheets, selection, selectionV2}` | `state/sessionstore` |
| `iconSplitter.history.v1` | `{v, entries, index}` capped at 100 | `state/historystore` |
| `iconSplitter.selectionV2.prefs.v1` | unchanged | `selectionv2/prefsstore` |

Both new payloads are validated field by field on read; a corrupt or
foreign-version payload costs one ignored load and the defaults, never a broken
startup (RULE 13).

### 12.7 Selection is one gesture, one entry

A row click used to push two entries (`checked`, then `view` for the active row),
so the first `Ctrl+Z` only moved the highlight and the selection came back on the
second press. `useSelectionV2.selectRow(id, intent)` now pushes **one** `checked`
entry whose `before`/`after` is `{ids, anchor, active}`: `applyChecked` reads all
three, and a bare array is still accepted so pre-anchor timelines undo cleanly.
The intents come from `lib/reviewselect`: `selectIntent` reads the modifiers,
`selectOne` and `selectRange` are pure, and `anchorId` lives in the session so a
Shift+click survives a tab switch.

The bulk bar is selection-only: **Approve selected**, **Decline selected** and
**Reset selected to pending**, each armed before it applies and each labelled
with the number of pairs that will really change
(`checked ∩ visible ∩ complete`). The visible-list variants were removed — a
bulk action reaching beyond the selection is exactly what the `v2-blocked` and
`v2-hidden` warnings are there to prevent.

The History window (`ui/HistoryPanel.tsx`, opened by `hist-open`) lists the whole
timeline newest first, marks the cursor and offers the same Undo/Redo. It is
read-only: clicking an entry would apply several changes at once, and a failed
apply must never move the cursor.

### 12.8 Undo must not depend on where the focus ended up

`selection/hotkeys` only skips a keystroke for a *text* surface: a text-ish
`<input>` (`text, search, number, email, password, url, tel, date, month, time,
datetime-local`), a `<textarea>`, a `<select>` or a contenteditable. A `range` or
`checkbox` passes the keystroke through, so `Ctrl+Z` still works after dragging
the zoom slider or clicking a row checkbox — the previous "any input is a text
field" test killed undo for the two controls the review tab uses most.
