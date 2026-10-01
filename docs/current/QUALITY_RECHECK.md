# Quality re-check — process and dated records

Adapted from `Process-Images-in-Areana/docs/current/QUALITY_RECHECK.md`, which
is the dated log of full quality re-checks after substantial changes. The
numbers there belong to that app; this file carries Icon Splitter's own.

<!-- ideal-size: ~476 lines reason=RULE 17 keeps dated verification and baseline decisions in one chronological quality ledger; splitting would fragment comparisons. -->

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

# Quality re-check — 2026-10-01 (Selection review, TDD)

Third re-check, same day: the Selection mode shipped (design:
`docs/archive/2026-10-01-selection-review/design.md`), test-first. 5 new pure
lib modules, 12 new selection modules, 10 new test files (incl. one happy-dom
component smoke).

## What changed

* `src/lib/` +5: `pairing.ts`, `reviewfilter.ts`, `reviewsort.ts`,
  `reviewmeta.ts`, `reviewfile.ts`; `fs.ts` grew an optional `removeEntry`
* `src/selection/` +12: `state.ts`, `reviewstore.ts`, `handles.ts`, `fmt.ts`,
  `thumbs.ts`, `useSelection.ts`, six components
* `src/ui/Workbench.tsx` — third tab `tab-selection` ("Selection")
* Legacy hotspots untouched (App.tsx still 588 lines).

## The numbers (measured, not estimated)

* Tests: **123 passed** (23 files; was 68 / 14)
* Coverage `src/lib`: **lines 95.76%** (threshold ≥ 80%)
* Lanes: tsc ✓ · eslint 0 errors (warnings only in legacy App/detect) ·
  gate strict run fails only the 3 baseline-held files ·
  `--changed --allow-legacy` **GATE PASSED** · build ✓
* `dist/index.html`: 409.55 kB (gzip 122.03 kB)
* First-pass gate violations on new code (validRecord cc 11, three JSX fns
  34–39 LOC) were refactored in the same change until the gate passed.

## Baseline decision

**Not re-recorded** — legacy values unchanged; all new files pass the hard
lines standalone (largest new file 153 LOC).

## Known debt carried

Same two legacy items; nothing new.

---

# Quality re-check — 2026-10-01 (Selection review V2)

Full re-check after adding the fourth Workbench mode (Selection V2), the three
new pure lib modules and the shared surfaces extracted out of V1.

## What changed

* New: `src/selectionv2/*` (11 files) — template-driven list review, bulk bar,
  zoom slider, filter grid, pair rows with both thumbnails.
* New pure lib: `reviewselect.ts` (checkbox selection), `reviewbulk.ts`
  (eligibility, bulk scope, one summary line), `reviewprefs.ts` (zoom range +
  persisted view prefs).
* Extracted from V1 into shared modules (no second copy): `Surfaces.tsx`
  (banner / corrupt note / toast / busy), `hotkeys.ts` (A/D/arrows/Space),
  `copypath.ts` (Explorer-path fallback). `SelectionPanel.tsx` 158 → 109 lines.
* Extended: `reviewfilter.ts` (`pairing` filter), `selection/state.ts`
  (`withBulkDecision`), `useSelection.ts` (`decideBulk`, `persist` → boolean),
  `thumbs.ts` (`useSideThumbs`), `fmt.ts` (`fmtDate` / `fmtTime`),
  `StatusFooter.tsx` (skin class), `Workbench.tsx` (4th tab), `index.css`
  (+460 lines of V2 design tokens/classes; CSS is outside the TS gate).
* TDD: 7 new + 2 extended test files, written before the code they cover.

## The numbers (measured)

| Lane | Command | Result |
|---|---|---|
| Types | `npx tsc --noEmit` | clean |
| Lint | `npm run lint` | 0 errors, 8 warnings — all pre-existing (`App.tsx` cc 15, `detect.ts` cc 11/14/32, `no-explicit-any` ×2) |
| Quality gate | `node tools/quality.mjs --allow-legacy` (ALL files) | **GATE PASSED** |
| Tests | `npm test` | **30 files / 207 tests passed** (was 23 / 126) |
| Coverage | `npm run coverage` | `src/lib` lines **96.55%**, branches 91.78% (threshold 80%) |
| Build | `npm run build` | single-file `dist/index.html` 467.99 kB (gzip 139.26 kB) |
| Duplication | `npx jscpd src --min-tokens 60` | 1 clone — the pre-existing `SIZES` table in `App.tsx` / `PresetBar.tsx` |
| Dead code | `npx knip` | **blocked** — `oxc-parser` dies with `RangeError: Array buffer allocation failed` in this sandbox; substituted an export-by-export consumer check (every new export has a consumer outside its own module) |

