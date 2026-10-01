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
3. **Selection** (Chrome/Edge only, File System Access API) — recursively pair
   every original image with its `*_AI*` result, review them side by side and
   approve or decline each pair; decisions live in `review-decisions.json` in
   the split root and survive rescans and restarts.

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
* Only `name_AI.ext` / `name_AI_<n>.ext` images are eligible; the reference
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

Selection (image review):

* Pick the split root (readwrite) — the choice is remembered in IndexedDB and
  re-offered on the next visit (permission re-requested).
* The scan walks the root recursively (ignoring `_split_output`) and pairs each
  original with its `*_AI` / `*_AI_N` result; one pair per AI file, several AI
  variants of one base share the original. Unpaired sides are listed as
  "AI result missing" / "Original missing" — never hidden.
* List rows: thumbnail, file name, relative folder, creation date (newest side
  mtime) and review status. Counters show total / pending / approved / declined
  and double as the status filter.
* Filters: all images, one month (`YYYY-MM`) or a custom From/To range;
  sorting by creation date, review status, filename or folder path, both
  directions; one click clears every filter.
* Comparison window: Original and AI result side by side, large and
  aspect-preserving, each labelled with dimensions, format, size and path, each
  with "Open in File Explorer" (browser-safe path copy). Approve/Decline sit
  above the AI result; `A`/`D` are the hotkeys, arrows walk the list, Esc
  closes, and after every decision the window rolls on to the next pending pair
  (when none is left it closes and says so).
* Decisions are stored in `<root>/review-decisions.json` (`pair_id`, `source`,
  `ai_result`, `decision`, `reviewed_at`). A missing file is created with every
  pair pending; a corrupt file is reported, left untouched and never silently
  overwritten — the user may retry or explicitly back it up
  (`review-decisions.corrupt-<stamp>.json`) and start a fresh file.
* Review status is only what that file says: a `processed` batch status never
  counts as approved.

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

Review model (`useReview.ts`):

```
root                  FileSystemDirectoryHandle (restored from IndexedDB)
items: ReviewItem[]   ReviewPair + status(pending|approved|declined) + reviewedAt
orphans               decision records whose files are gone (kept, listed)
counts                total / pending / approved / declined
query                 scope(all|month|range) + status filter + sort(key, dir)
selectedId            pair open in the comparison window (null = closed)
fileStatus/fileNote   ok | corrupt | write-error + the honest message
busy / toast          progress and reporting surfaces (RULE 2/5)
```

Pair identity: lowercased `folder/base` plus `#variant` for `_AI_N`
(`category-a/star`, `category-a/star#2`) — stable across rescans while the pair
is unchanged, independent of which side is currently on disk.

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

Selection:

* **Scan:** root handle → `readDirTree` (ignore list) → `walkTree` →
  `buildPairs` → `loadAndSync` (reads/creates `review-decisions.json`,
  reconciles it with the scan) → `applyDecisions` → rows + counters; the rescan
  note reports `+added / −removed / ~changed / renamed / unchanged`.
* **Review:** clicking a row opens the comparison window; `useCompare` loads
  both sides (dimensions/format/size through `loadImageFile`) and revokes the
  object URLs on change (RULE 20). A/D (or the buttons) call `decide`, which
  updates the list and counters immediately (RULE 24), writes the JSON and
  selects the next pending pair.
* **Persistence:** every write merges the in-memory decisions into the stored
  file first, so records of vanished pairs survive; the write itself goes to a
  temp file and is renamed with `move()` when available, else
  `createWritable()` replaces the file atomically on close (RULE 23).
* **Errors:** a failed write keeps the decisions in the list and shows an
  actionable retry; a corrupt file blocks automatic writing and offers backup +
  fresh start.

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
* **I-12 (review, RULE 3/4):** a pair is exactly one AI file plus its original;
  a source with no AI file and an AI file with no source stay visible with an
  explicit "missing" label — an empty result is never reported as success.
* **I-13 (review, RULE 13):** `review-decisions.json` is validated on read; a
  corrupt payload is reported and left on disk, and no automatic write may
  replace it (explicit backup + reset only).
* **I-14 (review, RULE 24):** approve/decline updates the row, the counters and
  the selection in the same render; a decision is never pending on a later
  interaction to become visible.
* **I-15 (review, RULE 23):** a decision write either lands completely (temp
  file + move, or swap-and-replace on close) or the previous file stays intact;
  a failed write is reported with a retry, never silently dropped.

## 6. Storage map

