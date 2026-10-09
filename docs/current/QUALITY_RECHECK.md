# Quality re-check — process and dated records

> **Agents: do not read this file into context.** It is an append-only ledger —
> append one dated entry at the end (format: the newest entries below), read
> none of it. The rules live in `AGENT_RULES.md`, the workflow in
> `CODE_VERIFICATION.md` (`AGENTS.md` §2).

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

# Quality re-check — 2026-10-01 (Generate SVG tab, TDD)

Design record: `docs/archive/2026-10-01-generate-svg/design.md`.

## What changed

A fifth Workbench tab (`Generate SVG`, `tab-generate-svg`) that turns
**approved** Selection pairs into validated, versioned SVG files. Pure rules in
`src/lib/svg*.ts` (provider settings, prompt + manifest, batch plan, composite
geometry, canvas composite, response split/match, validation + security, icon
count, sidecar model, versioning, list filters/sort/totals, request payload,
error classification, usage/cost arithmetic, secret masking); IO + state in
`src/svg/*.ts` (approved-only discovery, sidecar IO, the run, the review
applier, the state reducer, the context bridge); the UI in `src/svg/Svg*.tsx`.
New CSS block at the end of `src/index.css`, reusing the V2 token grammar.
Touched outside the tab: `src/ui/Workbench.tsx` (one tab entry), and
`src/svg/ctx.ts` — see the note below, it is the only behavioural fix made to
an already-shipped module.

## The numbers (measured)

| lane | before | after |
|---|---|---|
| `tsc --noEmit` | clean | clean |
| eslint | 0 errors / 8 warnings | 0 errors / 8 warnings |
| `tools/quality.mjs --allow-legacy` | GATE PASSED | GATE PASSED |
| tests | 43 files / 346 | **50 files / 426** |
| coverage (all files, stmts/branch/funcs/lines) | 96.58 / 93.10 / 96.58 / 97.02 | **96.29 / 91.62 / 95.43 / 96.96** |
| coverage `src/lib` svg modules (stmts) | — | `svgbatch`/`svgcomposite`/`svgicons`/`svgprompt`/`svgsecret`/`svgusage` 100; `svgvalidate` 98.43; `svgfile` 98; `svgconfig`/`svgextract`/`svgrequest`/`svgcanvas` ≥ 96; `svglist` 85 |
| build `dist/index.html` | 487.73 kB / gzip 145.65 kB | **575.68 kB / gzip 169.31 kB** |
| jscpd `src` | 2 clones / 12 lines | **21 clones / 229 lines (1.84%)** |

`npm run verify` → **ALL LANES PASSED**.

The two coverage percentages move down because the tab adds ~2 700 statements of
UI and IO code while the four SVG test files (49 tests) cover the pure and IO
layers, not every branch of the dialog layer. `src/lib` — the lane the gate
ratchets on — stays above the 80% floor on every new module, and the lowest new
module (`svglist.ts`, 85% stmts) is above it too.

## RULE 18 — ideal sizes

Every new file is small and single-purpose; the largest is `src/svg/runner.ts`
at 277 lines (the one writer: validate → version → SVG → sidecar) and
`src/svg/actions.ts` at 251 (the command surface). `SvgControls.tsx` 213,
`SvgDialogs.tsx` 235, `Svgfile.ts` 198 — all under the 300-line hard limit. No
function exceeds 30 body lines, 4 parameters (every component takes one props
object), CC 10 or nesting 4; the gate enforces all four and passes. The panel
was split into `SvgControls` / `SvgBulkBar` / `SvgList` / `SvgRow` /
`SvgThumbs` / `SvgBatchStrip` / `SvgDialogs` / `SvgHotkeys` after the first gate
run flagged the monolithic version.

## Accepted debt / notes

- **`src/svg/ctx.ts` — the real bug fixed in this feature.** `useScanBridge`
  returned inline arrow writers, so `useSvgBoot`'s dependency array changed on
  every render and the boot effect re-ran forever (~3 600 dispatches per mount;
  the symptom was a 5 s `act()` timeout only when a root was remembered). Every
  writer is now `useCallback(…, [dispatch])`. Any future context hook that
  returns callbacks must memoise them — this is a React rule, not a local quirk.
- `lib/svglist.ts` search now also matches the file name (`row.name`), because
  the toolbar promises filename search; the previous string only held the path.
- jscpd's 21 clones are 18 CSS clones inside the **pre-existing** V2 block of
  `index.css` (lines 114–473, untouched) plus 4 short TS clones, of which 3 are
  pre-existing (`lib/detect.ts`, `selection/FilterBar.tsx`,
  `selection/reviewstore.ts`) and one is new: `lib/svgfile.ts` 125–131, where
  `newestValid` and `approvedVersion` differ only in their predicate. Kept as
  two readable five-line functions rather than one higher-order helper; the
  previous record's "2 clones" came from a narrower jscpd invocation.
- The API key never enters a history entry, a preset, a report or the
  repository: `svg/keystore.ts` writes IndexedDB `secrets`, `lib/svgsecret.ts`
  masks and redacts (RULE 20). `tests/secret_hygiene.test.ts` enforces this.

---

# Quality re-check — 2026-10-01 (Generate SVG: the API key save did nothing)

Reported: pasting a key into the provider card and pressing **Save** changed
nothing — no toast, the row stayed on "No API key yet" — and no request could
ever be sent afterwards.

## What changed

`src/batch/store.ts` — the `iconSplitter` database was opened at **version 1**,
the version the batch/selection features shipped. That database holds only the
`handles` object store, and opening an existing database at the version it
already has never runs `onupgradeneeded`, so the `secrets` store the SVG key
needs did not exist. Every `idbPut("secrets", …)` threw `NotFoundError`, the
`saveKey` promise rejected, and the state update plus the toast after the
`await` never ran — a dead Save button with no error anywhere. The database now
opens at **version 2** (the upgrade creates the missing store for exactly those
installs), `onblocked` resolves to "no storage" instead of leaving the promise
pending when another tab holds version 1 open, and `idbPut`/`idbDelete` report
whether the write really happened.

`src/svg/keystore.ts` — no keystore call can throw any more, and `saveApiKey`
returns `false` when only the in-memory copy could be kept.

`src/svg/actions.ts` — `saveKey` always updates the key, the model and the UI,
and says which of the two things happened: "API key stored on this device only"
or "API key kept for this session only — browser storage refused it". A silent
failure is what made the button look broken, so the honesty is the fix.

`src/svg/ctx.ts` — the boot key refresh swallows a rejection instead of
producing an unhandled one.

## The numbers (measured)

| lane | before | after |
|---|---|---|
| `tsc --noEmit` | clean | clean |
| eslint | 0 errors / 8 warnings | 0 errors / 8 warnings |
| `tools/quality.mjs --allow-legacy` | GATE PASSED | GATE PASSED |
| tests | 50 files / 426 | **51 files / 431** |
| coverage (all files, stmts/branch/funcs/lines) | 96.29 / 91.62 / 95.43 / 96.96 | 96.29 / 91.62 / 95.43 / 96.96 |
| build `dist/index.html` | 575.68 kB / gzip 169.31 kB | 575.92 kB / gzip 169.40 kB |

`npm run verify` → **ALL LANES PASSED**.

## Regression tests

* `tests/svg_keystore.test.ts` (new, 3 tests, `fake-indexeddb` as the only new
  devDependency) seeds a **version-1 database holding only `handles`** — the
  state an existing install is in — then saves, reads back, checks and clears
  the key. This test fails with `NotFoundError: No objectStore named secrets in
  this database` on the old code. It also proves the session-only fallback when
  `indexedDB.open` throws, and that the batch handle store still round-trips.
* `tests/svg_ui.test.tsx` (6 → 8 tests) drives the real provider card: it types
  a key, presses Save, asserts the row flips to "API key secured locally", and
  that the confirm dialog now opens instead of the "add your key" guard toast.
  The second new test stubs a storage that refuses the write and asserts the
  session-only message.

# Quality re-check — 2026-10-01 (SVG preview background + task cost, TDD)

Feature prompt: a background-colour control for SVG previews (presets White,
Black, Gray, Green, Red plus a custom colour) that belongs to **the web app
only** — it must never modify an SVG's fills or its saved code — and the cost
shown **beside the token usage of every generation task/version**, using the
provider-reported number when there is one and labelling any calculated value
**Estimated**, with cost, currency, model and pricing version stored in the
per-file sidecar. Design: `docs/archive/2026-10-01-svg-preview-cost/design.md`.

## What changed

* `src/lib/svgbackground.ts` (new, 115 lines) — the preview background as a pure
  module: the five presets + their colours, `parsePreviewBg` (anything corrupt or
  unknown falls back to the default, RULE 13), `normalizeHex`, and
  `previewFrame` → `{ color, outline }`. The outline is the honest answer to
  "black strokes stay visible": a background the artwork's black strokes would
  vanish into gets a light hairline around the artwork. Nothing in the module
  can or does touch an SVG document.
* `src/lib/svgpricing.ts` (new, 56 lines) — `PRICING_TABLE` keyed by model +
  `PRICING_VERSION`, `estimateFromTokens` (needs a known model **and** both token
  counts, otherwise no number is invented) and the single cost decision
  `costInfoFor(model, usage)`: a provider-reported cost wins; the per-image share
  of a reported batch total stays an estimate; a token-only response is priced
  from the rate card and labelled Estimated; an unknown model yields "no cost
  reported".
* `src/lib/svgfile.ts` (198 → 275) — `CostInfo` gains `basis` and
  `pricing: string | null`; `parseSidecar` normalises each cost field on read, so
  a hand-edited or older sidecar can never break a row.
* `src/lib/svgusage.ts` (96 → 123), `src/lib/svglist.ts` (117 → 137) — the cost
  formatters (`costLabel` / `costText`) are the only place cost wording is
  produced, and the totals keep reported and estimated money apart.
* `src/svg/` — the row, the version history, the bulk bar and the status bar all
  use that formatter; `saveversion.ts` writes `costInfoFor(...)`, and
  `rejectOne` keeps the usage of a request that was charged even though its SVG
  was rejected; `prefsstore.ts` persists the background with the zoom.
* `src/index.css` — the preview frame, the swatches and the history cost note.

## The numbers (measured)

| lane | before | after |
|---|---|---|
| `tsc --noEmit` | clean | clean |
| eslint | 0 errors / 8 warnings | 0 errors / 8 warnings |
| `tools/quality.mjs --allow-legacy` | GATE PASSED | GATE PASSED |
| tests | 51 files / 431 | **54 files / 456** |
| coverage stmts / branch / funcs / lines | 96.29 / 91.62 / 95.43 / 96.96 | 96.51 / 92.12 / 95.79 / 97.14 |
| build `dist/index.html` | 575.92 kB / gzip 169.40 kB | 582.79 kB / gzip 171.54 kB |

Lane 3 is recorded twice on purpose. `npm run verify` reports **ALL LANES
PASSED** (tsc, eslint, changed-file gate, 54/456 tests, coverage, build), and
the gate was additionally run over **all** files (`GATE PASSED`). The all-files
pass is the stronger evidence here: this checkout has no usable `origin/main`
merge base, so `--changed` falls back to `git diff HEAD~1`, and on a branch with
a single commit that base does not exist at all — a changed-file pass alone
would have been vacuous or dead.

## RULE 18 size re-check

Every changed production file is inside the 150–300-line ideal or justified by a
single responsibility: `svgfile.ts` 275, `runner.ts` 290, `SvgDialogs.tsx` 238,
`actions.ts` 259, `SvgPanel.tsx` 169, `SvgRow.tsx` 153 (154 per the gate's
counter), `saveversion.ts` 142, `svglist.ts` 137, `svgusage.ts` 123,
`SvgBulkBar.tsx` 120, `svgbackground.ts` 115, `statemodel.ts` 112, `ctx.ts` 111,
`SvgThumbs.tsx` 88, `rowmodel.ts` 70, `runstate.ts` 60, `svgpricing.ts` 56,
`useSvgGen.ts` 52, `prefsstore.ts` 40 — none ≥ 300, and `tools/quality.mjs`
reports every function inside the RULE 16 caps (30 lines / 4 params / CC 10 /
nesting 4). `rejectOne` had to lose its fifth parameter and read the usage from
its context instead — a real fix, not a re-hosted call (§16.2).

Accepted test-file debt: `tests/svg_ui.test.tsx` grew 237 → 329 lines (over the
300 ideal, no gate applies to `tests/`). It stays one file on purpose — one
mounted SVG panel exercises the whole journey, and splitting the mount would
duplicate the fake filesystem + IndexedDB fixtures four ways. `tests/svg_io.test.ts`
was already 362 lines before this change.

Baseline: **untouched** — the gate passes against the existing
`tools/quality_baseline.json`, so no re-record is needed and the ratchet does not
move.

## Regression tests (RULE 8 — each fails if its feature is deleted)

* `tests/svg_bg.test.ts` (new, 6) — presets and their colours, hex
  normalisation (3/6 digits, with/without `#`, garbage → `null`), corrupt prefs
  falling back to White, the label of a custom colour, the outline rule (Black
  and a dark custom colour need it, White/Gray/Green/Red do not), and
  "frames the preview with a colour and nothing else — the SVG never changes".
* `tests/svg_cost.test.ts` (new, 9) — the rate card and its version, both token
  counts + a known model required before anything is priced, the provider number
  preferred over any calculation, the batch share and rate-card branches of the
  cost decision, and the exact wording every surface shows.
* `tests/svg_cost_io.test.ts` (new, 7) — cost through the real save path: the
  provider-reported number stored with currency + model + pricing version, read
  back after a simulated restart, a batch share stored as an estimate and never
  as a reported number, a token-only response priced from the rate card, a
  charged-but-invalid response still recording its share, and a legacy sidecar
  reading as "no cost reported" instead of crashing a row.
* `tests/svg_ui.test.tsx` (8 → 11) — frames the preview and keeps black strokes
  visible while the code dialog still shows the file's own bytes, proves the
  saved SVG **and its sidecar** are byte-identical after every background click
  (the colour is the app's, not the document's), remembers the background across
  a restart, and shows the cost beside the tokens with the Estimated label and
  the model + pricing version in the history.

---

# Quality re-check — 2026-10-01 (SVG preview rendering)

Re-check after the SVG preview fix: *"the SVG generates and copies as valid
code, the in-app preview is missing or rendered incorrectly"*. Root cause,
design and rejected alternatives:
[`docs/archive/2026-10-01-svg-preview-rendering/design.md`](../archive/2026-10-01-svg-preview-rendering/design.md).

## What changed

`src/lib/svgpreview.ts` (new, 240 lines) owns the whole preview pipeline —
parse with the real XML parser, one namespace repair pass, sanitize, fit,
scope ids, serialize. `src/svg/SvgPreview.tsx` (new, 73 lines) renders that
markup INLINE inside an **open shadow root**, and separates empty ("No SVG")
from broken ("Preview failed" + the reason). `src/svg/preview.ts` is deleted:
its `data:` URL inside an `<img>` was the path that could not draw a document
without `xmlns`, without an intrinsic size, or with `currentColor`.
`src/svg/rowmodel.ts` gained `previewTargetOf`, the single version the row
previews AND copies, and `SvgModel.rootToken` (bumped by every pick and scan)
makes every row re-read the file it shows. `src/svg/SvgDialogs.tsx` now draws
the document the code dialog is about to copy; `useCodeDoc` + `CodeDrawing`
were extracted to keep `CodeDialog` at 30 lines (RULE 19).

## The numbers (measured)

| lane | before | after |
|---|---|---|
| `tsc --noEmit` | clean | clean |
| eslint | 0 errors / 8 warnings | 0 errors / 8 warnings |
| `tools/quality.mjs --changed --allow-legacy` | GATE PASSED | GATE PASSED |
| `tools/quality.mjs --allow-legacy` (all files) | GATE PASSED | GATE PASSED |
| tests | 51 files / 431 | **52 files / 453** |
| coverage (all files, stmts/branch/funcs/lines) | 96.29 / 91.62 / 95.43 / 96.96 | **96.52 / 91.79 / 95.75 / 97.20** |
| jscpd `src --min-tokens 60` | 12 clones | **11 clones** (1 removed, see below) |
| build `dist/index.html` | 575.92 kB / gzip 169.40 kB | 582.70 kB / gzip 171.42 kB |

`npm run verify` → **ALL LANES PASSED**.
`npx knip` could not run in this sandbox (`oxc-parser` fails to allocate its
`ArrayBuffer`, on `HEAD` as well) — the dead-code lane stays unverified here.

## Baseline decision

**Untouched.** No file in `tools/quality_baseline.json` grew; every new file
(`svgpreview.ts` 240 lines, `SvgPreview.tsx` 73) is inside the 300-line file
ideal and every new function is inside LOC ≤ 30 / params ≤ 4 / CC ≤ 10 /
nesting ≤ 4 without an override, so there is nothing to re-record.

## Debt removed on the way

`src/svg/rowmodel.ts` held a byte-identical copy of `lib/svgfile`'s
`newestValid` (jscpd, 7 lines / 64 tokens). `toRow` and the runner event now
call the lib owner and the duplicate is deleted — one owner for "newest valid
version", which is what the preview and Copy both read.

## Regression tests

* `tests/svg_preview.test.ts` (new, 19 tests) — one test per defect and per
  failure reason; each fails if `buildSvgPreview` is deleted.
* `tests/svg_ui.test.tsx` (8 → 11 tests) — the row renders an inline `<svg>`
  with `xmlns` + `100%` + `xMidYMid meet`, the frame's `data-version` equals
  the version Copy puts on the clipboard, a truncated file shows "Preview
  failed / not well-formed XML", a source with no SVG shows "No SVG".
* `tests/svg_io.test.ts` — one scan bumps `rootToken` once.

---

# Quality re-check — 2026-10-01 (preview colour fidelity)

Correction after the previous round: *"The app also do not change Lines or any
color inside SVG at all. on screenshot see as icon SVG has white lines but in
reality it black."* Root cause, the decision and the rejected alternatives:
[`docs/archive/2026-10-01-svg-preview-rendering/design.md`](../archive/2026-10-01-svg-preview-rendering/design.md) (D4, corrected).

## What changed

`src/lib/svgpreview.ts` — `PREVIEW_INK` is now `#000000`, the colour a standalone
SVG resolves `currentColor` to, and the default moved into `PREVIEW_CSS`
(`svg{…;color:#000000}`), i.e. into the stylesheet that rides in the shadow root
next to the artwork instead of into the artwork's own `style` attribute.
`fittedStyle()` no longer injects a colour at all: it keeps the author's
declarations minus `width`/`height` and adds `display:block`, so a document
saved with `style="color:#ff0000"` keeps it. The document the app serializes now
contains no colour the app chose. The Bg frame colour stays exactly as it was —
it is a wrapper the user picks, never an edit to the document — and a
`currentColor` icon on a dark frame is still legible through the WCAG contrast
outline on the frame, not through a recolour of the artwork.