New/changed files, all inside the RULE 16 fail lines and the RULE 18 ideals:

| File | Lines | Fns | File | Lines | Fns |
|---|---:|---:|---|---:|---:|
| `lib/reviewselect.ts` | 32 | 7 | `selectionv2/ThumbPair.tsx` | 93 | 10 |
| `lib/reviewbulk.ts` | 64 | 9 | `selectionv2/ReviewRow.tsx` | 99 | 15 |
| `lib/reviewprefs.ts` | 66 | 7 | `selectionv2/BulkBar.tsx` | 110 | 12 |
| `lib/reviewfilter.ts` | 71 | 10 | `selectionv2/FilterGrid.tsx` | 147 | 23 |
| `selection/copypath.ts` | 18 | 1 | `selectionv2/SelectionV2Panel.tsx` | 156 | 27 |
| `selection/hotkeys.ts` | 58 | 5 | `selectionv2/ReviewList.tsx` | 83 | 6 |
| `selection/Surfaces.tsx` | 68 | 3 | `selectionv2/SourceBar.tsx` | 69 | 6 |
| `selectionv2/prefsstore.ts` | 20 | 2 | `selectionv2/useSelectionV2.ts` | 60 | 20 |
| `selectionv2/SegButton.tsx` | 20 | 1 | `selectionv2/ZoomSlider.tsx` | 26 | 2 |

New `src/lib` modules are at **100%** statements / branches / lines. The
`src/lib` average sits below the historical "100%" note above because of
pre-existing gaps this change did not touch (`dom.ts` 0%, `naming.ts` 88%,
`output.ts` 88%); every file this change added or edited in `src/lib` is at
100%.

## Baseline decision

**Untouched.** `tools/quality_baseline.json` records only the legacy hotspots
(`App.tsx`, `lib/detect.ts`, `lib/render.ts`, `main.tsx`, `utils/cn.ts`) and
none of them grew — `App.tsx` and `detect.ts` were not modified at all, and
`SelectionPanel.tsx` shrank. No re-record was needed or performed.

## Accepted debt / notes

* `docs/current/SYSTEM_OF_RECORD.md` is now 361 lines, above the RULE 18 ideal
  for context files. RULE 17 forbids a second current doc, so all four modes'
  authoritative behaviour stays in one file; the reason is recorded in the file
  header. Per-mode design detail lives in `docs/archive/` instead.
* `node tools/quality.mjs --changed` needs a revision to diff against:
  `git merge-base origin/main HEAD` fails in this checkout (unrelated
  histories), so the gate falls back to `HEAD~1`. Both the full-tree gate and
  `npm run verify` (which runs the `--changed` lane against the new commit's
  parent) were run and passed.
* The V2 rows use `role="list"` / `role="listitem"` rather than the template's
  `role="listbox"` / `option`: an `option` may not contain the checkbox and
  four buttons every row has. Recorded in
  `docs/archive/2026-10-01-selection-v2/design.md`.

# Quality re-check — 2026-10-01 (session restore, reset to pending, global undo/redo)

## What changed

New pure modules `lib/history.ts` (the one global timeline), `lib/session.ts`
(the restart snapshot), `lib/exportopts.ts`, `lib/isrecord.ts`; a store above the
tabs (`state/appstore.ts` + `useAppState`, `boot`, `useSessionAutosave`,
`usePrefsAutosave`, `safestorage`, `historystore`, `sessionstore`); the apply path
(`state/apply.ts`, `selection/offline.ts`); the UI (`state/HistoryProvider.tsx`,
`ui/HistoryBar.tsx`, `ui/useSheetsEdit.ts`). Touched: `selection/state.ts`
(`withReset`, `withRecords`), `useSelection`, `useSelectionV2`, `BulkBar`,
`CompareView`, `SelectionPanel`, `SelectionV2Panel`, `App`, `Workbench`,
`main`, `lib/reviewbulk|reviewfile|reviewfilter|reviewprefs|reviewsort`.

## The numbers (measured)

