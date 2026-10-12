# Batch: one preset-saved merge slider + "Preview splits" at 1000-image scale

**Status: DESIGN (no production code written yet).** This is the plan-of-record for the
change, written before the first line of `src/` is touched, per RULE 16.6 step 2 and
RULE 17. Every number marked *measured* was produced in this sandbox on 2026-10-12
(Node `v22.22.3`, V8) by importing the **real** `src/lib/detect.ts`; the harness lives
outside the repo (`/tmp/proto/`) and is rebuilt properly in-repo as step P0. Numbers
marked *estimate* are called out as such and get measured in P0 before they are relied on.

---

## 1. What was asked, as acceptance criteria

| # | Ask | Acceptance (testable) |
|---|---|---|
| A1 | Batch only: **one** preset-saved global merge slider + Auto reset | `batch-merge` (range 0–0.15, step 0.0025) + `batch-merge-reset` live in the preset row; value stored in `preset.split.mergeFrac` (already `null` = auto) and survives a preset save/load/restart; corrupt value → auto |
| A2 | That one value drives **every** row's preview **and** the subsequent split | `detect(an, split.mergeFrac)` for both paths, from the same `SplitSettings` object; no second merge control anywhere in Batch (RULE 10) |
| A3 | "Preview splits" **beside "Split selected"** | `batch-preview` sits next to `batch-process` in the bulk bar; disabled with 0 selected |
| A4 | For each selected **eligible** row: every resulting icon as a **horizontal thumbnail strip + count** | per-row strip with `<img>` (chunks scroll horizontally) + `batch-preview-count-{relPath}`; ineligible rows (missing/deleted/not selected) get nothing |
| A5 | Reuse Batch's existing detect/render pipeline + preset output settings so previews **match processing** | preview pixels come from `renderIcon` (padding/size/transparent/size-cap only differ), the count equals `splitSheet(...).length` for the same settings — asserted by test |
| A6 | Preview **writes nothing**: no files, no JSON, no status, no undo | a read-only run over a write-guarded fake FS; `rows[].status`, `<base>.json` and the history timeline unchanged |
| A7 | **1000 images** previewed without lag and without crushing the tab | measured per-row budget (§3), visible-first cooperative scheduling, one decoded image at a time, byte-budgeted result cache with `URL.revokeObjectURL` on eviction, strips mounted only near the viewport |
| A8 | Single sheets **unchanged** | `src/App.tsx`, `src/sheets/**`, `src/ui/` untouched; `analyze`/`detect`/`renderIcon` keep their signatures and **their output** (equivalence-gated) |

---

## 2. What exists today (read-only research)

* Single sheets has everything the preview needs and Batch has none of it: merge slider
  (`merge-slider`, 0–0.15 step 0.0025), Auto reset (`merge-reset`), detected-boundary
  overlay, `renderIcon`-based previews (`src/App.tsx` → `previews` `useMemo`, cap 260 px).
* `SplitSettings.mergeFrac: number | null` already exists and is already validated
  (`src/lib/presets.ts` `validFrac`, out-of-range → `null`), already saved per preset
  (`BatchPresetRow` → `setPreset` → `savePresets`), and already reaches the detector:
  `useBatch.runBatch` → `processItems({ split: preset.split })` → `splitOne` →
  `splitSheet` → `detect(an, split.mergeFrac)`. **The only missing piece is the control.**