## The numbers (measured)

| lane | before | after |
|---|---|---|
| `tsc --noEmit` | clean | clean |
| eslint | 0 errors / 8 warnings | 0 errors / 8 warnings |
| `tools/quality.mjs --changed --allow-legacy` | GATE PASSED | GATE PASSED |
| tests | 57 files / 517 | **57 files / 517** |
| coverage (all files, stmts/branch/funcs/lines) | 96.52 / 91.79 / 95.75 / 97.20 | **96.85 / 92.68 / 96.22 / 97.47** |
| jscpd `src --min-tokens 60` | 11 clones | 11 clones (unchanged) |
| build `dist/index.html` | 582.70 kB / gzip 171.42 kB | **601.97 kB / gzip 176.88 kB** |

`bash tools/pre_push_check.sh` → **ALL LANES PASSED** (6/6).
`npx knip` still cannot run in this sandbox (`oxc-parser` fails to allocate its
`ArrayBuffer`, on `HEAD` as well) — the dead-code lane stays unverified here.

## RULE 18 / RULE 16 re-check

Changed production files: `svgpreview.ts` 252, `SvgPreview.tsx` 73,
`SvgThumbs.tsx` 102 — all inside the 150–300-line ideal or the module's single
responsibility, none ≥ 300. The gate reports every function inside the RULE 16
caps (30 lines / 4 params / CC 10 / nesting 4) and no baseline entry grew.

Baseline: **untouched** — `tools/quality_baseline.json` is not re-recorded; the
change only removes an injected declaration, so the ratchet does not move.

Context files stay above the RULE 18 200-line ideal (`SYSTEM_OF_RECORD.md` 660,
this log 732). That is the debt already recorded on 2026-09-30 and re-affirmed
by RULE 17 — one current doc per app, with design detail pushed to
`docs/archive/`. No new doc was added for this correction.

## Regression tests (RULE 8 — each fails if the fix is deleted)

* `tests/svg_preview.test.ts` — the default ink is `#000000`, the fitted style
  injects no `color:`, explicit `fill`/`stroke` values survive byte-for-byte, an
  author's own `style="color:#ff0000"` wins over any app default, and the
  serialized document carries no app-chosen colour.
* `tests/svg_ui.test.tsx` — the frame's shadow-root stylesheet carries the
  default ink while the document's own `style` has none, so the newest SVG
  renders inline, fitted and centred with its own colours.
* `tests/svg_bg.test.ts` — unchanged and still green: the Bg colour frames the
  preview and changes nothing else.

---

# Quality re-check — 2026-10-01 (multi-request confirmation, reasoning limits, tier waits, preview/zoom)

Second re-check of the day, after the SVG tab's fix pass: the confirmation now
plans every request (not just the first), the reasoning tier caps how many
icons one request may carry, the wait is raised to a per-tier floor, the
preview never recolours the artwork, and one zoom value drives both previews
and the row. Design record:
[`docs/archive/2026-10-01-svg-batches-limits-preview/design.md`](../archive/2026-10-01-svg-batches-limits-preview/design.md).

## What changed

* `src/lib/effortlimits.ts` (new) — the tier rules: effective per-request size
  (low = configured, **medium 2, high/xhigh 1**), timeout floors (120/300/600 s),
  the tier note and the timeout hint. The panel, the confirmation and the
  runner all read the same two functions.
* `src/lib/svgbatch.ts` — `requestCount`, `validateBatchPlan` (fail-closed) and
  `batchOutcome`; `src/lib/svgconfig.ts` — the timeout clamp widened to
  5 000–900 000 ms so a tier floor is never re-clamped away.
* `src/svg/runner.ts` split into `runtypes.ts` (the shared vocabulary),
  `runbatch.ts` (ONE request: composite → send → match → save → record) and
  `runner.ts` (plan → validate → run each request → fold the outcomes), with
  per-request outcomes (status, saved/failed/missing, tokens, cost, error).
* `src/svg/SvgConfirm.tsx` (new) — the paginated confirmation: request count,
  tier limit, model/sampling/effective wait, and one page per request with its
  own composite, ordered filenames and empty cells; `SvgDialogs.tsx` keeps only
  the code and history dialogs.
* `src/svg/SvgBatchStrip.tsx` — the request in flight plus one line per
  finished request; it stays after the run so the record is readable.
* Follow-up (same day): the model card now exposes the wait (`svg-timeout`, in
  seconds, 5–900) and the retries (`svg-retries`, 0–5), clamped by
  `clampTimeoutMs` / `clampRetries` — the same clamps the read path uses. That
  closes the honesty gap in the timeout message, which tells the user to raise
  the timeout: before this the value could only be changed by editing storage.
  `tests/svg_ui.test.tsx` drives both controls (including clamping and the tier
  floor overriding a smaller configured wait) and `tests/svg_lib.test.ts` the
  clamps. The same pass fixed test isolation in `tests/svg_ui.test.tsx`: its
  `beforeEach` now clears the key store's session copy and localStorage, so a
  test that saves a key or picks a tier can no longer leak into the next.
* One zoom value (`--svg-thumb`) written inline by `SvgPanel.tsx`, sizing both
  preview boxes, the row's minimum height and the previews column; the AI box
  is contained (`object-fit: contain`), the SVG keeps `xMidYMid meet`, and the
  contrast hint is a frame outline instead of a drop-shadow filter.
* `src/lib/svgpreview.ts` — the inline stylesheet is layout only; the UA-default
  ink is a root `color` presentation attribute written only when the document
  declares no colour, and a bare `#id` is rewritten only in real reference
  attributes (so hex fills are never mistaken for ids). Dead CSS for the removed
  manifest dialog was deleted.
* `tools/quality.mjs` — `--changed` now degrades gracefully on a single-commit
  branch (no `origin/main` merge-base, no `HEAD~1`): it compares the working
  tree against `HEAD` instead of crashing. No threshold or baseline changed.

## The numbers (measured)

| lane | before | after |
|---|---|---|
| `tsc --noEmit` | clean | clean |
| eslint | 0 errors / 8 warnings | 0 errors / 8 warnings |
| `tools/quality.mjs --changed --allow-legacy` | GATE PASSED | GATE PASSED (20 changed files) |
| tests | 57 files / 517 | **61 files / 574** |
| coverage (all files, stmts/branch/funcs/lines) | 96.85 / 92.68 / 96.22 / 97.47 | **97.34 / 92.85 / 96.94 / 98.11** |
| jscpd `src --min-tokens 60` | 11 clones | 12 clones (the new one is a CSS block; no new TS/TSX clone) |
| build `dist/index.html` | 601.97 kB / gzip 176.88 kB | 608.20 kB / gzip 178.81 kB |

`bash tools/pre_push_check.sh` → **ALL LANES PASSED** (6/6).
`npx knip` still cannot run in this sandbox (`oxc-parser` fails to allocate its
`ArrayBuffer`, on `HEAD` as well) — the dead-code lane stays unverified here,
so the dead CSS and the unused exports were checked by hand (`grep` per class
and symbol) instead.

## RULE 18 / RULE 16 re-check

New/changed production files, all inside the 150–300-line ideal or explained by
a single responsibility: `effortlimits.ts` 79, `svgbatch.ts` 169, `svgconfig.ts`
141, `svgpreview.ts` 278, `runner.ts` 78, `runtypes.ts` 74, `runbatch.ts` 237,
`SvgConfirm.tsx` 213, `SvgBatchStrip.tsx` 54, `SvgDialogs.tsx` 162,
`SvgPanel.tsx` 188, `SvgThumbs.tsx` 107, `actions.ts` 292, `ctx.ts` 176,
`useSvgGen.ts` 57, `types.ts` 59, `SvgControls.tsx` 278. The first cut of
`runner.ts` (356 lines) and of `SvgConfirm` (31-line component) failed the gate
by one metric each; both were split by responsibility rather than padded —
`runner.ts`/`runbatch.ts`/`runtypes.ts`, and the confirm dialog's plan hook +
body/actions components. No function is above 30 lines / 4 params / CC 10 /
nesting 4, and no anti-gaming name pattern is used.

Baseline: **untouched** — `tools/quality_baseline.json` is not re-recorded. The
full gate still reports only the three recorded legacy files (`src/App.tsx`,
`src/lib/detect.ts`, `src/lib/render.ts`), unchanged; every file this change
touches meets the hard lines directly.

Context files stay above the RULE 18 200-line ideal (`SYSTEM_OF_RECORD.md` 741,
this log 838) — the same recorded debt as before, with the design detail pushed
to `docs/archive/`.

## Regression tests (RULE 8 — each fails if the fix is deleted)

* `tests/svg_batch.test.ts` — the split for 1/3/4/5/8/9/11/23 images and for
  every configured size 1..9 on a nine-image selection, the partial last batch
  keeping its empty cells, the fail-closed validator, per-request outcome
  status/usage/cost.
* `tests/svg_effort.test.ts` — medium caps a request at 2 and high at 1, never
  above the configured size; the timeout floors; the note and hint wording.
* `tests/svg_runner.test.ts` — 8 images as 2×4, 9 as 4+4+1 and 23 as 4×5+3 over
  an in-memory FS with a recording fake transport, effort-driven splits,
  per-request tokens/cost, failure isolation, and the high-tier timeout floor
  under fake timers.
* `tests/svg_confirm.test.tsx` — the request count, one page per request with
  its own composite and exact ordered filenames, pagination, empty cells,
  nothing sent by opening the dialog, and the 1/3/4/5/8/9-image matrix walked
  page by page.
* `tests/svg_preview.test.ts` / `tests/svg_ui.test.tsx` — the artwork keeps its
  own colours (no `color`/`filter`/stroke override in the preview CSS, hex fills
  never rewritten, a multicolour gradient/fill/stroke/dash/opacity document
  carried through byte-for-byte with only its ids scoped), the contrast hint is
  a frame outline, the one slider resizes BOTH previews in step at EVERY value
  from 48 px to 240 px, every preview background is applied to the frame while
  the document stays byte-identical, and the model card and request estimate
  follow all four tiers (low 120 s/4, medium 300 s/2, high and xhigh 600 s/1).
* `tests/svg_io.test.ts` — the run summary line names a failed request
  ("1 request failed") while a clean run claims none.

# Quality re-check — 2026-10-05 (long SVG generations: streaming + stall window + journal)

Re-check after the long-generation fix. The prompt's constraints were explicit:
the reasoning level must **not** shrink the batch (the 2026-10-01 medium=2 /
high=1 cap is reversed), a generation may take as long as it takes, the client
timeout is removed rather than raised, streaming keeps the socket alive, a
request whose outcome nobody confirmed is never resent, and the user sees the
elapsed time with a Cancel control. Design record:
[`docs/archive/2026-10-05-svg-long-requests/design.md`](../archive/2026-10-05-svg-long-requests/design.md)
(the 2026-10-01 caps and total timeout are marked there as reversed).

## What changed

* `src/lib/svgstream.ts` (new) — the pure SSE frame parser: deltas joined across
  chunk boundaries, `: keepalive` counted as liveness and never as content, the
  usage/cost chunk, `[DONE]`, an `error` payload, unreadable frames counted and
  never thrown, the first `id:` kept.
* `src/lib/svgstreamread.ts` (new) — the reader: fetch → stream, ONE idle
  watchdog (armed before the first byte and reset by every byte, never a total
  duration), the user's abort, the JSON fallback for a provider that ignores
  `stream: true`, and four outcomes — chunk data, `[DONE]`, `stalled`
  (unknown), `aborted`.
* `src/lib/svgrequest.ts` — `stream: true` + `stream_options.include_usage`,
  `provider_timeout`/`stalled` classification, the shared JSON reader; the
  total-timeout `sendChatRequest` is gone.
* `src/lib/effortlimits.ts` — rewritten smaller: the tier rules are **stall
  floors only** (low 120 s, medium 300 s, high/xhigh 600 s), no icon cap
  anywhere, honest label/note/hint wording ("no total limit", "outcome unknown
  … has not been resent").
* `src/svg/journal.ts`, `src/svg/recovery.ts` (new) — the in-flight journal
  (`iconSplitter.svg.inflight.v1`, validated reads, corrupt = empty) and the
  restart recovery: named rows come back **Unknown** with the request id and
  the elapsed time, and the only way to resend is the user's explicit
  "Retry these" through the normal confirmation.
* `src/svg/runbatch.ts`, `runner.ts`, `runstate.ts`, `runtypes.ts` — the batch
  is `clampImagesPerRequest(config.imagesPerRequest)` at every tier; the send
  streams and keeps the id; the journal is written when a request starts and
  cleared only on a confirmed outcome (a stall keeps it); `startedAt` and
  `elapsedMs` are recorded per request; a stall counts as `unknown`, not as a
  failure, and is never retried.
* UI — `svg-batch-elapsed` (ticking, shared with the bulk bar via
  `src/svg/Elapsed.tsx`), the confirmation's streaming fact + stall-window
  wording + the user's batch size ("2 × 4 max" at medium effort), the recovery
  note (`svg-inflight*`), and the CSS for the ticking clock (tabular digits) and
  for `li.unknown` (an unknown outcome is not painted like a failure).
* `src/lib/svgclock.ts` (new) — `fmtElapsed` (seconds → m:ss → h:mm:ss).

## The numbers (measured)

| lane | before | after |
|---|---|---|
| `tsc --noEmit` | clean | clean |
| eslint | 0 errors / 8 warnings | 0 errors / 8 warnings |
| `tools/quality.mjs --changed --allow-legacy` | GATE PASSED | GATE PASSED (28 changed files) |
| tests | 61 files / 574 | **66 files / 614** |
| coverage (all files, stmts/branch/funcs/lines) | 97.34 / 92.85 / 96.94 / 98.11 | 97.14 / 92.30 / 96.95 / 98.09 |
| jscpd `src --min-tokens 60` | 12 clones | 12 clones (no new clone) |
| build `dist/index.html` | 608.20 kB / gzip 178.81 kB | 617.59 kB / gzip 182.02 kB |

Coverage moved down marginally because the new reader/journal/recovery code adds
branches that only a real socket (or fake timers) can reach; it stays far above
the ≥80 % gate, and every new module has direct tests.

`bash tools/pre_push_check.sh` → **ALL LANES PASSED** (6/6).
`npx knip` still cannot run in this sandbox (`oxc-parser` `ArrayBuffer` failure,
on `HEAD` as well) — pre-existing, no regression.

## RULE 18 / RULE 16 re-check

New files are inside the 150–300-line ideal (the hard cap is 300):
`svgstream.ts` 103, `svgstreamread.ts` 183, `svgclock.ts` 20 (two tiny pure
functions — the RULE 18 *file* band assumes a module with real substance; this
one is deliberately a single formatter), `journal.ts` 119, `recovery.ts` 98,
`Elapsed.tsx` 34 (one hook + one 12-line component, shared by two surfaces).
Changed files stay where they were: `effortlimits.ts` 72 (was 79),
`svgrequest.ts` 226, `runbatch.ts` 288, `runstate.ts` 80, `SvgConfirm.tsx` 218,
`SvgControls.tsx` 294, `SvgPanel.tsx` 214, `SvgBatchStrip.tsx` 61.
No function is above 30 lines / 4 params / CC 10 / nesting 4, and the gate's
anti-gaming name check rejected `readStep` (it matches the `*Step\d*$`
pattern) — renamed to `nextRead` rather than whitelisted. The reader loop is
four flat pieces (`nextRead` / `absorb` / `finish` / `stopReading`).

Baseline: **untouched** — `tools/quality_baseline.json` is not re-recorded. The
full gate still reports only the three recorded legacy files (`src/App.tsx`,
`src/lib/detect.ts`, `src/lib/render.ts`), unchanged. Context files
(`SYSTEM_OF_RECORD.md`, this log) stay above the 200-line ideal as before; the
design detail lives in `docs/archive/`.

## Regression tests (RULE 8 — each fails if the fix is deleted)

* `tests/svg_stream.test.ts` (13) — a 400-frame answer accumulated byte for
  byte, chunk boundaries inside a frame, deltas
  joined, `: keepalive` ignored but counted, usage chunk, `[DONE]`, error
  payload, unreadable frames counted, nothing appended after the end.
* `tests/svg_stream_read.test.ts` (11) — a request kept alive for 20 minutes of
  keepalives+deltas far past the configured window, silence longer than the
  window reported `stalled` (not retryable), a user cancel reported `aborted`,
  the request id from the header AND from the stream, a provider error frame,
  an early EOF as unknown, the JSON fallback, the stall before the first byte,
  and `onId` firing the moment the id is known.
* `tests/svg_effort.test.ts` (6) — no tier rule carries an icon cap; the floors
  120/300/600; a configured 900 s is never lowered; the label/note/hint wording.
* `tests/svg_journal.test.ts` (8) / `tests/svg_recovery.test.ts` (2) — validated
  reads, corrupt = empty, the id attached late, a finished request removed, the
  honest summary; rows marked Unknown (never Failed) with the id.
* `tests/svg_runner.test.ts` (11) — the user's batch size at every tier, a live
  request running 120× past the configured timeout, a stall reported unknown in
  ONE attempt with `retries: 2` configured, the journal written with the id and
  cleared on completion (kept on a stall), a mid-stream cancel keeping the
  finished request, and the JSON fallback.
* `tests/svg_confirm.test.tsx` (11) — 8 images at 4 are "2 × 4 max" at medium
  effort, with the stall-window fact and the streaming fact.
* `tests/svg_ui.test.tsx` (27) — the stall window control (default 120 s, clamps,
  tier floor), the per-request size at all four tiers, and the restart recovery:
  the note names the id, the row says Unknown, retry opens the confirmation
  (nothing is sent without the user), dismiss clears the journal.
* `tests/svg_strip.test.tsx` (4) — the ticking elapsed time (shared with the
  bulk bar), Cancel only while running, and a stalled request named "outcome
  unknown" with its own elapsed time in the report line.

## Follow-up 2026-10-05 (same day, small): the row's path line named the sidecar

Reported from a real screenshot: a row that is NOT generated yet showed
`…/split_01/icon-airplane-landing_AI_8_01.svg.json`, which reads like a double
file extension. Cause: `SvgRow.FileCell` fell back to the sidecar's name
(`<stem>.svg.json`) whenever no version existed, and prefixed `dirPath` even
though a version's `svgPath` is already root-relative (so a generated row
doubled its folder: `architecture/architecture/fog_AI.svg`).

* `src/svg/SvgRow.tsx` — the row now names the SVG artifact: the newest
  version's real path, or the path generation will write (`<dirPath>/<stem>.svg`).
  The sidecar stays discoverable on the persist line's `title`
  (`architecture/fog_AI.svg.json`), where "Per-file sidecar saved" / "Not
  generated yet" already lives. New handle `svg-target-{sourceId}`.
* `tests/svg_ui.test.tsx` — new case: the generated row shows its path exactly
  once (no doubled folder, no `.json`), the not-generated row shows the SVG it
  will produce, and the sidecar path is on the persist title.

