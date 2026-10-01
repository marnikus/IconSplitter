# System of Record — Icon Splitter

Current behaviour, invariants and flows. If code and this doc disagree, one of
them is wrong — fix the wrong one in the same change (AGENT_RULES RULE 17).
Adapted structure from `Process-Images-in-Areana/docs/current/SYSTEM_OF_RECORD.md`.

<!-- ideal-size: ~600 lines reason=RULE 17 requires one authoritative system-of-record; five modes' current invariants stay sectioned here while design rationale stays in dated docs/archive/. -->

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
   multi-selection and bulk review, plus a switchable **comparison** layout.
5. **Generate SVG** (Chrome/Edge only) — recursively indexes only Selection-
   approved AI results, prepares numbered contact sheets, and after explicit
   consent sends the contact sheet, mapping manifest and editable prompt to
   Requesty's multimodal Chat Completions API. SVG files are sanitized, reviewed
   per version and saved beside each AI source without overwriting earlier versions.

Stack: React 19 + Vite 7 + TypeScript + Tailwind 4, `jszip` for archives.
Production build is one self-contained `dist/index.html`
(`vite-plugin-singlefile`) with locally available workflows offline; Generate
SVG requires network access only when the user confirms a Requesty run (RULE 20).

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
* Bulk review — **Approve selected** / **Decline selected** / **Reset selected
  to pending**: the count is shown and each button arms before applying (Escape
  or Cancel disarms); one operation = one transition, one file write, one
  undoable history entry. Scope is checked ∩ visible ∩ complete, so hidden
  checks never change silently and incomplete pairs are excluded. A failed write
  keeps the change in memory with Retry.
* The **active row** (keyboard target, `aria-current`, scrolled into view) is
  distinct from a **checked row** (bulk target). `A` / `D` decide the active
  row; "Next pending after a decision" advances it.
* Extra filter: **Pairing** = all / complete / missing pair.

Generate SVG (uses the shared Selection root and V2 checkbox state):

* Recursively includes only AI results whose current Selection decision is
  approved. Rescan reads the current approval file; revoked or changed sources
  are blocked again at the final pre-send and pre-save checkpoints.
* Search covers filename, relative path, generation/review state and version
  metadata. Filters cover generation and per-version review. Sorts are stable by
  generated date, filename/path, generation, review or actual Requesty cost,
  with reversible direction. Hidden checked rows are counted but excluded from
  selected actions.
* The active row is distinct from checked rows. Up/down moves the active row;
  Space toggles its check; G generates it; A/D review its newest valid version;
  V opens sanitized SVG code. Bulk controls operate only on visible checked rows.
* Prompt, search, filters, sort/direction, thumbnail zoom and request settings
  persist in `iconSplitter.svg.preferences.v1` and use the app-wide undo/redo
  timeline. The exact editable default prompt is:
  “Create 4 split SVG icons. Snap visually intended connections exactly to
  curves/anchors. Never leave tiny gaps, floating endpoints, overshoots, or
  approximate joins. Preserve seamless geometry without breaking the intended image.”
* Preflight orders image paths deterministically, fingerprints every source,
  builds a centered square contact sheet with a visible position marker and a
  same-order filename/path/position manifest, and enforces the serialized JSON
  body cap. No network call happens during scanning or preflight.
* The default Requesty endpoint is `https://router.requesty.ai/v1`; the default
  model is `azure/gpt-6.1-sol@eastus2`. The credential is AES-GCM encrypted in
  IndexedDB (non-extractable Web Crypto key), never shown, and never included in
  preferences/history/sidecars/logs. The confirmation dialog shows the prompt,
  source count, batches, image/payload sizes and cost caveat before **Generate now**.
  That final action sends only approved contact sheets plus manifest and prompt;
  Requesty response token/cost figures are authoritative, and shared batch cost
  is not falsely allocated per image.
* Every request has durable per-source checkpoints before send. Only explicit
  429 responses may be retried, within the configured bound and `Retry-After`;
  timeout, lost response, malformed success, and uncertain provider failures are
  marked unknown and never automatically resent. Cancellation prevents new
  queued requests but lets in-flight requests finish.
* Responses require explicit position IDs and exact source titles—never array
  order fallback. Every SVG is XML-parsed, allowlist-sanitized and render-tested.
  Outputs use sibling `<stem>.svg`, `<stem>-v2.svg`, … names, staged verification
  and no-overwrite atomic rename. Request/version usage, prompt, source and
  composite fingerprints, mapping and validation records persist in a sidecar.
* Restart rescans classify in-progress requests as unknown. Valid untracked SVGs
  are reconstructed into sidecars; valid interrupted temp SVGs can be promoted
  only after approval/fingerprint rechecks and never overwrite a target. Each
  version's approve/decline/pending decision is durable and undoable globally.

