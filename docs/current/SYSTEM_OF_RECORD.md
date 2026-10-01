# System of Record — Icon Splitter

Current behaviour, invariants and flows. If code and this doc disagree, one of
them is wrong — fix the wrong one in the same change (AGENT_RULES RULE 17).
Adapted structure from `Process-Images-in-Areana/docs/current/SYSTEM_OF_RECORD.md`.

## 1. What this is

A browser app with three modes (top tabs, `src/ui/Workbench.tsx`):

1. **Single sheets** — detect individual icons in a sprite sheet, review,
   resize and exclude them, export equal-size square PNGs (ZIP / downloads /
   folder / clipboard).
2. **Batch folders** (Chrome/Edge only, File System Access API) — pick a root
   folder, recursively scan every `*_AI*` image, review and select them, split
   each into its own organised output tree beside the sources, with presets
   and per-reference JSON status tracking.
3. **Selection** (Chrome/Edge only) — recursively scan a root, pair every
   original with its `_AI` result, review them in two layouts (Comparison /
   List review) and store an approve/decline decision per pair in
   `review-decisions.json`, individually or in bulk.

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
* Two layouts share one filter/selection/decision pipeline: **Comparison view**
  (side-by-side panes, dims / format / size / path per side, 1:1 zoom with
  synced scrolling, per-side Open-in-Explorer) and **List review** (full-width
  list, no comparison panel) where every row shows both labelled thumbnails
  (aspect preserved, never upscaled past source pixels), filename, folder,
  date, dimensions, status chips and row actions.
* Thumbnail max height is a zoom slider (48–240 px, live while dragging,
  persisted in `localStorage iconSplitter.sel.thumbH.v1`, validated on read).
* Multi-selection (checkbox per row) is separate from review status and from
  the active row (keyboard target). Selection survives filters/sorting by
  pair id; "Select all" unions the visible rows, "Deselect all" clears all;
  the header checkbox is tri-state over the visible scope. Bulk actions
  (Approve/Decline selected or visible list) confirm first with affected /
  missing / changed counts plus the number of hidden checked rows that will
  be skipped, then apply in ONE operation with ONE report; a failed write
  reports affected/unaffected counts and keeps decisions in memory (I-12).
* Review list filters: search, month / custom-range dates, status
  (pending/approved/declined/missing-pair), sorting by date/status/name/path
  in both directions, counters.
* Hotkeys A/D/arrows/Space/Ctrl+K act on the active row; "Next pending"
  auto-advances after each decision (toggle in the toolbar); the active row
  scrolls into view.
* Decisions persist in `<root>/review-decisions.json` (atomic tmp-verify-
  overwrite protocol); missing file is created pending; corrupt file raises a
  warning and previous in-memory decisions are kept; write failures keep the
  change in memory with a Retry action.
* Rescan diffs added/renamed/removed/unchanged; decisions travel across
  renames via size+mtime identity; orphan records are retained so a
  transiently missing file never destroys a decision; selection is pruned to
  surviving pairs and the active row falls back to the first pair.
* A watcher re-scans every 30 s while a root is open (toggleable).

Everything runs client-side; nothing is uploaded anywhere.

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
* **I-15 (selection, RULE 6/10):** a bulk action touches exactly the rows its
  scope names — checked ∩ visible for "selected", all visible for "visible";
  hidden checked rows are reported and skipped, never silently included.
  Selection state and review status are independent stores.

## 6. Storage map