Lanes: `tsc` clean, eslint 0 errors (8 pre-existing warnings), quality gate
PASSED, **66 files / 615 tests**, coverage unchanged at 97.14/92.30/96.95/98.09,
build 617.75 kB / gzip 182.06 kB. Baseline untouched; `UI_SELECTORS.md` §P and
`SYSTEM_OF_RECORD.md` §11 updated with the handle.

## 2026-10-05 (later, larger): the recursive scan is deterministic and atomic

Reported by the user: reloading the same unchanged folder returned different
missing-AI counts (4, then 5), and some approved pairs disappeared from the
list. Design: `docs/archive/2026-10-05-recursive-scan-determinism/design.md`.

Diagnosis (each proved by a probe or a test before any fix):

* the filesystem's own enumeration order was the algorithm's input
  (`dir.entries()` → `walkTree` → first-writer-wins pairing), and
  `parseAiName("x_AI_8_01.svg")` parses — so a split folder holding
  `…_01.png` **and** `…_01.svg` gave the same pair id a *different* AI side per
  reload. The WHATWG File System spec says the order is intentionally
  unspecified;
* `splitApproved` moved an approved pair whose file needed attention out of the
  list into `missing: string[]` (base names only) — the "disappearing pairs";
* `fileNode` mapped a failed `getFile()` to `size: 0/mtime: 0` and `unreadable`
  was `size === 0`, so a locked/being-written file read as changed or empty;
* `loadDecisions` *created* `review-decisions.json` during a scan — a scan
  mutating the folder it scanned;
* no ticket, no in-flight guard: an older scan could resolve last and win;
* every scan replaced every row, even when nothing had changed.

Fix: canonical order imposed by `walkTree` (`compareNames`); `pairEntries`
order-independent (raster beats the `.svg` artifact, list sorted by
folder/base/suffix, version artifacts ignored); a failed read is a retryable
state (`error: "unreadable"`, one immediate retry) and never a size; every
approved pair stays listed with per-file reasons (`problemsOf` →
`SvgSource.problems` → the row's `svg-problem-{id}` line and the
`svg-warn-problems` banner), including a record-only pair ("Files missing");
`loadDecisions` is read-only; a monotonic ticket (`lib/scanseq`) lets only the
newest scan commit; the whole snapshot is compared through `scanKey`
(`src/svg/scankey.ts`) and committed once, with the id→path cache write last and
best-effort; `applyScan` keeps `pairs`/`records` by reference when the pair set
is unchanged.

Lanes: `tsc` clean, eslint 0 errors / 8 warnings (all pre-existing; an earlier
`Banners` complexity-12 warning was removed by splitting its note builders out),
quality gate PASSED, **68 files / 647 tests**, coverage 97.16/92.12/97.05/98.2,
build 622.30 kB / gzip 183.56 kB, jscpd unchanged. Baseline untouched; sizes stay in RULE 18's ideal band (largest
touched module: `src/lib/pairing.ts` 209 lines; the two new modules are
`src/svg/scankey.ts` 33 lines and `src/lib/scanseq.ts` 25 lines; every new
function is ≤ 20 lines).

Regression tests (RULE 8 — each fails if its fix is deleted):

* `tests/scan.test.ts` (9) — canonical order whatever the input order; a read
  failure travels as `error` while a zero-size file is not an error;
  `diffScan` buckets an unreadable file separately instead of calling it
  changed or lost.
* `tests/pairing.test.ts` (20) — the same file set yields byte-identical pairs
  for the plain, reversed and six shuffled enumeration orders; the raster wins
  over the `.svg` artifact; `…_AI_8_v2.svg` is ignored; a case-only collision
  resolves the same way twice; `problemsOf` names each missing/unreadable file.
* `tests/fs.test.ts` (6) — a transient failure is retried, a locked file is
  listed as unreadable.
* `tests/reviewstore.test.ts` (5) — loading a missing decision file creates
  nothing.
* `tests/svg_scan.test.ts` (7) — one commit per change (rows, discovery, root
  token), a fresh boot rebuilding identical rows, nothing committed for an
  identical rescan, and an overlapping older scan committing nothing.
* `tests/selection_scan.test.ts` (4) — `rescan` keeps `pairs`/`records` by
  reference when nothing changed, commits a deletion once (the pair stays with
  `ai: null`), carries a decision through a folder rename once, and drops a
  superseded result.
* `tests/svg_io.test.ts` (29) — every approved pair is listed with its reason
  (AI image gone, unreadable file, record-only pair), the discovery is
  byte-identical for a mirrored enumeration order, and a scan writes nothing
  into the root.
* `tests/svg_ui.test.tsx` (29) — a pair whose AI image is gone is still a row,
  with its status and the full reason in the banner.

---

# Quality re-check — 2026-10-05 (global activity log ported; the dock no longer covers the rows)

Change: the activity log from `arena/01a10c14-iconsplitter@aaedf2e` ported onto
this branch, and the layout bug that branch carried fixed (the fixed dock
intercepted clicks on the row checkboxes painted under it — see
`archive/2026-10-05-global-log/design.md`). Scope: the log only; the prompt
preview and the tier caps of that commit are not ported.

## Lanes run (`npm run verify`, committed-tree equivalent)

| Lane | Result |
|---|---|
| 1/6 `tsc --noEmit` | clean |
| 2/6 ESLint (src, tests, tools) | 0 errors, 8 warnings (all pre-existing: `any` in test helpers, `detect.ts` complexity) |
| 3/6 RULE 16 gate — changed files (legacy allowed, ratchet) | **GATE PASSED** |
| 4/6 `vitest run` | 75 files / 704 tests passed |
| 5/6 coverage (`src/lib`, RULE 16.3) | 97.14 stmts / 92.21 branch / 97.16 funcs / 98.27 lines |
| 6/6 production build | `dist/index.html` 636.84 kB, gzip 188.08 kB |

## RULE 18 / RULE 16 numbers for the touched files

`node tools/quality.mjs --changed --allow-legacy` output (the gate's own
counting) for every touched `src/` file, all `[OK]`:

| File | Fns / lines | Note |
|---|---|---|
| `src/lib/log.ts` | 21 / 212 | new; the pure core |
| `src/log/logstore.ts` | 15 / 120 | new |
| `src/log/LogDock.tsx` | 8 / 49 | new |
| `src/log/LogHead.tsx` | 11 / 75 | new |
| `src/log/LogList.tsx` | 2 / 30 | new |
| `src/log/LogRow.tsx` | 1 / 23 | new |
| `src/log/dockheight.ts` | 2 / 26 | new (the `--app-dock-h` contract + the one head/body height) |
| `src/log/scroll.ts` | 1 / 17 | new |
| `src/log/useAutoScroll.ts` | 7 / 44 | new |
| `src/log/useLog.ts` | 1 / 11 | new |
| `src/svg/runlog.ts` | 9 / 127 | new |
| `src/svg/runplan.ts` | 5 / 33 | new — the three pure plan helpers moved out of `actions.ts` |
| `src/svg/actions.ts` | 38 / 283 | changed: emitters + the `refreshModelsNow` extraction keep every function ≤ 30 |
| `src/svg/runbatch.ts` | 31 / 299 | changed: the retry event is a helper, not four lines inside `sendBatch` |
| `src/svg/scan.ts` | 10 / 155 | changed: `logScan` + one `scanWarnings` used by both the user message and the log |
| `src/batch/BatchPanel.tsx` | 16 / 126 | changed (the toast lift) |
| `src/selection/Surfaces.tsx` | 3 / 68 | changed (the toast lift) |
| `src/state/HistoryProvider.tsx` | 18 / 155 | changed (the timeline emitters) |
| `src/svg/keystore.ts` | 6 / 80 | changed (mask-only entries) |
| `src/lib/svgbatch.ts` | 15 / 184 | changed (`BatchOutcome.requestId`) |
| `src/svg/runtypes.ts` | 0 / 83 | changed (the retry event) |
| `src/ui/Workbench.tsx` | 6 / 89 | changed (the shell + the tab emitter) |
| `src/App.tsx` | 70 / 581 | changed (2 class names); still a recorded legacy offender, and *smaller* than its baseline record (76 fns / 607 lines) |

Fidelity of the port, checked file by file against `aaedf2e`:
`lib/log.ts`, `log/{logstore,scroll,useAutoScroll,useLog,LogList,LogRow}` are
**byte-identical**; `log/dockheight.ts` is new (it factors `LOG_DOCK_HEAD_PX` out
of `LogHead`, so head, body and the published CSS value share one writer);
`LogDock.tsx` and `LogHead.tsx` carry the layout fix; `svg/runlog.ts` is
hand-adapted to this branch's events: a retry is a warn line naming the failure
kind and the wait, a stalled outcome is a warning that says "never retried"
(never an error — no failure was confirmed), and the provider request id
travels to the entry through the `requestId` this port added to `BatchOutcome`
(absent, never invented, when the outcome has none).

Baseline: **untouched** (no recorded offender grew; the two new over-100 files
are new code, not legacy).

## Browser verification of the fix (the bug the port had to resolve)

Headless Chromium (`@sparticuz/chromium`) + Playwright, 1440×900, the app served
by Vite, a fake File System Access root with 14 approved pairs (the probe lives
outside the repo — it needs a headless Chromium the project does not ship):

| Probe result | `aaedf2e` | this branch |
|---|---|---|
| Selection V2 — checkboxes inside the visible region whose own coordinates hit the dock | 2 (`time`, `log-body`) | **0** |
| Selection V2 — human click at the list's end | `false → true` only after a full *window* scroll | `false → true` |
| Generate SVG — checkboxes inside the visible region whose own coordinates hit the dock | 2 (`li[log-entry]`, `log-body`) | **0** |
| Generate SVG — human click at the list's end | `false → true` only after a full *window* scroll | `false → true` |
| Dock geometry | `y 663…900`, `position: fixed`, covering both lists | `y 663…900` as the shell's last row; the lists end at `y 663` |

New debt accepted: none. The full (non-changed) gate still reports the same
three baseline hotspots as before this change — `src/App.tsx` (70 fns, 581
lines), `src/lib/detect.ts` (15 fns, 307 lines, 5 over-line functions) and
`src/lib/render.ts` (8 fns, 106 lines, 1 over-line function) — byte-identical to
the gate output on the parent commit, and the changed-file lane with the ratchet
passes. The 8 ESLint warnings are the same pre-existing ones.

---

# Quality re-check — 2026-10-05 (copy a folder, with the picked folder's real full path)

Change: every "copy path" action copies a **folder** instead of a file, as a
Windows full path with backslashes; the picked root's real full path is a value
the user pastes once and the app remembers (`iconSplitter.rootpaths.v1`); and
the Generate SVG tab always offers the folder picker, so its root can be chosen
there rather than only inherited from the Selection tab. Record:
`archive/2026-10-05-folder-path-copy/design.md`.

## Lanes run (`npm run verify`)

| Lane | Result |
|---|---|
| 1/6 `tsc --noEmit` | clean |
| 2/6 ESLint | 0 errors, 8 warnings (all pre-existing) |
| 3/6 RULE 16 gate — changed files (legacy allowed, ratchet) | **GATE PASSED** |
| 4/6 `vitest run` | **76 files / 725 tests passed** (21 new) |
| 5/6 coverage (`src/lib`) | 97.12 stmts / 92.16 branch / 97.21 funcs / 98.32 lines |
| 6/6 production build | `dist/index.html` 639.24 kB, gzip 188.79 kB |

## RULE 16 / RULE 18 numbers for the new and touched files