| Where | What | Rules |
|---|---|---|
| localStorage `iconSplitter.presets.v1` | preset list (JSON) | validated on read (RULE 13) |
| localStorage `iconSplitter.lastPreset.v1` | last-used preset name | restores on boot |
| IndexedDB `iconSplitter/handles` | source/dest directory handles per preset | permission re-requested on restore |
| `<refDir>/<base>.json` | per-reference source status records | rewritten after every scan/batch; app-owned, overwrite allowed |
| `<root>/review-decisions.json` | review decisions per pair (spec §8) | created when missing; corrupt payloads are never auto-overwritten |
| `<root>/review-decisions.corrupt-<stamp>.json` | backup of an unreadable review file | written once, on explicit user request; never overwritten |
| IndexedDB `iconSplitter/handles` key `review.root.v1` | last reviewed root | permission re-requested on restore |
| `<root>/_split_output/…` or custom dest | batch outputs | never overwritten (I-8) |

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
| Review pairing | `src/lib/review.ts` | `pairId`, `buildPairs`, `diffPairs` |
| Review decisions | `src/lib/reviewfile.ts`, `src/lib/reviewmerge.ts` | record model + strict parse; items, decisions, counters, orphans |
| Review query | `src/lib/reviewquery.ts`, `src/lib/reviewformat.ts`, `src/lib/text.ts` | month/range/status filters, sorts, display text, shared comparison |
| Review IO | `src/lib/reviewio.ts`, `src/lib/reviewkeys.ts`, `src/lib/fs.ts` | atomic JSON read/write/backup, hotkey map, handle/path adapters |
| Review UI | `src/review/useReview.ts`, `useCompare.ts`, `persist.ts`, `scan.ts`, `store.ts`, `detail.ts`, `ReviewPanel.tsx`, `ReviewList.tsx`, `ReviewFilters.tsx`, `ReviewCounters.tsx`, `CompareView.tsx`, `StatusBadge.tsx` | orchestration, comparison window, list, filters |
| Shared UI | `src/ui/Workbench.tsx`, `Overlays.tsx`, `Thumb.tsx`, `useThumbnails.ts` | tab shell, busy/toast surfaces, thumbnail cache (RULE 20) |

Direction: UI → batch → lib, never upwards (RULE 1, RULE 3).

## 8. Tests — what exists and what must exist (RULE 8)

Exists (`tests/`, 22 files / 164 tests; canvas shims serve synthetic pixels,
in-memory fakes implement the FS handle interfaces):

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
* `review_pairs.test.ts` — recursive pairing, duplicates, unpaired sides, pair diff, roll-over
* `review_file.test.ts` — pending/blank/missing, corrupt rejection, upsert, sync history
* `review_merge.test.ts` — decisions, changed decisions, counters, orphans, restart
* `review_query.test.ts` — month/range filters, every sort mode + direction, notes
* `review_io.test.ts` — missing/ok/corrupt, atomic move, fallback, write failure, backup
* `review_flow.test.ts` — scan → decide → restart → rescan (+/−/~/rename) → corrupt → failure
* `review_ui.test.tsx` — status text+icons, comparison markup, rows, counters, hotkeys, tab order
* `review_ui_flow.test.tsx` — DOM flow: pick folder, review, A/D, counters, JSON, rescan

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
| Coverage `src/lib` | lines ≥ 80%, never decrease (now 97.8%) | vitest v8 |
| Anti-gaming | `partN` helpers always fail | same |

Workflow and ratchet: `CODE_VERIFICATION.md`. Dated re-checks: `QUALITY_RECHECK.md`.

## 10. History of designs — pointers

* 2026-09-30 — rules adopted from `marnikus/Process-Images-in-Areana`
  `docs/current/*` (AGENT_RULES 24 rules, CODE_VERIFICATION, DOM_SELECTORS →
  UI_SELECTORS, QUALITY_RECHECK); metrics reports intentionally not ported.
* 2026-10-01 — batch processing designed TDD-first:
  `docs/archive/2026-10-01-batch-processing/design.md` (module map, browser
  constraints, rule budget, negative tests).
* 2026-10-01 — image review / Selection tab designed TDD-first:
  `docs/archive/2026-10-01-review-selection/design.md` (pairing rules, decision
  file, rescan semantics, atomic write, rule budget).

## 11. Current UI — control inventory

Full handle reference with semantic fallbacks: `UI_SELECTORS.md`.

* Workbench: `tab-sheets`, `tab-batch`, `tab-review` (Selection).
* Sheets mode: header (upload + 3 export buttons), Sheets, Export settings
  (padding/size/transparent), Detection (merge slider + reset), Boundary
  overlay, Result grid, busy overlay, toast.
* Batch mode: header controls (`batch-root`, `batch-refresh`, `batch-process`,
  `batch-cancel`), PresetBar (name/save/list/delete + split settings), Dest
  info, review window (`scan-table`, `select-all`, per-row checkbox/actions),
  reference warnings, busy overlay, toast.
* Selection mode: header (`review-root`, `review-refresh`), counters that double
  as the status filter (`counter-*`), filters (`scope-*`, `filter-month`,
  `filter-from`, `filter-to`, `sort-key`, `sort-dir`, `filters-clear`), list
  (`review-list`, `review-row-{pairId}`, `status-*`), comparison window
  (`compare-view`, `compare-original`, `compare-ai`, `review-approve`,
  `review-decline`, `compare-close`), file warnings (`review-file-warning`,
  `review-file-retry`, `review-file-reset`), orphan history (`review-orphans`),
  busy overlay and toast.