All original sheet/batch/selection processing stays local by default. Under the
explicit Rule 20 exception, only a confirmed Generate SVG operation uploads its
approved contact sheet and disclosed mapping/prompt to Requesty.

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
* **I-5 (RULE 20):** images stay local by default; only after explicit Generate now consent are Selection-approved contact sheets plus their mapping manifest and prompt sent to the fixed Requesty endpoint. Other workflows and exports never upload content.
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
* **I-17 (Generate SVG, RULE 20):** only Selection-approved sources can enter
  preflight, and the exact mapped images/manifest/prompt are disclosed before
  the user explicitly confirms their Requesty upload.
* **I-18 (Generate SVG, RULE 22):** every response item must carry an explicit
  position ID and exact source title; order-only or mismatched mappings are never saved.
* **I-19 (Generate SVG, RULE 15/23):** only sanitized, render-tested SVG enters
  a staged sibling file; existing numbered versions are never overwritten.
* **I-20 (Generate SVG, RULE 8/13):** every request is durably checkpointed;
  an uncertain outcome stays `unknown`, is never automatically resent, and only
  an explicit 429 can be retried under the bounded policy.
* **I-21 (history, RULE 12):** prompt/filter/sort/zoom/request preferences and
  each version's review decision apply through the same global undo/redo path.

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
| localStorage `iconSplitter.svg.preferences.v1` | non-secret prompt, Requesty model/limits, filters/sort/search, thumbnail zoom | validated/clamped; global-undoable; never contains API key |
| IndexedDB `iconSplitter.secret-vault.v1/credentials[requesty]` | AES-GCM ciphertext, IV and non-extractable Web Crypto key | plaintext returned only to request action; never shown or logged |
| `<source-dir>/<AI-stem>.svg`, `-vNN.svg` | validated versioned SVG outputs beside approved AI source | staged verification + atomic no-overwrite promotion |
| `<source-dir>/<AI-filename>.svg.json` | per-source request checkpoints, position manifest, prompts, usage/cost, version validation and review decisions | staged/verified sidecar update; API key excluded |

Object URLs from user files are revoked on sheet removal (sheets mode); contact
sheet object URLs are released on dismiss, completion, cancellation or unmount.

## 7. Key modules and layers

| Layer | Files | Owns |
|---|---|---|
| Mode shell | `src/ui/Workbench.tsx`, `src/main.tsx` | five-tab switch, app-wide history/session providers |
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
| SVG preparation and protocol | `src/lib/svgcomposite.ts`, `src/svg/preflight.ts`, `prompt.ts`, `requesty.ts`, `responsemap.ts`, `lib/svgvalidate.ts` | deterministic contact sheets, manifest prompts, fixed Requesty Chat Completions transport, explicit-ID mapping, local sanitation |
| SVG durability | `src/svg/indexer.ts`, `versionindex.ts`, `files.ts`, `sidecar.ts`, `sidecar.parse.ts`, `sidecar.schema.ts`, `recovery.ts`, `review.ts`, `run/checkpoint.ts`, `run/process.ts`, `run/response.ts`, `run/queue.ts` | approved-source rescan, durable checkpoints, no-overwrite saves, restart recovery, version decisions and bounded queue |
| SVG UI and secrets | `src/svg/ui/GenerateSvgPanel.tsx`, `SvgHeader.tsx`, `SvgFilterBar.tsx`, `SvgBulkToolbar.tsx`, `SvgSourceRow.tsx`, `SvgOverlayHost.tsx`, `useSvg*.ts`, `Svg*Dialog.tsx`, `src/svg/keyvault.ts` | accessible review/workspace, global preferences/history integration, explicit consent and encrypted credential storage |

Direction: UI → batch/selection/SVG → lib, never upwards (RULE 1, RULE 3).

## 8. Tests — what exists and what must exist (RULE 8)

Exists (`tests/`; canvas shims serve synthetic pixels, in-memory fakes implement
the FS handle interfaces, and happy-dom tests exercise Selection, Selection V2,
the restored Generate SVG panel, and global history shortcuts):

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
* `svg_composite.test.ts`, `svg_mapping.test.ts`, `svgvalidate.test.ts` — square
  contact-sheet geometry, safe extraction/sanitization, explicit-position mapping
* `svg_preflight.test.ts`, `svg_files.test.ts`, `svg_indexer.test.ts`,
  `svg_recovery.test.ts`, `svg_sidecar.test.ts` — deterministic inputs, payload
  caps, atomic non-overwrite output, valid orphan repair, restart recovery, schema
* `svg_requesty.test.ts`, `svg_prefs_security.test.ts`, `svg_usage.test.ts` —
  endpoint/auth/header, no credential leakage, safe retry outcomes, usage/cost
* `svg_queue.test.ts`, `svg_process.test.ts` — bounded concurrency, cancellation,
  approval/fingerprint rechecks, uncertain outcomes, mapping failures, isolation
* `svg_review.test.ts`, `svg_review_history.test.tsx`,
  `svg_preferences_undo.test.tsx` — per-version decisions, global undo/redo,
  filters/search/prompt/zoom and key-like-text rejection