| lane | before | after |
|---|---|---|
| `tsc --noEmit` | clean | clean |
| eslint | 0 errors / 8 warnings | 0 errors / 8 warnings |
| `tools/quality.mjs --changed --allow-legacy` | GATE PASSED | GATE PASSED |
| tests | 30 files / 207 | **42 files / 325** |
| coverage `src/lib` (stmts/branch/funcs/lines) | 96.11 / 91.78 / 95.78 / 96.55 | **96.53 / 92.91 / 96.53 / 96.99** |
| build `dist/index.html` | 467.97 kB / gzip 139.25 kB | 485.14 kB / gzip 144.73 kB |
| jscpd | 2 clones (both pre-existing) | 2 clones, 12 lines — `lib/detect.ts` self-clone and `SelectBox` in `FilterBar`/`FilterGrid`; neither file was touched by this change |

`npm run verify` → **ALL LANES PASSED**.

## RULE 18 — ideal sizes

Every new file is small and single-purpose: `history.ts` 154, `session.ts` 118,
`HistoryProvider.tsx` 137, `apply.ts` 83, `appstore.ts` 74, `HistoryBar.tsx` 68,
`offline.ts` 59, `useSheetsEdit.ts` 43, the rest under 30 lines. No file exceeds
the 300-line hard limit; no function exceeds 30 body lines, 4 parameters, CC 10
or nesting 4 (the gate enforces all four and passes).

## Accepted debt / notes

- `selection/useSelection.ts` grew 161 → 273 lines: it now also maps view and
  decision changes onto history entries. Under the hard limit, but the natural
  next split is a `selection/history.ts` holding `ACTION_WORD`, `bulkLabel`,
  `VIEW_TOGGLES`, `pushDecisions`, `editView` and `patchState`.
- `knip` still cannot run in this sandbox (`oxc-parser` buffer allocation
  failure), so unused exports were checked by grepping every consumer instead:
  each new export has at least one non-test consumer, with one documented
  exception below.
- Exports verified to have a real consumer: `pruneIds` (useSelection rescan),
  `filterLabel`/`sortLabel` (useSelection), `patchRecords` (selection/offline),
  `parsePrefsValue` (state/apply), `parseSheetOpts`/`SIZES` (session, apply, App),
  `stepBack`/`stepForward`/`pushCoalesced`/`undoLabel`/`redoLabel`/
  `parseTimeline`/`serializeTimeline` (HistoryProvider, historystore),
  `bindDecisionApplier`/`hasLiveApplier` (useSelection / tests),
  `withRecords`/`withReset` (useSelection). `hasLiveApplier` is used only by
  tests — kept because it is the documented way to ask whether a panel owns the
  apply path.
- **Open item:** `selectionV2.scrollY` is carried by the store, the session
  schema and `useSelectionV2` (`scrollY` / `setScroll`), but `ReviewList` does
  not yet write it on scroll or apply it on mount, so the list currently always
  opens at the top. The plumbing is in place; the two lines in `ReviewList` (an
  `onScroll` handler and a mount effect) plus a DOM test are still to come.
- History and session live in `localStorage`, not in the atomic file flow: they
  are UI state, not user data, and writing them into the user's image folder
  would leave stray files. The atomic tmp-verify-overwrite writer remains the
  only path for `review-decisions.json`.

# Quality re-check — 2026-10-01 (selection review fixes)

## What changed

Four fixes on the Selection V2 review surface: undo/redo dead after using a
control (`selection/hotkeys.ts` — `isTextField` only skipped text surfaces
before, now it skips only text-ish inputs, textarea, select and contenteditable);
the History window (`ui/HistoryPanel.tsx`, opened by `hist-open` in
`ui/HistoryBar.tsx`); the bulk bar reduced to the selection
(`selectionv2/BulkBar.tsx` — approve / decline / reset **selected**, the
visible-list buttons removed); and explorer-style multi-selection
(`lib/reviewselect.ts` — `selectIntent`, `selectOne`, `selectRange`; `anchorId`
in `lib/session.ts`; one `checked` entry per click carrying `{ids, anchor,
active}`, read back by `state/apply.ts`). Touched: `ReviewRow`, `ReviewList`,
`SelectionV2Panel`, `useSelectionV2`.

## The numbers (measured)

| lane | before | after |
|---|---|---|
| `tsc --noEmit` | clean | clean |
| eslint | 0 errors / 8 warnings | 0 errors / 8 warnings |
| `tools/quality.mjs --changed --allow-legacy` | GATE PASSED | GATE PASSED |
| tests | 42 files / 325 | **43 files / 346** |
| coverage (all files, stmts/branch/funcs/lines) | 96.58 / 93.10 / 96.58 / 97.02 | 96.58 / 93.10 / 96.58 / 97.02 |
| build `dist/index.html` | 485.14 kB / gzip 144.73 kB | 487.73 kB / gzip 145.65 kB |
| jscpd | 2 clones / 12 lines | 2 clones / 12 lines — both pre-existing (`lib/detect.ts` self-clone, `SelectBox` in `FilterBar`/`FilterGrid`); neither file was touched |