| Where | What | Rules |
|---|---|---|
| localStorage `iconSplitter.presets.v1` | preset list (JSON) | validated on read (RULE 13) |
| localStorage `iconSplitter.lastPreset.v1` | last-used preset name | restores on boot |
| IndexedDB `iconSplitter/handles` | source/dest directory handles per preset | permission re-requested on restore |
| `<refDir>/<base>.json` | per-reference source status records | rewritten after every scan/batch; app-owned, overwrite allowed |
| `<root>/_split_output/…` or custom dest | batch outputs | never overwritten (I-8) |
| `<root>/review-decisions.json` | selection approve/decline records | atomic write; corrupt → warn + keep memory (I-12) |
| localStorage `iconSplitter.sel.thumbH.v1` | selection thumbnail max height (48–240) | validated on read (RULE 13) |
| IndexedDB `iconSplitter/handles["__selection__"]` | selection root handle | permission re-requested on restore |

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
| Selection logic | `src/lib/pairing.ts`, `reviewfilter.ts`, `reviewsort.ts`, `reviewmeta.ts`, `reviewfile.ts`, `reviewselect.ts`, `reviewthumb.ts`, `reviewbulk.ts` | pairing, filters, sorts, status/hotkey semantics, decision records, multi-select model, thumbnail geometry, bulk planning |
| Selection IO+UI | `src/selection/state.ts`, `reviewstore.ts`, `handles.ts`, `fmt.ts`, `thumbs.ts`, `useSelection.ts`, `SelectionPanel.tsx`, `SelectionToolbar.tsx`, `FilterBar.tsx`, `PairList.tsx`, `PairRow.tsx`, `CompareView.tsx`, `HeaderRow.tsx`, `StatusFooter.tsx` | reducers, atomic decision IO, both review layouts |

Direction: UI → batch/selection → lib, never upwards (RULE 1, RULE 3).

## 8. Tests — what exists and what must exist (RULE 8)

Exists (`tests/`, 27 files / 168 tests; canvas shims serve synthetic pixels,
in-memory fakes implement the FS handle interfaces, two happy-dom component
tests render the Selection panel and drive it with clicks and hotkeys):

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
* `reviewfilter.test.ts` — month/custom ranges (inclusive, either anchor), status+missing+search
* `reviewsort.test.ts` — all sort modes × directions, status meta, hotkeys
* `reviewfile.test.ts` — corrupt/valid parse, orphans, rename carry, diff
* `reviewstore.test.ts` — missing/corrupt load, atomic write + failure path
* `reviewselect.test.ts` — toggle/union, tri-state header, visible/hidden split, prune
* `reviewthumb.test.ts` — slider bounds, aspect/no-upscale geometry, persisted height
* `reviewbulk.test.ts` — scope plans, summary counts, single result message
* `selection_state.test.ts` — applyScan/withDecision/withDecisions/nextPending/counters, selection pruning
* `handles.test.ts`, `fmt.test.ts` — path resolution, formatters
* `selection_ui.test.tsx` — DOM smoke: pick → list → A/D hotkeys → text chips
* `selection_list_ui.test.tsx` — view switching, zoom slider + restart persistence, multi-select + tri-state header, bulk confirm/apply, bulk-save failure counts, active-row A/D/arrows

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

## 11. Current UI — control inventory

Full handle reference with semantic fallbacks: `UI_SELECTORS.md`.

* Workbench: `tab-sheets`, `tab-batch`.
* Sheets mode: header (upload + 3 export buttons), Sheets, Export settings
  (padding/size/transparent), Detection (merge slider + reset), Boundary
  overlay, Result grid, busy overlay, toast.
* Batch mode: header controls (`batch-root`, `batch-refresh`, `batch-process`,
  `batch-cancel`), PresetBar (name/save/list/delete + split settings), Dest
  info, review window (`scan-table`, `select-all`, per-row checkbox/actions),
  reference warnings, busy overlay, toast.
* Selection mode: header (`sel-root`, `sel-rescan`, `sel-watcher`, counters,
  help), FilterBar (date modes + From/To, `sel-status-filter`, sort, order,
  clear), toolbar (`sel-toolbar`: `sel-view-compare`/`sel-view-list`,
  `sel-thumbzoom` + value, `sel-autonext`, `sel-select-all`,
  `sel-deselect-all`, `sel-selected-count`, `sel-approve-selected`,
  `sel-decline-selected`, `sel-approve-visible`, `sel-decline-visible`),
  review list (`sel-list`, `sel-search`, `sel-select-all-check`, rows
  `sel-row-*` with `sel-check-*`, `sel-row-main-*`, `sel-row-approve/decline/
  opensrc/openai-*`), comparison (`sel-compare`, `sel-status`,
  Approve/Decline, 1:1/SYNC, per-side Open-in-Explorer), bulk confirmation
  (`sel-bulk-confirm`, `sel-bulk-apply`, `sel-bulk-cancel`), status footer
  (`sel-footer`), write/corrupt banners, busy + toast.