* Batch's row list (`src/batch/ScanTable.tsx`) renders `rows.map(...)` with no windowing;
  `ScanThumb` resolves one object URL per row through `useThumbCache` (never revoked — pre-existing,
  not this change's).
* No worker, no virtualization, no `requestIdleCallback` usage anywhere in `src/`.
* `vite.config.ts` ships `vite-plugin-singlefile`: the product is `dist/index.html` opened
  from disk with **no server** (`run_app.bat`, README §"single-file build").
* Test environment: `happy-dom`. It has `IntersectionObserver` as a **non-firing stub**
  (verified here: one `observe()` produced **0** callbacks in 50 ms) and **no**
  `requestIdleCallback` (verified: `undefined`); canvas is driven by recording shims in the
  existing suites. Both matter in §4/D4 — the design may not depend on either.

---

## 3. The performance problem, in numbers

`detect()` currently finds the automatic merge radius by running the full
dilate+label pipeline **once per candidate radius** (`for (let r = 1; r <= rMax; r++)`), and it
does that **even when a manual fraction was requested** — `series` is always built first.

Measured on the real `detect.ts` (3-rep averages, cold JIT):

| Sheet | grid `gw` | `detect(an, null)` | `detect(an, 0.05)` | rMax runs |
|---|---:|---:|---:|---:|
| 512² / 1 icon | 256 | 74 ms | 68 ms | 51 |
| 1024² / 1 icon | 342 | 192 ms | 171 ms | 68 |
| 1024² / 4 icons | 342 | 260 ms | 255 ms | 68 |
| 2048² / 12 icons | 342 | 324 ms | 349 ms | 68 |
| 4000² / 40 icons | 400 | 703 ms | 734 ms | 80 |

Consequences for the ask:

* **1000 rows ≈ 190–700 s** of main-thread work today, in **indivisible 170–700 ms blocks**.
  A modal spinner cannot hide that; the tab would freeze.
* Even a *visible-first* preview of one screen (≈15 rows) is **≈3–5 s of frozen UI**.
* Manual mode is *not* cheaper (at most ~1.1× better) — the price is the auto series.

So a faithful preview at 1000 rows is not a UI problem, it is a **per-image cost problem**.
The design therefore does two things:

1. **P1 — make the merge-radius series cost one sweep instead of `rMax` dilations**, with
   *bit-identical output* (proved by a frozen-oracle test). Measured on the prototype:

   | Sheet | today | after P1 | speed-up |
   |---|---:|---:|---:|
   | 512² / 1 icon | 74 ms | 17 ms | 4.3× |
   | 1024² / 1 icon | 192 ms | 36 ms | 5.4× |
   | 1024² / 4 icons | 260 ms | 33 ms | 8.0× |
   | 2048² / 12 icons | 324 ms | 41 ms | 8.0× |
   | 4000² / 40 icons | 703 ms | 93 ms | 7.5× |

   Prototype equivalence, run before writing this doc: the radius series is **identical on
   48/48** generated analyses (6 pattern families × 5 sheet sizes), and full
   `detect(an, frac)` outputs (`boxes`, `usedFrac`, `autoFrac`) are **identical on 288/288**
   comparisons (48 analyses × 6 fractions: `null, 0, 0.0025, 0.05, 0.15, random`).
   The harness is kept at
   `docs/archive/2026-10-12-batch-preview-splits/prototype/equivalence.mjs` (research artifact,
   never imported by `src/`/`tests/`; `prototype/README.md` has the run command).

2. **P3/P5 — run the remaining work cooperatively**: one row at a time, visible rows first,
   every step yieldable, results cached as small PNG blobs under a byte budget.

Warm per-phase breakdown of the fast detector (measured, excludes `analyze`):

| Sheet | cell fill | radius series | final label | box pass | core total |
|---|---:|---:|---:|---:|---:|
| 1024² / 1 icon | 1.4 ms | 14.5 ms | 2.4 ms | 1.8 ms | **20.2 ms** |
| 2048² / 12 icons | 5.2 ms | 14.7 ms | 2.9 ms | 7.8 ms | **30.7 ms** |
| 4000² / 40 icons | 20.2 ms | 20.2 ms | 5.1 ms | 28.5 ms | **74.2 ms** |

`analyze()` is the other per-row cost and cannot be measured in Node (it needs a canvas:
downscale `drawImage` + `getImageData` + two `w·h` passes): *estimate* 10–30 ms for 1024²,
150–400 ms for 4000². **P0 measures it in the browser and the P5 slice plan uses the real
number.** Realistic per-row budget after P1 (1024² AI icon): ≈ **45–60 ms**, sliced at
phase boundaries into ≤ ~20 ms steps; a 15-row screen ≈ **0.8–1.0 s** spread over frames.

### Why not a Web Worker (rejected, with the constraint that decides it)

`dist/index.html` is opened from `file://` with no server (`run_app.bat`), and web workers are
documented not to work from a `file://` page (the worker script is a cross-origin/opaque-origin
fetch; blob URLs are bound to the creating document's origin). The fast lane would therefore be
silently unavailable in the app's primary delivery mode — while adding a protocol, an
OffscreenCanvas variant of `analyze`/`renderIcon`, and an untestable transport (happy-dom has no
`Worker`), i.e. a RULE 8 hole. **Decision: main-thread cooperative scheduling, no worker, no new
dependency.**

### Memory model (the "do not crush the tab" part)

| Thing | Size | Policy |
|---|---|---|
| decoded source image | `W·H·4` (1024² ≈ 4 MB, 4000² ≈ 64 MB) | **transient**, one row at a time, dropped after the row |
| `Analysis.mask` + detect scratch | ≤ 16 MB mask + ~4 MB grid arrays | transient, never cached (an `Analysis` cache would be 4 GB at 1000 rows) |
| strip result | 1 PNG blob per row ≈ 4–20 KB | cached, **byte-budgeted LRU** (32 MB default), `revokeObjectURL` on evict |
| strips in the DOM | `<img>` per near-viewport row | mounted only within the viewport window ± overscan |

---

## 4. Decisions

**D1 — The merge radius is computed in one union-find sweep, not `rMax` dilations.**
For dilation radius `r` the dilated set is exactly `{cell : Chebyshev distance to ink ≤ r}`, so
components of the dilated set per `r` are the components of the thresholded distance field: one
Chebyshev distance transform (two passes, exact for the chessboard metric) plus an
increasing-`r` union-find walk over cells sorted by distance. Component inks are maintained per
root, `maxInk` and the `valid` count are evaluated at each radius (the existing `1.5 % of max ink`
rule unchanged). This is the *same function of the same inputs*; P1 proves it against a frozen
copy of today's algorithm (§7 T1/T2). Owner: new `src/lib/mergeseries.ts`; `src/lib/detect.ts`
keeps the final `dilate`+`label`+box pass **verbatim** so boxes cannot drift.

**D2 — Batch gets the merge control in the preset row, and it is the only one.**
`batch-merge` (min 0, max 0.15, step 0.0025 — same numbers as Single sheets) writes
`preset.split.mergeFrac`; `batch-merge-reset` writes `null`. Because the value lives in the
preset, save/load/restart already carry it (RULE 13 validation already handles corruption → auto).
While auto, the slider sits at 0, is visually muted, and the value read-out says
**"Auto — each image picks its own"** with a `title` explaining it; moving the slider switches to
manual immediately (RULE 24: the visible value mirrors state at the moment of change).
RULE 10 is why there is no per-row slider, and why the strip thumbnail size is **not** a second
control (D7).

**D3 — "Preview splits" is a session, not a job list.**
One session owns: the key set (selected ∧ eligible rows), the current settings fingerprint
(`mergeFrac`, `padding`, `size`, `transparent`), a **generation counter**, and the result cache.
Any settings change or rescan increments the generation (immediate cancel + debounced replan,
250 ms); stale completions are dropped, never painted (RULE 24 + RULE 7).

**D4 — Order: near-viewport rows first, then list order.**
The queue prioritises rows inside the viewport window (± 300 px overscan), then the rest in the
user's own list order (filters/sort included). No `IntersectionObserver` dependency: the window is
computed from `getBoundingClientRect()` in a rAF-debounced pass over mounted rows (rects are
monotonic in DOM order, so the range is found by binary search; **zero rects — happy-dom, hidden
tabs — mean "everything is near"**, which is also the deterministic test path). No
`requestIdleCallback` dependency either (absent in happy-dom): the scheduler takes its yield and
clock functions as injected values.

**D5 — One row at a time, one image at a time.**
Peak memory stays at one source image + its scratch; concurrency >1 would multiply the largest
term in the memory table for no wall-clock gain on a single main thread.

**D6 — Results are PNG blobs, cached under a byte budget, pinned while visible.**
A row's strip is one composite canvas per chunk (`≤ 8192 px` wide, D8) encoded once with the
existing `canvasToBlob` (RULE 15's gate applies to the blob's existence, not to a file). The cache
stores `{key, blobs, url, count, usedFrac, bytes}`; eviction order is LRU with visible rows pinned;
evict/clear **must** revoke the URL (RULE 20). Deleting a row's strip on uncheck/removal takes the
same path.

**D7 — Preview thumbs are a fixed 64 px, and the preview is honest about its caps.**
64 px × ≤128 icons per chunk keeps a strip ≈ 4–20 KB and keeps the whole-set cache inside 32 MB;
the row's own zoom slider (48–800 px) stays a *row thumbnail* decision and is not reused (RULE 10).
Guards, reported in text, never silently applied (RULE 4): at most **512 icons per row** rendered
("Preview shows the first 512 of 913 icons"), at most **32 MB** of cached strips, at most
**8192 px** per chunk canvas.

**D8 — Parity is by construction, and asserted.**
Preview renders through `renderIcon(img, an, boxes, box, sq, opts, maxOut)` with the *same*
`analyze`/`detect`/`squareInfo` and the same `ExportOpts` (`padding`, `size`, `transparent`) as the
split path; the only difference is `maxOut = 64`. `splitSheet` becomes
`splitSheet = planSplit + renderAll`, so preview and split share `planSplit`. A test asserts the
preview count equals `splitSheet(...).length` on the same file and settings. Preview results are
**not** fed to the split (freshness, RULE 22/15: what is written must come from the bytes read at
split time) — recorded as a non-goal with its reason.

**D9 — Preview never writes and never blocks.**
It reads through `resolveFile().getFile()` only — no `ensureDirPath`, no `writeFileNew`, no
`copyFileTo`; no `applyOutcomes`, no `syncAndCollect`, no `setSelected`, no `patchBatch`, no
`history.pushGesture`. It does **not** use the `busy` overlay (that would block the scrolling that
drives the preview): progress is the live counter `batch-preview-progress` plus a start toast and an
end toast, per RULE 2/5/7. Leaving the Batch tab unmounts the session and clears the cache.

**D10 — Preview state is view-local and ephemeral.**
It lives in the panel's React state (a hook), never in `appstore`/`session.ts`/localStorage and
never in the undo timeline (RULE 12: undo covers editable state; a preview is not editable state,
and persisting blobs is not readable back — RULE 13).

---

## 5. Architecture

```
                       preset.split.mergeFrac  (ONE value: preview + split)
                                    │
        ┌───────────────────────────┴────────────────────────────┐
        │ useSplitPreview  (src/batch/preview/, React state)     │
        │  session: keys · settings fingerprint · generation     │
        └───────┬───────────────────────────┬────────────────────┘
                │ plan(keys, settings)      │ results(version)
                ▼                           ▼
   previewqueue (lib, pure)          previewcache (lib, pure)
   visible-first · 1 in flight       byte budget · pin · revoke
   abort/generation · per-item catch
                │ work(job, token)
                ▼
   per row: resolveFile → getFile → loadImage            (read-only IO)
            → planSplit(img, split)                      (analyze+detect+squareInfo)
            → renderStrip(img, plan, split, 64)          (renderIcon per icon, RULE 1)
            → stripBlobs → object URL → cache.put
                │
                ▼
   ScanTable row → PreviewStrip (img + count)  ·  BatchBulkBar (toggle/progress/Stop)
```

**New lib modules** (pure logic, `src/lib/**` coverage gate ≥ 80 % applies):

| File | One responsibility | Key exports | Est. lines |
|---|---|---|---|
| `mergeseries.ts` | component count per merge radius in one sweep (D1) | `componentCountSeries`, `distanceToInk`, `cellsByDistance` | 150–200 |
| `previewstrip.ts` | strip layout + rendering one row's icons into chunk canvases + PNG delivery | `stripChunks`, `renderStrip`, `stripBlobs` | 110–150 |
| `previewlimits.ts` | the preview's budget constants and their reasons | `THUMB_PX`, `MAX_STRIP_PX`, `MAX_ICONS_PER_ROW`, `CACHE_BYTES`, `REPLAN_MS` | 30–45 |
| `previewcache.ts` | byte-budgeted LRU with pinning + revoke | `createPreviewCache` | 80–110 |
| `previewqueue.ts` | order, one-in-flight, yield, abort, generations, per-item isolation | `createPreviewQueue` | 130–180 |
| `batchsplit.ts` *(edit)* | sheet → plan; plan → blobs | `planSplit`, `splitSheet` | 32 → ~55 |
| `detect.ts` *(edit, legacy hotspot)* | mask + boxes, **same output**, cheaper series | `detect` (unchanged signature) | 306 → ≤ 306 |

**New Batch modules** (`src/batch/preview/`, RULE 18 module 5–15 files):

| File | One responsibility | Est. lines |
|---|---|---|
| `useSplitPreview.ts` | session hook: keys, generations, per-row state, debounce, lib wiring | 140–190 |
| `useRowWindow.ts` | near-viewport row set (D4), zero-rect fallback | 60–90 |
| `PreviewStrip.tsx` | one row's strip: pending / ready / empty / error / capped + count | 60–90 |
| `BatchPreviewBar.tsx` | "Preview splits (N)" toggle + live counter + Stop | 40–70 |

**Edits**: `BatchPresetRow.tsx` (+`MergeMini`, ~35 lines), `BatchBulkBar.tsx` (render the preview
cluster beside `batch-process`, ~25 lines + props), `ScanTable.tsx` (mount the strip as a 7th grid
child spanning `grid-column: 1 / -1`, ~25 lines), `BatchPanel.tsx`/`useBatchView.ts` (wiring,
~35 lines), `index.css` (`.batch-preview-strip` block, ~15 lines: `grid-column: 1 / -1;
align-self: start; overflow-x: auto; display: flex; gap: 8px`).

**Handles** (RULE 21 — semantic first, `data-testid` for the stable hooks):

| Handle | Element | Notes |
|---|---|---|
| `batch-merge` | range 0–0.15 step 0.0025 | the one Batch merge control (D2) |
| `batch-merge-value` | text | `Auto — each image picks its own` or `0.0475` |
| `batch-merge-reset` | button `↺ Auto` | disabled while already auto |
| `batch-preview` | button beside `batch-process` | `👁 Preview splits (N)`; disabled with 0 selected |
| `batch-preview-stop` | button | visible only while previewing (`✕ Stop preview`) |
| `batch-preview-progress` | text, `aria-live="polite"` | `Previewed 137/1000 rows · 412 icons` |
| `batch-preview-strip-{relPath}` | per row, `data-state` | `pending \| reading \| ready \| empty \| error \| capped` |
| `batch-preview-count-{relPath}` | per row text | `12 icons` · `No icons at this merge distance` · `Preview failed: …` · `first 512 of 913 icons` |
| `batch-preview-img-{relPath}` | per row `<img>` | `alt="Preview of 12 icons from <name>"`, `decoding="async"` |

---

## 6. Invariants to add to the SOR (with the implementation commit, not now)

* **I-66 (batch, RULE 10/24):** Batch has exactly one merge-distance control, stored in the preset
  (`preset.split.mergeFrac`, `null` = auto); the preview and the split read the same value from the
  same `SplitSettings`.
* **I-67 (batch, RULE 14/15):** a preview is a view, never output: it writes no file, no state JSON,
  no status, no undo entry, and its results are never reused by a split.
* **I-68 (batch, RULE 5/7):** a preview session is interruptible at row granularity and at phase
  granularity; a per-row failure is reported on that row and never stops the session; a stale
  generation never paints.
* **I-69 (batch, RULE 1/20):** preview pixels come from `lib/render.renderIcon` with the preset's
  own `ExportOpts`; decoded images are transient (one row at a time) and every cached strip URL is
  revoked on eviction.

---

## 7. TDD plan (red first, per file; `npx vitest run tests/<file>`)

| # | Test file | Red spec (first failing assertions) | Green at |
|---|---|---|---|
| T1 | `tests/mergeseries.test.ts` *(new)* | stub returns `[]` → fails: series for a two-icon sheet (both merge at a hand-computed radius); no-ink mask → all zeros; single component after the grid floods; series is non-increasing in `r`; counts never exceed ink cells | P1 |
| T2 | `tests/detect_equivalence.test.ts` *(new)* + `tests/helpers/detect_oracle.ts` (frozen copy of today's `dilate`/`label`/`detect`, header-commented as the equivalence oracle) | `detect` vs oracle on 24 seeded masks × 4 fractions (sizes ≤ 512², file budget ≤ 15 s) + curated fixtures (1 icon, 4 icons, edge-touching ink, blank, dithered noise): identical `boxes`, `usedFrac`, `autoFrac` | P1 |
| T3 | `tests/batchsplit.test.ts` *(edit)* | `planSplit` returns `{an, boxes, usedFrac, autoFrac, sq}` for a synthetic sheet and encodes nothing; `splitSheet` still returns one blob per icon (existing cases stay green) | P2 |
| T4 | `tests/previewstrip.test.ts` *(new)* | chunk math (0, 1, 128, 129, 913 icons; `≤ 8192 px`), render order = detection order, one `renderIcon` per icon with `maxOut = 64`, blob type/size > 0, the 512-icon cap reports itself | P2 |
| T5 | `tests/previewqueue.test.ts` *(new)* | visible-first then list order; one job in flight; each job sees the live generation; cancel stops before the next row and reports `stopped`; a throwing row is reported and the session continues; replan of the same keys is a no-op; a stale completion is never emitted | P3 |
| T6 | `tests/previewcache.test.ts` *(new)* | byte budget evicts LRU non-pinned first; pinned rows survive while anything non-pinned exists; `revoke` runs exactly once per URL on evict/clear/replace; `clear()` empties and revokes everything | P3 |
| T7 | `tests/batch_merge_slider.test.tsx` *(new)* | slider bounds/step; default `Auto`; drag → manual value in state **and** in the saved preset JSON (localStorage round-trip); `batch-merge-reset` → `null`, disabled while auto; loading a preset with `mergeFrac: 0.0475` shows `0.0475` (RULE 24); a corrupt `0.9` reads back as auto (RULE 13); the value the split receives is the slider's | P4 |
| T8 | `tests/batch_preview_ui.test.tsx` *(new)* | `batch-preview` exists beside `batch-process`; clicking it gives every selected eligible row a strip + count and gives ineligible rows nothing; **zero writes** (write-guarded fake FS: `getFileHandle(create:true)`/`createWritable` throw), statuses/JSON/history unchanged; Stop leaves later rows unpreviewed and says so; unchecking mid-session removes that strip and cancels its job; a decode failure shows an honest row error and the queue continues; slider change replans (debounced) and strips update; tab unmount clears the session and revokes URLs; **1000 selected rows** → only near-viewport rows mount strips, cache bytes ≤ budget, progress counter present, still zero writes | P5 |
| T9 | `tests/batch_preview_parity.test.ts` *(new)* | real pipeline on a 3-row fake root with the canvas shim: preview count per row == `splitSheet(file, split).length` for `mergeFrac: null` and a manual value (previews match processing, A5) | P5 |
| T10 | `tests/preview_viewport.test.ts` *(new)* | window math incl. overscan; monotonic binary search over rect tops; **zero rects ⇒ all near** (happy-dom/hidden tab) | P5 |

Test seams follow the repo's existing pattern (`ProcessDeps.splitImage` is injected today): the
session hook takes its per-row work, clock and yield function by injection, so T8 exercises the
**real** queue/cache/state machine with a deterministic work function, while T9 + T4 exercise the
**real** pixels. No test asserts on strings alone, and no test would pass with the feature deleted.

---

## 8. Implementation steps (each ends green: `npx tsc --noEmit` · `npm run lint` · `npm run quality:changed` · targeted `vitest`)

* **P0 — measurement harness, no src change.** Add `tools/bench_detect.mjs` (per-phase ms for
  512²/1024²/2048²/4000² sheets, prints a table). Record, in this folder's `numbers.md`, the current
  numbers **and** the browser numbers for `analyze` (downscale + `getImageData`) taken from a
  throwaway page; the suite baseline (`npx vitest run` count) goes in too. *Exit:* the doc's §3 table
  is reproduced by the repo tool.
* **P1 — exact-equivalent merge series (the enabler).** T1+T2 red → `mergeseries.ts` → `detect.ts`
  uses it (delete the `r=1..rMax` loop; keep `dilate`/`label`/box pass for the final radius; add the
  `col[]` column map to both `w·h` passes as a named, tested helper) → all existing detect/analyze/
  render/renderIcon tests stay green as the boxes gate. *Exit:* T1/T2 green, bench shows ≥ 4× on
  every sheet, `detect.ts` line count ≤ its 306-line baseline, `git diff` shows no signature change.
  *Fallback if equivalence ever fails:* ship the preview on the old series with the D4 paging and a
  documented worst case (≈0.2–0.7 s per newly viewed row) — never ship a detector that changed output.
* **P2 — one plan for split and preview.** T3+T4 red → `planSplit` extraction in `batchsplit.ts` →
  `previewstrip.ts` + `previewlimits.ts`. *Exit:* `splitSheet`'s exported behaviour unchanged
  (existing `tests/batchsplit.test.ts` + `tests/process.test.ts` green).
* **P3 — scheduler + cache (pure lib).** T5+T6 red → `previewqueue.ts`, `previewcache.ts`.
  *Exit:* queue/cache tests green; no DOM, no React in these modules (they are the tested core).
* **P4 — the merge slider.** T7 red → `MergeMini` in `BatchPresetRow.tsx`, one line of wiring in
  `SplitControls`. *Exit:* the slider's value reaches `processItems` untouched; `presets.test.ts`
  unchanged.
* **P5 — the preview UI.** T8/T9/T10 red → `useSplitPreview.ts`, `useRowWindow.ts`, `PreviewStrip.tsx`,
  `BatchPreviewBar.tsx`, `ScanTable`/`BatchPanel`/`useBatchView` wiring, `index.css` block.
  *Exit:* preview runs with `busy` untouched; Stop works within one row; 1000-row test passes with
  injected work; parity test passes with the real pipeline.
* **P6 — docs + numbers, same commit as the code (RULE 17).** Update `SYSTEM_OF_RECORD.md` (§2 Batch
  behaviour, §4 flows, §5 I-66…I-69, §11 control inventory), `UI_SELECTORS.md` §L (new handles),
  this folder's `numbers.md` (before/after), one dated entry appended to `QUALITY_RECHECK.md`, and
  the `docs/README.md` row. *Exit:* `npm run verify` clean; commit message
  `feat(batch): one preset merge slider + preview splits (I-66…I-69)` + a `Verified:` line.

---

## 9. Quality budget (RULE 16 hard lines, RULE 18 ideals) and how it is checked

| Rule | Target for this change | Check |
|---|---|---|
| Function ≤ 30 lines (aim 4–20) | every new function; the union-find sweep is split by concept (`distanceToInk`, `cellsByDistance`, `countValidComponents`), never `fooPart1` | `npm run quality:changed` |
| Params ≤ 4 | queue/cache take one context object (`PreviewContext`, `CacheOpts`) — domain types, not `options: any` | same |
| CC ≤ 10, nesting ≤ 4 | no nested loop deeper than 2; guard clauses first (RULE 19 order) | same + `refactor_optimize.test.ts`-style review |
| New file ≤ 300 lines | all new files ≤ 200 except `mergeseries.ts` (≤ 200) | same |
| Hooks/component ≤ 15 | `useSplitPreview` splits into `useSessionState` + `useSessionRunner` if it reaches 12 | review |
| `detect.ts` (legacy) | **must not grow** past its baseline (306) and must not worsen CC | baseline ratchet |
| No new smells | no duplicated canvas math (preview calls `renderIcon`), no dead code (`tsc` clean) | `tsc --noEmit`, lint |
| Coverage | `src/lib/**` ≥ 80 %, zero uncovered new lib functions | `npm run coverage` |

Self-review checklist to attach to the PR: RULE 16.7 list verbatim, plus "Single sheets untouched
(`git diff --stat` shows no `src/App.tsx`/`src/sheets/**`)" and "`detect` outputs identical
(oracle test green)".

> **Sandbox note (measured 2026-10-12).** This branch's HEAD **tracks `node_modules/`** — 11,480
> files, a Windows checkout — which contradicts `AGENTS.md` §0 ("HEAD tracks none"; that sentence
> describes `main`). A snapshot restore also drops the exec bits and the Linux rollup binary, so
> `npm run test:fast` dies with `vitest: Permission denied`. Working recipe here:
> `npm ci --prefer-offline` (7 s) → `git checkout -- node_modules` (keeps the tree clean; the
> untracked Linux packages stay) → call tools through their entry points:
> `node node_modules/vitest/vitest.mjs run <file>`, `node node_modules/typescript/bin/tsc --noEmit`,
> `node node_modules/eslint/bin/eslint.js src tests tools`, `node tools/quality.mjs --changed
> --allow-legacy`. Untracking `node_modules/` on this lineage is a separate owner decision, not
> part of this change.

---

## 10. Risks, and the design's answer

| Risk | Answer |
|---|---|
| The fast series is subtly wrong on some mask family | frozen-oracle equivalence test (T2) over 24 seeded masks + curated fixtures, run in CI; `detect.ts` keeps the old final `dilate`+`label`+box pass; P1 is a separate commit that can be reverted alone |
| `analyze` on a 4000² sheet is a 150–400 ms indivisible block | measured in P0, stated honestly in the doc + SOR; visible-first ordering means it happens for rows the user is looking at, one at a time, never 1000 times in a burst |
| Memory blow-up (decoded images, canvases, URLs) | D5 (one image at a time), D6 (blob cache + byte budget + revoke), D7 caps, T6/T8 assertions |
| Jank while the user scrolls/drags | generation cancel-on-change + 250 ms replan debounce, yields at every row and every icon, no modal overlay (D9) |
| RULE 16 gate failures from a large new UI surface | the §9 budget table is a per-file contract; `previewqueue`/`previewcache` stay pure and small; the UI hook is split the moment it reaches 12 hooks |
| Scope creep into `ScanTable`'s pre-existing per-row object URLs | explicit non-goal, recorded as debt below |

**Non-goals (explicit):** workers/OffscreenCanvas; reusing preview boxes for the split; caching
`Analysis`; virtualizing `ScanTable` or changing `ScanThumb`/`useThumbCache`; touching
`analyze`/`renderIcon`/`process.ts`/`naming.ts`/`statefile.ts`; new dependencies; persisting preview
state; the Single-sheets UI.

**Open points (defaults in bold):** (1) strip thumb size — **fixed 64 px** vs following the row zoom;
(2) show each row's auto value in its count line (*`12 icons · auto 0.0117`*) — default **yes, as a
muted suffix**; (3) caps **512 icons/row, 32 MB cache, 8192 px/chunk** — move after P0 measurements;
(4) add a `P` hotkey for the preview — default **no** (RULE 10 spirit: the button is enough).

**Debt handed forward (not fixed here):** `useThumbCache` never revokes the per-row source URLs and
`ScanTable` renders every row — a 1000-row scan holds 1000 object URLs today. It is outside A1–A8's
blast radius and gets its own design if measurements in P0 show it dominating.
