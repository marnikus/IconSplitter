# Quality re-check — process and dated records

Adapted from `Process-Images-in-Areana/docs/current/QUALITY_RECHECK.md`, which
is the dated log of full quality re-checks after substantial changes. The
numbers there belong to that app; this file carries Icon Splitter's own.

## What a re-check is

A **full** run of every verification lane (`npm run verify` — types, lint,
quality gate on ALL files, tests, coverage, build) plus the review lanes
(jscpd, knip), with the results recorded here as a dated entry. It is the
moment when the baseline may be re-recorded — and only then.

## When to run one

* after any change that touches a legacy hotspot (`src/App.tsx`, `src/lib/detect.ts`) — RULE 16.5
* after adding a pipeline stage (analyze/detect/render/deliver)
* after dependency upgrades that change tooling output (eslint, vitest, typescript)
* before a release / before merging a feature branch to main

## What a record must contain

1. Lanes run and their results (pass/fail, counts)
2. The numbers: per-file lines + function counts, coverage, gate status
3. Baseline decision: re-recorded (with reason) or untouched
4. Any new debt accepted, with a pointer to its archive doc (RULE 17)

**Baseline re-record is an integrator step, reviewed:** one writer runs
`node tools/quality.mjs --write-baseline`, and the diff of
`tools/quality_baseline.json` is part of the change. A re-record that raises a
recorded offender's values without a matching refactor is rejected (the ratchet
moves down or sideways, never up to hide growth — CODE_VERIFICATION.md).

---

# Quality re-check — 2026-09-30 (rules adopted from sister project)

First re-check: adoption of the RULE 16 gate, test lane and baseline from
`Process-Images-in-Areana` (`docs/current/AGENT_RULES.md`, 24 rules).

## What changed

* `tools/quality.mjs` gate written (TS AST: function LOC / params / CC /
  nesting, file lines, anti-gaming names, per-function baseline ratchet,
  merge-base `--changed` mode incl. untracked files)
* ESLint flat config: hygiene errors + complexity/nesting warns
* Vitest lane: 17 tests executing the real `analyze` / `detect` /
  `renderIcon` / `canvasToBlob` logic (canvas shims serve synthetic pixels)
* `data-testid` handles added to `src/App.tsx` (UI_SELECTORS.md A–H)
* Baseline recorded from the current tree (grandfathering legacy hotspots)

## The numbers (measured, not estimated)

| File | Lines | Functions | Gate state |
|---|---:|---:|---|
| `src/App.tsx` | 607 | 76 | LEGACY (App 553 LOC, cc 14; two anonymous handlers 36/45 LOC) |
| `src/lib/detect.ts` | 307 | 15 | LEGACY (analyze 92/cc 11, label 42/cc 14/nest 5, detect 97/cc 32) |
| `src/lib/render.ts` | 106 | 8 | LEGACY (renderIcon 74 LOC, 7 params, cc 9, nest 3) |
| `src/main.tsx` | 11 | 0 | OK |
| `src/utils/cn.ts` | 7 | 1 | OK |

* Tests: **17 passed** (4 files)
* Coverage `src/lib`: **lines 100%, branches 95%** (threshold lines ≥ 80%)
* Lanes: tsc ✓ · eslint 0 errors / 8 legacy warnings · gate ✓ · build ✓
* `dist/index.html` single-file build: 342 kB (gzip 104 kB)

## Baseline decision

Re-recorded once at adoption (`--write-baseline`) to grandfather the legacy
hotspots above. The ratchet now fails any growth of those values; new code
must meet the hard lines (LOC ≤ 30, params ≤ 4, CC ≤ 10, nesting ≤ 4).

## Known debt carried

* `App` component at 553 LOC — split into sheet panel / preview grid / export
  hooks on first functional touch (RULE 16.5; design goes to
  `docs/archive/<date>-app-split/` when that happens)
* `detect()` at cc 32 — auto-radius sweep and reading-order sort are separable
  concepts (`chooseAutoRadius`, `orderBoxesByReading`), extract on touch

---

# Quality re-check — 2026-10-01 (batch processing feature, TDD)

Second re-check: the batch-processing feature shipped (design:
`docs/archive/2026-10-01-batch-processing/design.md`), written test-first in
10 TDD cycles. 17 new source files, 10 new test files; Sheets-mode code was
not touched except `App` shrinking behind the new mode shell.

## What changed

* `src/lib/` +6: `naming.ts`, `scan.ts`, `statefile.ts`, `presets.ts`,
  `output.ts`, `fs.ts`, `batchsplit.ts`, `dom.ts` (8 new lib files)
* `src/batch/` +9: `store.ts`, `process.ts`, `statewrite.ts`, `picker.ts`,
  `useBatch.ts` (composed of 4 sub-hooks), `BatchPanel.tsx`, `ScanTable.tsx`,
  `PresetBar.tsx`