`npm run verify` → **ALL LANES PASSED**.

## RULE 18 — ideal sizes

`ui/HistoryPanel.tsx` 87 lines (five components: the dialog shell, header,
action row, list, `useEscape`), `ui/HistoryBar.tsx` 54 (bar + `StepButton`),
`selectionv2/BulkBar.tsx` 133, `selectionv2/useSelectionV2.ts` 113,
`lib/reviewselect.ts` 58. Nothing touched exceeds 150 lines, and the gate
confirms no function crosses 30 body lines, 4 parameters, CC 10 or nesting 4.
The bar and the window were both split into sub-components after the first gate
run flagged `HistoryBar` at 36 and `HistoryPanel` at 42 body lines.

## Accepted debt / notes

- The `v2` selection payload grew from a bare array to `{ids, anchor, active}`;
  `applyChecked` still accepts the array form, so timelines written before this
  change undo without a migration.
- Three tests had to move with the code, not because they were wrong about the
  old behaviour: `approves the whole visible list` (that button is gone —
  replaced by a decline-selected test asserting the same skip accounting), the
  a11y label test (the visible-list aria-label is gone) and the cross-tab undo
  assertion, which hard-coded a one-entry timeline and now asserts one step back
  from the tip instead of `index === -1`.

---

# Quality re-check — 2026-10-01 (Generate SVG)

Final full re-check after implementing the Generate SVG workspace, restart
recovery, global undo/redo integration, security controls, tests and current
behaviour/design documentation. The final code-fit review was performed after
the initial passing verification; the full suite was rerun afterward.

## What changed

* Added the Generation workspace over Selection V2’s approved-source index:
  local contact-sheet preflight, explicit consent, Requesty mapping/validation,
  immutable SVG versions, per-version review, recovery and shared-batch usage.
* Added persisted non-secret preferences, encrypted local key storage, safe
  request/error handling and restart-recoverable sidecars. Generate SVG
  edits participate in the existing single global undo/redo timeline; the
  credential never enters that timeline.
* Refactored multi-responsibility UI/schema code during the RULE 18 fit review:
  schema envelope vs. icon schema, separate filter/header/history/key-dialog
  regions, consent disclosures, source-row collection, bulk-action controls,
  and preflight/settings parsing.

## Verification lanes and review results

| Lane | Command / measurement | Result |
|---|---|---|
| Types | `npx tsc --noEmit` | clean |
| Lint | `npm run lint` (inside verify) | 0 errors; 8 existing warnings in legacy `App.tsx` / `detect.ts` |
| Changed-file gate | `node tools/quality.mjs --changed --allow-legacy` (inside verify) | **GATE PASSED** |
| Full source gate | `node tools/quality.mjs --allow-legacy` | **GATE PASSED** |
| Tests | `npm run verify` | **60 files / 438 tests passed** |
| `src/lib` coverage | statements / branches / functions / lines | **96.31% / 92.03% / 96.55% / 97.61%** |
| Production build | Vite single-file `dist/index.html` | **605.06 kB / 179.62 kB gzip** |
| Duplication | `npx jscpd src --min-tokens 60` | **0 clones** in 120 files / 12,463 lines |
| Dead-code scan | `npx knip` | blocked by the previously recorded `oxc-parser` `RangeError: Array buffer allocation failed`; manual export-consumer check found an external consumer for all **107 checked declarations across 47 feature source files** |

`npm run verify` completed all six lanes: types, lint, changed-file quality,
tests, coverage and production build (**ALL LANES PASSED**). The only lint
warnings are the same pre-existing legacy warnings; no new warnings or gate
debt were accepted. `svgvalidate.ts` remains at 100% line coverage.

## RULE 18 — final code-fit recheck

The Generate SVG feature touches 47 production modules (45 under `src/svg/`
plus `src/lib/svgcomposite.ts` and `src/lib/svgvalidate.ts`): **4,802 lines
and 731 functions** by the quality tool's file/function metrics. Largest files
are `src/svg/sidecar.schema.ts` (296 lines / 60 functions),
`src/svg/run/response.ts` (285 / 36), and `src/lib/svgvalidate.ts` (280 / 40).
No feature file exceeds the 300-line hard limit; the longest function is 25
lines, below the 30-line hard limit.

The code-fit pass reduced the previously over-ideal compound functions; the
only remaining functions over 20 lines are the three annotated cohesive
lifecycles/composition points below. All remain within CC 10 and nesting 4:

| Function | Lines | Disposition |
|---|---:|---|
| `GenerateSvgWorkspace` | 23 | `ideal-size` comment: top-level ordering of independently owned screen regions; extra wrapper-only components would add indirection |
| `useRequestyKey` | 25 | `ideal-size` comment: credential availability, validation and secure save/remove share one state owner to keep plaintext contained |
| `useRunState` | 21 | `ideal-size` comment: run state, liveness refs and object-URL cleanup share one hook lifecycle |

All other feature functions are at or below the 20-line ideal. The full
per-file line/function measurements follow (physical source lines; function
counts from `tools/quality.mjs`):

| File | Lines | Fns | File | Lines | Fns |
|---|---:|---:|---|---:|---:|
| `src/lib/svgcomposite.ts` | 132 | 16 | `src/lib/svgvalidate.ts` | 280 | 40 |
| `src/svg/events.ts` | 13 | 4 | `src/svg/files.ts` | 128 | 15 |
| `src/svg/indexer.ts` | 186 | 25 | `src/svg/keyvault.ts` | 93 | 24 |
| `src/svg/preflight.ts` | 126 | 13 | `src/svg/prefs.ts` | 110 | 11 |
| `src/svg/prefsstore.ts` | 40 | 6 | `src/svg/prompt.ts` | 73 | 12 |
| `src/svg/recovery.ts` | 62 | 10 | `src/svg/requesty.ts` | 184 | 20 |
| `src/svg/responsemap.ts` | 135 | 20 | `src/svg/review.ts` | 127 | 13 |
| `src/svg/run/checkpoint.ts` | 145 | 21 | `src/svg/run/process.ts` | 50 | 6 |
| `src/svg/run/queue.ts` | 59 | 7 | `src/svg/run/registry.ts` | 17 | 5 |
| `src/svg/run/response.ts` | 285 | 36 | `src/svg/run/types.ts` | 27 | 0 |
| `src/svg/security.ts` | 16 | 2 | `src/svg/sidecar.parse.ts` | 27 | 5 |
| `src/svg/sidecar.schema.ts` | 296 | 60 | `src/svg/sidecar.ts` | 106 | 18 |
| `src/svg/sort.ts` | 49 | 10 | `src/svg/types.ts` | 119 | 0 |
| `src/svg/ui/GenerateSvgPanel.tsx` | 242 | 52 | `src/svg/ui/SvgBulkToolbar.tsx` | 137 | 30 |
| `src/svg/ui/SvgCodeDialog.tsx` | 29 | 3 | `src/svg/ui/SvgConfirmDialog.tsx` | 64 | 11 |
| `src/svg/ui/SvgDialog.tsx` | 45 | 10 | `src/svg/ui/SvgFilterBar.tsx` | 79 | 16 |
| `src/svg/ui/SvgHeader.tsx` | 158 | 25 | `src/svg/ui/SvgHistoryDialog.tsx` | 98 | 16 |
| `src/svg/ui/SvgKeyDialog.tsx` | 74 | 9 | `src/svg/ui/SvgOverlayHost.tsx` | 48 | 5 |
| `src/svg/ui/SvgPreview.tsx` | 54 | 10 | `src/svg/ui/SvgSourceRow.tsx` | 127 | 16 |
| `src/svg/ui/SvgStatusFooter.tsx` | 69 | 8 | `src/svg/ui/hotkeys.ts` | 99 | 19 |
| `src/svg/ui/useRequestyKey.ts` | 33 | 5 | `src/svg/ui/useSvgIndex.ts` | 105 | 19 |
| `src/svg/ui/useSvgPreferences.ts` | 27 | 3 | `src/svg/ui/useSvgReview.ts` | 39 | 7 |
| `src/svg/ui/useSvgRun.ts` | 213 | 34 | `src/svg/usage.ts` | 41 | 12 |
| `src/svg/versionindex.ts` | 136 | 22 |  |  |  |

## Baseline decision

**Not re-recorded.** `tools/quality_baseline.json` was left unchanged; legacy
hotspots did not grow and the full-source gate passed with only the recorded
legacy allowances.

## Accepted debt / notes

* No new quality debt accepted. `npx knip` remains unavailable in this
  environment as recorded above; the export-consumer scan is the documented
  substitute, not a claim that `knip` passed.
* The three 21–25-line functions above have explicit `ideal-size: reason`
  annotations. Every other Generate SVG function is at or below the RULE 18
  ideal, and the full feature passed RULE 16 gates.