* `workbench_ui.test.tsx` — restart into Generate SVG, approved-source empty state,
  exact default prompt and global history bar

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
* 2026-10-01 — Generate SVG designed from the supplied SVG-generation HTML/image
  and Selection V2 patterns: `docs/archive/2026-10-01-generate-svg/design.md`
  (consent/privacy exception, deterministic contact sheets, Requesty mapping,
  version sidecars, unknown outcomes, recovery and undo).

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
  `v2-thumb` + `v2-thumb-value`, `v2-approve-selected`, `v2-decline-selected`,
  `v2-reset-selected`),
  list (`v2-list`, `v2-rows`, `v2-row-*`, `v2-check-*`, `v2-thumb-src` /
  `v2-thumb-ai`, `v2-status-*`, `v2-open-{src,ai}-*`, `v2-decline-*` /
  `v2-approve-row-*`, `v2-autonext`, `v2-empty`, `v2-nomatch`), comparison
  (`v2-pair-picker` + the V1 `sel-compare` handles), shared surfaces
  (`v2-writewarn` / `v2-retry`, `v2-corrupt`, `v2-toast`, `v2-busy` and the
  shared `sel-footer` / `sel-diff` / `sel-retry-count`). Full table:
  `UI_SELECTORS.md` §N.
* Generate SVG: source controls (shared root, rescan, source counters, prompt,
  key management, model/batch/concurrency/cell/advanced settings), filters
  (generation/review/sort/direction/search), selected-only actions (checks,
  generate, review/reset, 48–180 px zoom), active source rows (AI + newest SVG,
  state/review/version/usage, code/history/recovery and row actions), explicit
  consent dialog, progress/cancel, safe notices and errors. Handles:
  `svg-panel`, `svg-empty`, `svg-rows`, `svg-row-{pairId}`, `svg-check-{pairId}`;
  semantic labels/dialogs are listed in `UI_SELECTORS.md` §P.

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
the V2 prefs (`prefsstore`), SVG preferences (`svg/prefsstore`), folder handles
(IndexedDB via `batch/store`) or decisions (`review-decisions.json`).

Restore happens in `state/boot.ts` **before** the first render, so no panel ever
paints defaults and then jumps. Autosave is debounced 250 ms
(`useSessionAutosave`) and prefs are written by `usePrefsAutosave`, both mounted
above the tabs so an undo applied while a panel is unmounted is persisted too.
Generate SVG preferences have their own validated localStorage record (one
owner, not copied into the session); the `svgPrefs` history applier writes that
store directly, so undo works after a tab switch.

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
remembered root handle. SVG version decisions use `svg/review.ts` to patch the
sidecar, including when the Generate SVG panel is unmounted. Stale targets are
skipped, never fatal.

### 12.4 Reset to pending

`withReset` is one transition for a whole batch, so a bulk reset is one history
entry and one summary line ("3 pairs reset to pending"). A pending pair owns no
record (I-13), the record is removed from the JSON, and pair identity, paths and
file metadata are untouched. Available for one item (`sel-reset` in the
comparison view) and for checked, visible, complete Selection V2 pairs
(`v2-reset-selected`); there is no visible-list bulk reset.

### 12.5 Undoable vs not (documented and tested)

| undoable | not undoable (and why) |
|---|---|
| decisions: approve / decline / reset, single and bulk | batch processing — it writes files into the destination folder |
| checkbox selection, select visible, deselect all | ZIP / download / clipboard export — the file is already on disk |
| filters, sort, date mode and range | picking a folder — re-granting permission can be denied, so the app cannot promise it |
| view prefs (list/compare, thumbnail zoom), zoom, sync, auto-next, sidebar | switching tabs — navigation, restored on restart but not an edit |
| Generate SVG prompt/model/request limits, filters/search/sort/zoom and per-version review decisions | Requesty transmission and generated files — remote work/files cannot be reversed; outputs are append-only |
| — | API-key management — the credential must never enter the undo history |
| sheets padding / size / transparent | the folder watcher toggle — not persisted, so undoing it across a restart would be fiction |

Nothing in the right column is ever reported as reversed; the history simply does
not record it.

### 12.6 Storage map additions

| key | contents | owner |
|---|---|---|
| `iconSplitter.session.v1` | `{v, savedAt, tab, sheets, selection, selectionV2}` | `state/sessionstore` |
| `iconSplitter.history.v1` | `{v, entries, index}` capped at 100 | `state/historystore` |
| `iconSplitter.selectionV2.prefs.v1` | unchanged | `selectionv2/prefsstore` |
| `iconSplitter.svg.preferences.v1` | validated non-secret SVG settings | `svg/prefsstore`; separate from session, history can restore it |

Session and preference payloads are validated field by field on read; a corrupt
or foreign-version payload costs one ignored load and the defaults, never a
broken startup (RULE 13).

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