* `src/ui/Workbench.tsx` — new mode shell (tabs); `src/main.tsx` renders it
* `tests/` +10 files incl. `tests/helpers/fakefs.ts` (in-memory FS fakes)
* RULE 16.5 honoured: `App.tsx` was NOT grown — the tab switch lives outside it

## The numbers (measured, not estimated)

| File | Lines | Functions | Gate state |
|---|---:|---:|---|
| `src/App.tsx` | 588 | 70 | LEGACY held — App 552 LOC, cc 14; two anonymous handlers 36/45 LOC |
| `src/lib/detect.ts` | 307 | 15 | LEGACY held — analyze 92/cc 11, label 42/cc 14/nest 5, detect 97/cc 32 |
| `src/lib/render.ts` | 106 | 8 | LEGACY held — renderIcon 74 LOC, 7 params, cc 9 |
| 17 new batch/shell files | ≤ 184 each | — | all `[OK]` — no violations |

* Tests: **68 passed** (14 files; was 17 tests / 4 files)
* Coverage `src/lib`: **lines 94.76%, branches 90.4%** (threshold lines ≥ 80%;
  drop vs 2026-09-30 is `dom.ts` browser-lane code, untestable in vitest)
* Lanes: tsc ✓ · eslint 0 errors / 8 legacy warnings · gate strict run fails
  only the 3 baseline-held files · `--changed --allow-legacy` **GATE PASSED** ·
  build ✓
* `dist/index.html` single-file build: 374.79 kB (gzip 113.04 kB)

## Baseline decision

**Not re-recorded.** The only legacy-file delta is `App.tsx` shrinking
(606 → 588 lines), which the ratchet already permits (shrink never fails).
`detect.ts` and `render.ts` are unchanged. Every new file passes the hard
lines standalone. Re-recording would only risk cementing values; there is
nothing to grandfather.

## Known debt carried

Same two items as 2026-09-30 (`App` split on first functional touch;
`detect()` cc 32 extraction). No new debt accepted — all batch code is
gate-clean at introduction, including RULE 18 (no file > 300 lines, no function
> 30 LOC, context objects instead of >4 params).

---

# Quality re-check — 2026-10-01 (image review Selection tab, TDD)

Third re-check: the Selection tab shipped (design:
`docs/archive/2026-10-01-review-selection/design.md`), written test-first in
8 cycles (R7 lib, R8 DOM flow). Sheets mode untouched; the batch feature only
reused the new shared pieces (`src/ui/Overlays.tsx`, `src/ui/Thumb.tsx`,
`src/ui/useThumbnails.ts`, `resolveFileHandle`) and shrank.

## What changed

* `src/lib/` +9: `review.ts`, `reviewfile.ts`, `reviewmerge.ts`, `reviewquery.ts`,
  `reviewio.ts`, `reviewkeys.ts`, `reviewformat.ts`, `text.ts` (+
  `resolveFileHandle` added to `fs.ts`)
* `src/review/` +14: `useReview.ts`, `useCompare.ts`, `persist.ts`, `scan.ts`,
  `store.ts`, `detail.ts`, `ReviewPanel.tsx`, `ReviewList.tsx`,
  `ReviewFilters.tsx`, `ReviewCounters.tsx`, `CompareView.tsx`, `StatusBadge.tsx`
* `src/ui/` +2 and reworked: `Overlays.tsx`, `Thumb.tsx`, `useThumbnails.ts`;
  `Workbench.tsx` gained the `tab-review` tab; `BatchPanel.tsx`/`ScanTable.tsx`
  now share the overlays/thumbnails (both files shrank, no test change needed)
* `tests/` +8 files: `review_pairs`, `review_file`, `review_merge`,
  `review_query`, `review_io`, `review_flow`, `review_ui`, `review_ui_flow`
  (+ `tests/helpers/review.ts`)

## The numbers (measured, not estimated)

| File | Lines | Functions | Gate state |
|---|---:|---:|---|
| `src/App.tsx` | 588 | 70 | LEGACY held — App 552 LOC, cc 14 |
| `src/lib/detect.ts` | 307 | 15 | LEGACY held — analyze 92/cc 11, label 42/cc 14/nest 5, detect 97/cc 32 |
| `src/lib/render.ts` | 106 | 8 | LEGACY held — renderIcon 74 LOC, 7 params, cc 9 |
| `src/lib/review.ts` | 197 | 36 | `[OK]` |
| `src/lib/reviewfile.ts` | 163 | 21 | `[OK]` |
| `src/review/useReview.ts` | 240 | 60 | `[OK]` |
| `src/review/CompareView.tsx` | 219 | 18 | `[OK]` |
| 24 further new files | ≤ 157 each | — | all `[OK]` — no violations |