| File | Fns / lines | Note |
|---|---|---|
| `src/lib/rootpath.ts` | 8 / 100 | new: the path memory + the pure copy-text rules |
| `src/lib/copypath.ts` | 1 / 19 | new: the one clipboard writer (replaces `src/selection/copypath.ts`, deleted) |
| `src/ui/RootPathField.tsx` | 2 / 35 | new: the shared toolbar field |
| `src/svg/SourceLine.tsx` | 5 / 68 | new: extracted from `SvgControls` so both stay under the 300-line ceiling |
| `src/svg/SvgControls.tsx` | 27 / 256 | changed: `SourceLine` moved out (was 300 → would have failed) |
| `src/selectionv2/SourceBar.tsx` | 7 / 70 | changed: the shared field joins the source bar |
| `src/batch/BatchPanel.tsx` | 15 / 124 | changed: its private forward-slash copy is replaced by the shared function |
| `src/selection/{SelectionPanel,handles}.tsx` + `src/svg/codeactions.ts` | ±2 | changed: import the shared function |
| `src/index.css` | +16 | changed: `.pathfield` (the toolbar field's box) |

Baseline: **untouched**. Function-level: the new exports are covered by
`tests/rootpath.test.ts` (15) and `tests/copypath.test.ts` (3), and the DOM
behaviour by `tests/svg_ui.test.tsx` (3 new) and `tests/selectionv2_ui.test.tsx`
(1 new — the real clipboard stub receives `…\F:\\…\architecture` for a row
button, never a file name). The layout change was re-checked with the same
headless-Chromium probe as the log port (1440×900, fake root with 14 approved
pairs): both tabs report `covered=0`, the window still does not scroll
(`max 0` — `.app-main` does, `57…663`, with the dock at `663…900`), a human
click on the last row's checkbox still selects (`false → true`), and the new
controls hit-test clear (`svg-choose-root` `82…115`, `svg-root-path` `84…113`,
`v2-root-path` `84…113`). The Generate SVG probe also drove the copy end to end
in the real browser: after pasting `"F:\Stocks 2026\icons testing\single\test_processing\"`
the row's `Location` action handed the clipboard
`F:\Stocks 2026\icons testing\single\test_processing\set_A` — full path,
backslashes, folder only — and `Change folder…` re-picked from that tab with the
same 14 eligible sources.

New debt accepted: none.

## 2026-10-05 — the Generate SVG list: approved AI outputs only (Task D)

Reported (with screenshots) after the earlier fixes: the Generate SVG list still
showed **the same AI source twice** (`icon-bunny-face_AI_5_01.png`) and listed a
**reference image** (`icon-airplane-landing.png` — a name with no `_AI`) as
something to generate from, and the user asked for the whole-dataset audit
("total files, eligible AI sources, references excluded, duplicates removed,
missing files, final unique rows") to be the app's own output.

Root cause: the list was built from **decisions**, not from files. `sources.ts`
concatenated `approved.map(toSource)` with `recordSources(orphans)` — `toSource`
invented a `<stem>_AI<ext>` name for a pair whose AI side was gone (a reference
wearing an implied `_AI` name, still offering Generate), and every approved
decision record whose `pair_id` did not match this scan became a row using
`r.ai_result ?? r.source ?? r.pair_id`, so a reference path was listed and two
records naming one `ai_result` each produced a row for the same file. Nothing
deduplicated the two halves or checked the name and the file. The version half
was already correct (`toRow` → `newestValid`), so it was left alone. Full record:
`archive/2026-10-05-svg-source-list-audit/design.md`.

The rules now live in one pure module, `src/svg/sourcelist.ts` (no IO, no React):
a row exists iff a **raster** file on disk carries the canonical `_AI` name
**and** an approved decision names exactly that path — by the pair's own id, or
by an approved record whose `ai_result` is that path (ids drift when a file
moves between `split_NN` folders; the recorded approval does not) — and nothing
else claimed the same normalized path. The first record naming a claimed path is
that path's approval; only a second one is a duplicate (probed: reporting every
record would have turned a reorganised folder's 12 healthy approvals into 14
"duplicates" and buried the user's own). Everything else is **reported, never
listed**: `ai-missing`, `no-files`, `not-ai-output`, `artifact` (the app's own
`…_AI.svg`) and `duplicate`, each with its reason, in the banner, the audit line
and the log. Invariants I-31…I-34.

### Lanes run (`npm run verify`, `/tmp/verify14.log`)

| Lane | Result |
|---|---|
| 1/6 TypeScript | clean |
| 2/6 ESLint | 0 errors, 8 warnings (all pre-existing baseline) — GATE PASSED |
| 3/6 Quality gate (RULE 16/18) | GATE PASSED (`--changed --allow-legacy`, 15 files) |
| 4/6 Tests | **77 files / 737 tests, all green** (was 76 / 736) |
| 5/6 Coverage (`src/lib`, RULE 16.3) | 97.21 statements · 92.3 branches · 97.39 functions · 98.44 lines |
| 6/6 Build | `dist/index.html` 642.94 kB / 189.93 kB gzip |

### RULE 16 / RULE 18 numbers for the touched files

| File | fns / lines | What changed |
|---|---|---|
| `src/svg/sourcelist.ts` | 25 / 256 | **new**: the selection rules (canonical `_AI` + raster), approval by id or path, the attribution + dedupe, the exclusions, the audit counts + their one-line text |
| `src/svg/sources.ts` | 15 / 138 | `discoverApprovedSources` calls it; `toSource`/`expectedAiPath`/`recordSources` deleted; `Discovery` gains `excluded` + `audit` |
| `src/svg/SvgPanel.tsx` | 34 / 260 | the exclusion banner (`svg-warn-excluded`); the row-problem banner reworded to "listed source(s)" |
| `src/svg/SourceLine.tsx` | 4 / 72 | the audit line (`svg-audit`) under the scope copy |
| `src/svg/scan.ts` | 10 / 158 | the scan log carries the audit as its detail + fields, and warns for the exclusions |
| `src/svg/scankey.ts` | 8 / 41 | the exclusions and the audit join the snapshot key (`auditKey`) |
| `src/index.css` | +1 | `.svg-audit` (muted, 10 px) |

Baseline: **untouched**. Tests: `tests/svg_sources.test.ts` (**new**, 11 tests
built on a root reproducing the report — two stale records for the bunny path,
two approved references with no AI image, a stale plane record, a declined pair),
plus the suites that had encoded the old contract updated (`svg_io` 2, `svg_scan`
2, `svg_ui` 1 rewritten + 1 new) — 80 tests across the four files, with the audit
numbers asserted as literals so a future change cannot quietly re-list a
reference or a duplicate.

### Browser verification (headless Chromium, 1440×900, dev server)

Fake root: 12 healthy approved pairs **plus** the reported tree (one AI image
named by three records with ids from other folders, two approved references with
no AI image). Before the fix the same root listed a reference and the same image
more than once; now:

| Check | Result |
|---|---|
| rows | 13 = 12 healthy + the bunny **once**; every name carries `_AI`; no `icon-airplane-landing.png` |
| `svg-audit` | `Audit — 30 files · 13 AI sources · 14 references excluded · 2 missing files · 2 duplicates removed → 13 rows` |
| `svg-warn-excluded` | "4 approved source(s) are not listed — 2 with no AI image on disk, 2 duplicate records", first reasons spelled out |
| scan log | `svg.scan · Audit — 30 files · … → 13 rows · aiSources=13 · duplicates=2 · files=30 · missing=2 · references=14 · rows=13 · unreadable=0` |
| layout, both tabs | 3 scroll positions each: the dock covered **0 of 11** (SVG) and **0 of 15** (V2) visible row controls, **0** blocked hit-tests, the window itself never scrolls, and a real mouse click on the last row's control toggles it (`false → true`) |

New debt accepted: none.

## 2026-10-05 — the picked folder's full path, captured at pick time

Reported: *"why it build the folder path not from my selected folder directly but
ask to put my full path folder manually? make it build full path from selecting
folder to scan. and give full path of selected folder visible."* The honest
answer is a browser boundary, not a bug: `showDirectoryPicker()` returns a handle
whose only identity is `{ kind, name }` — no drive, no folders above; a `File`
from a handle has an empty `path`, a folder `input` gives only a path relative to
the picked folder, and `startIn`/`id` remember a dialog's folder without
reporting it. What the app can do is take the path from the clipboard at the
moment of the pick (Explorer's "Copy as path"), match it against the folder that
was really picked, and never invent one. Full record:
`archive/2026-10-05-root-path-at-pick/design.md`.

The chosen process was boxed in the picker:
`ui/pickroot.pickRootWithPath()`/`pickFolderFor()` (read the clipboard before the
dialog, once more only if that read was empty, then adopt), `lib/clipboardpath`
(guarded read + match + save), `lib/rootpath` (the string rules, `{ path, how }`
per folder name, a revision + subscribers), `ui/userootpath` (the live React
view) and `ui/RootPathField` (field, the three-state status, `Use copied path`).
Both root pills show the full path the moment it is known. Invariants I-35…I-37.

### Lanes run (`npm run verify`, `/tmp/verify16.log`)

| Lane | Result |
|---|---|
| 1/6 TypeScript | clean |
| 2/6 ESLint | 0 errors, 8 warnings (all pre-existing baseline) — GATE PASSED |
| 3/6 Quality gate (RULE 16/18) | GATE PASSED |
| 4/6 Tests | **79 files / 763 tests, all green** (was 77 / 737) |
| 5/6 Coverage (`src/lib`, RULE 16.3) | 97.2 statements · 92.09 branches · 97.3 functions · 98.48 lines |
| 6/6 Build | `dist/index.html` 646.54 kB / 191.17 kB gzip |

### RULE 16 / RULE 18 numbers for the new and touched files

| File | fns / lines | What it is |
|---|---|---|
| `src/lib/rootpath.ts` | 26 / 219 | the path string rules + the one storage; `{ path, how }` with a legacy-string read |
| `src/lib/clipboardpath.ts` | 3 / 41 | **new**: guarded clipboard read, the match, the save |
| `src/ui/pickroot.ts` | 3 / 62 | **new**: `pickRootWithPath` + the shared `pickFolderFor` every tab uses |
| `src/ui/userootpath.ts` | 2 / 25 | **new**: `useRootPath`/`useRootLabel` (storage as a live value) |
| `src/ui/RootPathField.tsx` | 10 / 85 | the field, the status line, `Use copied path` |
| `src/selection/rootsource.ts` | 11 / 93 | **new**: boot / pick / rescan, moved out of `useSelection` (it had reached 302 lines with the change — split, not squeezed) |
| `src/batch/outcomes.ts` | 7 / 38 | **new**: item → status records + tally, moved out of `useBatch` (303 → 279) |
| `src/selection/useSelection.ts` | 53 / 232 | the root flow now comes from `rootsource` |
| `src/svg/SourceLine.tsx` / `src/selectionv2/SourceBar.tsx` | 4 / 76 · 6 / 73 | the pill shows the full path when known |

Baseline: **untouched**. New debt accepted: none. The extraction also fixed the
`rescan` root-name race found by the V2 suite (state snapshots could win over the
pick and blank the root name) — pinned by a regression test.

### Browser verification (headless Chromium, 1440×900, 22 checks green)

| Scenario | Result |
|---|---|
| pick with `"F:\Stocks 2026\icons testing\single\test_processing\" ` copied | pill and field show that path, status "✓ every copy uses this path", toast "Full path taken from your clipboard: …", memory `{ path, how: "copied" }` |
| a row's copy action | clipboard `F:\Stocks 2026\icons testing\single\test_processing\set_A` |
| pick with `hello` copied | nothing stored; pill `test_processing`; status "not set — Chrome can't read the drive path; copy the folder in Explorer, then press "Use copied path""; the button answers "Nothing path-like on the clipboard" |
| pick with the copied **parent** | completed to `…\test_processing`, status "completed from the copied folder — check it" |
| V2 pick, then the Generate SVG tab | both pills show the captured path without a reload |
| layout with the long path in the bar | toolbar 107 px / rows band 606 px / dock 237 px; 3 scroll positions per tab: 0 controls under the dock, 0 blocked hit-tests |

## 2026-10-05 — the reviewable set is the split output, and a path is a folder path

Two reports in one sitting. **Bug 1** — *"the selection tab v2 also incorrectly
adding the full unsplitted batches in to the list but should not use the folder
with files that was not splitted in root man folder. It should use created folder
where this files where added like \"_*split*output\""*: `rescan` and
`discoverApprovedSources` walked the picked folder in full, so a batch root listed
the unsplit sheet pair (the batch's **input**) beside the split pieces. The scope
is now decided from the tree's directories (`lib/splitscope`, `/^_.*split.+output/i`),
the lists keep only pairs inside such a folder, and every hidden pair is counted
and reported — toolbars, log, `outside-split` exclusions — never silently dropped;
a tree with no split folder behaves exactly as before (I-38/I-40). **Bug 2** —
*"why it copy svg to file path. it only for path explorer dir nothing else. bug."*
with the pill holding `<svg xmlns="http://www.w3.org/2000/svg" …>`: `isPathLike`
judged the **normalised** text, and normalisation had already turned the markup's
`/` into `\`, so it passed; the field stored any text at all. `isFolderPathText`
now judges the **raw** text (drive or UNC only) at the clipboard, `Use copied
path`, the field's save and on read, and the field states the refusal (I-39).

### Lanes run (`npm run verify`, `/tmp/verify18.log`)

| Lane | Result |
|---|---|
| 1/6 TypeScript | clean |
| 2/6 ESLint | 0 errors, 8 warnings (all pre-existing baseline) |
| 3/6 Quality gate (RULE 16/18) | GATE PASSED |
| 4/6 Tests | **80 files / 786 tests, all green** (was 79 / 763) |
| 5/6 Coverage (`src/lib`, RULE 16.3) | 97.16 statements · 92.05 branches · 97.35 functions · 98.5 lines |
| 6/6 Build | `dist/index.html` 648.34 kB / 191.88 kB gzip |

### RULE 16 / RULE 18 numbers for the new and touched files

| File | fns / lines | What it is |
|---|---|---|
| `src/lib/splitscope.ts` | 9 / 77 | **new, pure**: the folder-name rule, the tree's directory names, the scope decision, the pair filter + the outside count, the one wording |
| `src/lib/rootpath.ts` | 28 / 247 | `isFolderPathText` + the guard in `saveRootPath`/`pathFromCopied`/`loadRootPathInfo`; `isPathLike`/`isFolderPath` deleted |
| `src/selection/rootsource.ts` | 13 / 120 | `scopedPairs` walks once and decides the scope; the scan records it and says it once per change |
| `src/selection/state.ts` | 33 / 218 | `SelState.scope` (`{ split, outside }`) |
| `src/selection/HeaderRow.tsx` | 5 / 71 | the V1 scope line (`sel-scope`) |
| `src/selectionv2/SourceBar.tsx` | 6 / 77 | the V2 scope line (`v2-scan-scope`) replaces the static "Recursive" note |
| `src/svg/sourcelist.ts` | 26 / 269 | `selectRows(…, scoped)` → out-of-scope pairs become `outside-split` exclusions; a new kind in the summary wording |
| `src/svg/sources.ts` | 15 / 143 | computes the scope from the walked tree |
| `src/ui/RootPathField.tsx` | 10 / 88 | refuses a non-path save with its own note (`.pathfield-note.warn` reused) |

Baseline: **untouched**. New debt accepted: none. `src/index.css` needed no
change — the V2 line reuses `.v2-recursive`, the V1 line Tailwind's muted text,
the refusal the existing warn tone.

### Browser verification (headless Chromium, 1440×900, real OPFS folder, 18/18 green)

| Scenario | Result |
|---|---|
| V2 on a root holding BOTH unsplit sheets and `_split_output/…` | 2 rows — the split pieces; the unsplit sheet is not listed; scope line *"Scope: split output only · 1 pair(s) in the main folder not listed"* |
| approve both pieces in V2, open Generate SVG | decisions really written; 2 rows; audit *"7 files · 3 AI sources · 3 references excluded · 0 missing files · 0 duplicates removed → 2 rows"* |
| an approved sheet outside the scope | 1 row (the piece); banner *"⚠ 1 approved source(s) are not listed — 1 outside the split output (unsplit sheets). icon-sheet_AI.png is outside the split output — the main folder's unsplit files are not listed."* |
| pick with SVG markup on the clipboard | nothing stored (`{}`); field empty; pill still `test_processing`; status "not set — …" |
| typing the same markup into the field | note *"That is not a folder path — paste the folder's path, e.g. F:\work\icons"*; nothing stored |
| a row's copy action on a split tree | clipboard `F:\Stocks 2026\icons testing\single\test_processing\_split_output\2026-10\2026-10-01_10-24-31` — the batch folder **(superseded 2026-10-06: since I-56 the copy names the file's own folder, `…\<piece>\split_NN`)** |

## 2026-10-05 — one JSON per pair: the approval and the SVG history live beside the images

The reported gap — *"i don't see json in local folder contain information about SVG
aproval. only AI image aproval"* — had two halves in two places: the pair's
approval sat in `<root>/review-decisions.json` (one file per picked tree) while
the SVG's own review sat in `<stem>.svg.json` beside the images. Per I-41…I-43
(design: `docs/archive/2026-10-05-per-pair-metadata/design.md`) both now live in
**one `v: 2` file per pair**, in the folder that holds the pair; the Selection
tabs, Generate SVG and every writer read/write it through
`selection/pairstore` + `lib/pairmeta`, a scan writes nothing, the legacy global
file is a read-only fallback (a local file wins, including `pending`), an
unreadable pair file is named while its decision is kept, and Retry rewrites
exactly the pairs whose write failed. `selection/reviewstore.ts` is deleted;
`svg/sidecar.ts` → `svg/svgfiles.ts`; `svg/sourceindex.ts` → `state/sourceindex.ts`
(shared by both tabs' undo paths). Wording: the UI now says "pair file", never
"sidecar".

### Lanes run (`npm run verify`)

| Lane | Result |
|---|---|
| 1/6 TypeScript | clean |
| 2/6 ESLint | 0 errors, 8 warnings (all pre-existing baseline; the two new complexity-11 functions found on the first pass — `pairMetaFromLegacy`, `metaFromRecord` — were split into named helpers, `nameParts` / `identityFromRecord`) |
| 3/6 Quality gate (RULE 16/18) | GATE PASSED |
| 4/6 Tests | **82 files / 827 tests, all green** (was 80 / 786) |
| 5/6 Coverage (`src/lib`, RULE 16.3) | 96.59 statements · 90.84 branches · 96.34 functions · 98.06 lines |
| 6/6 Build | `dist/index.html` 655.73 kB / 194.09 kB gzip |

### RULE 16 / RULE 18 numbers for the new and touched files

| File | fns / lines | What it is |
|---|---|---|
| `src/lib/pairmeta.ts` | 24 / 276 | **new, pure**: the v2 model (identity + both faces + decision + versions), parse (v2 + legacy v1), serialize, `toRecord`, `withDecision`, `withVersion`, the file-name/locator rules |
| `src/lib/svgmodel.ts` | 14 / 155 | **new**: the version record (status, review, usage, cost + basis, validation, batch ref) with per-field tolerant parsing |
| `src/selection/pairstore.ts` | 22 / 304 | **new** (replaces `reviewstore.ts`): reads every pair file of a walk + the legacy fallback, writes ONE pair's file atomically, locates a file from a record |
| `src/selection/offline.ts` | 8 / 86 | the cross-tab undo writes per-pair files; a pair back to `pending` is located through `state/sourceindex` |
| `src/selection/useSelection.ts` | 28 / 262 | per-pair writes + failed-id retry (`retryIds`), reworded warning |
| `src/selection/rootsource.ts` | 17 / 152 | `walkAndLoad` → one `commit`; records the id → AI path index for the undo paths |
| `src/selection/Surfaces.tsx` | 6 / 62 | `PairFilesNote` (`sel-pairfiles` / `v2-pairfiles`), pair-file wording |
| `src/svg/saveversion.ts` | 9 / 146 | validate → name → write; returns the pair's updated record (the caller persists it); `metaAfterFailure` records a failed attempt with no SVG |
| `src/svg/reviewact.ts` / `reviewundo.ts` | 23 / 119 · 9 / 88 | the SVG review writes the pair's own file; one history entry per operation; the applier patch both tabs share |

Baseline: **untouched**. New debt accepted: none. `src/index.css` needed no
change (the notes reuse the existing warn tone).

### Browser verification (headless Chromium 153, 1440×900, real OPFS folder, 13/13 green)

| Scenario | Result |
|---|---|
| V2 on a root holding both the unsplit sheet and `_split_output/…` | 2 rows — the split pieces only; the scope line names the sheet left out |
| **Approve visible** (arm → confirm) on both pieces | both pair files appear beside their images (`…/split_01/icon-sheet_AI_01.svg.json`, `…/split_02/…`) with `decision: "approved"`; the file carries `v: 2`, `pair.{id,base,suffix,dir}` and both faces; **no `review-decisions.json` exists anywhere** |
| Generate SVG on the same root | exactly the two approved rows |
| the row's ✓ on a pair whose file has `versions[0].review: "pending"` | the SAME file now reads `versions[0].review: "approved"`, `decision` untouched |
| one pair file replaced with `{not json`, re-scan | banner names `icon-sheet_AI_02.svg.json`; both pairs still listed; the neighbour's decision still shown |

Probe script: `/tmp/probe_pair.mjs` (sandbox-local; the recipe — OPFS
subdirectory as the picked root, `showDirectoryPicker` overridden in the page —
is the one from the earlier probes).

## 2026-10-05 — one folder control, one path row (Selection V1/V2 + Generate SVG)

The report — *"Folder control is unclear and displays the folder name as the
button. Obsolete Watcher and copied-path controls add noise. Full selected path
is not presented clearly."* — was three variants of one control in three
toolbars, each labelled with **state** (the folder's name) instead of the action,
each followed by a `Full path for copies` field with a `Use copied path` button
and a status sentence, and V2 additionally carried a 30 s `Watcher` pill. Per
I-44…I-46 (design: `docs/archive/2026-10-05-folder-bar/design.md`) all three now
mount one shared `ui/FolderBar`: a green `Open folder` button with real
hover/active/focus states, always labelled with the action, plus a full-width
read-only path row below the controls (`sel-folder-path` / `v2-folder-path` /
`svg-folder-path`) in three honest states — the captured path, the same path with
`completed — check it`, or the folder's name with `full path not captured`.
Removed: `ui/RootPathField`, `ui/userootpath` (the live read moved into
`ui/FolderBar`), `lib/rootpath.saveRootPath` + the `pasted` variant of `PathHow`,
`lib/clipboardpath.adoptCopiedPath`, and the Watcher with everything it owned
(`SelState.watcher`, `useSelection.useWatcher`, `WATCH_MS`). The pick-time
capture (I-35) is untouched and is now the memory's only writer; its toast says
`Folder path captured: …` because the path itself is on screen. Rescan is
unchanged in all three tabs (same handlers, labels, testids).

### Lanes run (`npm run verify`)

| Lane | Result |
|---|---|
| 1/6 TypeScript | clean |
| 2/6 ESLint | 0 errors, 8 warnings (untouched baseline: `App`, `detect` — no new warning, and one `setInterval` (the footer's "N seconds ago" display clock) is deliberately kept) |
| 3/6 Quality gate (RULE 16/18) | GATE PASSED (`quality:changed`: 13 files checked, every one OK) |
| 4/6 Tests | **83 files / 840 tests, all green** (was 82 / 827) |
| 5/6 Coverage (`src/lib`, RULE 16.3) | 96.66 statements · 91.04 branches · 96.33 functions · 98.05 lines (branch +0.20; lines −0.01, 18 points above the enforced 80 % floor) |
| 6/6 Build | `dist/index.html` 652.89 kB / 193.35 kB gzip (was 655.73 / 194.09 — the removed field/pill CSS) |

### RULE 16 / RULE 18 numbers for the new and touched files

| File | fns / lines | What it is |
|---|---|---|
| `src/ui/FolderBar.tsx` | 4 / 59 | **new, shared**: the live path read (`useRootPath`), `OpenFolderButton` (one label, one green class) and `FolderPathRow` (read-only text + the one warning state) |
| `src/selectionv2/SourceBar.tsx` | 6 / 71 | the V2 toolbar + the row below it; `watcher`/`toggleWatcher` props gone |
| `src/svg/SourceLine.tsx` | 3 / 63 | the SVG bar + the row below it; the name pill, the second picker button and the field gone |
| `src/selection/HeaderRow.tsx` | 4 / 63 | V1: `sel-open-folder` + `sel-folder-path`; the watcher pill and the `patch` prop gone |
| `src/selection/useSelection.ts` | 53 / 248 | `useWatcher` + `WATCH_MS` + the `watcher` dependency of the boot effect gone |
| `src/selection/state.ts` | 36 / 240 | `SelState.watcher` (and its default) gone |
| `src/lib/rootpath.ts` | 27 / 242 | `saveRootPath` gone; `PathHow` = `copied \| completed` (a legacy `pasted`/bare-string record reads as `copied`) |
| `src/lib/clipboardpath.ts` | 2 / 34 | `adoptCopiedPath` gone; `readCopiedText` + `adoptCopiedText` (the pick-time capture) stay |
| `src/ui/pickroot.ts` | 4 / 66 | the capture is untouched; `pickMessage` no longer names the clipboard |
| `src/index.css` | — | `.folder-open` (+ `:hover` / `:active` / `:focus-visible` / `:disabled`) and `.folder-path`; `.v2-path-pill`, `.svg-path-pill`, `.pathfield*` deleted |

Under ideal, not over: `FolderBar.tsx` (59 lines) is small because it owns one
control; the state that grew (`SelState`) only shrank. No `ideal-size:` deviation
was needed.

### Browser verification (headless Chromium 153, 1440×900, real OPFS folder, 27/27 green)

| Check | Result |
|---|---|
| V2, empty state | the toolbar shows the green `Open folder` button, label exactly `Open folder`, class `folder-open`, painted `rgb(23, 113, 76)` |
| hover / cursor | background changes on hover `rgb(23, 113, 76) → rgb(29, 139, 94)`; `cursor: pointer` |
| the pick | clicking it walks the picked OPFS folder and lists the pair (1 row) |
| the path row | below the toolbar, 1378 px wide = the toolbar's own width, `DIV`, 0 inputs/buttons/links inside, text `Full pathF:\Stocks 2026\icons\probe_root` |
| removals | no `v2-watcher`, no `v2-root`, no `v2-root-path*`, no "Watcher", no "Use copied path", no "Full path for copies" anywhere in the DOM |
| Rescan | `v2-rescan` re-walks the root and keeps the row (unchanged) |
| the pair file (Task G intact) | approving wrote `architecture/fog_AI.svg.json` beside the images and **no** `review-decisions.json`; Generate SVG then listed exactly that 1 row (`svg-row-count` = 1) |
| Generate SVG | the same button (`svg-open-folder`, same label) is offered with a root already loaded, the read-only `svg-folder-path` row shows the same captured path, Rescan works, and re-opening the picker keeps the list |
| narrow window | at 780 px the row stays inside the viewport (`31…749`) |

Probe script: `/tmp/probeenv/probe_folder.mjs` (sandbox-local). Recipe: Chromium
153 extracted from `@sparticuz/chromium/bin/chromium.br` (the package's own
`executablePath()` wrote a 0-byte file in this sandbox), `LD_LIBRARY_PATH` to the
extracted `al2023` libs **without** `FONTCONFIG_PATH` (Skia aborts with
`SkFontMgr_FontConfigInterface … Not implemented` when that is set), Vite dev
server on `:5199`, OPFS `probe_root` as the picked handle.

## 2026-10-05 — picking the batch's own output folder (`…\_split_output\`)

The report names two folders:
`…\test_processing_2\_split_output\2026-10\2026-10-05_18-45-20` and
`…\test_processing_2\_split_output\`. Both are folders the app created, and the
scope filter read only **relative** path segments — so the folder that *is* the
split output filtered itself out. Per I-47/I-48 (design:
`docs/archive/2026-10-05-picked-output-root/design.md`) `lib/splitscope.scopeOf`
now returns `ScopeRule { split, hideOutside }` (hide only while the output folder
is strictly *below* the root), `lib/batchlayout.ts` owns the layout's names
(`_split_output` / `<YYYY-MM>` / `<YYYY-MM-DD_HH-mm-ss>`), and
`lib/rootpath.folderCopyText` finds the batch folder from either side of the
root — inside the relative path, at its head, or the root itself. **(I-48 was
replaced by I-56 on 2026-10-06: the copy now names the folder of the file.)**

### Lanes run (`npm run verify`)

| Lane | Result |
|---|---|
| 1/6 TypeScript | clean |
| 2/6 ESLint | 0 errors, 8 warnings (untouched baseline) |
| 3/6 Quality gate (RULE 16/18) | GATE PASSED (17 files checked, every one OK) |
| 4/6 Tests | **83 files / 850 tests, all green** (was 83 / 840) |
| 5/6 Coverage (`src/lib`, RULE 16.3) | 96.68 statements · 91.06 branches · 96.34 functions · 98.06 lines |
| 6/6 Build | `dist/index.html` 653.13 kB / 193.45 kB gzip |

### RULE 16 / RULE 18 numbers for the new and touched files

| File | fns / lines | What it is |
|---|---|---|
| `src/lib/batchlayout.ts` | 3 / 29 | **new, pure**: `OUTPUT_DIR`, `isSplitDirName`, `isMonthName`, `isRunStamp` — the one owner of the app's output layout |
| `src/lib/splitscope.ts` | 8 / 85 | `ScopeRule { split, hideOutside }`; `scopeOf` reads the tree **and** the root's own name; `splitPairs` takes the rule |
| `src/lib/rootpath.ts` | 27 / 258 | `folderOf(relPath, rootName)`: `batchEnd` (chain inside the relPath) → `runEnd` (chain at its head) → the root being one run folder; the old `MONTH`/`STAMP`/`OUTPUT_DIR` literals moved to `batchlayout` |
| `src/svg/sourcelist.ts` | 26 / 269 | `selectRows(..., hideOutside)` — the flag under its real name |
| `src/svg/sources.ts`, `src/selection/rootsource.ts` | 17 / 179 · 19 / 171 | pass `rule.hideOutside` / `rule.split` instead of the old boolean |

No over-ideal file, no new lint warning, no `ideal-size:` deviation needed.

### Browser verification (headless Chromium 153, 1440×900, real OPFS folder)

The exact tree from the report — `probe_root/test_processing_2/_split_output/
2026-10/2026-10-05_18-45-20/icon-sheet_AI/split_0N/` — picked as each of the two
folders, with the real path on the clipboard:

| Check (both picks) | Before | After |
|---|---|---|
| Selection V2 rows | run folder 2 · `_split_output` **0** | **2 / 2** |
| Scope line | run folder `whole folder — no split output found` · `_split_output` `split output only · 2 pair(s) in the main folder not listed` | `Scope: split output only` (no "not listed") |
| The copy a row's button hands over | `…\icon-sheet_AI\split_02` · *(nothing — no row)* | `…\_split_output\2026-10\2026-10-05_18-45-20` in both |
| Generate SVG rows after approving both | — | **2 / 2**, audit `6 files · 2 AI sources · 2 references excluded · 0 missing · 0 duplicates → 2 rows`, no `outside-split` |
| The path row | already correct (Task H) | unchanged: the picked folder's full path in both cases |

Probe script: `/tmp/probeenv/probe_outputroot.mjs` (sandbox-local; the probe
approves through the real arm → confirm bulk action, then reads the SVG tab).

## 2026-10-05 — root-independent pairs: the same folders under any root (Task I, part 2)

The report: the run folder, `_split_output` and the month folder must list the
same pairs — the month was the only accepted pick — and the path row must show
the picked folder **exactly** ("unable to disply full folder path as folder was
chosen"). Red-before tests first (TDD), then I-49/I-50/I-51 (SYSTEM_OF_RECORD
§18). Design: `archive/2026-10-05-root-independent-pairs/design.md`.

### The red tests, and what each one pinned

| Test | Red before | Green after |
|---|---|---|
| `tests/pairstore.test.ts` — "a pair file read from a DIFFERENT root (I-49)" (3) | the meta kept the other root's `dirPath`, faces and id | the file's own directory, the stored file names, the id a scan of this root computes |
| `tests/svg_scan.test.ts` (2) | `[]` sources · `missing` 2 | 2 sources · `missing` 0 |
| `tests/selection_scan.test.ts` (1) | the pair the file names was not listed | listed, decision intact |
| `tests/splitscope.test.ts` (1) | the month root → `whole folder — no split output found` | `{ split: true, hideOutside: false }` |
| `tests/knownroots.test.ts` (new, 8) · `tests/pickroot.test.ts` (+4) | `deriveRootPath` → `null` (the module did not exist) | derivation, overrule, fallbacks |
| `tests/selectionv2_ui.test.tsx` (1) | the row showed the folder name | the captured path, exactly |

One fixture lesson (kept in `tests/helpers/fakefs`): the real API is
`parent.resolve(child)`. A test that puts `resolve` on the *picked* folder
instead of on the folder the app already knows gets `null` from every
derivation — the algorithm was right, the fixture was not.

### RULE 16 / RULE 18 numbers for the new and touched files

| File | fns / lines | What it is |
|---|---|---|
| `src/lib/pairrebase.ts` | 3 / 33 | **new, pure**: `rebaseMeta(meta, dirPath)` — identity + both faces re-pointed at the file's own directory (I-49) |
| `src/selection/pairrecord.ts` | 13 / 114 | the record ⇄ pair-file mapping (`metaForRecord`, `metaFor`, `metaPathOf`, `metaFromRecord`, `locatable`, `identityOfPaths`) extracted **by concept** out of `pairstore` (RULE 19 step 4) |
| `src/selection/pairstore.ts` | 23 / 232 | reads rebase onto this root (I-49); the id each file carried still answers the legacy record |
| `src/lib/pairmeta.ts` | 36 / 286 | `rebaseMeta` moved out; parsing/serializing/transitions unchanged |
| `src/lib/splitscope.ts` | 8 / 88 | `split` = an output folder **or** a run stamp in the set (I-50) |
| `src/ui/knownroots.ts` | 10 / 71 | the folders the app has named + `deriveRootPath` (I-51) |
| `src/ui/pickroot.ts` | 5 / 86 | prefers an exact clipboard match, else the derivation, else the flagged completion |
| `src/selection/rootsource.ts`, `src/svg/scan.ts` | 20 / 179 · 12 / 173 | boot remembers the restored handle with its captured path |

The first gate run failed on `pairmeta` (309) and `pairstore` (334) — both over
RULE 18's 300-line ideal, and neither is in `tools/quality_baseline.json`, so the
ratchet could not hold them. Fixed in RULE 19 order (nothing to flatten or
simplify: the files had two responsibilities each), by extracting the rebase and
the record mapping. No over-ideal file, no new lint warning (8 pre-existing
warnings), no `ideal-size:` deviation needed.

### Gates (full run)

`npm run verify`: types ✅ · lint 0 errors / 8 warnings · quality gate PASSED ·
**84 files / 872 tests** ✅ · coverage ✅ (96.6 st / 90.87 br / 96.2 fn /
98.01 ln) · build 654.64 kB (193.93 kB gzip). `npm run quality:changed` PASSED.

### Browser verification (headless Chromium 153, real OPFS, both tabs)

`probe_three_roots.mjs`, the two-run tree (`…\_split_output\2026-10\` holding
`2026-10-05_18-45-20` with 2 pieces and `2026-10-05_19-02-11` with 1):

| Check | Before | After |
|---|---|---|
| Selection V2 rows (run / out / month / main) | 2 / 3 / 3 / 3 | 2 / 3 / 3 / 3 (unchanged — the rows were already right) |
| Scope line (run / out / month) | `split output only` / `split output only` / **`whole folder — no split output found`** | `Scope: split output only` in all three |
| Generate SVG rows (run / out / month), after approving on the main pick | **0 / 0 / 0**, every audit `3 missing files` | **2 / 3 / 3**, audits `0 missing files`, no `outside-split` |
| One-run tree, the three roots, **empty clipboard** (the literal report: "all 3 dir should gave same result and same list of items") | *not measured — this is the acceptance itself* | the same 2 pairs (`icon-sheet_AI_01.png`, `icon-sheet_AI_02.png`) in all three, each with its own exact path |
| Path row under four clipboard states (exact / nothing / parent / a stale folder of the same name) | exact / *not captured* / **`…\_split_output\2026-10-05_18-45-20` (month lost, `completed`)** / `D:\other\2026-10\2026-10-05_18-45-20` | **the exact run path in all four** |

Screenshots: `/home/user/run-folder-derived-path-v2.png`,
`/home/user/single-run-three-roots.png` (sandbox-local evidence, like the probe).

## 2026-10-05 — capturing the picked folder's path when the first try fails (I-52)

Report (screenshot of the folder bar): *"work, but stil unable to capture full
path of folder user choose. fix"* — the row read `FULL PATH _split_output · full
path not captured`. Design: `archive/2026-10-05-path-capture-recovery/design.md`.

The pick's capture reads the clipboard, and that read has four failure modes the
app could not tell apart (a Ctrl+C'd folder item, a blocked read, a copy made
after the pick, nothing copied) — all of them ended at "not captured" with
nothing to do. I-52 makes the capture recoverable and self-explaining:
`Rescan` retries one exact-match read, `Ctrl+V` anywhere outside a text field
adopts the path for the root on screen, the read reports `text`/`empty`/
`blocked`/`unsupported`, and the row + toast name the action and the reason.

### Red tests first (TDD)

| Test file | Red before | Green after |
|---|---|---|
| `tests/clipboardpath.test.ts` (3) | `readClipboardText is not a function` | the read distinguishes text / empty / blocked / no-API |
| `tests/rootcapture.test.ts` (new, 13) | module missing | paste adoption (exact only), `Rescan`'s retry, the paste listener (bubbles, ignores fields, unsubscribes), and the gesture guard |
| `tests/pickroot.test.ts` (3) | the failure was silent | the toast names `Ctrl+Shift+C` + `Rescan`, or `blocked` + `Ctrl+V` |
| `tests/folderbar.test.tsx` (4) | the note stopped at `full path not captured` | the note names both ways out, is in the `title`, and `Ctrl+V` fills the row in live — still no control added |
| `tests/selection_scan.test.ts` (2) · `tests/svg_io.test.ts` (1) | a rescan never re-read the clipboard | a rescan captures an unknown root's exact path once and says so; a second rescan stays quiet; an unrelated clipboard writes nothing |

One test-only lesson: the path memory is a single `localStorage` key, so the two
scan suites now clear `localStorage` in `beforeEach` — a test must not inherit
the previous test's captured path.

### RULE 16 / RULE 18 numbers for the new and touched files

| File | fns / lines | What it is |
|---|---|---|
| `src/ui/rootcapture.ts` | 8 / 81 | **new**: `captureFromPaste`, `retryCapture`, `bindPasteCapture`, the gesture guard, and the field-target check |
| `src/lib/clipboardpath.ts` | 2 / 48 | `readClipboardText(): { text, state }` replaces the `""`/`"none"` sentinel pair; `adoptCopiedText` unchanged |
| `src/ui/pickroot.ts` | 6 / 103 | carries the clip state into `pickMessage`, which now also speaks when the capture failed |
| `src/ui/FolderBar.tsx` | 5 / 72 | the actionable note (in the `title` too) and the paste listener mounted with the row |
| `src/selection/rootsource.ts`, `src/svg/scan.ts` | 20 / 182 · 12 / 176 | one `retryCapture` before any `await`, so the click's gesture is still active |

No over-ideal file, no new lint warning, no `ideal-size:` deviation needed.

### Gates (full run)

`npm run verify`: types ✅ · lint 0 errors · quality gate PASSED · **85 files /
896 tests** ✅ · coverage ✅ · build ✅. `npm run quality:changed` PASSED.

### Browser verification (headless Chromium 153, real OPFS tree, six states)

| Clipboard at pick time | Result |
|---|---|
| the exact path (Ctrl+Shift+C) | row + toast: `Folder path captured: …\_split_output` |
| a copied folder **item** (read gives the bare name) | row names both ways out; toast: `in Explorer press Ctrl+Shift+C on the folder, then Rescan`; **Rescan → the exact path** |
| the read **blocked** (throws) | toast: `the browser blocked the clipboard: … press Ctrl+V here`; **Ctrl+V → the exact path** |
| the parent folder copied | `completed — check it` (unchanged) |
| nothing copied | actionable note, nothing invented |
| the **real** Clipboard API (no stub, permission granted) | the exact path — the shipped code, unstubbed |

Probe: `/tmp/probeenv/probe_path_capture.mjs`; screenshots
`/home/user/path-capture-not-captured.png`,
`/home/user/path-capture-real-clipboard.png` (sandbox-local).

---

## 2026-10-05 — I-53/54/55: the generation queue, the version chooser, 800 px zoom

### What was verified

* **Queue (I-53)** — `tests/svg_queue.test.ts` (6) pins the pure rules (append
  order, head-gated start, shift, drop-by-id, dropAll, unique ids); the DOM suite
  `tests/svg_queue_ui.test.tsx` (4) drives the REAL panel + scan + runner over the
  shared fake transport: Generate stays enabled during an in-flight run, a second
  confirmation shows `svg-confirm-queue-note` / "Add to queue" and sends
  **nothing extra** (still exactly one request in flight), the waiting batch
  starts **by itself** when the first answer lands (two requests, in order, both
  SVGs written beside their sources), Cancel drops the queue and says how many,
  and a single `× Drop` removes exactly one waiting batch.
* **Preferred version (I-54)** — `tests/svg_versions_ui.test.tsx` (6): every
  recorded version is listed as a tile, an OLDER version can be made preferred,
  the choice is read back from the folder after a reload (not from memory), the
  popup stays open and one line says what changed, a failed write claims nothing,
  and a failed version offers no artwork. `tests/pairmeta.test.ts` +
  `tests/pairpreferred.test.ts` pin the stored key (v stays 2, nonsense → no
  choice) and `tests/svg_scan.test.ts` proves the CHOICE is part of what the panel
  shows (its own scan key) — so a re-scan cannot silently undo it.
* **Zoom (I-55)** — `tests/zoom.test.ts` (6) pins 48–800 step 4 (including
  `clampZoom(803) → 800` and never upscaling a raster), `tests/paired_thumbs.test.tsx`
  (8) pins the one shared layout: real px boxes per slot, label as an overlay,
  `flex: none`, no `overflow: hidden`, and the stylesheet contract `max-content`
  preview columns at every breakpoint (so an 800 px pair is never clipped and the
  list scrolls instead). The tab suites then drive the real sliders: `svg_ui`
  walks **every value 48…800 in step 4** on both previews at their own ratios,
  and `selectionv2_ui` zooms to 800 px at each side's own ratio.

### Gates (full run)

`tools/pre_push_check.sh`: types ✅ · lint 0 errors (warnings under the 1000 cap) ·
`quality.mjs --changed --allow-legacy` **PASSED** · `vitest run` **91 files / 938
tests** ✅ · coverage ✅ · production build ✅.

RULE 18 recheck — every file of this change is inside the ideals; the gate's
`funcLoc 30 / params 4 / fileWarn 300` limits forced five honest extractions
rather than any limit being waived: `pairmeta` → `lib/pairpreferred.ts` (the
choice and its validation, 308 → ~300 lines), `actions.ts` → `useQueueActions`
(the queue's own callbacks), `ThumbPair.slot` and `SvgThumbs.svgSlot` → one args
object each (≤ 4 params), `SvgList` → `Footer`, `VersionsDialog` → `VersionList`
+ `VersionFacts`. `src/svg/runcontrol.ts` (139) holds the queue's async half so
`runqueue.ts` (59) stays pure rules only; `actions.ts` is back to 283 lines.

---

## 2026-10-06 — I-56: "Location" names the folder of the file

The report: a deep file's location copied the run folder one level up.

```
copied   F:\…\test_processing_2\_split_output\2026-10\2026-10-05_18-45-20
wanted   F:\…\test_processing_2\_split_output\2026-10\2026-10-05_18-45-20\icon-bunny-face_AI_7\split_04
file     …\icon-bunny-face_AI_7\split_04\icon-bunny-face_AI_7_04_v2.svg
```

### What was verified (TDD — every test red before the fix)

* `tests/rootpath.test.ts` — the user's exact tree: the `_AI_04.png` piece, its
  `.svg.json` sidecar, the plain and the `_v2` SVG all resolve to
  `…\icon-bunny-face_AI_7\split_04`, and the run folder is asserted NOT to be the
  answer; the same file copied from three different picked roots (the output
  folder, the month folder, the run folder) gives the same folder, because the
  root no longer decides anything (I-56).
* `tests/copypath.test.ts` — the clipboard text and the toast carry that folder.
* `tests/svg_location.test.tsx` (new, the real panel on the user's own tree) —
  the shown version (preferred v2) decides the FILE the row names, the copied
  folder is `…\split_04` and never the run folder, choosing v1 keeps the same
  folder, and a pair with no version yet still copies its own folder (never a
  file name). This is also the regression test for the doubled chain: before the
  fix `openLocation` handed over `…\split_04\…\split_04`-style input, which only
  looked right while the truncation collapsed it.
* `tests/selectionv2_ui.test.tsx` — the shared copy now hands over
  `…\2026-10-01_10-24-31\icon-sheet_AI\split_01` for the split-tree fixture (one
  rule for every tab; the old batch-folder expectation is gone).

### Gates (full run)

`tools/pre_push_check.sh`: types ✅ · lint 0 errors (8 pre-existing warnings) ·
`quality.mjs --changed --allow-legacy` **PASSED** · `vitest run` **92 files /
941 tests** ✅ · coverage ✅ · production build ✅.

RULE 18 recheck — the change SHRANK the touched files rather than growing them:
`lib/rootpath.ts` 370 → 230 lines (the batch/run segment search is deleted, and
with it the `batchlayout` dependency), `svg/SvgRow.tsx` 203 → 187 (its local
`targetPath` and `joinPath` moved to `svg/rowmodel.ts` as the one exported
`targetPathOf`), `svg/codeactions.ts` 120 → 118, `svg/rowmodel.ts` 114 → 129.
Every function stays inside the limits; no baseline was touched.

---

## 2026-10-07 — environment-setup performance: pinned toolchain, AGENTS.md, node verify runner, shallow-safe quality gate

Research + plan of record: `docs/archive/2026-10-07-env-setup-performance/design.md`
(ported from `arena/12f110d4-iconsplitter` and re-verified in-sandbox against
this lineage, base `286304a`). No `src/` production code changed; the change is
tooling, pins, docs and tests.

* **O1 verified**: HEAD tracks 0 files under `node_modules/` and `dist/`;
  `origin/main` still tracks 11,486 + 1 (tree diff = 11,757 files) — merging
  this lineage removes them from main. History purge stays an owner step.
* **O2**: root `AGENTS.md` (96 lines) — pinned environment, exact commands with
  measured times, per-task reading protocol with a never-read list, the REAL
  handles of THIS lineage (`upload-*` for SVG to upload, `src/upload/`; the
  sibling branch's `up-`/`svgupload/` names do not exist here),
  definition of done + commit format.
* **O3**: `.nvmrc` 22.12.0 · `engines` `^20.19.0 || >=22.12.0` + npm ≥ 10 ·
  `packageManager` npm@10.9.2 · `.npmrc` (engine-strict, quiet, prefer-offline)
  · `npm run setup` = `npm ci`; README + `install_dependencies.bat` switched to
  `npm ci` (CRLF preserved). `npm ci` measured at 6 s warm.
* **O5+O9**: `tools/verify.mjs` (62 lines, node, no bash) replaces
  `tools/pre_push_check.sh` (deleted; hook + every doc reference updated in the
  same change). Fast mode runs the suite exactly ONCE — via the coverage lane;
  `--full` adds the standalone lane for pre-push parity; `--plan [--json]`
  prints the lane plan without running it (the test seam); `--base` forwards to
  the quality lane.
* **O6**: browser probes declared OPTIONAL (`CODE_VERIFICATION.md` §9) — the
  happy-dom suite is the acceptance gate; no playwright/puppeteer dependency.
* **O7**: `design temp/` → `design/` (121 files, `git mv`, own commit) +
  `design/README.md` (35 lines): the SPEC.md handoff contract. Live references
  updated in the same commit (SOR §1 mode 4 + the two `src/index.css`
  comments); archived docs keep their historical paths (RULE 17).
* **O8**: `quality.mjs` gains `--base <ref>` (tree-vs-tree diff, no merge-base
  needed), `--files <list>` (no git involved; missing file fails loudly, non-src
  is an honest empty set) and a shallow-clone hint. Pre-fix behaviour
  demonstrated in this depth-1 sandbox: merge-base exits 1, `HEAD~1` exits 128,
  the gate printed `Changed files vs merge-base: (none)` → GATE PASSED without
  measuring anything.
* **O10**: `.devcontainer/devcontainer.json` added. The CI workflow could NOT
  be pushed to `.github/workflows/` — the GitHub App token lacks the
  `workflows` permission (remote rejected the push, exactly as on the plan's
  source branch); it is staged ready-to-paste at
  `docs/archive/2026-10-07-env-setup-performance/verify.yml` (fetch-depth 0,
  node from `.nvmrc`, npm cache, `npm ci`, `verify:fast`) and the
  "CI equivalent" section of CODE_VERIFICATION.md says so.
* **O11**: `docs/README.md` — archive rows collapsed to one-line pointers, the
  missing rows added (`history-session` + the three 2026-10-07 folders),
  `AGENTS.md` + `design/README.md` listed under "Outside docs/".
* **O4 deferred** (owner ticket, reasons in the plan): the SOR domain split.
  Mitigation shipped: reading index at the top of SOR, the stale
  `ideal-size: 357 lines` comment corrected to the honest 1800, and an
  append-only "do not read this file" header on QUALITY_RECHECK.md.
* **RULE 17 drift repaired**: SOR §1 + README "five modes" → six, SOR §8
  counts 114/1212 → 126/1334 + the two tooling-test rows, §10 pointers for the
  2026-10-07 svg-to-upload and env-setup-performance designs.

### What was verified (TDD — both files red before the tools existed)

* `tests/verify_runner.test.ts` (7 tests) — spawns the real runner: the fast
  plan contains exactly one vitest lane (coverage), `--full` exactly two, lane
  order types→lint→quality→(tests)→coverage→build, the quality lane carries
  `--changed --allow-legacy`, `--base origin/main` reaches its args, `--plan`
  runs nothing. Red before: the module did not exist (all 7 failed).
* `tests/quality_base.test.ts` (7 tests) — spawns the real gate: `--files`
  measures exactly the named src files, non-src → `(none in src)` + GATE PASSED
  (RULE 4), a missing named file exits 1 with "not found", `--base HEAD` names
  the ref with no merge-base, an unknown ref exits 1 naming it, the shallow
  hint prints iff merge-base is unavailable in a shallow repo, flag-less
  `--changed` stays green (characterization). Red before: 6 of 7 failed.

### Gates (fast run — through `node tools/verify.mjs` itself, dogfood)

types ✅ 9.4 s · lint ✅ 7.3 s (0 errors, 9 pre-existing warnings, none in the new files) · quality
gate `--changed` ✅ 0.4 s (honest "(none)" — no `src/*.ts(x)` file in this
change; the shallow hint printed) · tests + coverage ✅ **126 files /
1334 tests** (91.5 s) · coverage ✅ src/lib lines **97.52 %**, branches
88.96 % (threshold 80) · build ✅ `dist/index.html` 1,472.50 kB
(gzip 422.55 kB) in 6.4 s. Total **1 m 55 s**; the full lane
(`npm run verify`, dogfooded on this commit) ✅ **3 m 06 s** — the ≈ 2×-suite
saving of the old `pre_push_check.sh` is what `verify:fast` buys back for the
commit loop.

RULE 18 recheck: `AGENTS.md` 96 lines (≤ 120 target) · `tools/verify.mjs`
62 lines, every function ≤ 10 · `tools/quality.mjs` +69/−12, every touched
function ≤ 15 · `design/README.md` 35 · `docs/README.md` 57 · no src change, so
the size gate legitimately reports "(none)"; baseline untouched.

### Known debt carried

* O4: SOR is 1800 lines against RULE 18's 60–200 context-file ideal — owner
  ticket, planned in the archive doc.
* §10 still lacks pointers for the 2026-10-06 `location-folder-of-file` and
  2026-10-07 `svg-to-upload-merge` designs (recorded, not silently added here).
* `design/Arena setup analyze/` (34 MB saved web page, most of the 121 tracked
  design files) — owner decision on removal/external storage.
* The 2026-10-07 API-key change (`286304a`, the tip this change was built on)
  carried no QUALITY_RECHECK entry of its own; the ledger's last entry before
  this one is therefore dated 2026-10-06, and this entry is the first measured
  record of the tree that includes it — src/lib lines 97.52 % (floor 80).

## 2026-10-08 — the seven-point SVG-to-upload batch: metadata minima, clean export SVG, pinned artboard

The user's seven points, as implemented in one change: (1) tags are a MINIMUM
now — `tags must be at least 10 (got N)`, no maxima anywhere; (2) `title must
be at least 5 words (got N)`; (3) `description must be at least 7 words (got
N)`; (4) the background rectangle is fill-only (`stroke="none"`) so an artwork
that strokes on the root no longer gets a border painted around the artboard;
(5) the artboard is a settings field with a `content` mode, the square px
presets 256/512/1024/2048/4096 and an exact CUSTOM W×H (the aspect-ratio
control), clamped to 16–8192 px per edge and a 64 MP ceiling that shrinks both
edges together; (6) the shipped SVG declares `version="1.1"` (SVGO strips it, so
the clean pass re-adds it and the export re-verifies the committed text); (7)
the clean policy — no raster content, no editor bloat, no names: no `id`,
`class`, `data-*`, `aria-*`, `role`, `xml:space`, `enable-background`, no
foreign elements/attributes/namespaces, and a referenced id survives only as
`a`/`b`/`c`… with its references rewritten.

Design of the clean pass: ONE rule list (`src/lib/upload/clean.ts`, 17 fns /
173 lines) plus ONE rebuilding pass it re-checks against (`cleandom.ts`, 25 fns
/ 231 lines) over shared DOM readers (`svgdom.ts`, 13 fns / 88 lines) — three
call sites (prepare → after the optimizer → before commit) can no longer
disagree about what "clean" means. A paint-only `<style>`/`style=""` is folded
into the elements (that is what lets the class names go); anything that could
move, hide or clip geometry is refused as `unsupported` with the reason, never
guessed.

### Gates (full run — `npm run verify`, the pre-push hook's own check)

| Lane | Result | Numbers |
| --- | --- | --- |
| 1/6 types `tsc --noEmit` | ✅ | 9.8 s |
| 2/6 lint | ✅ | 0 errors, **9 warnings** (unchanged legacy) |
| 3/6 quality gate (changed) | ✅ | `GATE PASSED`; `--allow-legacy` still holds the 3 RULE 16.5 hotspots (`App.tsx`, `lib/detect.ts`, `lib/render.ts`) |
| 4/6 tests | ✅ | **128 files / 1374 tests** (96.4 s; was 126 / 1334) |
| 5/6 tests + coverage | ✅ | statements **95.73 %** (floor 95.2 by the merge report §12 — was 94.81 before this entry's tests), branches **89.21 %** (floor 88.0 — was 87.93), functions 96.81 %, lines 97.74 % |
| 6/6 build | ✅ | `dist/index.html` 1,484.03 kB (gzip 425.99 kB) in 6.9 s |

Total ≈ 4 m 0 s; `ALL LANES PASSED`.

### What the new tests proved (and the two defects they caught)

`tests/upload_cleandom.test.ts` (11) drives the rebuilding pass fold by fold:
non-document input, unusable viewBox, a foreign editor vocabulary (Illustrator
`xmlns:i` + `i:extraneous`, `data-name`, `aria-label`, `xml:space`, a foreign
element), used vs unused `xmlns:xlink`, a referenced id renamed to `a` with
`href="#a"` rewritten, an unreferenced id removed, a DUPLICATE id collapsed,
27 referenced ids renamed `a…z` then `aa`, class and tag rules folded, the
inline paint fold, and eight stylesheet shapes refused (no value, compound
selector, `#id` selector, external `url(`, `var(`, trailing garbage, `@import`,
`transform`).

Two real defects surfaced while writing those tests, both fixed in this change:
the rebuild used to DELETE a foldable `<style>` block instead of folding it
(which silently changed the picture — now the block is folded first, and a
block it cannot fold is left in place so the violation survives and the file
ships unchanged), and it never dropped foreign `xmlns:*` declarations, so a
rebuilt Illustrator file stayed dirty (now only a USED `xmlns:xlink` survives).
The suite also closed a gate gap: the merge report §12 floors (≥95.2 % stmts,
≥88.0 % branches) are NOT what `vitest.config.ts` enforces (`lines: 80`), so the
batch's new code had quietly dropped the aggregate to 94.81 / 87.93 while
`verify` stayed green. 15 added tests (11 + 4 for the artboard/geom/prepare
edges) brought it to 95.73 / 89.21.

### RULE 18 recheck

`clean.ts` 172 lines / 17 fns · `cleandom.ts` 230 / 25 · `svgdom.ts` 87 / 13 ·
`tests/upload_cleandom.test.ts` 157 · `prepare.ts` 165 / 13 · `settings.ts` 244
/ 24 · `UploadSettingsDialog.tsx` 255 / 30 — every one under the 300-line file
target, and no function over 30 lines. The RULE 19 order was obeyed for the
three functions the gate flagged mid-work: `prepareExportSvg` lost its guard
clause to a `sourceVeto` helper, `parseOverrides` became a field table
(`readNumbers`/`readFlags`/`readBackground`/`readArtboard`), and the 437-line
`clean.ts` was split by responsibility into check / rebuild / DOM readers.

### Known debt carried

* The §2 field ranges (padding 0–40 %, stroke 0.2–8 pt, JPEG 1–30 MP, quality
  0.5–0.98) are still the pre-merge values in `settings.ts` (0–50 / 0–24 /
  1–64 / 0.5–1). Changing the stroke default to 2.2 pt would alter every
  prepared/committed SVG, so it is scoped as its own change, not smuggled into
  this batch.
* The report's named test obligations still open: T17 (tag-count refusal at the
  new minimum), T19 (65,502-byte APP1 limit), T25 (12-row mockup walkthrough,
  belongs to P5), T27 (cost receipt), T28 (duplicate-name dance).
* Point 4 was fixed at the mechanism the user named (fill-only background);
  deeper research into stroked-artwork edge cases is not done.
* `docs/README.md` §10 still lacks pointers for the 2026-10-06
  `location-folder-of-file`, 2026-10-07 `svg-to-upload-merge` and 2026-10-08
  `env-setup-performance` designs.
* `design/Arena setup analyze/` (the 21 MB saved web page) — owner decision on
  removal, scheduled with P5's `design/SVG to upload/` landing.

## 2026-10-08 — the artboard must not cap the JPEG resolution (user correction)

Reported: "if artboard selected it block to setup the MP custom resolution in MP
but it should not. User can have big resolution of icon even the icon artboard
is small so it should let user decide it resolution same as artboard or not."

What was wrong: pinning the artboard `disabled` the MP field and silently used
the pinned px for the JPEG, so a 512×512 artboard made a bigger file
impossible. Now `upload-set-mp` is never disabled; with a pinned artboard a
checkbox (`upload-set-mp-match`, "same size as the artboard", default on) makes
the choice explicit, and typing a megapixel value unticks it in the SAME
gesture (one `changeMany` → one override patch, one undo entry). The note says
what the JPEG will really be either way. With a `content` artboard the question
does not exist (the artboard follows the MP), so the checkbox is not rendered.

Implementation: `jpegMatchArtboard` is a first-class setting (default true) —
`UploadSettings`, `readFlags` (so it survives corrupt storage as the default),
`settingsEqual`, `settingsFingerprint` (it changes the output, so a toggle must
re-export) — and `buildJpeg` picks `pinnedDimensions` only while it is on,
otherwise `targetDimensions(fit.artW, fit.artH, jpegMegapixels)`, which keeps
the artboard's ratio. A latent bug found on the way: `overridesEqual` in
`uploadundo.ts` kept its OWN list of seven overrideable fields and had already
missed the artboard, so a change touching only the artboard (or the new flag)
compared EQUAL and could be swallowed while the panel was unmounted. The list
is now `SETTINGS_FIELDS` in `lib/upload/settings.ts` — one source of truth —
and `overridesEqual` derives from it.

Tests: 4 new/updated — `upload_settings` (the flag is a real setting: parse,
normalize, equality, fingerprint; the defaults object), `upload_runexport` (4 MP
+ 512×256 + match OFF ⇒ the pipeline really asks for and commits a 2828×1414
JPEG while the SVG stays `0 0 512 256`), `upload_ui` (MP never disabled, the
checkbox appears only when pinned, typing 4 MP stores both values, the box hands
the decision back, and `upload-set-mp-match` is absent in content mode), and
`upload_undo` (artboard-only and flag-only changes are NOT equal).

### Gates (full run)

| Lane | Result | Numbers |
| --- | --- | --- |
| 1/6 types | ✅ | 8.9 s |
| 2/6 lint | ✅ | 0 errors, 9 legacy warnings |
| 3/6 quality gate (changed) | ✅ | `GATE PASSED` (RULE 19 order used again: `MegapixelSetting` hit 32/30 lines, so the checkbox moved into its own `MatchArtboard` component) |
| 4/6 tests | ✅ | **128 files / 1376 tests** (was 1374) |
| 5/6 tests + coverage | ✅ | statements **95.74 %**, branches **89.27 %**, functions 96.82 %, lines 97.75 % |
| 6/6 build | ✅ | `dist/index.html` 1,485.05 kB (gzip 426.35 kB) |

Note on fingerprints: adding a field to the canonical settings fingerprint makes
packages committed before this change read `stale` once — by design, since the
meaning of the settings changed (the artboard no longer implies the JPEG size).

### Known debt carried

* Unchanged from the previous entry: §2 field ranges (padding 0–40, stroke
  0.2–8 pt, MP 1–30, quality 0.98), T17/T19/T25/T27/T28, P5–P7, and the
  `docs/README.md` §10 design pointers.

## 2026-10-08 — four-point batch: silent tags dedupe, EPS 10, the two global buttons

Landed together (the user's four points, one batch): silent tag dedupe
(`dedupeTags` in `lib/upload/meta.ts` feeds both `parseMetadata` and the tags
edit path, and the ≥10 minimum counts the deduped list), the **EPS 10** document
layer (DSC comment block with `%%HiResBoundingBox` / `%%DocumentData: Clean7Bit`
/ `%%LanguageLevel: 3`, `verifyEps` requiring all three, `%%Title` from the
`${stem}.eps` name and `%%CreationDate` from the run's clock) built from the
CLEANED/optimized export SVG, and the two global buttons plus the export chain
(`✦ Generate metadata (N)` = only the selected icons with no metadata text;
`⇪ Export selected` = generate the missing metadata, accept every valid answer
as it lands, then export the WHOLE selection).

The batch's real bug was a React-timing race, and it is worth the record: the
accepts were dispatched, but `runExportBatch` read the rows back through
`latest.current` BEFORE React re-rendered, so the first icon exported with no
metadata at all (it was the `freshMeta` map that fixed it). Never re-read
`latest.current` for state the current task just dispatched.

### Structure work forced by the gate (RULE 18/19)

The gate failed three NEW files, and the fixes are structural, not cosmetic:

| File | Was | Now |
| --- | --- | --- |
| `src/lib/upload/eps.ts` | 342 lines, `assemble` 5 params | 271 lines — the DSC document layer moved to **`src/lib/upload/epsdoc.ts`** (96 lines: `assemble({…})` takes ONE document object, `verifyEps`, the markers, the boxes), and `eps.ts` re-exports the public surface so its importers do not move |
| `src/upload/metaactions.ts` | 365 lines, `useMetaRequestActions` 57 loc, `runMetadataBatch` 31 loc | 262 lines — the selection-level buttons, the confirmation they open and their guards moved to **`src/upload/metaselect.ts`** (155 lines); the batch's tail became `exportAfterMetadata` |
| `src/upload/UploadMetaDialog.tsx` | `UploadMetaDialog` 42 loc | the header / note / prompt blocks are their own components (`MetaDialogHead`, `SentNote`, `ThenExportNote`, `MetaPrompt`) |

### Gates (full run)

| Lane | Result | Numbers |
| --- | --- | --- |
| 1/6 types | ✅ | 10.8 s |
| 2/6 lint | ✅ | 0 errors, 9 legacy warnings |
| 3/6 quality gate (changed) | ✅ | `GATE PASSED` after the three splits above |
| 4/6 tests | ✅/⚠️ | **128 files / 1385 tests** (was 1376). One run reported the suite green (`128 passed`, `1385 passed`) yet exited non-zero on a **harness flake**: `EnvironmentTeardownError: [vitest-worker]: Closing rpc while "onUserConsoleLog" was pending`, attributed to `tests/selectionv2_ui.test.tsx` — the same code then passed this lane in the re-run, and lane 5 (same suite + coverage) passed in both |
| 5/6 tests + coverage | ✅ | statements **95.75 %**, branches **89.29 %**, functions 96.82 %, lines 97.75 % |
| 6/6 build | ✅ | `dist/index.html` 1,489.75 kB (gzip 427.77 kB) |

### Known debt carried

* Unchanged: the `duplicate tags: …` refusal is gone by design (the tags are
  deduped silently), T17 now reads as "a list of fewer than 10 UNIQUE tags is
  refused" and stays open with T19/T25/T27/T28 and P5–P7.
* The lane-4 flake above is environmental (act() warning volume during
  teardown), not a failing assertion: worth one `vitest`/pool note, not a code
  change, until it reproduces with a failing test named.

## 2026-10-08 — export naming: the artifact is named after the ICON

One rule change, one place: `lib/upload/export.ts` `stemOf` now trims the app's
bookkeeping from the artifact name — the extension, this app's own `_v2`
version artifact, the `_AI` marker and every numeric tail behind it
(`fog_AI_7_04_v2.svg` → `fog.svg` / `fog.jpg` / `fog.eps`). A base that really
ends in a digit keeps it (`chat_bot_2_AI.svg` → `chat_bot_2.*`), and a name with
no `_AI` marker is returned unchanged — never invented, only trimmed.
`runexport.ts` lost its second private `stemOf`, so the commit, the
published-JPEG path and the UI cell all derive from the same function.

Because a rename would otherwise leave the pre-2026-10-08 package beside the new
one, the commit now removes the files **the previous record itself named** whose
name is no longer in use, after the new files are written and verified — nothing
the record does not name is touched, and a selective re-export (say, one JPEG
that had to be re-rendered) never removes a file it did not rewrite. That last
point was a real bug in the first cut of this change, caught by the existing
"a missing JPEG rebuilds only the JPEG" test: the first version compared against
the files written in THAT run, so a JPEG-only rebuild deleted the SVG.

### Tests

| Suite | What it pins |
| --- | --- |
| `upload_export` | the rule itself: `fog_AI` → `fog`, `icon-bunny-face_AI_7_04` → `icon-bunny-face`, `fog_AI_v2` → `fog`, `chat_bot_2_AI` → `chat_bot_2`, `plain_name` unchanged, `publishedJpegPath` = `…/export/fog.jpg` |
| `upload_runexport` | the committed folder holds exactly `[export.json, fog.svg, fog.jpg]`, `%%Title: fog.eps`, `record.source.svgPath` still names `…/fog_AI.svg` (the provenance moved into the record), and a hand-built OLD package (`fog_AI.*` + a record naming them) is replaced — the folder ends with only the new names |
| `upload_ui` | the export-selected chain and the single-row export read `export/fog.svg` / `fog.jpg`; the foreign `fog_AI.svg` junk in the fixture folder still survives a failed export |

### Gates (full run)

| Lane | Result | Numbers |
| --- | --- | --- |
| 1/6 types | ✅ | 8.9 s |
| 2/6 lint | ✅ | 0 errors, 9 legacy warnings |
| 3/6 quality gate (changed) | ✅ | `GATE PASSED` |
| 4/6 tests | ✅ | **128 files / 1386 tests** (was 1385) |
| 5/6 tests + coverage | ✅ | statements **95.75 %**, branches **89.3 %**, functions 96.82 %, lines 97.76 % |
| 6/6 build | ✅ | single-file bundle, no size regression |

### Known debt carried

* One icon per export folder is now an **assumed** invariant (the user's tree:
  the batch layout puts one piece in each `split_NN` folder). Two paired sources
  in one folder whose bases trim to the same name would share a package — not in
  the corpus, and T28's guard is still the place where it gets refused.
* Unchanged: T17/T19/T25/T27/T28, P5–P7, and the lane-4 teardown flake recorded
  in the previous entry.

## 2026-10-08 (later) — the rename migration may never lose a package

Two properties pinned after the export-naming change, both found by asking what
a real folder would look like after a rename:

1. **A superseded file is removed only when its replacement is present.** The
   first cut removed every old-named file the previous record named. It was safe
   under today's planner (a skipped rebuild implies the canonical file exists),
   but that invariant is invisible in the code and one `planStages` change away
   from deleting the only copy of an output. `dropSuperseded` now checks the
   export folder itself (`listChildNames`) and removes an old-named artifact only
   when `${stem}.${ext}` is really there.
2. **The record stops naming a file the commit removed.** `writeRecord` prunes
   the previous outputs through `pruneRemoved`, so `outputs.eps` becomes null
   when the superseded EPS was removed and no new one was written (the honest
   half of a failed EPS stage) instead of pointing at a deleted path.

| Suite | What it pins |
| --- | --- |
| `upload_runexport` | "keeps an old-named file when this run wrote nothing to take its place" (the only EPS in the folder stays, `replaced` is empty, the record still names it) and "stops naming a file it just removed" (the superseded EPS goes because `fog.eps` is on disk, and `outputs.eps` comes back null) |

### Gates (full run)

| Lane | Result | Numbers |
| --- | --- | --- |
| 1/6 types | ✅ | clean |
| 2/6 lint | ✅ | 0 errors, 9 legacy warnings |
| 3/6 quality gate (changed) | ✅ | `GATE PASSED` |
| 4/6 tests | ✅ | **128 files / 1388 tests** (was 1386) |
| 5/6 tests + coverage | ✅ | statements **95.75 %**, branches **89.3 %**, functions 96.82 %, lines 97.76 % |
| 6/6 build | ✅ | single-file bundle, no size regression |

### Known debt carried

* An **orphaned** superseded artifact — one that no `export.json` names — is
  deliberately left in place: the app never deletes a file it cannot prove it
  wrote. A folder carrying one needs the user's word before any sweep lands.
* Unchanged: T17/T19/T25/T27/T28, P5–P7, and the lane-4 teardown flake.

## 2026-10-08 (third) — the export folder sweeps to ONE name; the record stops lying

The user's follow-up: after the rename an export folder still held the old-named
EPS, and the package must "be the same name as the svg". The record-based
removal from the previous entry could not see an **orphan** — a superseded file
the current `export.json` no longer names, which is exactly what a real folder
has — so it was replaced by a folder sweep (`src/upload/exportsweep.ts`, five
unit tests + two pipeline tests):

* candidates: the three artifact extensions whose bare name trims to THIS icon's
  stem under the export rule (`trimArtifactStem`), and which are not the current
  `${stem}.${ext}` — another icon, a foreign file, `fogv2.eps` and
  `fog_AI_x.eps` are never candidates;
* a candidate the previous record still names goes only when its replacement is
  on disk (a failed EPS stage must not delete the previous EPS); an orphan goes —
  it passed the naming proof and no package claims it;
* written and verified first, swept second, reported in `replaced`.

**And the sweep exposed a pre-existing bug worth the record**: `assembleRecord`
built a fresh record for every run, so a selective re-export (one JPEG, one SVG)
blanked the record's `outputs` and JPEG block for everything it did not rewrite —
the record stopped naming files that were sitting right there. `assembleRecord`
now seeds `outputs` and the JPEG block from the previous record; the commit then
fills, replaces and prunes them (`writeRecord` + `pruneRemoved`).

| Suite | What it pins |
| --- | --- |
| `upload_exportsweep` (new) | our superseded forms (`_AI`, `_AI_v2`, `_AI_7_04`, `_AI_9_01`) go; another icon / foreign file / `export.json` / near-miss bases stay; a claimed old-named file with no replacement stays; an orphan goes; a clean folder is a no-op |
| `upload_runexport` | the orphan EPS from a real folder is swept and the folder ends `[export.json, fog.svg, fog.jpg]`; the record keeps naming the SVG a JPEG-only rebuild did not rewrite; the old-name package is still replaced |

### Gates (full run)

| Lane | Result | Numbers |
| --- | --- | --- |
| 1/6 types | ✅ | clean |
| 2/6 lint | ✅ | 0 errors, 9 legacy warnings |
| 3/6 quality gate (changed) | ✅ | `GATE PASSED` |
| 4/6 tests | ✅ | **129 files / 1395 tests** (was 128 / 1388) |
| 5/6 tests + coverage | ✅ | statements **95.75 %**, branches **89.3 %**, functions 96.82 %, lines 97.76 % |
| 6/6 build | ✅ | single-file bundle, no size regression |

### Known debt carried

* A superseded file whose base does not trim to this icon's stem (e.g.
  `fog_AI_x.eps`) is left alone: the naming rule cannot prove this app wrote it.
* Unchanged: T17/T19/T25/T27/T28, P5–P7, and the lane-4 teardown flake.

## 2026-10-08 (fourth) — corrected: only `_AI` goes, every number stays

The user corrected the naming rule the same day: *"sorry it was incorrect task.
only remove `_AI` but keep number `_03` etc."* The rule in
`lib/upload/export.ts` is now literal — strip the extension, remove the `_AI`
marker, change nothing else:

| source | before (wrong) | now |
| --- | --- | --- |
| `fog_AI.svg` | `fog.*` | `fog.*` (unchanged) |
| `fog_AI_03.svg` | `fog.*` | **`fog_03.*`** |
| `icon-bunny-face_AI_7_04.svg` | `icon-bunny-face.*` | **`icon-bunny-face_7_04.*`** |
| `fog_AI_v2.svg` | `fog.*` | **`fog_v2.*`** |
| `chat_bot_2_AI.svg` | `chat_bot_2.*` | `chat_bot_2.*` (unchanged) |
| `fog_AI_x.svg` | `fog_AI_x.*` | `fog_AI_x.*` (a non-numeric tail is not our marker) |

Keeping the digits also removes the collision the previous rule created:
`fog_AI.svg` and `fog_AI_7.svg` are different pairs and now export as `fog.*`
and `fog_7.*` instead of collapsing onto one name.

The sweep follows the same, single rule (`trimArtifactStem`): for icon `fog`,
`fog_AI.eps` is ours and goes when `fog.eps` is on disk, while `fog_AI_7.eps` /
`fog_AI_9_01.jpg` belong to OTHER icons and are never candidates. A versioned
source is swept under its own stem: exporting `fog_AI_v2.svg` (stem `fog_v2`)
replaces `fog_AI_v2.*` with `fog_v2.*`.

### Tests

| Suite | What it pins |
| --- | --- |
| `upload_export` | every row of the table above, plus `publishedJpegPath("", "fog_AI_7.svg")` = `export/fog_7.jpg` |
| `upload_exportsweep` | our own `fog_AI.*` goes; `fog_AI_03.eps`, `fog_AI_7_04.svg`, `fog_AI_9_01.jpg` are LEFT ALONE (another icon's); the versioned old name goes when `fog_v2.*` is the stem being exported |
| `upload_runexport` | a real export of the `fog_AI_7.svg` pair commits `fog_7.svg` + `fog_7.jpg` |

### Gates (full run)

| Lane | Result | Numbers |
| --- | --- | --- |
| 1/6 types | ✅ | clean |
| 2/6 lint | ✅ | 0 errors, 9 legacy warnings |
| 3/6 quality gate (changed) | ✅ | `GATE PASSED` |
| 4/6 tests | ✅ | **129 files / 1398 tests** |
| 5/6 tests + coverage | ✅ | statements **95.76 %**, branches **89.3 %**, functions 96.83 %, lines 97.76 % |
| 6/6 build | ✅ | single-file bundle, no size regression |

### Known debt carried

* A pre-rename artifact of a DIFFERENT version (`fog_AI_v2.eps` while v1 is the
  approved source) is left alone: it belongs to the `fog_v2` stem, and only an
  export of that version sweeps it.
* Unchanged: T17/T19/T25/T27/T28, P5–P7, and the lane-4 teardown flake.

## 2026-10-08 (fifth) — the teardown flake is fixed, not retried

The lane-4/lane-5 `EnvironmentTeardownError: [vitest-worker]: Closing rpc while
"onUserConsoleLog" was pending` that had been recorded as a "harness flake"
(previous entries) finally blocked a push, so it was diagnosed instead of
retried: the DOM suites stream thousands of React `act()` warnings, and while
one of those `onUserConsoleLog` messages is in flight a worker teardown makes
vitest exit non-zero on an otherwise green run.

**Fix:** `vitest.config.ts` sets `silent: "passed-only"` — a passing test's
console output is not streamed, a failing one still prints everything. Measured
on this tree: the coverage run's log fell from **42,618 lines to 744**, `act()`
warnings streamed went to **zero**, coverage numbers are unchanged
(95.76|89.3|96.83|97.76), and three consecutive `npx vitest run --coverage` runs
all exited **0** (the failure had been intermittent — roughly one heavy run in
three). `CODE_VERIFICATION.md` §5 explains the setting and how to debug with
`console.log` anyway.

### Gates (full run)

| Lane | Result | Numbers |
| --- | --- | --- |
| 1/6 types | ✅ | clean |
| 2/6 lint | ✅ | 0 errors, 9 legacy warnings |
| 3/6 quality gate (changed) | ✅ | `GATE PASSED` |
| 4/6 tests | ✅ | **129 files / 1398 tests** |
| 5/6 tests + coverage | ✅ | statements **95.76 %**, branches **89.3 %**, functions 96.83 %, lines 97.76 %; log 744 lines |
| 6/6 build | ✅ | single-file bundle, no size regression |

### Known debt carried

* Unchanged: T17/T19/T25/T27/T28, P5–P7, the version-stem sweep note above, and
  a `fog_AI_v2.*` leftover that only an export of that version removes.

## 2026-10-08 — exact stroke width: every transform baked into the geometry, the px setting written verbatim

The user set a stroke width of 2 and the shipped file read
`stroke-width="2.6224000000000003"`. Two faults, both real (design:
`docs/archive/2026-10-08-stroke-width-exact/design.md`): the width was
finalised in LOCAL units under the artwork's and the artboard's transforms,
and SVGO's `applyTransforms` re-multiplied it with raw float arithmetic when it
baked those transforms into the path (`2.384 × 1.1`); and the setting was in
pt while the user — rightly, for a stock file — thinks in the file's px.

The fix is structural, not a rounding pass: prepare now bakes `artboard × CTM`
into every shape's coordinates (`lib/upload/bake.ts`), so the file has no
`transform` and SVGO has nothing to re-multiply, and the stroke width is
written AFTER that, verbatim (`strokePx: 2` → `stroke-width="2"`). The
previous entry's "fewest decimals within 10 %" rule is deleted with its tests
— superseded, no caller. The one lesson worth the record: **a number written
under a transform is never the number the reader sees** — finish the geometry
first, then write the numbers.

### Structure work (RULE 3/18/19)

| File | Was | Now |
| --- | --- | --- |
| `src/lib/upload/epspath.ts` | 243 lines, the full path grammar welded to PostScript text | 33 lines — only the PostScript writer; the grammar is **`src/lib/upload/geom/outline.ts`** (269 lines, reason comment: one grammar table with its handlers), the ONE outline model the bake and the EPS share (a circle is now the same four-cubic split as an ellipse — one pinned EPS expectation changed, with the reason) |
| `src/lib/upload/geom/bakeshape.ts` | — | 94 lines — which element survives which matrix (`isAxisAligned`, `isUniform`, the per-shape attribute bakers as a table) |
| `src/lib/upload/bake.ts` | — | 110 lines — the walk, the named refusals before the tree is touched, widths/dashes following their geometry |
| `src/lib/upload/prepare.ts` | wrapper `<g transform>` + width ÷ CTM scale | 202 lines — bake → restyle (verbatim) → viewBox + background; no wrapper group |
| `src/lib/upload/geom.ts` | `ptToPx`/`pxToPt` | gone — no caller; a SOURCE length in pt is still read at 96 DPI |

### Gates (full run)

| Lane | Result | Numbers |
| --- | --- | --- |
| 1/6 types | ✅ | 9.8 s |
| 2/6 lint | ✅ | 0 errors, 10 pre-existing warnings (unchanged set) |
| 3/6 quality gate (changed) | ✅ | `GATE PASSED` |
| 4/6 tests | ✅ | **131 files / 1452 tests** (was 1422): `upload_outline` (10), `upload_bake` (15), the prepare suite rewritten for the new contract, one export test through SVGO pinning the SHIPPED text (`stroke-width="2"`, no `transform=`) |
| 5/6 tests + coverage | ✅ | statements **96.08 %**, branches **89.54 %** |
| 6/6 build | ✅ | `dist/index.html` 1,416 kB |

### Known debt carried

* Deliberate narrowing (design D6): a stroked shape under a non-uniform or
  skewed transform, a rotated rounded rect, `userSpaceOnUse` paint servers and
  clipPath/mask/filter/pattern now refuse by name where they exported before.
  Composing `gradientTransform` is the follow-up if a real icon hits it.
* Two of the previous entry's export tests referenced the pre-merge package
  name (`STEM`) and failed on the merged baseline; fixed in passing (`ART`).
* The SVGO `removeTitle`/`removeViewBox` stderr line in `upload_runexport`
  and `upload_eps` predates both entries; the optimizer config still deserves
  one look, not this commit.

## 2026-10-08 — one global stroke definition (`fix(upload)`)

The stock reviewer's second file: `<svg stroke="#111"><g stroke="#000"
stroke-width=".8">` with every `<path>` carrying its own `stroke-width`. The
previous entry wrote the width verbatim onto every visible stroke and left
the colour where the artwork had it; SVGO then hoisted the identical widths
onto the group and kept the source root's `#111`. The rule now: each stroke
property is defined ONCE — `lib/upload/strokeglobal.ts` (49 lines) hoists
`stroke`/`stroke-width` onto the root when every visibly stroked shape
agrees, strips it from everything else (attributes and inline styles), and
gives the shapes that do not stroke `stroke="none"` so the root's paint
cannot reach them; disagreement means explicit per stroked shape and bare
containers; nothing stroked means nothing written. The default stroke
colour becomes `#000000` (the fingerprint moves once; `artwork` stays
selectable). Lesson: **a property the reader sees once is a property the
file states once** — SVGO can only tidy what it is given.

### Structure work (RULE 3/18/19)

* `Stroke.paint` joined the resolved stroke (`geom/stroke.ts`, 75 lines);
  `stripStyleKeys`/`keyOf` moved there from `prepare.ts` (193 lines) so the
  restyle and the unify passes share one inline-style eraser.
* `tests/upload_strokeglobal.test.ts` (9), the two stroke describes in
  `upload_prepare` rewritten around a `where(root, attr)` → `tag=value`
  helper, one new SHIPPED-text test in `upload_runexport`.

### Gates (full run)

`npm run verify`: types, lint, quality (changed) GATE PASSED, 132 files /
1465 tests, coverage (`strokeglobal.ts` 100 %), build 1,417 kB — ALL LANES
PASSED. RULE 16: every new function ≤ 30 lines / ≤ 4 params; RULE 18: no
file grew past its band.

### Known debt carried

* Unchanged from the previous entry (bake refusals, the SVGO
  `removeTitle`/`removeViewBox` stderr line).
* `artwork` colour over a mixed-paint source cannot ship one global colour
  by definition — it ships one per stroked shape; the stock rule is met by
  the default, not by that mode.

## 2026-10-08 — one clean phrase: metadata title and description (`fix(upload)`)

The stock reviewer's file still read `<title>Collaborative Unity Promoting
Collective Social Empathy. Icon of charity and community.</title>`. The item-5
rule (`cleanTitle`) only stripped a TRAILING period; the model's second
sentence, its Title Case and — in a file exported before that rule — the
period itself all survived. The field hint even asked for "two sentences".
Now `cleanPhrase` (`lib/upload/meta.ts`, 175 lines, 100 % covered) makes
the title and the description ONE phrase each: cut at the first sentence
break, end punctuation gone, sentence case; `cleanMetadata` applies it to
both fields at the three gates (parse, cache read, Accept), the prompt and
the hints ask for it, and the shipped `<title>`/`<dc:title>`/`<desc>` are
pinned in `upload_runexport`. Lesson: **a rule about the shape of a text
must describe the whole shape** — "no trailing period" said nothing about
the sentence in front of it.

### Structure work (RULE 3/18/19)

* Merged with the parallel `title-one-phrase` commit (`92513f1`): its fourth
  gate (`metaFromRecord`, now `cleanMetadata`) and prompt line kept, its
  title-only cleaner replaced.
* `cleanTitle` deleted — one name, one rule, both fields; the test fixture
  title that was itself two sentences ("… of growth. Speed and growth
  pictogram") became one phrase in every upload test.
* Field hints no longer state a policy the validator never had
  ("two sentences: 5–7 words, then 3–5 words", "7–15 words").

### Gates (full run)

`npm run verify`: types, lint, quality (changed) GATE PASSED, 132 files /
1475 tests, coverage, build — ALL LANES PASSED. RULE 16: `cleanPhrase` 5
lines, 1 param; RULE 18: `meta.ts` 175 lines.

### Known debt carried

* Unchanged from the previous entry.
* The sentence-break heuristic needs a word of 2+ letters before the
  punctuation, so "plan B. Next" would not be cut — the prompt forbids a
  second sentence anyway; revisit only if the field shows it.

## 2026-10-08 — Generate SVG: the run outlives the tab, the next attempt, the pinned list (`feat(svg)`)

Four findings on one screen, one cause each (measured, not guessed): a tab
switch UNMOUNTED `SvgPanel` (the run and its queue died with it); Regenerate
APPENDED a batch (the bad image came last); a landing SVG re-sorted the list
(`date` sort on `item-saved`) while the strip and the queue were inserted
ABOVE it (the header walked away); a waiting source looked like nothing was
planned for it. Now: the Workbench parks the panel `hidden` and never unmounts
it (I-57); `SvgRunPopup` on every tab says "N done · M left" from the ONE
arithmetic in `runtotals.ts`, one count across the whole queue chain; a row's
Regenerate while busy is the NEXT attempt — first in the queue, no dialog, the
image removed from every later batch (I-53); the visible order is pinned and
refreshed only by a scan, a sort or a return to the tab, and the run record
sits below the list (I-58). Lesson: **a queue the user cannot see is not a
queue** — the grey "Next attempt" badge is derived from the queue every render,
so dropping a batch restores nothing because nothing was written.

### Structure work (RULE 3/18/19)

* New files, each one responsibility: `runtotals.ts` (76 lines: totals, line,
  chain), `RunRecord.tsx` (29), `SvgRunPopup.tsx` (39). `SvgPanel.tsx` gave the
  strip + queue to `RunRecord` and took `useActivation` (286 lines);
  `Workbench.tsx` extracted `Panels` when `Shell` hit 31 lines (RULE 16 caught
  it: `quality_base` went red on the working tree).
* `enqueueBatch` returns `{ waiting, removedFrom }`; `dropIdFrom` takes one
  `Replan` callback (requests AND label — the first cut re-planned the count
  and kept the stale label, the UI test found it). Helpers stay ≤ 4 params.
* The render-observed tally was abandoned: React batches the hand-over from
  one run to the next, so the popup never saw run 1's final render. The chain
  is now a model fact (`model.chain`) written by `drainQueue` from the run
  summary's outcomes — data, not timing.
* `batch-start.runId` added because batch ids (`batch_1_1`) repeat per run; a
  reader keyed on them confused two runs.

### Gates (full run)

`npm run verify`: types, lint (0 errors), quality (changed) GATE PASSED, 133
files / 1505 tests, coverage (lines 98 %), build — PASS. One full run showed a
pre-existing teardown flake in `selectionv2_ui` ("window is not defined" from a
late scheduler tick; that file mounts no Workbench, is green 3× alone and in
the two other full runs). RULE 16: every new fn ≤ 30 lines, ≤ 4 params; RULE 18:
largest touched files `runbatch.ts` 298, `SvgPanel.tsx` 286, `actions.ts` 285.

### Known debt carried

* Unchanged from the previous entry.
* `src/svg/` has 53 files (RULE 18 ideal 5–15 per directory): a grouping
  into `run/`, `list/`, `ui/` is due but is its own change.
* The popup does not yet survive a page reload (the queue is session-only by
  I-53, so there is nothing to count after one).

## 2026-10-08 — SVG to upload: Download all (`feat(upload)`)

The user wanted the selection's prepared files in ONE folder instead of N
`export/` folders. The button reads `⤓ Download all (N files)` — the count
comes from the same pure planner (`lib/upload/download.ts`) that decides the
names, so what the button promises is what the copy writes. The destination
is the browser's folder dialog; the copy is `writeFileNew` (a name already
there is kept and said), read back and compared, one file isolated from the
next; the result is one line in the toast and in the log (`downloaded`, the
seventh closed-set action). Lesson: **a fixture must obey the record's own
assumptions** — the first UI fixture put two pairs in one folder, so both rows
read one `export.json` (the SOR's "one icon per export folder" note); the
fixture was wrong, not the feature.

### Structure work (RULE 3/18/19)

* New files, one responsibility each: `lib/upload/download.ts` (planner +
  line, 103 lines, pure), `upload/downloadactions.ts` (I/O, 96 lines).
* `UploadBulkBar.BulkRight` hit 34 lines with the fifth button → `BulkActions`
  extracted by concept (the ratchet caught it on `quality:changed`).
* No new fs primitive: `pickDirectory`, `nameExists`, `writeFileNew`,
  `readBytesAt` were enough.

### Gates (full run)

`npm run verify`: types, lint (0 errors), quality (changed) GATE PASSED, 135
files / 1512 tests, coverage, build — ALL LANES PASSED. RULE 16: every new fn
≤ 30 lines, ≤ 4 params; RULE 18: largest touched file `UploadPanel.tsx` 254.

### Known debt carried

* Unchanged from the previous entry.
* The destination is flat; a per-icon subfolder option was not asked for.

## 2026-10-08 — fix(eps): rounded `<rect>` as an exact outline

* RULE 16 gates: `npx tsc --noEmit` clean; `npm run lint` 0 errors (10 pre-existing warnings, none in touched files); `npm run quality:changed` GATE PASSED — `roundedRectOutline` first failed params 6/4 → takes a `box` object; `outline.ts` first hit 303 lines → split into `geom/ops.ts` (primitives, 27 lines) + `geom/shapes.ts` (basic-shape builders, 87 lines), `outline.ts` now 211 (ideal-size tag dropped: it is well under the 300 default).
* RULE 18: no new directory debt (`src/lib/upload/geom/` 10 files). `src/svg/` 53-file debt unchanged.
* Tests: 5 red → green at the geometry/EPS layer, 7 red → green at the pipeline/row/log/UI layer; `tests/helpers/uploadpackage.ts` extracted from `upload_download_ui` so the new `upload_epsnote_ui` shares the package fixture (one pair per folder).

## 2026-10-08 — fix(meta): keep every sentence, strip only the final period

* User correction: the clean pass must not cut a second sentence. `cleanPhrase` now keeps the whole text; `sentenceCase` extracted (per-sentence first letter up) so the function stays ≤ 30 lines; `SENTENCE_BREAK` narrowed to `.`/`!`/`?` (a `;`/ellipsis no longer starts a "sentence" and so no longer capitalises the next word); `CAPITALISED` allows trailing punctuation so `Empathy.` lowers like `Empathy`.
* RULE 16 gates: `npx tsc --noEmit` clean; `npm run lint` 0 errors; `npm run quality:changed` GATE PASSED; `npm run verify` ALL LANES PASSED. RULE 18: no size change of note (`meta.ts` +6 lines).
* Also in this commit: `tests/quality_base.test.ts` "shallow-clone honesty" expected the fetch hint whenever the repo is shallow; after a `git fetch` a shallow sandbox DOES have a merge-base with `origin/main`, so the gate (correctly) prints none. The test now expects the hint only when shallow AND no merge-base — the tool is unchanged.

## 2026-10-09 — feat(upload): EPS converter registry, Inkscape client, expand-strokes setting (commit A of the design)

* TDD: red first — `tests/upload_epsconv.test.ts` (registry, built-in wrapper, Inkscape probe/convert/failure mapping, bridge config), new describes in `upload_settings`/`upload_export`/`upload_runexport`, `tests/upload_eps_settings_ui.test.tsx` (drop list, helper row states, expand toggle, row line) — then green.
* Gate split: the commit/validate gate is now `verifyEpsDocument` (converter-neutral; Inkscape's cairo EPS has no EPS 10 markers); `verifyEps` stays the built-in writer's strict contract. Pinned in `upload_eps.test.ts`.
* RULE 16 gates: `npx tsc --noEmit` clean; `npm run lint` 0 errors (the one new CC warning — `assembleRecord` 13 — removed by extracting `fillToolBlocks`); `npm run quality:changed` GATE PASSED after two RULE 18 splits: `export.ts` 313 → 202 (`exportplan.ts` 117, the stage planner) and `runexport.ts` 306 → ~280 (`exportrecord.ts` 48, the record blocks); `npm run verify` ALL LANES PASSED. RULE 18: new files 27–117 lines; `UploadEpsSettings.tsx` 73; `src/upload/` grows by 2 files (debt noted).
* `tests/upload_ui.test.tsx` pinned "10 fields overridden" → 12 (the two new settings fields); the settings fingerprint of the defaults is unchanged (`expandStrokes` is appended only when on).

## 2026-10-09 — feat(bridge): the Inkscape EPS helper, its launchers and the pre-batch probe (commit B of the design)

* TDD: red first — `tests/bridge_inkscape.test.ts` (node env; spawns the REAL `tools/bridge/server.mjs` against `tests/helpers/fakeinkscape.mjs`: health live/found:false, convert + version header + temp cleanup, 502/504/499/413/400/404, CORS/PNA, `dist/` at `/`) and the pre-batch probe toast in `upload_eps_settings_ui.test.tsx` — then green.
* RULE 16 by hand (tools/ is outside the gate's measurement): `server.mjs` ~170 lines, `inkscape.mjs` ~115, every function ≤ 30 lines, ≤ 4 params (options objects), nesting ≤ 3. `src/` changes: `exportactions.ts` +28 (`probeEpsNote`, `browserConverterDeps`, `finishBatch` — the gate caught `runExportBatch` at 31 lines, split in RULE 19 order), `uploadlog.ts` +2. `eslint.config.js`: Node timer globals + `tests/helpers/*.mjs` under the Node block.
* Gates: `npx tsc --noEmit` clean; `npm run lint` 0 errors; `npm run quality:changed` GATE PASSED; `npm run verify` ALL LANES PASSED.
* Honesty: the 413 path answers before the body is consumed (`connection: close`) so the client sees a status, not a dropped socket — found by the test, fixed in the helper, not the test.

## 2026-10-09 — feat(upload): Expand strokes to fills — the built-in geometry expander (commit C of the design)

* TDD: red first — `tests/upload_expand_geom.test.ts` (pinned butt rectangle, caps, miter/limit/round/bevel, ring, circle annulus, S-curve offset error, zero-length dots), `tests/upload_expand_dash.test.ts` (arc length, de Casteljau split at a length, SVG pattern rules, pieces, the wrapping dash), `tests/upload_expand.test.ts` (the real prepare pass, refusals, the `expandStrokes:false` equivalence gate), one end-to-end run in `upload_runexport` — then green. Test helper `tests/helpers/outlinemath.ts` (winding, filled area, offset distance).
* Test corrections made FOR honesty, not convenience: the shoelace area of a ring counts the pivot's corner loops twice (winding 2) — the assertion moved to the nonzero-sampled `filledArea`; a KAPPA quarter is not an arc (2e-4 relative length, 0.027 % radial) — thresholds say so; a closed dashed circle's "on" length includes the wrapping dash.
* RULE 16 gates: `npx tsc --noEmit` clean; `npm run lint` 0 errors (the gate caught `sideOps` CC 12 → `cornerAt` + `segOp` extracted; `normalizeDash` CC 11 → `dashValues` extracted); `npm run quality:changed` GATE PASSED; `npm run verify` ALL LANES PASSED. RULE 18: seven new files 36–119 lines (ideals ~110–150 met), `prepare.ts` +4.
* RULE 18 directory note: `src/lib/upload/` now holds `geom/expand/` (6 files) and `epsconv/` (5 files) as their own concept folders; `src/svg/` (53 files) remains the recorded debt.

## 2026-10-09 — fix(ui): the Full path row no longer glues a previous root onto a new pick (I-59)

* TDD: red first — `tests/knownroots.test.ts` (`provenOutside`: veto only on a definite `resolve() === null` under a known path; sibling prefix, containing root, no-resolve/throw/no-path all false), `tests/pickroot.test.ts` (the reported `…\export\test_process_3` refused; the app's own copy never completed, adopted when exact), `tests/rootcapture.test.ts` (`Rescan` replaces a `completed` guess, keeps it otherwise), `tests/upload_ui.test.tsx` (end to end in the reporting tab; the red run printed the exact path from the screenshot) — then green.
* RULE 16 gates: `npx tsc --noEmit` clean; `npm run lint` 0 errors (11 warnings, all pre-existing — same count on HEAD); `npm run quality:changed` GATE PASSED (`knownroots.ts` 13 fns/101, `pickroot.ts` 7 fns/121, `rootcapture.ts` 9 fns/87, `copypath.ts` 2 fns/33, `actions.ts` 31 fns/292); every new fn ≤ 30 lines, ≤ 2 params, CC ≤ 4.
* RULE 18: no new source file; largest touched `src/upload/actions.ts` 291 lines (baseline file, +6). `src/svg/` directory debt unchanged.
* Honesty: the completion is still offered (flagged) when nothing contradicts it — the one case it serves (first pick with the parent copied) keeps working; nothing is stored before the answer is settled.

## 2026-10-09 — fix(ui): no completed path at all — a stored guess reads as nothing (I-59, round 2)

* Second report the same day: the stored guess (localStorage, older build) became the BASE of a derivation (`<guess>\\_split_output`, labelled `copied`). Root cause of both rounds: a guess treated as a capture. Fix: the completion is removed (exact leaf or nothing); `{how:"completed"}` reads as no path; `knownroots.nameKnownRoot` hands late captures to the registry. Removed: `provenOutside`, `lastCopiedByApp`, `believable`, the `completed — check it` state/toast, `saveRootPathInfo`'s `how` parameter, `looksLikeFile`.
* TDD: red first — `rootpath`, `clipboardpath`, `folderbar`, `pickroot` (the second report at unit level), `knownroots`, `rootcapture`, `upload_ui` (both reports end to end; 10 red → green). Tests that pinned the completion were CHANGED to pin its absence (the behaviour was the defect).
* RULE 16 gates: `npx tsc --noEmit` clean; `npm run lint` 0 errors (11 pre-existing warnings); `npm run quality:changed` GATE PASSED (`rootpath.ts` 23 fns/220, `knownroots.ts` 11/85, `pickroot.ts` 6/98, `rootcapture.ts` 8/84, `copypath.ts` 1/20, `FolderBar.tsx` 5/71). RULE 18: every touched file SHRANK (−16 … −4 lines); no new file.
* Honesty: no migration rewrites storage — the guess is simply not believed when read; the row then names the way out (Ctrl+Shift+C → Rescan, or Ctrl+V).

## 2026-10-09 — fix(upload): the built-in EPS is an executable PostScript program (I-61, commit A)

* TDD: red first — `tests/upload_epscheck.test.ts` (the reported `concat` typecheck, arity/type per operator, path-before-paint, gsave balance, first-error semantics), `tests/upload_eps.test.ts` (the pinned bare-number line CHANGED to the array form — the old assertion had enshrined the defect; fill-inside-gsave then stroke; unpainted shape emits nothing; `verifyEps` rejects the bare concat by line), `tests/helpers/psrun.ts` (executes the subset, painted extent inside `%%HiResBoundingBox`), `tests/upload_runexport.test.ts` (the committed EPS runs), `tests/upload_epsconv.test.ts` (the converter verifies its own output) — then green.
* RULE 16 gates: `npx tsc --noEmit` clean; `npm run lint` 0 errors (11 pre-existing warnings — the gate caught `checkPostScript` CC 11 and `apply` CC 12 → `runLine`/`atEnd`/`plural` extracted and an `EFFECTS` table replaced the if-chain); `npm run quality:changed` GATE PASSED (`epscheck.ts` 23 fns/136 lines). RULE 18: new file 136 lines; `eps.ts` 299 (+1), `epsdoc.ts` 114 (+1), `builtin.ts` 26.
* Honesty: the check stops at the first error like the interpreter; it judges the built-in writer's output only (Inkscape's cairo PostScript is outside its vocabulary and keeps the neutral gate).