* Tests: **164 passed** (22 files; was 68 tests / 14 files)
* Coverage `src/lib`: **lines 97.78%, branches 92.29%** (up from 94.76% / 90.4%)
* Lanes: tsc ✓ · eslint 0 errors / 8 legacy warnings (unchanged) · full gate
  `node tools/quality.mjs --allow-legacy` **GATE PASSED** · jscpd 1 clone
  (pre-existing `App.tsx` ↔ `PresetBar.tsx`, 0.18%) · build ✓
* `dist/index.html` single-file build: 410.66 kB (gzip 122.51 kB)

## Baseline decision

**Not re-recorded.** No legacy file grew (`App.tsx` unchanged at 588,
`BatchPanel.tsx` 125 → 112 and `ScanTable.tsx` 94 → 75 after the shared
extraction), and every new file passes the hard lines standalone.

## Known debt carried

Same two items as 2026-09-30/2026-10-01 (`App` split on first functional touch;
`detect()` cc 32 extraction). New debt accepted: none. Note for the integrator —
`node tools/quality.mjs --changed` needs a real `origin/main` merge base; in a
single-commit clone the fallback `HEAD~1` does not exist, so the full run above
was used instead.

---

# Quality re-check — 2026-10-01 (Selection UI rebuilt to the supplied design)

Fourth re-check: the Selection tab was rebuilt to match the design screen
(watcher, filter row with From/To, search, badges with icons, inline comparison
card, status bar). Pure logic gained only formatting/query helpers; the layout
files were replaced, the old ones deleted.

## What changed

* `src/lib/` — `reviewformat.ts` (+ pair token, long/short dates, relative time,
  Windows path, datetime-local value, zoom label), `reviewquery.ts` (+ search,
  data range, per-key order labels), `reviewmerge.ts` (+ attention/progress),
  `reviewkeys.ts` (+ Space/zoom, ↑↓), `scan.ts` (+ `countFolders`), `text.ts`
* `src/review/` — new: `RootBar`, `FilterBar`, `PairList`, `PairRow`,
  `DetailPane`, `DetailHead`, `SidePane`, `StatusBar`, `Warnings`,
  `OrphanHistory`, `Hotkeys`, `sides.ts`, `api.ts`; `useReview.ts` gained the
  watcher, scan delta, unsaved-retry counter, zoom and search.
  Deleted (replaced): `CompareView.tsx`, `ReviewList.tsx`, `ReviewFilters.tsx`,
  `ReviewCounters.tsx`
* `src/ui/` — new: `Brand.tsx`, `HelpButton.tsx`, `AppChrome.tsx` (status slot),
  `Glyph.tsx`, `useTick.ts`; `Workbench.tsx` grew the app bar (still 90 lines),
  `Thumb.tsx` redrawn
* `tests/` — 2 new files (`review_format`, `review_ui_flow` rewritten),
  `review_ui.test.tsx` rewritten: **190 tests / 23 files** (was 164 / 22)

## The numbers (measured, not estimated)

| File | Lines | Functions | Gate state |
|---|---:|---:|---|
| `src/review/useReview.ts` | 268 | 78 | `[OK]` — grouped `ScanOutcome` instead of 6 params |
| `src/review/ReviewPanel.tsx` | 145 | 26 | `[OK]` — list controls extracted to `useListControls` |
| `src/review/PairList.tsx` | 123 | 8 | `[OK]` |
| `src/review/DetailPane.tsx` | 84 | 5 | `[OK]` |
| `src/ui/Workbench.tsx` | 90 | 5 | `[OK]` |
| 20 further changed files | ≤ 110 each | — | all `[OK]` |
| `src/App.tsx`, `src/lib/detect.ts`, `src/lib/render.ts` | unchanged | — | LEGACY held |

* Tests: **190 passed** (23 files)
* Coverage `src/lib`: **lines 97.91%, branches 92.12%** (was 97.78% / 92.29%)
* Lanes: tsc ✓ · eslint 0 errors / 8 legacy warnings (unchanged) · full gate
  `node tools/quality.mjs --allow-legacy` **GATE PASSED** · build ✓
* `dist/index.html` single-file build: 430.17 kB (gzip 128.36 kB)

## Baseline decision

**Not re-recorded.** No legacy file grew; the new `useReview`/`ReviewPanel`
violations found during the first gate run were fixed by grouping and extracting
(no overrides). Two legacy warnings (`Complexity` on `detect`, nesting in
`label`) are untouched.

## Known debt carried

Same two items as before (`App` split on first functional touch; `detect()`
cc 32 extraction). New debt accepted: none. The design's "Open in File Explorer"
stays a clipboard-path substitute because no browser API can open Explorer
(RULE 9 fail-open, documented in the help popover).
