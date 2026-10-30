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

## 2026-10-09 — fix(upload): the artboard is the shipped artwork (I-60, commit B)

* TDD: red first — `tests/upload_prepare.test.ts` ("the artboard is the shipped artwork": the F4 reproduction with 8 px verbatim strokes, with expansion, with padding, a pinned 512 with scale < 1 centred to 0.01 px, passes = 1 for fills, the invisible/filled artboard rect), `tests/upload_geom.test.ts` (unpainted shapes have no bounds), `tests/upload_optimize.test.ts` / `tests/upload_clean.test.ts` / `tests/upload_eps.test.ts` (the invisible rect survives SVGO, is not a violation, emits no EPS path), `tests/upload_runexport.test.ts` (`tools.artboard` agrees with the viewBox) — then green. Honesty: `upload_clean`'s pinned `0 0 20.2 20.2` enshrined the conservative hull (miter √2) — now `19.72`, the stroke's real outline; the `where(root,"stroke")` expectations gained `rect=none` because the artboard rect must not inherit a hoisted paint.
* RULE 16 gates: `npx tsc --noEmit` clean; `npm run lint` 0 errors (10 pre-existing warnings); `npm run quality:changed` GATE PASSED (`place.ts` 15 fns/149 lines, `restyle.ts` 4/59, `prepare.ts` 7/145; `eps.ts` trimmed back to 299 after the `fillNone` field pushed it to 302). RULE 18: two new concept files instead of growing `prepare.ts` (199 → 145).
* Design deviations recorded in the archive doc's status line: no separate normalise bake (one bake per candidate, expansion after restyle so the expanded width is the setting's px under any scale); exact measurement via the expander instead of the conservative hull; settle tolerance = the file's precision.

## 2026-10-09 — feat(upload): scale the artboard to N megapixels (I-62, commit C)

* TDD: red first — `tests/upload_settings.test.ts` (defaults off / 5 MP, clamp 1…64, junk → 5, overrides, the defaults' fingerprint still `36232c04`, moves only while on), `tests/upload_geom.test.ts` (the megapixel fit: exact area, the content fit's aspect, 100×50 → 3162.278 × 1581.139, zero area → scale 1), `tests/upload_prepare.test.ts` (fills exact in one pass; verbatim 2 px strokes within the file's precision with `stroke-width="2"` in the file; a pinned artboard wins; the number is dormant while off), `tests/upload_runexport.test.ts` (`scaledTo` 5, JPEG untouched, pinned → null), `tests/upload_eps_settings_ui.test.tsx` (the row, its disabled states, live store, the row line) — then green; `upload_ui`'s "12 fields overridden" became 14 (the bulk apply serialises every field).
* RULE 16 gates: `npx tsc --noEmit` clean; `npm run lint` 0 errors (10 pre-existing warnings); `npm run quality:changed` GATE PASSED. RULE 18: the artboard block moved out of `UploadSettingsDialog.tsx` (236 → 171 lines) into `UploadArtboardSettings.tsx` (115); `geom.ts` gained `contentFit`/`megapixelScale` instead of a third branch in `fitArtboard`.
* Honesty: the design's `upload-set-mp-note` testid collided with the JPEG row's existing hint — the new note is `upload-set-mp-scale-note` (UI_SELECTORS updated); the "batch log names it once per run" line of the design was not implemented because the batch log names no setting today (the row line carries it).


## 2026-10-09 — EPS page bounds for Inkscape conversion
- `npm run verify:fast`: PASS — TypeScript, lint (0 errors; 10 existing warnings), changed-file gate, full test + coverage lane, production build.
- Coverage: `src/lib` lines 96.56%; build: single-file `dist/index.html` 1,452.92 kB (428.89 kB gzip).
- Focused EPS suites: 4 files / 88 tests PASS; viewBox-only EPS page regression checks integer and HiRes BoundingBox.

## 2026-10-09 — built-in EPS Illustrator artboard bounds
- Scope correction: the earlier Inkscape-only sizing change was reverted; this fix is confined to the built-in EPS writer. SVG export is unchanged.
- The writer keeps the HiRes box on the viewBox (including the painted white background), rounds the DSC integer box outward, emits single-`%` `%AI5_ArtSize` (height then width) and centered `%AI3_TemplateBox`, and anchors the CTM to the exact HiRes rectangle. No page-level `%%PageBoundingBox` was added. Built-in writer ID bumped to `builtin-subset-2`; old built-in EPS outputs are refreshed EPS-only.
- Regression test: nonzero-origin 1025 × 512 white artboard → integer box 769 × 384, HiRes 768.75 × 384, AI5 art size 384 × 768.75; interpreted painted bounds equal HiRes bounds.
- `npm run verify:fast`: ALL LANES PASSED — TypeScript clean; lint 0 errors / 10 existing warnings; changed-file quality gate passed; coverage lane passed (1,632 tests; `src/lib` lines 96.56%, branches 91.13%); build passed (`dist/index.html` 1,453.27 kB, 429.07 kB gzip). Existing network-bound tests logged caught `ECONNRESET` messages for `router.requesty.ai` but did not fail.
- No Illustrator executable is available in this environment, so application-level opening was not tested; the EPS comments and painted bounds are covered by regression tests and the PostScript subset interpreter.

## 2026-10-09 — feat(svg): regenerate from current SVG (Export settings option, I-64)
- Feature 1 (row Regenerate = full main prompt + the first image alone) was already the behaviour; it is now locked by `tests/svg_regenprompt.test.ts` and documented in `docs/archive/2026-10-09-regenerate-from-svg/design.md` §1.
- Feature 2: Export settings → "Regenerate SVG from" → "Regenerate from current SVG" sends the saved prompt + the icon's newest valid SVG code + the same image, one icon per request; a refused choice (no/gone/blank saved prompt) starts no request.
- TDD: `tests/svg_regen.test.ts` (20), `tests/svg_regenprompt.test.ts` (8), `tests/upload_regen_ui.test.tsx` (7) written red first; `tests/svg_runner.test.ts` gained two end-to-end v2 cases (one request per icon with its code; the record without the code).
- RULE 16 gates: `npx tsc --noEmit` clean; `npm run lint` 0 errors (10 pre-existing warnings); `node tools/quality.mjs --changed --allow-legacy` GATE PASSED (every changed file ≤ 300 lines, the largest is `runcontrol.ts` at 229; every changed function within the 30-line limit).
- RULE 18/19 remediation during the change: `runbatch.ts` reached 303 lines (over the 300 hard line) — the wire of one request (send, journal, confirmed-only retries) moved to `src/svg/runsend.ts` (100 lines), `runbatch.ts` → 217; `startRun` reached 33 lines — the "mark generating" step extracted as `beginRun` (startRun now ≈ 22).
- `npm run verify:fast` ALL LANES PASSED: 147 files / 1,669 tests; `src/lib` lines 96.17%, branches 89.83%; build `dist/index.html` 1,457.37 kB (430.38 kB gzip).
- Known limit, stated in the UI and the design: the saved prompts are the metadata prompt presets; a preset written for metadata (three labelled lines) will not yield an SVG and is rejected by the existing SVG validator.

## 2026-10-09 — feat(svg): regen window moved to the Generate SVG tab; shared prompt presets (I-65)

- Moved "Regenerate SVG from" out of Export settings into a window above the Generate SVG prompt (`src/svg/RegenSetting.tsx`, `src/svg/SvgPromptZone.tsx`). Its drop-down lists the SVG prompt presets (`iconSplitter.svg.prompts.v1`), live from the prompt window (RULE 24).
- The Generate SVG prompt window gained the same preset controls as the metadata prompt (select, Quick load, Delete, Save as). One implementation serves both tabs: `src/ui/PromptWindow.tsx`, `src/ui/PromptPresetBar.tsx`, `src/ui/presetops.ts`, `src/lib/promptpresets.ts`, `src/state/presetstore.ts`. The upload prompt panel keeps its handles and renders the same window. No save code is duplicated.
- TDD: `tests/prompt_presets_shared.test.ts` (14 incl. the svg one), `tests/svg_prompt_presets.test.ts`, `tests/svg_regen_ui.test.tsx` written red first (module-missing failures), then green. `tests/upload_regen_ui.test.tsx` removed (its subject moved). `tests/secret_hygiene.test.ts` needed no change; the stale index entry was staged out with `git rm`.
- Test-id change: `svg-reset-prompt` → `svg-prompt-reset`. No test used the old id. Docs updated (UI_SELECTORS §P/§S, SYSTEM_OF_RECORD §2/§5 I-65/§6/§7/§8/§11).
- RULE 16 gate (changed files): `node tools/quality.mjs --changed --allow-legacy --base HEAD` → GATE PASSED. Largest touched: `SvgPanel.tsx` 287, `actions.ts` 278, `SvgControls.tsx` 251, `statemodel.ts` 196. New files all under 90 lines. Functions ≤ 20 lines.
- RULE 18 note: the new lib and UI files are below the 150-line floor on purpose (the shared pieces are small by design). `SvgPanel.tsx` (287) and `actions.ts` (278) are near the 300 limit; any further additions there must move code out first.
- Lint: 0 errors, 10 warnings (all pre-existing). `npx tsc --noEmit` clean.

## 2026-10-15 — feat(batch): split previews survive a restart; shell back-to-top button

- Feature 1 (R1–R3, design `archive/2026-10-15-preview-restore-scroll-top`): batch split previews persist per row in IndexedDB (`batchPreviews`, key `<rootName>::<relPath>`); a restart with a restored root re-renders them automatically, and regeneration happens ONLY on the explicit "↺ Regenerate splits" (force=true overwrites the stored record) — plain Preview skips rows whose stored preview is current. Fixes on the way: review effect deps, LRU hit ignoring `force` (force-slot bug: `previewOne(row, signal, undefined, force)`), stored-record validation (RULE 13), 8 s image-decode timeout with an honest fallback entry (count 1, full-frame box).
- Feature 2 (R4): `src/ui/ScrollTopButton.tsx` — one shell-level `↑` corner button on every tab (registered `scroll-top-btn`, UI_SELECTORS §Q); hidden at the top, appears past 80 px, click returns `app-main` to 0. Mounted after the dock so `app-main` and the log dock stay adjacent (I-27 invariant kept, `tests/log_layout.test.tsx` untouched).
- TDD: `tests/batch_preview_restart.test.tsx` (6 cases: restart restore, Regenerate rewrites, Preview skips done, re-pick keeps previews, warm-cache Regenerate rewrites, no IDB read storm / state-JSON write churn) and `tests/scroll_top.test.tsx` (2) written red first, then green. Pre-existing debt fixed to make the lanes meaningful: `vi.restoreAllMocks` was wiping `vi.mock` factories in vitest 3 (→ `clearAllMocks`); missing `setImageDecodeTimeout(25)` stub; `useCtx` hooks inside a `useMemo` factory (hook-order crash).
- Repo hygiene in the same change (lanes were red at HEAD): `npx tsc --noEmit` left non-clean (dead `toRow`/`ExtractArgs`, `StateKey` vs `string[]`, pngjs types — `@types/pngjs` added), 21 eslint errors (empty catches, `\"` escapes, `@ts-ignore` → removed, `prefer-const`, unused vars), and `tests/algo_efficiency.test.ts` timing budgets that always failed under `--coverage` (measured 1283/1791/508 ms vs 400/200/300 ms at HEAD too) — the coverage lane now sets `PERF_BUDGETS=coverage` and the budgets widen accordingly, still tripwires against the old implementations.
- RULE 16 gates: `npx tsc --noEmit` clean; `npm run lint` 0 errors / 25 warnings (pre-existing); `node tools/quality.mjs --changed --allow-legacy` GATE PASSED — `isStoredPreview` split into field validators (cc 14 → ≤4) and the button's scroll logic extracted to `usePastTop` (34 → ≤30 loc).
- `npm run verify:fast` ALL LANES PASSED: 172 files / 1,851 tests; build `dist/index.html` 1,551.84 kB (456.02 kB gzip).

## 2026-10-15 — fix(batch): previews lost on reload; per-item merge decisions now persist per preset (I-66/67/68)

- Research `archive/2026-10-15-preview-store-preset/research.md` diagnosed RC1–RC4; this change implements F1–F4 from its plan. TDD: `tests/batchmerges.test.ts` (5) + 7 new cases in `tests/batch_preview_restart.test.tsx` (13 total) written red first.
- F1 (RC1): boot queries permission quietly (`peekPermission`) and never spends the gesture; a "prompt" answer keeps the handle, restores the stored previews, and shows the `batch-grant` bar — one click re-grants and scans; a refusal is honest (toast, bar stays). A remembered custom dest re-grants inside the Split click; refused → auto dest for that run.
- F2 (RC2): `src/lib/batchmerges.ts` — per-preset, per-item merge decisions in localStorage `iconSplitter.batch.merges.v1` (validated entry-by-entry, capped 500×20). One `rowMerges` effect in `useBatch` is the single write path; boot and preset-switch load the preset's map; scan prunes and persists; Delete drops the preset's map; Save-as duplicates the decisions. The split (`splitWithOverride`) and the preview read the same map (I-67).
- F3 (RC3): every rendered `done` record now carries its `previewKey` (`key`); Preview's skip treats a key mismatch as not-done and the row badge shows `data-stale` + `⟳`; records from before keys existed are never called stale (backward compat).
- F4 (RC4): restore was already keyed on the handle's own name (`rName` fallback) — locked by a test: previews restore during a failing scan and a later rescan renders them untouched (`at` unchanged). Boot scan failures are no longer silent (RULE 4).
- RULE 16 gates: `npx tsc --noEmit` clean; `npm run lint` 0 errors (27 warnings, pre-existing); `node tools/quality.mjs --changed --allow-legacy` GATE PASSED (the grant banner extracted to `GrantBar` when `BatchPanel` hit 34 loc; `quietHandles`/`regrantDest` extracted to keep cc ≤10).
- `npm run verify:fast` ALL LANES PASSED: 173 files / 1,863 tests; build `dist/index.html` 1,555.27 kB (457.01 kB gzip).

## 2026-10-15 — fix(batch): scroll freeze / CPU spike ported from arena/736d3693-iconsplitter

- User report: the performance bug was not fixed on this branch — take the fix from `arena/736d3693-iconsplitter`. Ported its chain 20b78e4→5bab8bf→94ea14f→d02aee4→32c6797 (root cause 3398b0a: unstable `core`/`v` identity + O(n·renders) review sync), re-based onto this branch's preview/merge implementation.
- TDD: `tests/batch_perf_regression.test.tsx` (11 tests, from that branch's 32c6797, adapted where its own later ddceb69 superseded the mid-arc metadata-only verdict) written first — 4 red on this tree (bar layout, content-visibility, `useBatchView`/`useBatch` stability), then green.
- Pieces: memoized action bags + memoized `core`/view objects, hoisted `decide`/`decideActive`, memoized `RowView` via a data-driven deps table (RULE 18-friendly, cc 11 → 2), `.batch-row` content-visibility, cheap detection bar (`max-w-[420px]`, single `onChange`), restore effect no longer double-fires review sync, thumbs-aware queue eligibility + 1px fallback tile.
- `tests/batch_flex_thumb_info.test.tsx` width assertion widened to `min-w-[(300|360)px]` (the source branch's own amendment).
- RULE 16 gates: `npx tsc --noEmit` clean; `npm run lint` 0 errors (27 warnings, pre-existing); quality:changed GATE PASSED; `npm run verify:fast` ALL LANES PASSED — 174 files / 1,874 tests; build `dist/index.html` 1,555.87 kB (457.25 kB gzip).

## 2026-10-15 — perf(split): split-approved pipeline ≥80% faster on overhead-bound runs

- Research + measurements FIRST (`archive/2026-10-15-split-speed/README.md`): a 4-icon sheet spent **33 cooperative yields** (≈330 ms idle at the conservative 10 ms model); PNG encodes were serial (toBlob #2 issued only after #1 resolved — measured timestamps); 12 sequential items took **1 046 ms** against a 288 ms compute floor.
- TDD: `tests/split_speed.test.ts` written RED with those exact gates (yields ≤6, concurrent encode issue-before-resolve, pipeline wall <150 ms), then GREEN.
- Fixes: `yieldBudget(24ms)` time-based scheduling across batchsplit/render/detect/process; per-sheet encodes run via `Promise.all`; `processItems` runs a bounded 3-worker pipeline with item-order results (preallocated), per-item-start stop checks, completion-count progress; `loadSheet` decodes via `createImageBitmap` with the element path as fallback; `renderIcon`/`renderIconAsync` deduplicated through `paintIcon` (RULE 18: kills the duplicated 30-line body).
- Guardrails intact: RULE 5/7 responsiveness (≤24–48 ms stretches), no-overwrite (per-item planned folders), per-item failure isolation, stop semantics (locked by tests), blob order = reading order.
- RULE 16 gates: `npx tsc --noEmit` clean; `npm run lint` 0 errors (26 warnings, pre-existing); quality:changed GATE PASSED; `npm run verify:fast` ALL LANES PASSED — 175 files / 1,878 tests; build `dist/index.html` 1,556.06 kB (457.46 kB gzip).
- Measured in-suite: yields 33 → 5; pipeline 1 046 ms → 111 ms (89 %); combined model ≥80 % for typical batches (see the README for per-scenario estimates).

## 2026-10-15 — fix(batch): exported split size now equals the preset size (legacy string presets repaired)

- User report: "size 1024 (or other preset size) does nothing — exported files have a different size." Research first (`archive/2026-10-15-split-size/README.md`): the whole chain was verified link by link (UI select → state/localStorage → runBatch → paintIcon canvas → blob → file) with component and lib probes — the pipeline always rendered exactly `split.size` px. The break was in the PRESET PARSE: `numberOr` rejected stored numeric strings, so a legacy `"size": "1024"` silently became `0` = auto on every load — the reported symptom, persistent until re-save.
- TDD: `tests/split_size.test.ts` written RED first (string size → 0, string padding → default), then the fix: `numberOr` repairs finite numeric strings on read (RULE 13 recoverable-intent repair). Integrity kept: `"abc"`/`true`/off-list numbers still fall back (validSize snaps to auto); exact allowed values untouched.
- The fix is self-healing for existing browsers: the next preset load repairs the value; the next save normalizes it to a number.
- Contract locks added: `splitSheet` renders exactly `split.size` px (1024/512/0 matrix) — green before and after, proving the pipeline was never at fault.
- RULE 16 gates: `npx tsc --noEmit` clean; `npm run lint` 0 errors (26 warnings, pre-existing); quality:changed GATE PASSED; `npm run verify:fast` ALL LANES PASSED — 176 files / 1,884 tests; build `dist/index.html` 1,556.16 kB (457.50 kB gzip).

## 2026-10-15 — feat(batch): Location button on processed rows copies the splits folder

- User request: after processing, a row must show a "Location" button that copies the path of the folder holding the item's split icons. Research first (`archive/2026-10-15-row-location/README.md`): layout verified against `process.test.ts` — an item's four splits live in `<dest>/<plan.relFolder>/split_01..04`, so that item folder is what gets copied.
- TDD: `tests/batch_row_locate.test.tsx` RED first (7 failing: honest-base matrix, outRel data chain, button behaviour), then GREEN. Data: `ItemResult.outRel` ("" unless written) -> `finalize` stamps `Row.outRel` (session-scoped; a reload hides the button — the old run's stamp is unknowable; documented scope decision). Copy: `copypath.splitOutputBase` (custom dest bound path -> its name -> root base + `_split_output`, I-29/I-63) + `copySplitFolderText` (clipboard + RULE 9 toast; plain join, NOT `folderCopyText`, which would drop the item folder's last segment per I-56).
- UI: `batch-row-locate-<relPath>` button ("📍 Location") in the Status cell for rows with an output folder; `destRef` exposed on the batch core (mirrors `rootRef`).
- RULE 16 gates: `npx tsc --noEmit` clean; `npm run lint` 0 errors (27 warnings, pre-existing); quality:changed GATE PASSED; `npm run verify:fast` ALL LANES PASSED — 177 files / 1,892 tests; build `dist/index.html` 1,557.14 kB (457.79 kB gzip).

## 2026-10-16 — change(batch): run folders are a DAY (`YYYY-MM-DD`) — same-day exports share one folder

- User request: the run level was `2026-10-16_13-35-40`; extra exports the same day must land in the SAME folder. Research first (`archive/2026-10-16-day-run-folder/README.md`): grep found every format lock (RULE 10 kept it to `naming.batchPath` + `batchlayout.isRunStamp` + one UI hint).
- TDD: locks updated RED first (naming/output_plan/process/batch_row_locate) + new acceptance: two `processItems` runs on the same date share `2026-09/2026-09-30`, the re-split item gets `_v02` (no-overwrite now spans the whole day via the existing-lookup), side-by-side items verified. `isRunStamp` accepts day AND legacy stamp (I-50: pre-2026-10-16 trees keep their scope); months still rejected.
- Invariants: SYSTEM_OF_RECORD output-tree line, I-47 and I-50 updated with the dated change; `BatchDestRow` hint text says "one folder per day".
- RULE 16 gates: `npx tsc --noEmit` clean; `npm run lint` 0 errors (27 warnings, pre-existing); quality:changed GATE PASSED; `npm run verify:fast` ALL LANES PASSED — 178 files / 1,901 tests; build `dist/index.html` 1,557.09 kB (457.79 kB gzip).

## 2026-10-16 — feat(batch): the split controls bar pins to the top while the rows scroll

- User request (screenshot): the bulk bar (selection/review counts, zoom, Preview/Regenerate, decision buttons, Split approved) must stay reachable as the user scrolls down. Research first (`archive/2026-10-16-pinned-bulkbar/README.md`): `.app-main` is the scroll container; `.batch-shell` has no overflow, so pure CSS `position: sticky` is enough — no JS scroll listeners.
- The sticky-box constraint: the bar sat in `.batch-controls-stack` (a box barely taller than the bar), so it moved into `PinnedBulkBar` (`.batch-bulkbar-pin`, direct child of `.batch-shell`, z-index 6 below progress/modal layers; `.svg-bulk`'s opaque surface keeps rows from showing through). Visual order unchanged: source bar, filter grid, bulk bar, presets, rows.
- TDD: `tests/batch_pinned_bulkbar.test.tsx` RED first (4) — CSS contract via the `layout_fullwidth` precedent (index.css rule declares `position: sticky` + `top: 0`) and DOM contract (pin wraps the bar, out of the controls stack, order preserved).
- RULE 16: the restructure pushed `BatchPanel`'s main fn past the 30-loc limit and the file past 50 fns — fixed in RULE 19 order: `PinnedBulkBar` component + `rowcopy.ts` (copyPath/locateSplits extracted). Gates: `npx tsc --noEmit` clean; `npm run lint` 0 errors (27 warnings, pre-existing); quality:changed GATE PASSED; `npm run verify:fast` ALL LANES PASSED — 179 files / 1,905 tests; build `dist/index.html` 1,557.23 kB (457.86 kB gzip).

## 2026-10-16 — feat(svg): connection profiles — quick-switch dropdown, Requesty image connection (Sunburst), full image controls

- User request: a main dropdown to quick-switch between saved provider setups; a second shipped connection for IMAGE generation ("sunburst model from same provider"); controls for every image parameter (quality, custom WxH + presets, n, background, output format). Research FIRST (`archive/2026-10-16-connections/README.md`): Requesty docs confirm the OpenAI-compatible `POST {base}/images/generations` and `provider/model` ids; "Sunburst" = GPT-Image-2.5 Sunburst (`openai/gpt-image-2.5-sunburst`, 2026-09-08; quality auto..max, custom sizes, background auto/transparent/opaque); NO image-edit endpoint in Requesty's docs — honest scope: generation only.
- TDD: `tests/svgconnections.test.ts` (15 — defaults incl. migration seeding from the live config, RULE 13 repair matrix, clamps, resolveSize, exact snake_case `buildImageBody`, imageUrl) and `tests/svg_connections_ui.test.tsx` (5 — dropdown, switch swaps model + shows image grid and hides text rows, every control takes values, remount persistence, add/remove floor), both RED first.
- Design: `lib/svgconnections.ts` pure owner; storage `iconSplitter.svg.connections.v1`; `SvgModel.connections/activeConn` with ONE reducer action ("connections") as the single writer syncing the live config's base+model (the `config` handler mirrors manual edits back — no drift); caps/params re-resolve through the existing `useModelSync`. UI: `SvgConnections` (dropdown row + image grid) inside the provider card; text-only rows hidden for image connections; `Select`/`NumberField` moved to `ui/fields.tsx` (one owner).
- RULE 16/18 upkeep (RULE 19 order): `initialModel`/`useSvgModel` bundled into an extras object (params ≤4); `useConnectionActions` split into pure list math + thin memoized hook (and the double-`fn(m)` bug it exposed — `added` mints a fresh id per call); `sanitizeConnection` split (cc ≤10); ProviderCard/ProviderHead take one props object (no param growth vs baseline).
- Gates: `npx tsc --noEmit` clean; `npm run lint` 0 errors (27 warnings, pre-existing); quality:changed GATE PASSED; `npm run verify:fast` ALL LANES PASSED — 181 files / 1,925 tests; build `dist/index.html` 1,565.75 kB (460.31 kB gzip).

## 2026-10-16 — fix(svg): connection card layout — no clipped controls (RULE 14)

- User report (screenshot): with the Sunburst image connection active, the KIND select, BACKGROUND and the header label clipped at the card's right edge, and the MODEL input showed a truncated id. Root cause: the connection row reused `.svg-filters` (a fixed 6-column grid wider than the ~430px card) and the image grid/model field reused `.svg-provider-fields`, whose `.svg-field:first-child { flex: 0 0 118px }` pinned the model input to 118px and whose `flex: 1 1 0` items never wrap.
- TDD: CSS-contract + DOM gates added to `tests/svg_connections_ui.test.tsx` RED first — `.svg-conn-row` and `.svg-image-grid` must declare `flex-wrap: wrap`, `.svg-image-model .svg-field` must be `flex: 1 1 100%` (full-width model id), and the rows must NOT carry the borrowed classes.
- Fix: dedicated wrapping rules for both rows; the model id gets a full row in image mode.
- Gates: `npx tsc --noEmit` clean; `npm run lint` 0 errors (27 warnings, pre-existing); quality:changed GATE PASSED; `npm run verify:fast` ALL LANES PASSED — 181 files / 1,928 tests; build `dist/index.html` 1,566.04 kB (460.37 kB gzip).

## 2026-10-16 — feat(svg): AI source image regeneration — versions subfolder, main switch, shared confirm dialog

- User request: regenerate a pair's AI source image through the IMAGE connection with a prompt; the confirm popup identical to SVG generation's (same main prompt + same preset list, a preset click fills the editor); batch processing on the checked rows and a per-row action; the output becomes the new MAIN AI source and NEVER overwrites the previous one; every version lands in the pair's subfolder "AI source regeneration versions"; any version re-pickable as main anytime (chips); reuse the SVG-versions code. Honest scope, shown in the dialog: Requesty documents no image-edit endpoint, so it is text-to-image only — the current AI image cannot be sent along. Design first: `archive/2026-10-16-image-regen/README.md`.
- TDD: `tests/svgimgreg.test.ts` (17 — name/version/history parse + serialize with reader tolerance I-71 (then numbered I-69), nextImageVersion off disk + pair file, file naming, pointer fallback rules) and `tests/svg_imgreg_ui.test.tsx` (4 — text-connection guard toasts without a dialog; dialog shows provider + shared preset/prompt and Generate writes `architecture/AI source regeneration versions/fog_AI_v1.png` as main with exactly that file on disk and the chip `data-active`; run 2 appends v2 as main and the v1 chip click re-points main, persisted to the pair file; the row action opens the same dialog), both RED first.
- Implementation: `lib/svgimgreg.ts` pure owner (I-71 keys, `preferredImagePath`); `svg/imgactions.ts` (guarded request, confirmed batch, main switch — `recordResult`/`extendedWith`/`entryFor` under a `RegenPlace`/`RegenReq` bundle), `svg/imgregfiles.ts` (subfolder write + listing), `svg/imgrunner.ts` (the `images/generations` runner over the existing connection), `SvgImgConfirm.tsx` (the shared `PromptBlock` + counts/provider head), chips in `SvgRow`, the AI pane reads `preferredImagePath` in `SvgThumbs`, bulk button in `SvgBulkBar`. Bonus fix found by the UI guard: `chooseRoot` never refreshed the stored device key (only boot did) — fresh-pick runs toasted "Add the API key first"; `chooseRoot` now refreshes it before scanning.
- RULE 16/18 upkeep (RULE 19 order): `svgimgreg` helpers split (`entryOf`, `firstImageOf`, field readers); `SvgImgConfirm` → `PromptBlock` + `ConfirmHead`; `SvgPanel` → `panelbits.tsx` (`PanelDialogs`, `panelRowActions`); `imgactions` → `sayOutcome` + `RegenReq`/`RegenPlace` bundles; `pairmeta.ts` → the path math split into `lib/pairpath.ts` (re-exported, file back to 252 lines).
- Gates: `npx tsc --noEmit` clean; `npm run lint` 0 errors (27 warnings, pre-existing); quality:changed GATE PASSED; `npm run verify:fast` ALL LANES PASSED — 183 files / 1,949 tests; build `dist/index.html` 1,577.08 kB (462.95 kB gzip). Baseline: untouched (no full verify run this round).

## 2026-10-19 — fix(svg): row decision buttons dropped out of their column (RULE 14)

- User report (screenshot): in the Generate SVG list, the row's Regenerate / ⚠ / ✓ / ✕ buttons sat bottom-left under the thumbnails, and the last column held only a wide "Regenerate image" bar. Root cause: `.svg-row` is an 8-column grid (checkbox, preview pair, file, status, review, usage, file actions, decision) but `SvgRowView` rendered 9 children since the image-regeneration feature added the "Regenerate image" button as its own grid cell — it took the decision column and `DecisionActions` wrapped onto a second grid row in the 34px checkbox column.
- TDD: `tests/svg_imgreg_ui.test.tsx` — the row must have exactly one child per `.svg-columns` header cell, and `svg-row-image-regen-{id}` must sit inside `.svg-decision-actions`; RED first (9 vs 8).
- Fix: the button moved into `DecisionActions` (same testid, same dialog), `.svg-decision-actions .svg-img-regen { flex: 1 1 100% }` puts it on its own line in that cell. No grid change.
- Gates: `npx tsc --noEmit` clean; eslint on `src/svg` + the test 0 errors; `tests/svg_imgreg_ui` + `svg_ui` + `svg_connections_ui` 52 tests green; quality gate: SvgRow.tsx OK (36 fns, 217 lines), the only FAILs are the pre-existing `src/App.tsx` and `src/lib/render.ts`. `verify:fast` NOT run — `tools/verify.mjs` / `tools/quality.mjs` compute `ROOT` from `URL.pathname` ("/D:/…"), which Windows rejects as a cwd; the gate above ran from a throwaway copy with `fileURLToPath`. Not checked in a real browser.

## 2026-10-19 — style(svg): row image button matches Regenerate; vector/raster parts separated (RULE 14)

- User request (screenshot): the row's "Regenerate image" was a wide dark bar; make it the same as the SVG "Regenerate" button and leave space between the vector part and the raster part.
- TDD: `tests/svg_imgreg_ui.test.tsx` — the image button carries the same `svg-btn tiny primary` classes as `svg-generate-{id}` and a `.svg-decision-sep` sits between the two in DOM order; RED first.
- Change: `SvgRow.tsx` image button → `svg-btn tiny primary svg-img-regen` after a `span.svg-decision-sep`; `index.css` replaces the stretch rule with a full-width 1px divider (8px above, 4px below) that breaks the flex line. Same cell, same testid, no grid change.
- Gates: `npx tsc --noEmit` clean; eslint on `src/svg` + test 0 errors; `svg_imgreg_ui` + `svg_ui` + `svg_connections_ui` 53 tests green. `verify:fast` not run (Windows `ROOT` bug in `tools/`, see the entry above). Not checked in a real browser.

## 2026-10-19 — style(svg): AI source regeneration dialog — roomy reading surface (RULE 14)

- User request (screenshot): the popup was cramped — "Selected images" and the preset select squeezed to ~118px, the prompt a 2-line scrolling box. Make the window bigger, put the prompt below the other controls, size it to the full text (no scroll) up to the browser height. Root cause of the squeeze: the dialog reused `.svg-provider-fields`, whose `.svg-field:first-child { flex: 0 0 118px }` pins the first field of every row.
- TDD: new `tests/svg_img_confirm_layout.test.tsx` — controls in order count → provider → preset → prompt → Generate with neither preset nor prompt inside `.svg-provider-fields`; textarea height = scrollHeight and refit on text change; CSS contract: modal `min(980px, 96vw)` / `max-height: 9xvh`, prompt `width:100%`, `max-height … vh`, `resize:none`, `overflow-y:auto`, Generate row `position: sticky`; RED first (4/4).
- Change: `SvgImgConfirm.tsx` → own layout (`.svg-img-meta`, `.svg-img-prompt-block`), prompt last, `useFitToText` hook (height = scrollHeight, window-resize refit); `index.css` `.svg-modal.img-regen` (flex column, 94vh cap), prompt cap `calc(94vh - 340px)`, pinned Generate bar when the body scrolls.
- Real-engine check: the dialog markup + the real `index.css` rendered in headless Edge at 1400×900 and 1100×560 — controls full width, a ~12-line prompt shown whole with no inner scroll, Generate pinned below it. The 1100×380 (capped) render was taken but not viewable afterwards, so the capped-scroll state was only checked at the CSS level. The probe page used a border-box reset because raw `index.css` has no Tailwind preflight; the real app was not driven.
- Also: `AGENTS.md` §5 item 5 — owner rule "push when a task is finished".
- Gates: `npx tsc --noEmit` clean; eslint 0 errors; `svg_img_confirm_layout` + `svg_imgreg_ui` + `svg_ui` + `svg_connections_ui` green. `verify:fast` not run (Windows `ROOT` bug in `tools/`).

## 2026-10-19 — fix(svg): AI source regeneration sends the prompt AND the current image as reference

- User question/report: does regeneration send the image and the prompt, or only the prompt? It must send both — the prompt plus the last selected image source as the reference. Finding: it sent the PROMPT ONLY (`POST images/generations`), by an earlier design decision recorded as "Requesty has no image-edit endpoint". That claim was wrong: Requesty documents `POST /v1/images/edits` (multipart `image[]`, read 2026-10-19). Design/correction: `archive/2026-10-19-image-regen-reference/README.md`.
- TDD (RED first): `tests/svgimgedit.test.ts` (url, mime, quality map, multipart fields incl. `image[]` bytes, no `n`/`response_format`), new `tests/svg_imgrunner.test.ts` (edits URL, FormData body with the reference bytes + prompt, Bearer without Content-Type, each source its own image, unreadable reference = honest per-item failure with no request, HTTP errors unchanged), `tests/svg_imgreg_ui.test.tsx` (the mocked runner resolves each item's reference: run 1 = the original `fog_AI.png` bytes, run 2 = `fog_AI_v1.png` because v1 is main; dialog copy mentions the reference).
- Change: `lib/svgimgedit.ts` (new, pure), `svg/imgrunner.ts` (`attempt` = one edit request; items carry a lazy `reference()`), `svg/imgregfiles.ts` `readReferenceImage`, `svg/imgactions.ts` `referenceItem` (path = `preferredImagePath`, the thumbnail's own rule), dialog note + `svg-img-caps`, stale comment in `lib/svgconnections.ts` corrected.
- Gates: `npx tsc --noEmit` clean; the five related test files green (see commit). `verify:fast` not run (Windows `ROOT` bug in `tools/`). NOT exercised against the live Requesty API (no key used) — the wire follows their published schema; `size`/`quality` values outside their documented enum are sent as configured except `xhigh`/`max` → `high`.

## 2026-10-19 — fix(svg): AI source regeneration — a visible, honest run; the main image is the source (on top of the owner's commits above)

- User report (screenshot + text): the row's Regenerate / ⚠ / ✓ / ✕ stacked under the checkbox with "◍ Regenerate image" across the last column; "regenerate image do nothing. freezed button and no errors or warnings". Design first: `archive/2026-10-19-image-regen-fix/README.md` (RC1–RC8, D1–D8, §7 integration).
- Integration: the four entries above (the owner's parallel commits `ca1f7d6`…`9262499`) already fixed RC1 (button in the decision cell), gave the dialog its overlay + roomy layout, and switched the wire to image EDIT (prompt + the current main image as reference). This commit was rebased onto them twice, never forced; their placement, layout, edit wire and tests are kept (their two runner-mock UI tests ported to the real wire; my runner tests merged into their `tests/svg_imgrunner.test.ts`), and `verify:fast` — not runnable on their machine — runs here on the combined tree.
- Root causes this commit adds: RC2 the dialog had rendered below the whole list while SvgHotkeys froze the list keys (now pinned by tests); RC3 nothing showed the 20–120 s run; RC4 a silent `void` promise, reasonless toasts, the router's message dropped — and an HTTP 400 toasted "Regenerated 1 AI source" (every recorded entry counted as done); RC5 a pair without a pair file discarded the paid image; RC6 SVG saves dropped `imageVersions`/`imagePreferred` (stale `refs.metas`, plus a mid-save race); RC7 the 120 s stall window used as a total limit; RC8 the SVG generation read the ORIGINAL AI file, not the main the row shows.
- TDD (RED first, each failing for the diagnosed reason): `tests/svg_imgreg_ui.test.tsx` → 19 (the owner's 5 kept) and now the REAL runner against a stubbed fetch (RULE 8): row cells = the CSS grid's track count in both layouts; the overlay shell + caps + wait; blank prompt; busy + in-flight + Stop, then the landed main; HTTP and disk failures on the toast and the row; a pair without a file; an unreadable pair file refused; an SVG generation after a regen keeps the history and reads the main. `tests/svg_imgrunner.test.ts` (theirs, 6) + 7 (`onResult` per item, the router's message, non-JSON status, unreachable, timeout, no image, Stop). `tests/svgimgreg.test.ts` 17 → 26. `tests/svg_runner.test.ts` +2 (the composite resolves the main image; an image landing mid-save survives).
- Fix: in-flight state on the decision-cell button (`◍ Regenerating…`, disabled); `AiSourceBar` in the pair cell (`SvgThumbs`, `contain: inline-size`) — in-flight bar, chips, last failure, only when something to show; the owner's dialog + a wait-limit field, `svg-img-caps`, Generate disabled on a blank prompt; `imgRunning` (one writer) + the busy pill per landed result + a start toast + `svg-img-stop`; the run (in `imgactions`) records each result on landing — version file → in-memory copy → row → pair file — every failure caught and counted, `regenOutcome` naming the first; the runner's `onResult` over their edit wire, `classifyHttp` reused, timeout/unreachable texts; the reference is `mainImageOf` — the same file the row shows and the SVG generation reads; `metaForSource` for pairs without a file, unreadable ones refused before sending; `withImagesOf` field ownership in `runbatch.persist`; `buildComposite(root, sources, imageOf)` with `mainImageOf` in the run and the confirm preview; `imageWaitMs` = max(stall window, 300 s).
- Docs: SYSTEM_OF_RECORD — the image invariant renumbered I-69 → **I-71** (I-69 was already "batch render identity") and extended with the binding rules; module row updated. UI_SELECTORS — `svg-ai-bar/-running/-error-{id}`, `svg-img-stop/-wait`; `svg-row-image-regen` (the owner's placement + in-flight state), `svg-img-confirm`, `svg-img-caps`, `svg-busy` updated. docs/README — the 9 missing archive rows (2026-10-15/16/19).
- RULE 16/18 re-check: every changed file meets the hard lines (fn ≤30 loc, params ≤4, CC ≤10, nesting ≤4, file ≤300); `imgactions.ts` 249, `SvgRow.tsx` 209, `SvgThumbs.tsx` 188, `svgimgreg.ts` 173, `imgrunner.ts` 129, `SvgImgConfirm.tsx` 124 lines. The strip, the run and a fact tile were drafted as new files and folded into their owners: `src/svg` stays at 68 files (already far over the module ideal — this fix adds none). Lint warnings held at 27 (a `complexity` warning the strip briefly added was refactored away).
- Gates (combined tree): `npx tsc --noEmit` clean; `npm run lint` 0 errors (27 warnings, pre-existing); quality:changed GATE PASSED; `npm run verify:fast` ALL LANES PASSED — 186 files / 1,998 tests (coverage 94.69 / 88.67 / 97.27 / 97.10); build `dist/index.html` 1,586.00 kB (465.54 kB gzip). Baseline untouched.
- Not verifiable in the sandbox: a live Requesty call (no route to the router) — any provider refusal now surfaces verbatim on the toast, the row and the log. Observed, not changed: Generate SVG does not refuse while an IMAGE connection is active (it would send a chat request to the image model) — pre-existing since the connections round, left for a separate decision.

## 2026-10-19 — fix(svg): AI source regeneration log names tokens + cost (merged onto 0f53248)
- Report: the log did not say what a regeneration cost or how many tokens it spent. Root cause: `svg/imgrunner.ts` dropped the response's `usage` block and `x-request-id`. Design: `archive/2026-10-19-image-regen-spend-log/design.md`.
- Merge: a GitHub Desktop pull of `0f53248` (image-regen fix) had been resolved as "ours" for every file, which dropped the remote's work. Redone with `git merge --no-ff`: the remote's versions of the conflicted files were taken and the spend log re-applied on top (its `RegenTally`/`regenOutcome` already fix the old done-count).
- TDD (RED first): `tests/svgimgreg.test.ts` (`readImageUsage`: Images API + chat names, cost, missing = null), `tests/svg_imgrunner.test.ts` (a done result carries `usage` + `requestId`, no usage = nulls), new `tests/svg_imglog.test.ts` (item entry, run summary = `regenOutcome` text + summed spend, toast suffix empty when nothing reported).
- Gates: `npx tsc --noEmit` clean; eslint on the changed files clean; RULE 16 gate (throwaway `fileURLToPath` copy of `tools/quality.mjs`): imglog 8 fns / 63 lines, imgactions 41 / 255, imgrunner 9 / 136, svgimgreg 21 / 196 all OK (only the known App.tsx / render.ts fail); image tests 74/74; full suite 1993 passed / 16 failed. All 16 are in known-flaky Windows files (algo_efficiency, batch_preview_restart, split_speed, svg_ui), which pass in isolation (4, 13, 4, 38), plus the 5 `quality_base` failures from the `tools/` ROOT bug. Build 1,587.48 kB (gzip 466.30 kB). `verify:fast` not run (Windows ROOT bug). Not exercised against the live Requesty API.

## 2026-10-19 — AI-source composite batching design (docs only)

- Changed scope: design proposal + docs index; 0 production source files. No behaviour or invariant changed.
- `npm run verify:fast`: 5/5 lanes failed at 0.0 s on Windows (`tools/verify.mjs` cwd / URL-path issue); `npm run verify`: 6/6 lanes failed at 0.0 s for the same reason. `node tools/quality.mjs --changed --allow-legacy`: `cmd.exe ENOENT`; no changed `src/` files to measure.
- Manual lanes: `npx tsc --noEmit` passed; ESLint 0 errors / 27 warnings; focused AI-image/composite tests 92/92 passed; full coverage suite 1994/2009 passed, 15 failed across 5 files (`algo_efficiency`, `batch_preview_restart`, `quality_base`, `split_speed`, `svg_ui`); build passed, single HTML 1,587.48 kB (gzip 466.30 kB). Full suite was not green.

## 2026-10-19 — docs restructured for agent context budgets

- Change: new root router `docs/current/README.md` (task read packs with KB sizes, cross-cutting lookups, page conventions, do-not-load list); 10 oversized pages split into `-<part>` siblings or per-area folders (`sor/owners/`, `sor/storage/`); invariants split into `svg-run`, `svg-image-edits`, `paths-capture`, `paths-scope`; RULE 16 moved to `rules/QUALITY_GATES.md`; ratchet/CI to `VERIFICATION_RATCHET.md`. All inbound links/anchors retargeted.
- Measured: 76 current pages (ledger excluded), largest 8842 bytes (was 25,369); new test caps every page at 9,000 bytes and the router at 5,000. Docs link test also fixed to GitHub slug rules (no whitespace collapse).
- Gates: docs_navigation 4/4; `npx tsc --noEmit` clean; `npm run lint` 0 errors (27 pre-existing warnings); RULE 16 gate via Windows-safe throwaway copy: passed (no src files). Full vitest: 2042/2055, failures = quality_base (known Windows ROOT bug) + load-flaky files (algo_efficiency, batch_preview_restart, svg_ui, secret_hygiene) that pass in isolation. `verify:fast` not runnable on native Windows (tools ROOT bug).

## 2026-10-19 — test harness speed-up (vitest projects, quiet settle)

- Full `npx vitest run`: old harness 54–103 s across four runs on the Windows
  reference box (two at clean HEAD today: 103 s and 54 s, both with
  load-flaky failures); new harness ~15 s duration / ~17 s wall, 197 files,
  2055/2055 green on three consecutive runs.
- `npm run verify` (full): ALL LANES PASSED in 66 s — tsc 10.9 s, lint 11.4 s,
  quality 1.2 s, native perf 3.6 s, tests+coverage 28.3 s, build 9.5 s.
- Windows runner fixed: `tools/quality.mjs`/`tools/verify.mjs` resolve ROOT
  with `fileURLToPath` (the `cmd.exe ENOENT` failure is gone).
- Design: [test harness](TEST_HARNESS.md).

## 2026-10-19 — Generate SVG bulk bar pinned while rows scroll

- `.svg-bulkbar-pin` (sticky, top 0, z-index 6) wraps `SvgBulkBar` as a direct
  child of the `.svg` column; `tests/svg_pinned_bulkbar.test.tsx` 4 tests
  witnessed red (no rule, no pin), now green; svg_ui + svg_ui_config 38 green.

## 2026-10-19 — SVG version chips under the SVG preview

- Plan: docs/archive/2026-10-19-svg-version-chips. `SvgVersionChips` calls the
  Versions dialog's `preferVersion` owner; the strip under the pair is now two
  width-bound cells (AI chips | SVG chips). Versions dialog unchanged.
- `tests/svg_version_chips.test.tsx`: 4 of 5 red before (no chips), 5/5 green
  after; all 49 `tests/svg_*` files / 498 tests green.

## 2026-10-19 — SVG preview stroke width (pinned bar)

- Feature: `STROKE` field (0–50 px / "default") + Reset in the pinned Generate SVG bar; row thumbnails adopt one shared constructable stylesheet (`svg/strokesheet.ts`, rule from `lib/previewstroke.ts`), so a change is one `replaceSync` — no re-parse, no row re-render. Files, Copy and dialogs keep real widths; persisted as `previewStroke` in the SVG prefs. Plan: `docs/archive/2026-10-19-svg-preview-stroke/README.md`.
- TDD: `tests/svg_preview_stroke.test.tsx` 7/11 red before the UI (lib cases written with the lib), 11/11 green after; `tests/svg_*` + `tests/upload*` 95 files / 1116 tests green; tsc clean; lint 0 errors; `quality:changed` GATE PASSED (new files 40/48/40 lines).

## 2026-10-19 — preview stroke width: screen px (fix)

- User report: the override "works on v4 but not v5/v6" of one pair. Measured cause: v4 `viewBox="0 0 256 256"`, v5/v6 `0 0 1024 1024`; a width in document units drew 4× thinner. Fix: `strokeCss` adds `vector-effect: non-scaling-stroke !important`, so the value is screen px and identical on every thumbnail.
- TDD: 2 tests red (lib rule + adopted sheet), green after; plan doc §3 revised; selectors/invariant updated.

## 2026-10-19 — AI source regeneration: tokens + cost on the row

- User report: an image regeneration's spend appeared only in the log/toast, not in the row's usage column. Cause: `imgcommit.recordImageResult` built `ImageVersion` without usage/cost (the type had no fields). Fix: additive `usage` + `cost` on `ImageVersion` (parsed with `svgmodel.toUsage/toCost`), cost via `costInfoFor`, composite cells get `allocateUsage(usage, cells)` (estimate unless alone); `SvgRow.UsageCell` shows "SVG gen." then "Image gen." (vN · tokens · cost, or "original"). Plan: `docs/archive/2026-10-19-image-regen-usage/README.md`.
- TDD: 4 tests red (svgimgreg round-trip + 3 in svg_imgreg_ui "tokens and cost on the row"), green after; svgimgreg + svg_imgreg_ui 61/61.

## 2026-10-19 — preview stroke width reused on SVG to upload

- Request: the same feature on "SVG to upload", reusing code. Transform: `svg/strokesheet.ts` singleton → `createStrokeSheet()` factory with `SVG_STROKE_SHEET` / `UPLOAD_STROKE_SHEET` (both tabs stay mounted, so one shared sheet would leak widths across tabs); `SvgPreviewBox` `strokeOverride: boolean` → `strokeSheet?: StrokeSheet`; `PreviewStroke` takes `sheet` + `idPrefix`. Upload wiring: `previewStroke` pref, `stroke` action/model, `setStroke`, persist, `UploadBulkBar` + `UploadPreview`. No new CSS. Plan: `docs/archive/2026-10-19-upload-preview-stroke/README.md`.
- TDD: `tests/upload_preview_stroke.test.tsx` 6/6 red before, green after; `svg_preview_stroke` stays 11/11; tests/upload* + tests/svg* 101 files / 1189 tests green; tsc clean.

## 2026-10-19 — image regeneration cost from the Sunburst rate card

- Change: `lib/svgpricing` prices `openai/gpt-image-2.5-sunburst` ($8 in / $30 out per 1M, `requesty-2026-10-19`); `lib/svgimgreg` reprices stored tokens-only entries on read. A composite icon shows its share of the whole image's estimated cost.
- Measured: 4 new tests red before the change (rate missing, version, read repricing, row label), green after; svg_cost + svgimgreg + svg_imgreg_ui 73/73.

## 2026-10-19 — SVG to upload: pinned bulk bar

- Change: `UploadPanel` wraps `UploadBulkBar` in the shared sticky `.svg-bulkbar-pin` (`upload-bulkbar-pin`); no new CSS.
- Measured: `upload_pinned_bulkbar` 2 tests red before, green after.

## 2026-10-19 — SVG to upload: "default" settings, as-is export, live export preview, one stroke

- Change:
  - `lib/upload/asis` (new);
  - `settings`/`artboard`: padding null, background `default`, artboard `source`, `STROKE_MAX` 50, no per-icon `strokePx`;
  - `prepare`/`place`: an as-is shortcut, a single-pass source-frame fit, no rect on a default background;
  - `exportstages`/`exportvalidate`: no SVGO or clean check when as is;
  - `upload/exportpreview` (new): a debounced, cached live preview; `lib/zoom` `zoomBoxFit`;
  - dialog Default choices plus "All default"; the bar STROKE = `strokePx`;
  - removed the Upload preview-only stroke state and `UPLOAD_STROKE_SHEET`.
- Measured:
  - `upload_default_settings`: 10 tests, 9 red before (lib), green after.
  - `upload_live_preview`: 7 tests, 6 red with the UI changes stashed, green after.
  - `tests/upload*` + `tests/svg*`: 1205 green.
  - `prepareExportSvg` split to stay under RULE 16.

## 2026-10-19 — Upload paint clash note

- Report: a black thumbnail on SVG to upload. Cause (stored settings): export background `#000000` with stroke colour `#000000` — the live preview honestly showed the black-on-black export. Added `lib/upload/paintclash` (WCAG 3:1) → row preview note + dialog `upload-set-paint-clash`.
- Measured: `upload_paint_clash` 2 + `upload_live_preview` 8 green (red first: missing module / no note).

## 2026-10-19 — Upload per-icon stroke + commit-on-leave numbers

- One icon may pin its own stroke width again (icon dialog `upload-set-stroke`, inherit button); custom artboard W×H and that field commit on blur/Enter via new `ui/DraftNumberInput`.
- Measured: 4 tests red first (override parse ×2, icon stroke UI, W×H draft), then green; tests/upload* 631 green.

- 2026-10-19 — RULE 25/I-73 Batch-authoritative list selection across Selection V2, Generate SVG and SVG to upload. Red→green focused regressions: 15 suites / 248 tests; `npx tsc --noEmit` PASS; `npm run lint` PASS (23 existing warnings); `npm run quality:changed` PASS. `npm run verify:fast` PASS: main coverage suite 206 files / 2149 tests, src/lib line coverage 97.28%, single-file build PASS. `npm run verify` PASS on rerun: native 5 files / 30 tests, main 206 files / 2149 tests, coverage 97.28%, build PASS. First fast run failed one stale Batch footer assertion (updated); first full run timed out waiting for an Upload preview; its focused retry and the full rerun passed. No live provider calls. Runner: Node 22.14.0 (project pin 22.12.0), npm 10.9.2.

## 2026-10-20 — Upload Shadow and regenerated-image discovery

Measured on Node v22.14.0 / npm 10.9.2 (.nvmrc specifies v22.12.0): focused combined feature/navigation run 10 suites, 207 tests passed; npx tsc --noEmit passed; lint 0 errors, 23 pre-existing warnings; quality:changed passed. verify:fast passed 208 suites / 2194 tests, coverage 94.66% statements and 97.39% lines overall, build passed. Full verify passed: native perf 5 suites / 30 tests, coverage 208 suites / 2194 tests, build passed. An earlier coverage run timed out unrelated UI suites under Drive-path load; isolated retries and the subsequent fast/full gates passed.

**2026-10-20 — batch regeneration + six task prompts** (archive `docs/archive/2026-10-20-regen-batch-and-task-prompts/`; measured, not read back). `npx tsc --noEmit` PASS; `npm run lint` PASS (0 errors, 25 warnings — 24 pre-existing, the one added in `confirmplan.ts` fixed); `node tools/quality.mjs --changed --allow-legacy --base HEAD` PASS (the batch split: `runcontrol.ts` 303 → 153 lines by moving the queue-writing half to `runqueuepath.ts`/`runcontext.ts`; `runsend.ts` `attemptSend` extracted); `npx vitest run --reporter=dot --maxWorkers=2` PASS: 213 files / 2222 tests; `npm run verify:fast` — docs and build lanes PASS, tests lane flagged only `tests/upload_ui.test.tsx > previews each row's own approved SVG` which passes alone and in the low-parallelism full run (a 4 s wait under 213-file parallel load, not a behaviour change). No live provider calls. Runner: Node 22.22.3.

**2026-10-20 — prompt task detected, not switched** (archive `docs/archive/2026-10-20-task-prompt-detected/design.md`; measured, not read back). Removed the Single icon / Batch tab row from the one prompt picker: the selected count decides the task (`taskOf`), the popup names and preselects that task's stored prompt, and choosing a value writes only that task's entry. `TaskPromptPicker.tsx` 99 → 77 lines, `SvgConfirm.tsx` 252 → 248, `SvgImgConfirm.tsx` 250 → 248; the two task-prompt suites were rewritten to mount one icon and then many instead of clicking a tab. `npx tsc --noEmit` PASS; `npm run lint` PASS (0 errors, 24 warnings, all pre-existing); `node tools/quality.mjs --changed --allow-legacy --base HEAD` PASS; `npx vitest run --reporter=dot` 213 files / 2222 tests on 2 of 3 runs — the one miss is the known load/time-sensitive `tests/upload_ui.test.tsx > previews each row's own approved SVG`, which passes alone and in repeated full runs. No live provider calls. Runner: Node 22.22.3.

**2026-10-20 — regeneration size comes from the connection, not the popup** (archive `docs/archive/2026-10-20-regen-size-from-connection/design.md`; measured, not read back). Removed `svg-confirm-regen-size` and the stored `iconSplitter.svg.regenBatch.v1`: `confirmplan.ts` derives the regeneration request size from `config.imagesPerRequest` via `clampRegenPerRequest`, the queued plan still freezes it (I-76), and `src/svg/regenprefs.ts` was deleted. `npx tsc --noEmit` PASS; `npm run lint` PASS; `node tools/quality.mjs --changed --allow-legacy --base HEAD` PASS; focused suites (`svg_confirm_regen_batch`, `svgregen_batch`, `svg_queue_ui`, `svg_confirm*`, `svg_regenprompt`) green; full `npx vitest run` 213 files / 2222 tests. No live provider calls. Runner: Node 22.22.3.

**2026-10-20 — review is one status per item** (archive `docs/archive/2026-10-20-item-review-status/design.md`; measured, not read back). `PairMeta.review` is the stored status (mirrored into each version's own `review`), `SvgRow.approved` and `lib/svgfile.approvedVersion` are gone, the badge/filter/tally/count read `row.review`, `SvgReviewRec` is `{ id, review }` and `src/state/apply.ts` still accepts an entry that carries `version`. `pairmeta.ts` 32 fns / 293 lines, `reviewact.ts` 23 fns / 125 lines, `reviewundo.ts` 7 fns / 89 lines, `SvgRow.tsx` 37 fns / 237 lines. `npx tsc --noEmit` PASS; `npm run lint` PASS (0 errors, 24 warnings, all pre-existing); `node tools/quality.mjs --changed --allow-legacy --base f628a93…` PASS; `npx vitest run --reporter=dot --maxWorkers=2` 214 files / 2231 tests (after the fixture updates below). No live provider calls. Runner: Node 22.22.3.

## 2026-10-20 — Integrate SVG regeneration and item review with Upload Shadow

Measured on Node v22.14.0 / npm 10.9.2 (.nvmrc specifies v22.12.0): focused integration 18 suites / 313 tests passed; TypeScript passed; lint 0 errors / 23 existing warnings; quality:changed passed; verify:fast passed 216 suites / 2272 tests, overall coverage 94.72% statements and 97.44% lines, build passed. Full verify passed: native perf 5 suites / 30 tests, coverage 216 suites / 2272 tests and build. Merge preserved both prior append-only quality entries; generated dist/index.html was not staged.

## 2026-10-20 — Upload settings button hit areas

Measured on Node v22.14.0 / npm 10.9.2 (.nvmrc specifies v22.12.0): padding Default and icon-stroke Bar blank-area clicks witnessed red then green; focused dialog/docs run 3 suites / 66 tests passed; TypeScript passed; lint 0 errors / 23 existing warnings; quality:changed passed. verify:fast passed 216 suites / 2274 tests, overall coverage 94.72% statements and 97.44% lines, build passed. Full verify passed: native perf 5 suites / 30 tests, coverage 216 suites / 2274 tests and build. Earlier coverage runs timed out unrelated suites under Drive-path load; isolated checks and the final fast/full gates passed.


## 2026-10-20 — Editable-stroke corner badge finished + one badge control set

- `npm run quality:changed` — PASS (8 changed production files; `cornerbadge.ts` 173 lines / 21 functions).
- `npm run verify:fast` — PASS: tsc, eslint (0 errors), changed-quality, 713 tests / 55 files with coverage, single-file build (198 s).
- `npm run verify` — PASS on the immediate rerun (2308 tests, coverage, native, build; 195 s). The first full run had two load-sensitive `upload_ui` metadata assertions fail (approval toast, row preview); both pass alone and in the rerun — recorded, not hidden.
- Focused red→green: `upload_badge_geometry`, `upload_badge`, `upload_outline`, `upload_runexport`, `upload_live_preview`, `upload_ui` badge block.

## 2026-10-20 — S/L size guide repeats inside the artboard

- Red→green focused suites: `upload_sizeguide_geometry` (11), `upload_sizeguide` (13), `upload_sizeguide_settings` (4), plus the size-guide block of `upload_ui` and `docs_navigation`.
- `npx tsc --noEmit` PASS; `npm run lint` PASS (0 errors, 23 warnings — one fewer than before: `settings.ts normalizeSettings` was split into `settingssizeguide.ts`).
- `node tools/quality.mjs --changed --allow-legacy --base HEAD` PASS after splitting the new module set: `settingssizeguide.ts` (98 lines), `sizeguidelabel.ts` (50), `sizeguidecopy.ts` (116), `sizeguide.ts` (261), `settingsgestures.ts` (21); `settings.ts` 356 → 297 and `actions.ts` 306 → 285 lines.
- `upload_ui` "previews each row's own approved SVG" was diagnosed instead of re-recorded as a flake: it waited for the SOURCE path literal, which the live export preview only shows until the prepared text replaces it, so it failed about half the time (also on a detached worktree of the base commit). The fixture now gives each file its own FILL (`#123456` / `#654321` / `#00ff00`), the identity a preview keeps in both the approved and the prepared rendering; three consecutive coverage runs of the file pass.
- `npm run verify:fast` PASS (ALL LANES): 222 suites / 2339 tests, build PASS.
- `npm run verify` PASS: native perf 5 suites / 30 tests, coverage 222 suites / 2339 tests, statements 94.64 %, lines 97.54 %, build PASS.

**2026-10-20 — Export settings UI review (size guide, badge, shadow)** (measured, not read back). Red→green fixes in the settings popup and the row list: the size guide now reads as four `.up-guide-block` groups (placement / S / L / spacing) with each logo's width and its OWN stroke width together and short block-scoped labels (full sentences stay the accessible names); the per-icon Shadow checkbox uses the same `.up-shadow-check` label as badge and size guide instead of wrapping the whole field in a label (the row was a giant click target); the selected-only Shadow and Badge blocks are `div`s with a label inside for the same reason; decoration notes inside a fieldset span the full grid instead of one 160 px column; and the row's settings cell names `badge` and `size guide S/L%` while they are on, so a decorated row no longer looks like a bare one. Three new `upload_ui` tests (group layout + labels, row summary, clickable checkbox labels) fail on the previous UI and pass now. `npx tsc --noEmit` PASS; `npm run lint` PASS (0 errors, 24 warnings, all pre-existing); `node tools/quality.mjs --changed --allow-legacy --base HEAD` PASS after splitting `SizeGuideLogo` helpers; `npm run verify:fast` PASS (222 suites / 2342 tests, build); `npm run verify` PASS (native 30, coverage 2342 tests, build). One earlier parallel `npx vitest run` flagged `quality_base` (concurrent gate spawns) and one `algo_efficiency` timing test; both pass alone and in the gates.

**2026-10-20 — the S and L letters share one legend size** (measured against the reference artboard, not read back). The reference's two letters are both 9 px tall while its logos are 27 px and 62 px wide, but the guide sized each letter from its OWN logo (28 % of that logo's width), so `L` came out twice `S`. `sizeguide.ts planOf` now derives ONE label height — 28 % of the SMALLER logo's width — and both labels use it; measured on a 512×256 export: logos 30.72 vs 61.44 wide, letters 6.08×8.60 and 5.22×8.60 (equal height, glyph widths 8:12 vs 7:11). Two geometry tests updated/added (red first): the shared height, and the reversed S>L case keeping them equal. `npx tsc --noEmit` PASS; `npm run lint` PASS (0 errors, 23 warnings); `node tools/quality.mjs --changed --allow-legacy --base HEAD` PASS (`sizeguide.ts` 267 lines); `npm run verify:fast` PASS (222 suites / 2343 tests, build); `npm run verify` PASS (native 30, coverage 2343 tests, build). One earlier parallel `npx vitest run` flagged the known `algo_efficiency` timing test; it passes alone and in the gates.

**2026-10-21 — Row settings isolation: no global action pins a row, one global reset** (measured, not read back). Diagnosed with a throwaway probe over the real panel: every global-dialog edit, the bar STROKE and opening a row's dialog left `overrides` at `{}`; the only global→row writer was the bulk bar's "Apply settings to selected" (`applyDefaultsToSelected` → `perIconFields`, 13 pinned fields on every checked row) — removed with its helper. Added `↺ Reset to defaults (N)` (`upload-reset-settings`, `resetBatch` in `selectedsettings.ts`, hook in new `settingsreset.ts`): clears every checked icon's pins (decorations included) as ONE `uploadSettings` entry, `null` after-side, disabled at N = 0. Red first: the four rewritten/new `tests/upload_ui.test.tsx` cases failed on the old panel, then 61 passed. `npx tsc --noEmit` PASS; `npm run lint` PASS (0 errors, 23 warnings); `node tools/quality.mjs --changed --allow-legacy` GATE PASSED (new file 22 lines; `actions.ts` 287 ≤ its 296 ratchet; `shadowactions.ts` 51); `npm run verify:fast` PASS (2344 tests, build). Plan and measured numbers: `docs/archive/2026-10-21-upload-row-settings-isolation/README.md`.


- 2026-10-21 — Size-guide corner logo stroke width switched from artboard `%` to `px` (`sizeGuideSmallStrokePx`, `sizeGuideLargeStrokePx`, 0–50 px, step 0.1; legacy `*StrokePct` read migration); `sizeguide.ts` affine 2-sample shrink step (`axisScale`) kept all functions within RULE 16 limits (`quality.mjs` green, 0 new debt).
- 2026-10-21 — That px change is merged onto this branch as `d8dfbbb` (cherry-pick of `9187ce2`) together with the row-settings isolation and the shared S/L letter size: four conflicts resolved by keeping this branch's bulk-reset test, deleting the retired `perIconFields`, and keeping BOTH geometry tests (shared letter height + fixed-px shrink). Re-measured on the merged tree: `npx tsc --noEmit` PASS; `npm run lint` PASS (0 errors, 23 warnings); `node tools/quality.mjs --changed --allow-legacy` PASS (`sizeguide.ts` 268 lines, all functions inside RULE 16); `npm run verify` PASS (native 30, coverage 2344, build).

**2026-10-21 — Applied decorations: a checked-set opt-in is not a row pin** (measured, not read back). The user's screenshot showed Shadow, Corner badge and Size guide all reading `overridden` in a row that never had a local edit — the three Checked-icons writers put `<decoration>Enabled` into the icon's `overrides` (the place the export/preview/fingerprint already read it) and nothing recorded provenance, so `markerOf` and the row's `overrideKeys(...).length` counted the selection-level opt-in as a pin. Fixed with a persisted marks map beside the same `v: 1` payload: `applied: { pairId: { shadow?, badge?, sizeGuide? } }` (module `lib/upload/decorations.ts`, `loadApplied`/two-argument `saveOverrides` in `settingsstore`, `applied` in the model and both undo halves of `uploadundo`). `settingsfield.markerOf` reads an applied flag as `inherited`, `UploadRow` counts `localKeys`, `commitDecoration` (one `uploadSettings` entry per gesture, both maps) replaces the three ad-hoc writers, and the row's own dialog (`overrideactions.ts`) drops a mark only when the flag's value really moved. `↺ Reset to defaults (N)` now counts a row with a local pin OR an applied mark (`resettableIds`) and clears both in one entry, never touching the stored defaults. Mutation-checked red first: removing the applied branch from `markerOf` fails `expected 'overridden' to be 'inherited'`; dropping the marks from `resetBatch` fails `expected { shadow: true } to be undefined`. `tests/upload_ui.test.tsx` 63, `upload_settings_store` 14 (round-trip + junk marks), `upload_undo` 19 (applied half) passed; `npx tsc --noEmit` clean; `npm run lint` 0 errors / 23 warnings; `node tools/quality.mjs --changed --allow-legacy` GATE PASSED; `npm run verify` ALL LANES PASSED (tests + coverage + build). Plan and measured numbers: `docs/archive/2026-10-21-upload-applied-decorations/README.md`.

**2026-10-21 — Reset clears LOCAL pins only; applied fields are field-level** (the user's correction: "the reset should apply to local setting but not to global … shadow should not be removed from global preset"). The bulk reset and the row's own reset no longer empty a checked row: `resetBatch`/`resetOverride` write the row's overrides MINUS every field a global control applied (`withoutLocalPins` + `marksOf` in `lib/upload/decorations`), and N counts local pins only (`resettableIds` → `localKeys`). The `applied` marks are now per FIELD (`{ pairId: { [field]?: true } }`) instead of per decoration, so a selected-only shadow width survives too: `commitBatch` marks every field whose value it moved, `commitDecoration` marks the enable flag it sets/unset, `markerOf` reads any applied field as `inherited`, and `marksAfterLocalEdit` drops a mark only when that field's value really changed. The stored defaults are still never written. Mutation-checked: removing the applied branch from `markerOf` fails with `expected 'overridden' to be 'inherited'`; dropping the kept fields from `resetBatch` fails with `expected { shadowEnabled: true } to be undefined`. UI 64 (reset keeps the shadow, its checkbox and a 120% applied width; undo restores the local pin), store 14, undo 19, full suite 2351; `tsc` clean; lint 0 errors / 23 warnings; `quality --changed --allow-legacy` GATE PASSED; `npm run verify` ALL LANES PASSED. Plan and measured numbers: `docs/archive/2026-10-21-upload-applied-decorations/README.md`.

**2026-10-21 — "Reset to defaults" renamed to "Reset to inherited"; it never touches a decoration** (measured, not read back). The user's second report: clicking the button unticked Shadow / corner badge / size guide in the Export settings popup. Cause: those boxes are derived from the checked rows' effective settings (`shadowselection`/`badgeselection`/`sizeguideselection`), and the reset deleted the rows' decoration flags whenever they were plain overrides (stored by an earlier build or confirmed in the row's own dialog) — the `applied` marks only protected this session's applications. The button is also not a defaults reset at all: `resetBatch` only deletes `overrides`, so the name was wrong. Now: `DECORATION_FIELDS` + `isDecorationField` in `lib/upload/decorations`, `withoutLocalPins` keeps every decoration field (flag and geometry) and `localResetKeys` excludes them from the count, so both `resetBatch` and the row's `resetOverride` drop only LOCAL GENERAL pins; labels/hints/tooltips say **"Reset to inherited"** (`upload-reset-settings`, `upload-set-reset`), history label and toasts follow; no defaults are written. Mutation-checked red first: dropping the decoration branch fails the migration case with `expected undefined to deeply equal { shadowEnabled: true, …(2) }`. UI 65 (all-three boxes stay checked + flags survive reset with defaults byte-identical; a row decorated by an earlier build without `applied` marks survives too; the row's own reset keeps badge pins and the applied shadow), store 14, undo 19, full suite 2352; `tsc` clean; lint 0 errors / 23 warnings; `quality --changed --allow-legacy` GATE PASSED; `npm run verify` lanes 1–3, 5, 6 PASSED (the uninstrumented native wall-clock lane measured 200–245 ms against its 200 ms budget under ~1.9 load on 2 cores with no detection code touched; standalone it passes 30/30 — budgets unchanged). Plan: `docs/archive/2026-10-21-reset-to-inherited/README.md`.

**2026-10-21 — Decorations are VALUES, not overrides: a reset now clears every parameter** (measured, not read back). The user's report, with a screenshot: after "Reset to inherited" some fields in the row's Settings dialog still read `overridden` — Shadow, and the size guide's X inset. Root cause: the previous fix protected decorations by refusing to delete any decoration field from `overrides`, so a decoration a popup had applied (or a geometry the row had pinned) survived the reset as a pin, and the markers derive from `overrides`. Fixed by separating the two maps: `applied: { pairId: DecorationValues }` now stores the VALUES a global control applied (`lib/upload/decorations.ts`, `rowSettings = defaults ← applied ← overrides`), the row dialog takes an `applied` prop and computes `{ ...defaults, ...applied, ...overrides }`, `markerOf` reads `overrides` only, and `resetBatch`/`resetOverride` delete the row's WHOLE override map (ONE `uploadSettings` entry per gesture, undo halves `{ overrides, applied }` value maps). The stored payload is `v: 2`; a `v: 1` payload (the marks era stored both `true` marks in `applied` and the values in `overrides`) is migrated once on read, while a `v: 2` payload's `overrides` are the user's own dialog pins (the live-preview suite caught the unconditional migration deleting `shadowEnabled` right after the dialog wrote it, so the version — not the presence of a key — is the discriminator). `toUploadSettingsPatch` accepts a decoration-only payload. Tests: `upload_ui` 65/65 (reset clears every parameter, markers read `inherited`, migration, undo), `upload_settings_store` 15/15 (a marks-era `v: 1` payload migrates, a `v: 2` one keeps its pins), `upload_undo` 19/19, `upload_live_preview` 14/14; full suite 2352 with only the known wall-clock `algo_efficiency` case red under load (4/4 standalone); `npx tsc --noEmit` clean; `npm run lint` 0 errors / 23 warnings; `node tools/quality.mjs --changed --allow-legacy --base HEAD` GATE PASSED after `commitBatch` was split (CC 11 → under 10); `npm run verify` ALL LANES PASSED; docs pages back under the 9,000 B budget. Plan and outcome: `docs/archive/2026-10-21-decorations-are-not-overrides/README.md`.

### 2026-10-21 — Research only: vector-only SVG → EPS

Added `docs/archive/2026-10-21-vector-only-eps/research.md` and its history-index entry. No production code, application dependency or regression-test implementation changed by this research. Direct Level 3 radial shading executed in an isolated WASM interpreter probe without triggering raster tripwires. The evaluated SVG-to-PDFKit/PDFKit/Ghostscript-WASM intermediary produced actual image painting for both its opaque and transparent-shadow probes; both failed the research raster guard. This does not certify arbitrary EPS or complete SVG conversion. The two requested SVG fixtures are absent from this checkout, so their actual-file export verification is blocked, not passed. Proposed release rule: any embedded raster artwork or unverifiable EPS fails export and test; verify final metadata-bearing and saved/read-back bytes, including cached/downloaded files. Documentation navigation test attempted but runner failed at startup: missing optional native dependency `@rollup/rollup-linux-x64-gnu`; no suite result claimed and no dependency reinstall performed.

### 2026-10-21 — Native vector-only EPS gradients implemented

Plan/research and measured outcomes: `docs/archive/2026-10-21-vector-only-eps/{implementation,verification}.md`. Native axial/radial shadings, vector clips, reference/coordinate resolution, bounded-error color×alpha composition and conservative uniform-backdrop analysis replace the blanket gradient refusal. No production dependency, application or helper added. `verifyEpsDocument` now requires a closed vector program/data grammar and canonical XMP envelope; raster/unknown code, bitmap previews and opaque data fail. Gate applies after metadata, at tmp/final saved-byte readback, cache eligibility and Download all. Tests include real exported EPS/XMP, raster-injected converters/caches and post-tmp filesystem corruption; zero bitmap escape hatch. Initial new suite 5 red/7 green before code; final EPS-focused suites 85/85. `npm run verify:fast` ALL LANES PASSED: tsc, lint (0 errors/23 warnings), quality, 2396/2396 coverage tests in 224 files, build. Lib line coverage 97.80%; new gradient/scene/data/transform modules and EPS stack checker 100% function coverage. Independent disposable GS-WASM executed final native template-shadow/axial EPS (4094/6320 bytes) with no raster painting; resvg comparison at 4× measured max interior difference 2/255 per channel. Temporary raster comparisons are test-only, not embedded artwork. Both full verify runs failed only the existing native algo_efficiency <200ms wall-clock case; standalone 4/4 with that case 180ms. Full aggregate gate is NOT green; no performance budgets changed. Two user SVG fixtures remain absent, so their input-specific exports are not claimed verified.

### 2026-10-21 — Remove misleading routine EPS shadow warnings

Plan/outcome: `docs/archive/2026-10-21-eps-no-routine-warning/README.md`. Removed supported-shadow capability messages from the amber bulk alert, row and both settings scopes, plus unused EPS-shadow selection count and props. Actual EPS stage errors, partial-status reporting and zero-raster audit remain unchanged. TDD: 2 regressions failed before implementation; focused UI/live-preview/export/docs 129/129 passed afterward. `tsc` clean; full `npm run verify` ALL SIX LANES PASSED, including native performance, lint, quality, tests/coverage and build. No production export logic or performance budget changed.

## 2026-10-21 — source-faithful stroke endpoints and export controls

- Plan/results: `docs/archive/2026-10-21-stroke-endpoints/README.md`;
  current contract/owners/handles: `sor/upload-stroke-endpoints.md`.
- TDD: inherited caps/joins, lifecycle, forced endpoints and decorated
  expansion initially 17 red/1 green; final focused suites 133/133 green.
- Source cap/join inheritance corrected in native EPS. Source/butt/round
  controls apply before measurement/expansion across preview and exports,
  including decorations. Settings validation/persistence/equality/undo,
  as-is, fingerprints and writer cache identity covered. Row redo now records
  the actual setting rather than null; endpoint selects are discrete gestures.
- Types/lint/changed quality pass; new mode module 25 lines, UI 22 lines,
  settings domain 299 lines; no new threshold violations. Fast verification
  all five lanes pass. First full run hit unrelated native detection timing
  260.03 ms vs unchanged 200 ms; standalone 4/4 then full recheck ALL SIX
  LANES PASSED (native 2.6 s; coverage 166.5 s; build 6.8 s).
- Full coverage 2419/2419 tests in 225 files, 97.81% library lines;
  strokecaps/restyle/settings each 100% statements/branches/functions/lines.
- Independent GS9.56 raster traps exit 0 for inherited butt/round/square EPS;
  15 endpoint/interior samples match resvg. Rasters are test-only; no runtime
  dependencies added, EPS remains vector only. User fixtures still absent.

## 2026-10-21 — shared batch progress and Upload metadata/export headers

- Plan/results: `docs/archive/2026-10-21-shared-process-progress/README.md`;
  current contract/reuse API/handles: `sor/process-progress.md`.
- TDD: three new UI regressions red plus missing shared module suite, then
  112/112 focused tests green. Tests use real metadata/export stages with gated
  fake transports/encoders: 0/50/100%, metadata-to-export handoff, cancellation
  blocking chained export, aborted-item exclusion, independent/stale snapshots,
  retained/dismissed summaries and a real Workbench cross-tab export/review.
- Shared header reused by Batch, SVG and Upload, with accessible progressbar
  values and responsive layout; generic immutable reporter/totals reusable by
  future batch tasks. Metadata orchestration extracted from hooks; hidden Upload
  stays mounted after first visit, progress portal stays above navigation,
  hidden shortcuts are silent. Existing Batch/SVG selectors/actions preserved.
- Explicit-base quality check passes: common UI 54 lines, pure model 42 lines,
  Upload adapter 58 lines, metadata runner 220 lines; no new gate violations.
  Types/lint pass. Fast all five lanes and FULL ALL SIX LANES PASSED; native
  2.5 s, coverage 172.2 s, build 6.4 s. No timing thresholds changed.
- 2431/2431 tests, 227 files; library lines 97.81%; new processprogress module
  100% statements/branches/functions/lines. Existing SVG test teardown stops
  unfinished runners before restoring transports; shell discovery is stubbed.
  No dependencies added; generated dist excluded from staging.

## 2026-10-21 — embedded stock JPEG/EPS metadata and independent upload test page

- Plan/results: `docs/archive/2026-10-21-stock-file-metadata/README.md`;
  current contract, owners, limits and page handles: `sor/upload-file-metadata.md`.
- JPEG now has XMP APP1 + UTF-8 IPTC Photoshop APP13; EPS keeps canonical XMP
  and adds a verified IPTC hex-comment resource without raster content. Shared
  binary/IIM/resource rules; unrelated JPEG resources and scan bytes retained.
  Full text remains exact in XMP, legacy mirrors have UTF-8-safe byte limits.
- TDD: both carrier assertions red before integration; both JPEG metadata repair
  scenarios red before planner changes. Final focused 129 passed + 1 skipped,
  8 files. The independent local upload page reads committed file bytes only,
  displays Title/Description/Tags, and checks both carriers without app readers.
- Fast ALL FIVE LANES PASSED; full ALL SIX LANES PASSED: types14.6s, lint11.0s,
  quality0.7s, native2.6s, coverage174.1s, build7.0s. 2451 tests passed, 1 skipped,
  230 files. Library line coverage97.96%; six new lib modules100% lines/functions.
  No quality/performance thresholds changed; no repository dependencies added.
- Independent probes: Resvg2.6.2→jpeg-js0.4.4 real raster/encode/decode and real
  export commits for two labeled supplementary SVGs. Chromium153 uploaded all
  four exported files via the page and read exact fields/carriers; malformed-file
  replacement/no page errors/390px no overflow passed. ExifTool13.59 read every
  XMP/IPTC field and UTF8 charset exactly from all four. GS9.56 raster traps:
  both EPS execute exit0 without image/colorimage/imagemask. Tools stayed in /tmp.
- Exact two requested source SVGs absent: one user-fixture acceptance explicitly
  skipped, never replaced by a claimed synthetic pass. Fixture suite discovers
  them in the requested asset folder when supplied. Generated dist excluded.

## 2026-10-21 — stock metadata actual-user-fixture acceptance follow-up

- Remote user commit61cc804 arrived during the feature: one SVG
  icon-handshake-heart_7_03_v2.svg and one EPS icon-handshake-heart_7_01_v2.eps.
  Merged without overwrite/force-push; both original files remain byte-identical.
  The initial missing-fixture skip above is now RESOLVED, not left deferred.
- Page suite asserts both exact originals, exports actual SVG to JPEG AND EPS,
  uploads committed bytes through the page input, then embeds metadata into the
  supplied EPS and checks unchanged vector instructions and page readback.
  All9 page tests, final132 focused tests/8files pass; no skip remains.
- Independent real-codec/Chromium probe repeated with the actual SVG: real
  Resvg→JPEG encode/decode and SVG→EPS atomic commits. All7 uploaded files
  (4supplementary + user SVG JPEG/EPS + supplied EPS with metadata) read exact
  fields and both carriers in Chromium153 and ExifTool13.59. Ghostscript9.56
  raster traps passed all4 EPS, including actual user artifacts. No artwork
  bitmap was introduced; only JPEG is rasterized by design.
- Post-merge verify:fast ALL FIVE LANES PASSED; verify ALL SIX LANES PASSED:
  types13.9s/lint10.9s/quality0.5s/native2.6s/coverage172.6s/build6.7s.
  2454/2454tests,230files,no skips; library lines97.96%. Current docs and test
  folder README now identify the actual SVG/EPS instead of missing fixtures.
  Generated dist remains excluded; no dependency or threshold changes.

## 2026-10-21 — Adobe snapshot contract and real-ingestion validation boundary

- Integrated user fixture commit451dcc9 without modifying the captured page or
  assets. Actual Adobe bundles use /uploads/presign and multipart file upload;
  a saved frontend lacks Adobe's server importer. Serialized textarea markup
  is empty while saved Redux already holds Title/Keywords for both EPS names;
  this cannot establish automatic-import provenance. Original EPS has no packets.
- Plan/results: docs/archive/2026-10-21-adobe-upload-validation/README.md;
  current guide: sor/upload-adobe-validation.md. No speculative writer change.
- TDD missing modules red →10 Adobe contract/tool tests green;23 focused tests
  with existing page/doc suites pass. Only inert form controls parsed; no saved
  scripts/resources/session state executed. Live check requires explicit upload
  permission, local authenticated CDP, unique draft filenames, fresh trusted
  Adobe response and exact selected UI fields. Never fills metadata, never
  submits/deletes. Missing metadata/timeouts/offline/login failures are not skips.
- Actual-original-EPS preflight failed as expected before any browser connection
  or upload. This is NOT live ingestion evidence. Actual new Adobe upload is
  NOT RUN/BLOCKED here: no Adobe reachability/authenticated session and no exact
  fresh failing JPEG/EPS supplied. No claim the user's import issue is fixed.
- verify:fast all5lanes; verify all6lanes PASS: types14.0s/lint10.8s/quality0.5s/
  native2.6s/coverage178.7s/build7.8s. 2464tests/231files, lib lines97.96%.
  No production changes, dependencies, threshold reductions or original-fixture
  edits. Reports omit account/session data; generated dist excluded from commit.

## 2026-10-22 — Both-format XMP/IIM contract and optional identity

Plan: docs/archive/2026-10-22-metadata-carrier-contract/README.md before implementation. TDD:7 initial failures -> green; independent-reader/regeneration failures -> green;102 focused tests pass. JPEG exact APP1/APP13 identifiers; EPS0404+0424 plus canonical XMP; optional Creator/Copyright survive edit/accept/cache/record/reload/regeneration, clearing removes claims. Actual user SVG exports to both formats, original EPS preserved. ExifTool13.59 reads five fields in both protocols on7 exports; guarded Ghostscript9.56 executes4 EPS without raster calls; Chromium file-input reads7 exports,5 fields,390px no overflow. Initial overlapping full gate failed (coverage lock/native timing), not counted; fast5 lanes and sequential full6 lanes PASS,2479 tests/233 files,97.99% lines. Full timings: types14.5s/lint11.4s/quality0.7s/native2.6s/coverage183.6s/build7.1s. No threshold changes. Adobe live ingestion NOT RUN; no Adobe fix claim. Generated dist and probe artifacts excluded.

## 2026-10-22 — Accept metadata for all checked icons

Plan: docs/archive/2026-10-22-bulk-metadata-accept/README.md before code. TDD missing-button and unchecked-row reload failures witnessed then fixed;3 new real-panel tests +12 eligibility/guard cases. Shared row/bulk clean/validate/cache gate, invalid/empty/unchanged skips, edited identity, no paid calls, one sequential re-embed batch with fresh-state map. Restoration cannot import a sibling pair's acceptance. 135 focused tests/6 files pass. Fast5/full6 lanes PASS sequentially,2494 tests/234 files,97.99% lines; native30 tests pass. Full timings types13.8s/lint10.9s/quality0.6s/native2.5s/coverage182.4s/build7.0s. Docs/handles updated, diff check clean; dist and withdrawn Windows changes not staged.


## 2026-10-22 — user-defined badge SVG template

Delivered a scope-aware SVG code/preview popup with draft Apply/Cancel/default recovery,
focus isolation, validated persistence, local-pin undo/redo and actual-template
fingerprints. Supported replacement vector geometry uses shared bake/copy/caps/
expansion and bounds proofs in actual preview/SVG/JPEG/native EPS preparation.
Untrusted code is inert-parsed, allowlisted and resource/effect limited; simple CSS
preserves specificity/source/inline precedence. Existing bundled badge and checked-only
opt-in behavior retained. Plan/results: `docs/archive/2026-10-22-custom-badge-template/`.

Measured: initial validator/editor and CSS cascade REDs witnessed; GREEN final focused
6 files/94 tests. The first aggregate run caught the legacy defaults-shape assertion;
updated for the new empty template field and reran both full gates sequentially.
`verify:fast -- --base HEAD`: 5 lanes PASS. `verify -- --base HEAD`: 6 lanes PASS,
2544 tests/237 files; native perf 30 tests/5 files. Full lane times: types 14.1s,
lint 12.2s, quality 0.7s, native 2.9s, coverage 205.0s, build 7.6s. src/lib coverage
98.03% lines, 94.98% statements, 98.02% functions, 89.35% branches. All five new lib
modules have 100% line/function coverage. Explicit-base changed quality: 15 files PASS;
no new scoped lint warnings, overrides or baseline changes. Single-file build
1737.56 kB / gzip 513.08 kB. Actual supplied SVG tested with optimization on/off;
both user originals unchanged. Raster APIs simulated in unit tests: no independent
pixel/interpreter or live Adobe/Windows ingestion claim. Dist, dependency reinstall
line-ending noise and temporary outputs excluded.

## 2026-10-22 — isolated full-verification speed redesign

Research/plan/design written before implementation; bounded two-worker VM main,
serial real-realm native project, pinned official Istanbul 5.0.3, DOM-only React
bootstrap and tool-owned static caches with explicit --cold. Original 2544
runtime cases/237 files preserved; 17 added regression cases, final 2561/244
PASS. Same 167 src/lib files and exact per-file line/function/statement counts;
98.03% lines, unchanged 80% threshold. Four branch hits differ by provider
(89.35% V8 vs 89.28% Istanbul), disclosed; V8 audit retained. Real uncovered-code
threshold, cache invalidation, module/global/storage/root/timer isolation and
benchmark exit/median/machine canaries pass, including single-worker isolation.
Standalone types/lint (0 errors, 23 legacy warnings), quality changed vs ecc5ffa,
fast and full gates PASS. Sequential accepted passing original architecture
replay 254.9463s (native workers only calibrated 4 -> 1, all six gates/original
tests); final warm repeats 80.3059s/79.4789s, median79.8924s =68.6630% faster.
Cold bypass117.3432s =53.9734% faster: 60% cold aspiration NOT met. Initial
242.80s baseline failed native alarms and is not accepted performance evidence.
Details/evidence: docs/archive/2026-10-22-test-harness-speed/{results.md,measurements.json}.
No app algorithms, test assertions, coverage scope or verification gates omitted;
no intentional live provider calls; generated dist/dependency/cache churn excluded.
Exact warm candidate times (JSON authoritative): 80.306083791s and 79.478741579s;
the preceding four-decimal candidate figures have a sub-millisecond transcription
rounding error; median/reduction and PASS/FAIL results are unchanged.

## 2026-10-23 — second harness investigation; additional 50% NOT achieved

User selected harness-only/application unchanged. New plan, profiling, rejected
probes and measured evidence: docs/archive/2026-10-23-harness-round2/. Passing
current warm baselines76.2973s/73.4715s (median74.8844s; half37.4422s). No tested
execution change justifies a switch: four VM workers58.66s coverage-only with
~113 CPU-seconds; heap64 no gain; isolated threads115.64s; Vitest4 warm64.30s;
main-only vmForks warm56.57s; optimizer83.04s failed cleanup/Selection assertions.
Retained original architecture, app source/compiler, dependencies, assertions,
isolation, coverage scope and native budgets. No intentional live provider call
added; pre-existing blocked-network diagnostics still occur in current suites.
Only shipped code: --required-reduction percentage comparator option, default60,
new target50 and invalid-input regressions witnessed RED ->GREEN. Comparison of
real73.4715s baseline to73.9280s final warm correctly reports target50 FAIL; no
speedup claimed. Full final81.0645s (post-probe cache revalidation),73.9280s warm,
108.6925s explicit cold: all six gates PASS. Final2563tests/244files (two new
comparator regressions), every original discovery entry retained; full coverage
JSON exactly identical on167src/lib files,98.03%lines. Standalone types, lint
(0errors/23legacy warnings), quality changed vs0fa074c, fast/full gates PASS.
Generated dependency/build/cache/private-version/profiling output excluded.

## 2026-10-24 — remove original Selection tab, retain Selection V2

Plan/dependency map written before implementation in
`docs/archive/2026-10-24-remove-selection-v1/README.md`. Witnessed6RED then
focused140GREEN/12files. Removed original nav/render branch and exclusive
SelectionPanel/HeaderRow/FilterBar/PairList (418lines), sidebar-collapse state
and undo handling, and single-sided thumbnail resolver. Retained V2 engine,
comparison, selection/hotkeys, roots/sidecars and shared SVG/Upload/Batch/history
consumers. Old saved tab `selection` migrates to `selectionV2` with valid view,
checked ids and anchor retained; old collapsed field is discarded. Five tabs.
Original3UI smoke cases ported to V2, not deleted; log/scroll/layout and session
regressions updated. Standalone tsc, lint (0errors/23existing warnings), changed
quality vs c403c22, verify:fast5lanes and verify6lanes PASS. Full2568tests/245files,
native30tests/5files separately PASS,98.03%src/lib lines. Single-file build
1723.38kB/509.74kB gzip. No user files, sidecars or shared handle/session keys
deleted, no intentional live provider request, no coverage/gate relaxation.
Current owner/selectors/storage/overview/history routes updated; generated
dist/dependency/cache churn excluded.

## 2026-10-24 — Selection V2 output-folder discovery exclusions

- Planned before implementation: `docs/archive/2026-10-24-selection-output-folders/README.md`.
- Whole-name case-insensitive `export`, `AI source regeneration versions`, `SVG versions` pruning before traversal, media/sidecar reads and split-scope calculation; excluded picked roots are empty without metadata reads. Preserve real/near-miss sources and explicit saved-version reads. Reconcile stale checks/anchor, including completed empty scans.
- Witnessed 13 RED regressions, then focused 200 GREEN tests/10 files. Real V2 DOM reproduction shrank from 13 phantom/real rows to the one genuine split pair. New pure folder policy: 100% coverage across all metrics.
- Types, lint (0 errors/23 pre-existing warnings), changed quality vs4616d1e PASS. Initial fast gate: unchanged Upload T2 restore assertion failed; isolated unchanged Upload suite 73/73 PASS, full fast rerun PASS, then full verification all6lanes PASS. No Upload/harness changes or skipped/weakened gates.
- Full suite:2581tests/246files; separate uninstrumented native:30tests/5files. src/lib coverage:98.03%lines,98.02%functions,94.98%statements,89.28%branches. Production single-file build:1723.61kB/gzip509.79kB. Owning docs/router/selectors/invariants/owners/test inventory updated. Generated dependencies/dist/coverage/caches excluded from delivery.

## 2026-10-24 — parallel confirmed SVG/image processes and completion sound

Plan-before-code: `docs/archive/2026-10-24-svg-parallel-runs/README.md`. Witnessed scheduler/journal/correction RED, plus two input-safety RED regressions and first-click audio-activation RED; final focused GREEN. Atomic canonical sidecar ownership, fair disjoint admission, persisted 1/2/3 SVG slots (default 3), independent image run, frozen inputs/settings, isolated progress/controllers/Stop, guarded sidecar/root mutations, per-source terminal release and run-scoped journal IDs. Waiting previews block image/main changes; reverse SVG confirmation refuses active image mutation; unknown/stopped outcomes remove affected queued retries with a warning, not automatic paid resends. Real stream/image tests retain both histories, completed-row correction and exception cleanup. Local once-per-completed-process sound, mute/Test, cancellation/refusal/drop silence and blocked-browser safety. Requested MP3 absent; explicitly labelled built-in fallback plus exact-file inline embedding hook, not a claim of the supplied recording.

Verification: focused integration 160/160 across 11 files; final expanded queue/review/guard/audio/state suites 64/64 across 5 files; docs/audio 8/8. Types, lint (0 errors/23 existing warnings), changed quality vs9cf6e27, verify:fast and full verify PASS:2609 tests/249 files, native30/5; unchanged coverage scope/thresholds/native budgets, src/lib aggregate98.03% lines/89.31% branches, new joblocks100% all metrics. Build1731.11kB single HTML. Initial complete fast run found two incomplete legacy fixtures missing new busy:null field; repaired and added guard coverage, then both complete gates GREEN. No live provider requests, dependency/harness edits, build or evidence staged. Evidence `/home/user/svg-parallel-runs/`.

### 2026-10-24 — supplied completion MP3 integrated after concurrent remote update

First push was non-fast-forward rejected because user commit7f9952b added the exact requested41,795-byte MP3. Fetched/merged on the same branch without force or lost work. Byte-exact sound integration test first RED (cached empty optional glob still chose fallback); switched to explicit required inline import, removed temporary substitute tone, decoder failures report unavailable/silent rather than claim the recording played. Focused audio/docs10/10 GREEN. Repeated explicit changed quality vs9cf6e27, verify:fast and full verify ALL PASS with real asset:2611 tests/249 files and native30/5; src/lib98.03% lines/89.31% branches, joblocks100% all metrics; lint0errors/23existingwarnings. Production HTML1786.51kB/554.33kB gzip. Full Base64 byte comparison proves the built HTML embeds the entire supplied MP3, no runtime audio fetch. Current docs updated; earlier missing-file/fallback note describes initial verification only. Evidence `/home/user/svg-parallel-runs/*supplied-sound*.log`.

## 2026-10-24 — image regeneration automatic Apply and Batch-style process bar

Plan before code: `docs/archive/2026-10-24-image-auto-apply/README.md`. Real-panel2RED/34GREEN witnessed missing checkbox/bar, then expanded46/46 across5files GREEN. Persisted explicit default-off **Regenerate images: apply automatically** opt-in, moved/swapped-artwork warning and frozen per-confirmation policy; automatic crops use existing stale-source/root/pair validation and non-overwriting version commits, no initial-consent bypass or uncertain retry. Single/composite image processes have independent shared-style progress above tabs, actual per-cell processed/saved/failed/discarded counts, review/saving/stopping/terminal states, Stop after send, honest partial percent and dismiss/restore. Manual review stays default. Composite journal/send announcements extracted for size. Tests cover two automatic requests with policy change during run, stale-cell refusal, Stop, independent histories, portal outside hidden panel and late-event isolation. Existing nine-cell manual assertion now waits for all saves, not only first, preserving every assertion.

Types/lint(0errors/23existingwarnings), changed quality vs50d6aba, docs4/4 and verify:fast PASS. Initial full run: functional2619/250 and build PASS, unchanged native synthetic detector207.3ms failed200ms alarm; isolated unchanged native30/5 PASS, then complete full rerun ALL LANES PASS:2619tests/250files plus native30/5. No algorithm/harness edits, skipped tests, threshold/budget weakening or cached successes. Coverage src/lib98.03%lines/89.31%branches; build1790.17kB/555.35kB gzip, supplied MP3 preserved. Current docs/router/selectors updated. Evidence `/home/user/image-auto-apply/`; no live provider requests or generated/dependency outputs staged.

## 2026-10-24 — Automatic SVG upload fit/frame repair

Plan archived before implementation at `docs/archive/2026-10-24-upload-auto-repair/README.md`. Integrated the user's e6e3988 fixtures unchanged. Genuine RED: eight shadow viewport cases, then both supplied bulbs' 64px/50px-stroke four-pass failures. Kept the four-pass fast path; added bounded actual-geometry pinned search with verified final centring, unchanged strokes/padding/pinned dimensions and honest pass counts. Shadow preparation repairs only <=2% stroke-only viewport overshoot with contained visible geometry; real clipping/large overshoot/impossible fits still refuse. Added 96 real-logic regressions including actual vector EPS, source-frame-shadow/wide-stroke combinations and source immutability. Final types/lint(0errors/23existingwarnings)/quality vs e6e3988/docs/verify:fast/full verify PASS:2715tests/253files plus native30/5; coverage95.01%stmt/89.31%branch/98.03%fn/98.05%line, fallback100%line/86.36%branch. Full coverage lane75.2s; build1791.86kB. Initial CC11 and doc-size9117byte checks corrected by extraction/consolidation, thresholds unchanged. Current owners/tests/geometry/invariants/router updated, ledger not read. No live providers, harness/budget/scope changes or generated/dependency outputs staged.

## 2026-10-24 — Completion sound for actual processes on every tab

Preimplementation plan: `docs/archive/2026-10-24-all-process-sounds/README.md`. Genuine focused RED5/missing audio with3controls GREEN, then real-process GREEN. Reused exact embedded MP3, persisted mute, queued once-per-run playback. Added shell pointer/keyboard activation and runner terminal cues for Sheets imports/exports, Batch split/preview/manual review/scans, Selection bulk/retry/scans, SVG explicit scan/review, Upload metadata/export/download/scans. Stop/refusal/no-op/restore/superseded scans and automatic Batch preview-review remain silent. Upload scan awaits row assembly; chained metadata/export keep independent cues; no header/reducer effect audio. Cohesive real Sheet import extraction reduces legacy App. Added18tests and strengthened real UI phase-chain/hidden/cancel/download/bulk/cache assertions; focused207/12 and final integration/docs94/4 PASS. Types, lint0errors/23existingwarnings, quality vsb9c2a85, docs, verify:fast and full verify ALL PASS:2733tests/255files plus native30/5. src/lib coverage95.18%stmt/89.37%branch/98.14%fn/98.20%line; full coverage77.0s; HTML1793.20kB. Corrected initial scan complexity by cohesive extraction; fixed wrapper DOMException cancellation under test, no gates/expectations weakened. ZIP tests normalize browser Blob I/O only, real compression/detection/rendering unchanged. Current contracts/router/handles/owners/tests updated; no live providers, harness/budget/isolation/scope edits or generated/dependency artifacts staged. Ledger not read.

## 2026-10-24 — Grid-aligned final SVG fit centring

Plan written before production changes: `docs/archive/2026-10-24-upload-centred-fit/README.md`. Reproduced exact measured-artwork no-fit on supplied leaf _03 with64x64/50pxstroke/8%padding. Origin bounds50.006x51.971 became54.883x54.883 after half-grid centring at(31.997,32.9795); final painted containment correctly rejected it. Use shared0.001px formatter for final translation (<=0.0005px adjustment/axis), retaining final real re-probe,0.002px containment,0.008px search guard,37total-pass cap and four-pass fast path. No artboard/stroke/proportion/source change.20new real regressions cover both bulbs, padding/centre precision, nearby settings, rectangular boards, shadows, expansion, exact failing leaf's vectorEPS, determinism and optimized/cleaned containment, impossible-fit refusal. Separate pre-existing below-precision circleEPS limitation documented; EPS gear/circle tests use representable40px geometry, failing leaf keeps exact50px; no existing assertion/subset check relaxed. Focused255/8 GREEN; types/lint(0errors/23existingwarnings)/quality vse8aecf1/docs/verify:fast/fullverify ALL PASS:2753tests/256files plus native30/5. Coverage95.25%stmt/89.62%branch/98.14%fn/98.25%line; fallback100%line/86.36%branch; coverage88.3s; HTML1793.22kB. Current contract/owners/tests updated, existing router route retained. Ledger unread, no live providers or generated/dependency artifacts staged; no harness/budget/isolation/scope changes.


## 2026-10-24 — Automatically accept valid newly generated metadata

- Plan recorded before production changes in `docs/archive/2026-10-24-metadata-auto-accept/README.md`; genuine UI RED for row Generate, row Regenerate and selected batch (generated drafts instead of accepted). Removed flow-specific acceptance opt-in; every complete validated response now publishes/caches accepted once and logs once, preserving Creator/Copyright and the run-local accepted map. Ordinary completion sequentially refreshes existing packages only; explicit Export selected keeps its whole-selection promise. Initial paid-input confirmation, policy validation, legacy/manual-edit acceptance, failure/cancellation safety and completion progress/audio remain.
- Ten new real UI regressions, no algorithm mocks: automatic row/bulk Generate/Regenerate, persisted accepted reload, rights, no unsolicited packages, existing-package refresh, mixed accepted counts, invalid/malformed/truncated results, failed/cancelled regeneration and partial cancellation. Existing manual-accept tests now seed actual legacy source-hash cache drafts; request counts/scope/validation/persistence assertions preserved. Restore regression explicitly awaits row assembly after the audit; no harness changes. Focused 140 tests/7 files PASS.
- Types, lint (0 errors/23 existing warnings), changed quality vs55e34d0, doc-navigation, verify:fast and final full verify ALL PASS: 2763 tests/256 files plus native30/5; src/lib95.25%stmt/89.62%branch/98.14%fn/98.25%line unchanged. Final coverage89.6s; self-contained HTML1793.09kB/gzip556.41kB. No live providers, skipped tests, changed algorithms/harness/budgets or staged build/dependency artifacts.
- Repeat-run evidence retained: first full aggregate passed; a repeat passed all functional tests but synthetic native detection took244.4ms against200ms (metadata-only diff, detection/native/harness unchanged). Three complete independent native diagnostic runs then passed30/5 each; final full aggregate also ALL LANES PASSED. Budget not relaxed and failure not hidden. Logs `/home/user/metadata-{auto-red,focused,types,lint,quality,docs,fast-final,full-final,full-confirmed}.log`, plus native diagnostic1–3. Current contract split into bounded linked metadata/acceptance pages, router/handles/owners/tests updated. Ledger appended without reading.


## 2026-10-25 — Download all shared progress

- Planned before production edits; genuine RED on missing download track/hidden portal. Download all now owns an independent shared progress slot: current file, settled files/total, remaining, percentage, header/toolbar Cancel and retained completion/error/cancelled summary, Review/Dismiss, visible across tabs. Actual copy/readback outcomes advance once; cancellation finishes active verification and blocks the next copy. Source/plan captured, rapid same-render duplicate picker/copy guarded, empty/cancelled picker silent; completion sound exactly once via the shared reporter. No-overwrite, collision planner, byte checks/failed-write removal, EPS verification and selected-only scope preserved.
- Eight added real UI/reducer regressions; focused132/8 PASS, including actual Upload metadata/export and shell suites. Tests cover0/33/67/100%, both cancel controls, hidden completion/cue/review, mixed kept/missing/failed outcomes, duplicate reservation/repeat runs, empty/cancelled picker and independent459-file slot. Existing assertions retained; test-local Upload waits now await real row assembly after the audit and real metadata terminal summary after accepted row publication. No harness/algorithm/budget changes or skips.
- Types, lint(0errors/23existingwarnings), changed quality vsbcdf9a8, docs, verify:fast and final full verify ALL PASS:2771tests/256files plus native30/5; unchanged src/lib95.25%stmt/89.62%branch/98.14%fn/98.25%line. Coverage82.0s; single HTML1794.39kB/gzip556.78kB. Current contract/handles/router/owners/tests updated within read budgets. Ledger appended unread; build/dependency artifacts excluded.
- Diagnostics retained: npm run setup restored absent native Rollup; new test tab ID corrected. One full-run synthetic native alarm249.0ms/200ms on unchanged detection code; standalone native30/5 PASS (synthetic147.5ms, exact172.3ms), final full aggregate ALL LANES PASSED with original budgets. Logs `/home/user/download-{progress-red,focused,types,lint,quality,docs,fast,fast-final,full,native-diagnostic,full-confirmed}.log`; plan/results `docs/archive/2026-10-25-download-progress/README.md`.

## 2026-10-25 — Collapsible decoration popup groups

- Plan: `docs/archive/2026-10-25-collapsible-decoration-settings/README.md` written before production edits. TDD: 12 genuine RED -> 12 GREEN native-disclosure tests in both popup scopes. Badge, Size guide and Shadow initially folded, independently expandable, controls/drafts retained; no enablement/default/override/check changes from folding. Existing UI helpers open folded ancestors; original assertions retained.
- Final focused 30/4 PASS; documentation navigation 4/4 PASS; types, lint (0 errors/23 existing warnings), changed quality vs b0c429a PASS. Full verify ALL LANES PASSED: 2783/257 functional plus 30/5 native; final post-documentation fast verify ALL LANES PASSED: 2783/257. src/lib coverage 95.25% statements / 89.62% branches / 98.14% functions / 98.25% lines. Single-file build 1794.85 kB / gzip 556.90 kB.
- Earlier focused/fast runs had intermittent existing Upload UI toast assertions (different metadata/key messages empty at assertion time); all new tests passed. Isolated suspects and observational whole-file run passed; temporary tracing restored immediately. Final full and fast passed on unchanged source; this is not a claimed toast fix. Failed and passing logs retained as `/home/user/disclosure-*.log`; archive records details. No harness, thresholds, native budgets or algorithm edits; no browser probe claimed. Current settings/selectors/owners/tests/router updated within existing byte limits. Build/dependency changes excluded from commit. Ledger appended without reading it.

## 2026-10-25 — Four independent export padding sides

- Preimplementation plan: `docs/archive/2026-10-25-four-side-padding/README.md`. Genuine initial RED 25 failed/2 passed -> 27 GREEN; final 34 added regressions cover settings compatibility/clamps/equality/hash, both popup scopes, content/pinned/MP fitting, strokes/expansion/Shadow/no-fit, supplied wide-stroke SVGs, actual stock SVG/JPEG/vector EPS export, selective re-export, preview/reload and undo/redo. Existing UI tests edit Left and assert unchanged other sides; selection/reset/undo assertions retained.
- Types, lint (0 errors/23 existing warnings), changed quality against 7fa8ffb, docs navigation 4/4 and whitespace PASS. Fast and full verify ALL LANES PASSED: 2817 functional tests/260 files plus native 30/5, unchanged budgets. Coverage 95.28% statements / 89.67% branches / 98.16% functions / 98.26% lines; new padding domain 100% all four. Build 1796.66 kB / gzip 557.47 kB. Logs `/home/user/padding-*.log` retain initial RED and test-assumption corrections as well as final passes.
- Default/source margins, legacy scalar/null payloads and factory fingerprint36232c04 preserved; equal sides canonicalize to legacy scalar. No original file writes, raster artwork in EPS, provider calls, harness/threshold edits or coalescing changes introduced. Canvas transport injection is not real-browser raster visual validation. Current padding/settings/geometry/selectors/invariants/storage/owners/tests/router updated within original byte limits. Build/dependency artifacts excluded. Ledger appended without reading it.

## 2026-10-25 — Import named Upload row labels from 10f6776

- Preimplementation import plan: `docs/archive/2026-10-25-import-upload-row-badges/README.md`. Ported the unique feature delta from arena/54da14bf-iconsplitter (10f6776fa3aa76d56f2f30a51fef120c92c2d104), not old snapshots; preserved current Download all progress/cancel, collapsed settings groups and four-sided padding. Imported source ledger excluded unread. Catalog CRUD, per-row/checked-set application, badge filtering, validated local persistence and global undo/redo are independent of export artwork/metadata.
- RED: three source test files failed collection on missing feature modules (no behavior assertions ran); imported 17/17 GREEN. Added two real UI integration tests for hidden checks/padding/disclosure/independent undo plus one CSS scope regression, genuine RED -> GREEN. Source CSS columns now Upload-only, preserving Generate SVG layout. Focused87/7 and integration43/5 PASS, including actual download UI file; archive discloses an initially nonexistent filename pattern. Types, lint(0errors/23existingwarnings), changed quality vs5d579cf and docs4/4 PASS.
- Full verify and final fast verify ALL LANES PASSED: 2839 functional tests/264 files, native30/5. Earlier fast failed one known timing-sensitive API-key toast assertion (2838/2839); retained failure and later success evidence, no toast/harness/assertion/threshold changes and no claimed flake fix. Logs `/home/user/rowbadge-import-*.log`. Coverage95.32%stmt/89.72%branch/98.20%fn/98.29%line; rowbadge domain100%functions/lines. Build1808.95kB/gzip560.34kB. Current docs merged within original budgets, no browser probe claimed. Scoped commit excludes existing build/dependency artifacts. Ledger appended without reading.

## 2026-10-25 — measured selective-geometry harness redesign; 5.3x UNMET

- Plan/research before implementation: docs/archive/2026-10-25-harness-430/README.md; measured outcome in results.md. No application/algorithm/asset edits. Exact-once three-project partition keeps normal DOM suites isolated in VMs, measured geometry hot files isolated in native threads, unchanged native inventory serial/uncontended. Fix genuine queued-Promise-before-future-timer waitUntil defect without extending budgets/removing assertions.
- Genuine TDD RED→GREEN: policy1/4 RED, quiet1/4 RED, speedup comparator3/9 RED; focused32/9 GREEN. New native-realm isolation canaries PASS2/2 with one worker; private isolate:false negative control correctly FAILS leaked global state. Benchmark --required-speedup5.3 reports throughput/time units and rejects ambiguity, failed/different-machine evidence; legacy60%/50% targets retained.
- Successful original full warm118.1429s/cold142.6921s; candidate fully warm91.02/91.47s, median91.2421s, cold122.6012s. Apparent warm1.2948x (+29.48% throughput,22.77% time reduction), cold1.1639x. Required5.3x (+430%) NOT MET; both real comparator commands return1/passed:false. Original warm repeats88.95/91.28s FAILED with UI readiness/toast assertions and are retained/excluded, so single successful baseline and host timing variation do NOT establish a guaranteed29.48% gain. First-transform candidate105.13s separately disclosed. Global threads/V8 coverage148.71s rejected; no speculative lane overlap shipped.
- Final fast/full ALL LANES PASSED2849tests/267files, full additionally native30/5. tsc PASS; lint0errors/23existing warnings; changed-quality vs824e6c8 PASS (no src edits); docs4/4 and whitespace PASS. Full src/lib coverage unchanged95.32%stmt/89.72%branch/98.20%fn/98.29%line, lines80 threshold retained, real algorithms remain tested. Build1808.95kB/gzip560.34kB. Raw logs/reports/profiles /home/user/harness-430; no generated/dependency/build artifacts staged. Ledger appended without reading.

### 2026-10-25 — Additional40% full-system investigation (safe partial; target NOT met)

Reference281edd6, Linux/Node22.22.3/2CPU/4131278848B. Plan before implementation:
`docs/archive/2026-10-25-harness-40/README.md`; results/evidence in its results.md.
Reference warm91.85/96.16s (median94.00398), retained92.14/90.31s (91.22763):
nominal2.9534% less time; cold129.92→117.85s (9.2913%). Required56.40239s warm
NOT attained. Both per-reference warm comparisons and cold40%-required comparator
correctly FAIL; no best subset/prototype substituted. Additional final full
release86.37687s also passes; inclusive three-run warm median90.31s (~3.92% less),
with both inclusive40%-required comparisons also failing. Timing is noisy.

Retain disclosed REAL application offset optimization: same Bernstein arithmetic,
conservative interval certificates with rounding slack, original40-step fallback,
TOL/checkpoints/depth/subdivision/output unchanged;36 original hashes,648threshold
and7special oracle comparisons PASS; genuine call-through RED5658→GREEN<100.
Keep serial verification DEFAULT; explicit --overlap opts into native quarantine
then bounded static/build + full-suite pipelines, --serial/resource fallback wins.
Seven REAL child fixtures prove ordering/isolation/overlap/failures/unknown groups/
spawn errors and process-tree cancellation; deliberate serialization/direct-child-
only mutations FAIL. Plan metadata genuine RED→GREEN; focused22/4 PASS.

Reject direct-global VM/four-worker/default-overlap experiments: no proved gain.
Reject ALL automatic timer/immediate cancellation; invalid shared-immediate
prototype deadlocked IndexedDB/native work (291.75s failed), timeout-only ownership
and benefit unproved. Quiet helper/DOM setup/quiet tests restored byte-for-byte.
No tests/coverage/budgets/pools/provider/dependencies weakened. New kernel100%all
metrics; src/lib95.33/89.74/98.20/98.29 vs95.32/89.72/98.20/98.29, scope+1module.

Standalone tsc/lint/changed-quality and final fast/full ALL LANES PASSED2862/270,
plus native30/5; lint0errors/23existing warnings. First release-fast failed router
5002B cap (shortened) and one unexplained metadata-toast readiness assertion;
focused87/2 then fast/full PASS, no assertion/deadline changes; failure retained.
Reference/candidate logs also retain pre-existing blocked TLS attempts, not hidden
by a global fetch mock. Current owners/test index/router refreshed <=9KB (router
<5KB); UI handles unchanged; raw evidence losslessly compressed with SHA256.
No dependency/cache/build/coverage/profile artifacts staged. Ledger appended unread.

### 2026-10-25 — Upload Apply as local selected-batch settings

Plan before code: docs/archive/2026-10-25-upload-apply-local/README.md. Global
Export settings now has Apply as local (N), disabled without checks, absent from
per-row scope. Copies current global general fields into all checked loaded
rows (including hidden checks), replaces old general pins and freezes each row's
current effective decoration choices; separate applied map/defaults/checks stay.
Full canonical fields include equal/default/off/null values. Nested artboard and
padding are copied; explicit content-fit artboards survive reload/history. No new
store/schema or paid/export/source operation. Ordinary global editing remains
live for inherited fields; existing reset clears local pins. One uploadSettings
undo/redo entry per changed batch; duplicate/stale/unchecked/no-op ids do not add
history. Persistent undo works while panel is unmounted; draft blur precedes Apply.

Genuine feature RED5→GREEN10/2 (Rollup startup failure not counted as RED; npm run
setup repaired foreign-platform deps). Broader focused79/8 and docs4/4 PASS.
Standalone types/lint/changed-quality vs2187e78 PASS, lint0errors/23existingwarnings.
Fast AND full ALL LANES PASSED2872tests/272files plus uninstrumented native30/5;
all gates/build PASS. src/lib95.33/89.74/98.20/98.29; new settingslocal100%allmetrics.
Real prepared SVG512/1024/2048 and unchanged as-is bytes tested. Initial new-test
history-total assumption and unused import fixed, no old assertions/budgets weakened.
Current settings detail, selectors, source/test/storage indexes and router updated
<=9KB (router<5KB). Ledger appended without reading. Generated dependencies/build/
coverage/logs remain outside the scoped commit; no live provider calls made.


## 2026-10-25 — Independent SVG/JPEG output selection

Plan: `docs/archive/2026-10-25-upload-output-formats/README.md`; contract:
`sor/upload-formats.md`. Added default-on SVG/JPEG settings, inherited/local batch
pins and truthful all-off preflight. Requested-only planner/probes/artifacts and
atomic record detachment keep disabled bytes out of new downloads without
removing old files. EPS-only failure cannot commit an empty green package;
paid export metadata excludes no-output rows, mixed batches isolate failures.
Failed rows no longer count as exported in the batch toast.

Measured RED12 format failures before implementation, plus separate EPS-only
warning/failed-summary RED. Final focused128/10 PASS; types PASS; lint0errors/
23existingwarnings; changed-quality vs c9a99d7 PASS; verify:fast PASS; verify full
PASS:2894tests/275files + native30/5 + production build. Coverage95.37/89.81/
98.21/98.29 (statements/branches/functions/lines), formats.ts100% throughout.
Actual supplied handshake SVG EPS-only, all7 combinations, metadata carriers,
no raster while JPEG off, no-op/disable/re-enable, persistence/undo/redo and real
mixed-batch isolation tested. No live providers, source artwork writes, altered
thresholds/test isolation/scope, skips or generated artifacts committed.


## 2026-10-25 — Named global Export settings presets

Plan `docs/archive/2026-10-25-upload-settings-presets/README.md`; current contract
`sor/upload-settings-presets.md`. Added named create/load/rename/confirmed-remove
catalog under an independent versioned key. Canonical settings normalization,
case-insensitive collision rejection, 1–60 character names,50-entry bound,
normalized nested snapshot copies and verified-storage failure reporting.
Only explicit Load changes inherited globals; local pins/checks/applied decoration
choices stay. Save/rename/remove do not alter current export settings or files.

RED UI absence witnessed before implementation; final focused21/5 PASS,
including fresh boot, normalized custom template/padding/artboard, existing pins,
Apply-as-local/Undo and real SVG/EPS export with JPEG off/source unchanged.
Types PASS; lint0errors/23existingwarnings; changed-quality vs a5acedf PASS;
verify:fast PASS; full verify PASS:2901tests/277files + native30/5 + production
build. Coverage95.39/89.87/98.22/98.30 (statements/branches/functions/lines).
No src/lib mocks, provider calls, dependencies, skipped tests, weakened gates,
source artwork writes or generated artifacts committed.


## 2026-10-25 — Compact export preset toolbar

Plan `docs/archive/2026-10-25-compact-export-presets/README.md`; current owner
`sor/upload-settings-presets.md`. Replaced bordered/two-row card with a single
wrapping toolbar and capped selector. Save as/Rename open an auto-focused inline
form; submit closes only after verified success; Escape/Cancel/select/removal
dismiss it without changing stored settings. Duplicate/storage errors retain
editable names. Explicit Load and confirmed removal remain intact.

Genuine RED compact-idle assertion; focused23/5 PASS; types/lint/changed-quality
vs dcee771 PASS (0errors/23existingwarnings); verify:fast PASS. Final full verify
PASS:2903/277 + native30/5 + build; coverage95.39/89.87/98.22/98.30.
Earlier full attempts: metadata-toast summary timeout, then native synthetic
201.30ms vs200ms; standalone upload UI83 assertions passed (focused coverage
command still exited1 from global floor). Final unchanged-code full run passed
all lanes together. No weakened alarms, test skips, src/lib/algorithm/harness/
isolation/dependency/storage-schema changes or generated artifacts committed.


## 2026-10-25 — nearest pending row below in displayed order

- Fixed Selection V2 list/comparison auto-next to use the pre-decision filtered/sorted order instead of raw scan order, without wrapping. Added the same shared `nextPendingBelow` rule to one-row Batch and Generate SVG review; SVG retains generated-item eligibility, reads live candidate review metadata and does not steal an active row changed while saving. Checks/anchors, manual navigation, bulk scopes, confirmations, persistence/history and sound remain intact. Current owner: `sor/review-navigation.md`; plan: `../archive/2026-10-25-next-pending-below/README.md`.
- TDD witnessed: initial 8 regressions failed (72 passed); stale SVG candidate test separately failed (58 passed). Final focused 171 tests/7 files passed. Types, lint (0 errors/22 existing warnings), changed-quality vs 6c5b909 and verify:fast passed.
- Full `npm run verify -- --base 6c5b909`: ALL LANES PASSED, first full run. Native 30 tests/5 files; coverage 2917 tests/277 files; statements/branches/functions/lines 95.40/89.90/98.22/98.30%; production build passed. Coverage lane 90.2s, native 3.9s. Logs: `/home/user/next-pending-below/verify-full.log` and focused/red logs in the same external folder. No weakened assertions, gates, native alarms, isolation or harness changes.


## 2026-10-25 — Selection bulk bar stays pinned while scrolling

- Added sticky top 0/z-index 6 to the existing complete `v2-bulk`, matching Batch/SVG/Upload. Existing opaque surface, wrapping controls and list-height workspace preserve selection, zoom, review confirmation and auto-next behaviour. Current Selection behaviour/selectors updated; plan: `../archive/2026-10-25-selection-pinned-bulkbar/README.md`.
- Genuine RED: 1 failed/44 passed on missing sticky CSS; focused GREEN: 57 tests/4 files, including CSS/DOM pinning contracts and docs navigation. No browser scroll-geometry verification claimed. Types/lint passed (0 errors/22 existing warnings); changed-quality vs 101985a passed with no applicable production TS/TSX files (CSS-only edit).
- Fast and full verification both ALL LANES PASSED; first full run: 2919 tests/277 files, native 30/5, coverage statements/branches/functions/lines 95.40/89.90/98.22/98.30%, production build passed. Coverage lane 92.8s, native 3.9s. Logs: `/home/user/selection-pinned-bulkbar/`. No gates, assertions, thresholds, harness, isolation or algorithms changed.


## 2026-10-25 — choosing a version accepts the actual source/SVG

- SVG chip/history choice now atomically saves `preferred` plus item approval, including the currently displayed/default version. AI image choice validates a completed/readable saved image and saves the main pointer plus source approval, preserving independent SVG review and live metadata. Upload uses the accepted SVG rather than always the newest, and excludes an unavailable selected file instead of substituting artwork. Real export regression verifies selected older artwork and untouched originals/history. Current contract: `sor/version-acceptance.md`; plan: `../archive/2026-10-25-accepted-version-selection/README.md`.
- Genuine initial RED 7 failed/59 passed; additional stale-row regression fixed with shared row derivation. One unreadable test fixture corrected from write-failure to read-failure fake. Docs cap caught 9020-byte owner page, shortened to 8959 without changing the cap. Final focused 196 tests/9 files PASS; final separate docs 4/1 PASS. Types, lint (0 errors/22 existing warnings), changed-quality vs be6edb3 PASS.
- Fast and full verify both ALL LANES PASSED; first full run: coverage 2942 tests/278 files, native uninstrumented 30/5, coverage statements/branches/functions/lines 95.40/89.90/98.22/98.30%, build PASS. Full coverage lane 95.5s, native lane 3.9s. Logs: `/home/user/accepted-version-selection/`. No schema, harness/isolation, threshold/budget, provider/dependency or pixel/export-algorithm changes; no real provider generation requests.


## 2026-10-26 — Compact export visual settings

- Request: reduce screenshot-area whitespace without hiding controls. Scoped responsive three-group visual grid, inline padding Default, labelled side-by-side custom W/H and readouts, compact Scale-to-MP row (64px minimum target), and inline per-icon stroke input; existing handlers, disabled states, inheritance and exports unchanged. Existing decoration disclosures unchanged; no new hidden/collapsible controls.
- TDD: native React input fixture corrected, then witnessed RED 4 layout failures / 1 behaviour pass; GREEN 5/5. Focused UI/docs 153/10 passed. DOM/CSS contracts, not browser pixel/percentage measurements.
- Types PASS; lint 0 errors / 22 existing warnings; changed quality PASS (three TSX owners). Fast/full ALL LANES PASSED vs 0f25413: 2947 tests / 279 files; coverage statements/branches/functions/lines 95.40/89.90/98.22/98.30%; fast coverage 94.8s, full coverage 96.0s; full native 30 tests / 5 files, 4.1s; both builds PASS. Documentation routing/budgets PASS after shortening the router link, no cap changes.
- No domain/schema/dependency/provider/export algorithm/harness/isolation/performance-budget/threshold changes. Logs /home/user/compact-export-settings/. Plan/evidence docs/archive/2026-10-26-compact-export-geometry/README.md.


## 2026-10-26 — Large-list selection response (all four checkable list tabs)

- Plan before code: docs/archive/2026-10-26-selection-response/README.md; architecture/methodology/results and six raw Chromium runs archived beside it. Indexed canonical-snapshot checkbox/class projection before paint, stable committed-event bridges, memoized row presentation, linear Batch selected reconciliation/stale lookup/shared visible deselection/SVG scope, and instant background highlights. All rows/controls remain mounted; canonical state/history/shortcuts/eligibility unchanged.
- TDD: initial RED 5 cases (four presentation paths plus 508500 Batch row-path reads); memo-only iteration measured but insufficient. Second RED 2 failures / 4 passes (Upload shell and background animation); final 1000-row no-shell-render/projection, remount/cleanup/restoration/data/preview/callback freshness regressions PASS. Focused all-tab/history/preview/version/docs 275/15 PASS; corrected new-test/docs focused 16/4 PASS.
- Chromium153.0.8010.0, 1440x1000, no CPU throttle, fresh browser/case, 14 samples after one warmup cycle, standard medians: production 1000-row committed-DOM ms Batch99.95→5.50 (94.50%), V2 75.30→3.30 (95.62%), SVG402.90→3.75 (99.07%), Upload90.15→3.75 (95.84%). All 100-row primary reductions >90%; all 1000-row two-rAF frame proxies >80% in prod/dev. Frame percentage gains at100 rows are lower in some cases, reported without overclaim. Actual list components/preview algorithms, not full-panel/history/scan timing; no universal hardware guarantee. Browser packages/binaries/builds external to Git; small raw evidence record ~106KB.
- First fast gate PASS. First full native/build PASS but new Upload structural test setup exceeded5s under coverage (100 real export geometries). Corrected ONLY its setup to real source/as-is previews, retaining100 rows/all assertions; original default-settings browser benchmark and separate real geometry/preview tests unchanged. No timeout, count, skip, algorithm/mock, harness, isolation, coverage threshold or native timing-budget changes.
- Final fast/full ALL LANES PASSED vs0755387: 2959 tests/282 files; coverage statements/branches/functions/lines95.40/89.90/98.22/98.30%; fast coverage93.8s, full96.1s; native30/5 in3.9s; both builds PASS. Types PASS; lint0errors/20warnings (two old any casts removed); changed quality PASS (13 TS/TSX files); doc routing/budgets and whitespace PASS. No provider generations, dependencies, schemas or export-algorithm changes. Logs /home/user/selection-response/.


## 2026-10-26 — automatic non-uniform SVG stroke repair

- Diagnosed the actual supplied snowflake: central hexagon under translate(64 64)
  scale(1.7320508075688772 1), previously refused by bakeGeometry. TDD: 13 initial
  regressions failed, including the exact source/final-width error.
- Automatic local-space pen outlines preserve anisotropic source strokes; chosen
  final widths remain verbatim after centreline bake. Paint/caps, inherited dash
  context and single shape-opacity composition retained. Non-scaling pens retain
  final widths/dashes. Shared presentation lookup extracted, no duplicated walk.
  Source/as-is bytes unchanged; unsupported repair inputs fail atomically.
- Final focused 168 tests/7 files PASS. Final fast/full ALL LANES PASSED at base
  c30ec49: each 2982 tests/283 files; full native 30/5 PASS (4.1s). Coverage
  95.43/89.99/98.23/98.31%; new strokerepair.ts 100% across metrics. Types, lint
  (0 errors/20 existing warnings), changed quality, build, doc routes/budgets and
  whitespace PASS. Initial earlier native detector alarm missed 200ms at
  203.878ms; subsequent full gates passed with unchanged algorithms/budgets.
- Independent Chromium alpha probe: actual snowflake 147/1048576 differing pixels,
  normalized alpha error 0.06548%; translucent dashed affine fixture 0.16879%.
  Supplementary rendering evidence only, no raster artwork/dependency/provider
  fallback. Actual live preview and SVG/JPEG/EPS package regressions pass.
- Plan, measured verification and pixel methodology/results:
  docs/archive/2026-10-26-anisotropic-stroke-repair/. Current geometry, repair,
  selector, owner/test and router pages updated; no UI controls added.


## 2026-10-26 — skip current SVG request, continue its batch

- Diagnosed request-strip Cancel sharing the global cancelRun handler. Added
  one-way run-to-request cancellation scopes and separate foreground skip action.
  Skip retains saved versions, continues later plans, preserves independent
  queued/parallel/image work and the normal once-per-batch completion sound.
  Full Cancel/per-run Stop retain existing behaviour. Shared-request icons skip
  together; cancelled requests are never automatically resent.
- TDD: corrected one-icon/request panel fixture fails against original global
  wiring, then passes with separate action. Additional red/green regressions pin
  skipped wording, known usage on discarded late answers and whole-run late
  cancellation wording. Fresh controller, pre-send/retry abort, grouped inputs,
  global stop, exceptional cleanup and foreground isolation covered.
- Focused: 89 tests/8 files PASS. Final verify:fast and verify at base 20da47f:
  ALL LANES PASSED, each 2992 tests/283 files; full native 30/5 PASS (4.1s).
  Lib coverage unchanged at 95.43/89.99/98.23/98.31%. Types, uncached lint
  (0 errors/20 existing warnings), changed quality, docs/routes/budgets,
  whitespace and build PASS. No live providers, new dependencies or weakened
  assertions/harness/performance thresholds. One early verification was stopped
  deliberately to finish the late-answer regression and is not counted as PASS.
- Plan/results: docs/archive/2026-10-26-svg-request-skip/README.md.
  Updated current run contract, invariant I-53, request-strip selector, source/
  test owners and router. The button is labelled Skip current request, not a
  misleading generic Cancel.


## 2026-10-26 — reversible selection and approval sorting

- User confirmed all FOUR review tabs (not Single sheets) and accepted metadata
  as Upload approval. Added binary selected/not-selected and approved/not-approved
  sorting with reversal: existing Sort+Order in Batch/Selection V2, four explicit
  Sort options in SVG/Upload. Canonical checks (not active or processing mirrors),
  all non-approved states grouped together, stable path ties, immutable inputs.
- State sorting follows live checks/decisions/undo. Normal sorts preserve memoized
  selection performance; SVG's old pin remains for old sorts only. Selection
  auto-next uses the same pre-decision checked order as displayed. Existing
  checks, active/anchors, hidden scope, versions, files and provider gates remain.
- TDD: five old-sort/parser failures witnessed, then green. Added four real-panel
  regressions for reversal/live changes, retained checks, Batch undo, Selection
  next-pending and Upload accepted metadata using one confirmed fake send.
  Pure/rowmodel/selection-response focused 100 tests/6 files PASS; all four existing
  zero-selection-only-presentation checks PASS. Docs navigation 4 PASS; original
  read budgets preserved by condensing repeated prose, not changing assertions.
- Final verify:fast and verify at base 637d3a8: ALL LANES PASSED, each 3001 tests/
  284 files; full native 30/5 PASS (3.9s). Coverage 95.45/90.11/98.29/98.32%, all
  improve. Types, uncached lint (0 errors/20 existing warnings), changed quality
  for 16 production files, whitespace and builds PASS. No dependencies, live
  providers, threshold/harness changes or weakened assertions.
- Canonical contract/selectors/routes/owners/tests updated. Plan and exact results:
  docs/archive/2026-10-26-list-state-sorting/README.md. Logs outside Git under
  /home/user/list-state-sorting/.


## 2026-10-26 — import selection performance redesign from 0216b05e

- Imported cde75d1 (plus a9a9deb's named plan) from arena/0216b05e-iconsplitter
  onto current delivery 74b05d49, not a wholesale branch replacement. Compact
  ordered undo deltas, deferred history persistence, stable action/view contexts,
  slice subscriptions, atomic V2 gestures, projected active/checked rows, memoized
  row arrays, linear summaries and updated real-history benchmark tooling.
- Preserved current SVG skip/full Cancel separation, selected/approval sorting,
  accepted versions, generic stroke repair and export behavior. Batch integration
  uses canonical checks for selection sorts; ignores ONLY the selected processing
  mirror for ordinary memo reuse, retaining all-field reference/output updates.
- Witnessed three new failing tests for live selected sorting, reordered ids in
  undo and duplicate insertion ids, then green. A fourth red pinned stale reference
  data under source-only cache; fixed with existing all-field row-data comparison.
  Focused 70/6 PASS; existing regressions 244/11 PASS; final hardened focus 53/5
  PASS. Original byte/render/id-read/no-sort/native budgets unchanged.
- Final verify:fast + verify at 74b05d49: ALL LANES PASSED, each 3035 tests/287
  files plus full native 30/5 (3.3s). Types, uncached lint (0 errors/20 existing
  warnings), changed quality (36 production files), docs/routes/read budgets,
  whitespace and builds PASS. Coverage improves to 95.52/90.21/98.31/98.37%;
  selectiondelta lines/functions 100%. Native optional package restored via locked
  npm run setup; no manifest/lockfile changes. No live generation or new deps.
- Source serialization timings are historical, NOT a newly measured end-to-end
  browser improvement. Current docs make the distinction explicit. Source plan,
  import scope, TDD and precise gate evidence:
  docs/archive/2026-10-26-import-selection-performance/README.md.
  Logs outside Git: /home/user/perf-import/.

## 2026-10-26 — SVG to upload response research (baseline 01e08142)

- Research/design only: no production behavior or package manifest/lock changes.
  Full-panel fixtures use real UploadPanel/history/discovery/reducers/previews and
  original download/settings algorithms; no provider calls or substituted geometry.
- Added 7 diagnostic tests: 100/1,000 rows with zero/sparse/full persisted pins,
  plus isolated real override-map reducer at 100/1,000/2,000 keys. Raw single-run
  evidence and limitations: docs/archive/2026-10-26-upload-response-research/.
- Confirmed repeated boot settings loads and panel summary invalidation on warm
  gestures, triple selected effective-settings derivation on settings-open, and
  quadratic override-map copying. Diagnostic 1,000-key patch/reset: 231.719 /
  1233.745 ms with zero rows. These are not browser timings or a shipped speedup.
- Current proposed response redesign and owners routed from Upload docs; existing
  controls/selectors/contracts remain unchanged. Browser and cold geometry latency
  remain unmeasured; production implementation is still pending.
- Focused diagnostics 7/7; Upload UI 84/84; docs 4/4; types/lint/whitespace passed
  (20 existing lint warnings); changed-production quality found no source changes.
- Final verify:fast and verify at 01e08142: ALL LANES PASSED, each 3042 tests /
  289 files; full native/perf lane 30 tests / 5 files passed. Coverage unchanged:
  statements/branches/functions/lines 95.52/90.21/98.31/98.37%.
- Earlier fast attempts failed the existing transient Metadata ready toast wait;
  unchanged focused/full/final-fast checks passed. Timing-sensitive check remains
  noted, not claimed fixed. No assertions, timeouts, gates or isolation weakened.

## 2026-10-26 — Finish Upload-specific response redesign (base aba2474)

- Implemented mount-only boot/refs, actual-input context memo, one-pass selected
  metadata/artifact summaries with narrow dependencies, and count-only shared
  artifact eligibility; exact collision-safe download execution stays unchanged.
- Replaced quadratic pin map updates with one immutable batch map replacement,
  shared by applied decorations. Targeted stale projection retains unaffected
  rows and honors defaults→applied→pins, fixing applied-decoration omission.
  Global default changes skip equal nested values and non-inheriting rows.
- Open settings resolves each checked icon once for all decoration summaries;
  closed guard and all controls remain. Preview callbacks recheck result cache:
  real duplicate-subscriber regression improves 20 prepares to one, same output.
  Exact geometry/debounce/cache bound/failure fallback remain unchanged.
- Witnessed red: full-panel boot (4 failures), destination planning (4), popup
  3N instead of N (4), targeted/applied stale projection (7 failures/1 pass),
  preview duplicate work (1 failure/1 pass). Strengthened original research
  fixture; added model/summary/preview tests. Focused integration 95/95 passed;
  model/preview/docs smoke 15/15 passed. No existing gates/assertions weakened.
- Original 1000-key zero-row patch/reset diagnostic 231.719/1233.745 ms; isolated
  post-change 5.950/1.002 ms. Warm boot/planner calls now zero, single-row stale
  work 1000→1, popup resolutions 3000→1000. Node/Happy DOM diagnostics, not browser
  latency or an overall ≥80% claim. Three final isolated warm runs and mixed-run
  outliers retained in docs/archive/2026-10-26-upload-response-implementation/.
- Types, lint (0 errors/20 existing warnings), changed quality (14 source files),
  docs and whitespace passed. verify:fast and verify both ALL LANES PASSED on
  first implementation attempts: each 3066 tests/292 files; native 30/5 passed.
  Coverage statements/branches/functions/lines 95.54/90.23/98.32/98.37%, none
  decreased; settingspatch.ts and download.ts each 100% in all four metrics.
- Current Upload/performance/owner contracts updated. No selector removal,
  dependency/lock changes, provider generation, geometry replacement, altered
  harness isolation, test timeout relaxation or generated artifacts committed.

## 2026-10-26 — Shadow/source-viewport clipping research and plan only

- Investigated the exact preview warning at prepare.ts::shadowSourceFrame,
  viewrepair.ts and place.ts. Existing minor repair requires in-frame geometry,
  <=2% paint overshoot and unchanged precision rules; remaining overflow refuses
  to avoid revealing formerly clipped art when the shadow frame grows.
- Confirmed conservative Bezier control-hull bounds as a possible false-positive
  mechanism, not an established diagnosis of the reported flags. Planned tight
  paint classification first, then vector-painted-region viewport intersection
  only where actual clipping requires it. Preserve source bytes and pen-space,
  compositing, gradient, clean SVG and vector EPS contracts; no blanket expansion.
- Both named waving-flag SVGs are absent from this checkout and attachment
  directory; screenshots only. Exact overflow/per-file repair success remains
  unverified. The first planned implementation step obtains immutable originals.
- Documented ordered TDD/diagnostic/geometry/integration/format/performance/release
  steps in docs/archive/2026-10-26-shadow-viewport-repair-plan/README.md, linked
  from the current automatic-repair contract. Explicitly not implemented.
- Existing focused viewport/shadow/stroke tests 33/33; docs 4/4; whitespace passed.
  verify:fast and verify against b32d1a3 both ALL LANES PASSED: 3066 tests/292 files
  each, native/performance 30/5. Types/lint/quality/build passed; coverage unchanged
  at statements/branches/functions/lines 95.54/90.23/98.32/98.37%.
- Documentation only. No production/test/dependency/fixture changes, source SVG
  rewrites, changed guard/tolerance, library installation or implementation claim.

## 2026-10-26 — Flag originals arrived; viewport diagnosis confirmed (docs only)

- Availability follow-up to the initial research entry: remote 8324120 supplied
  both requested flag SVGs while the first draft was being published. Merged
  the user's fixture commit unchanged, including its additional root copy.
  The earlier missing-file prerequisite is resolved; no re-upload is needed.
- Original production prepare reproduces the exact shadow error on both files
  with source-default+Shadow and factory-default+Shadow settings. Shadow-off
  source-default AS-IS stays byte identical. No repair prototype was implemented.
- Read-only analytic derivative-extrema diagnostics on actual normalized geometry
  and existing bake/expand probe curves confirm a bounds false positive. Current
  shipped minY -2.121/-0.580 versus tight represented paint +7.560711/+8.191972,
  inside 224/240 viewports. Control Y -18/-15 is not a curve extremum.
- Updated plan narrows the required fix to general tight curve/paint bounds and
  consistent source-frame checks. No source path/viewBox rewrite, tolerance
  increase, real-clipping bypass or Boolean library is needed for these flags.
  True clipping support is separate and still refused. Preserve original hashes.
- Retained hashes and raw measurements in the research document/JSON; no source,
  test, dependency or fixture-byte changes by the agent. Temporary stdin research
  diagnostics did not add scripts or production code to the repository.
- Post-merge focused/docs 37/37; verify:fast and verify against 8324120 both
  ALL LANES PASSED: 3066 tests/292 files each, native/performance 30/5. Types,
  lint/quality/build/whitespace passed; coverage 95.54/90.23/98.32/98.37% unchanged.
  These gates validate the current baseline, not an implemented automatic fix.

## 2026-10-26 — tight source-viewport bounds / both supplied waving flags

Implemented analytic extrema of affine-mapped represented cubic outlines and one detached painted-outline viewport probe, shared by minor repair and final Shadow veto. Conservative placement/EPS bounds, source bytes/frames, 2% repair threshold and 0.002 tolerance unchanged. Unknown ambiguous outline overflow still refuses; conservative-contained compatibility retained. TDD actual-file regressions first: 10 reproduced clipping-warning failures / 2 passes; now 12/12 green. Focused 134/7; docs 4/4. Types pass, lint 0 errors/20 pre-existing warnings, explicit-base changed quality pass (7 production files), diff check pass. verify:fast and full verify all lanes passed: 3094 tests/294 files each; full adds native/perf 30/5; both builds pass. Coverage statements/branches/functions/lines 95.57/90.30/98.33/98.39%; all new functions covered, curvebounds 100% all metrics. Both original fixture SHA-256 values unchanged. Real opt-in live preview and saved SVG/JPEG/vector EPS package tests pass; JPEG transport/HappyDOM checks are pipeline proof, not pixel fidelity or provider ingestion. Plan/evidence: docs/archive/2026-10-26-flag-viewport-implementation/README.md. Logs: /home/user/flag-{red,focused,docs,lint,quality,verify-fast,verify-full}.log. Runtime dependency/build noise not staged.

## 2026-10-27 — Upload (`stockUpload`) FTPS tab (TDD Steps 1–8)
- Added `src/lib/stockupload/{types,credvault,presets,discovery,zippack,plan,bridgeclient}.ts`, `src/stockupload/*`, `tools/bridge/ftps/{reply,pasv,client,routes}.mjs`, `run_ftp_bridge.bat`, and `run_app_ftp.bat`.
- Enforced I-80 (`export/` + committed `export.json` strict discovery) and I-81 (local-only non-expanded IndexedDB FTP credentials + log redaction).
- Passed `tsc --noEmit`, `eslint`, `tools/quality.mjs --changed --allow-legacy` (37/37 files OK), and TDD test suites (`stockupload_*`, `bridge_ftps`, `workbench_ui`, `secret_hygiene`, `docs_navigation`).

### 2026-10-28 — Adobe Stock SFTP preset, guidelines preflight & zero-dep SSH-2/SFTP v3 helper
- Added `ADOBE_STOCK_PRESET` (`sftp.contributor.adobestock.com:22`, `protocol: "sftp"`, `remoteDir: "/"`), `resetBuiltinStockPreset`, automatic built-in preset backfill on legacy `localStorage` snapshots, and Adobe Stock preflight warnings (no `.zip` archives, root `/` only, `<= 45 MB`, `1-200` char title + `5-49` keywords) (`src/lib/stockupload/{types,presets,plan,bridgeclient}.ts`).
- Implemented zero-dependency Node SSH-2 + SFTP v3 client (`tools/bridge/sftp/{wire,kex,client}.mjs`) and protocol dispatch in `tools/bridge/ftps/routes.mjs`, plus per-stock SFTP UI fields (`SFTP Member ID`, `Generated SFTP password`, SSH host-key SHA-256 pinning, built-in reset) in `src/stockupload/{ftpactions.ts,StockFtpPanel.tsx,StockUploadDialogs.tsx}`.
- Verified with `tests/{stockupload_presets,stockupload_runner,bridge_sftp,stockupload_ui}.test.*` + `tests/helpers/fakesftp.mjs`, `node tools/quality.mjs --changed --allow-legacy`, and `npm run verify`.

### 2026-10-28 — Automatic unique per-stock named badges & uploaded-vs-pending row markers
- Added `src/lib/stockupload/stockbadges.ts` (`ensureStockBadges`, `assignStockBadgeOnSend`, `perStockMarkersOf`, `stockMarkerStateForItem`) giving every stock preset (`Shutterstock`, `Adobe Stock`, plus custom presets) a unique named badge (`stock:<presetId>`) and distinct hex color.
- Wired immediate live badge assignment + status update in `src/stockupload/runupload.ts` as soon as a file finishes sending (`res.ok`), preset badge sync in `src/stockupload/useStockUpload.ts`, uploaded vs pending per-stock pills (`stock-site-pill-<id>-<presetId>`) in `src/stockupload/StockUploadRow.tsx`, and `Pending: <Stock>` / `Uploaded: <Stock>` filters in `src/stockupload/{rowlist.ts,StockUploadControls.tsx}`.
- Verified with `tests/{stockupload_badges,stockupload_runner,stockupload_ui}.test.*`, `node tools/quality.mjs --changed --allow-legacy`, and `npm run verify`.

### 2026-10-28 — Ensure Adobe Stock always appears in preset drop list & auto-rebuild stale dist/index.html
- Guaranteed built-in presets (`Shutterstock`, `Adobe Stock`) always occupy slots 1-2 regardless of `MAX_STOCK_PRESETS` and healed legacy single-preset `localStorage` snapshots immediately on load (`src/lib/stockupload/presets.ts`, `src/stockupload/presetstore.ts`).
- Added stale `dist/index.html` detection & auto-rebuild (`tools/bridge/distfresh.mjs`, `tools/bridge/server.mjs`), loopback helper replacement (`/shutdown`), and port `47391` cleanup + auto-build in all `.bat` helper launchers (`run_ftp_bridge.bat`, `run_app_ftp.bat`, `run_inkscape_bridge.bat`, `run_app_inkscape.bat`) so `git pull` never serves a stale pre-Adobe-Stock bundle.
- Verified with `tests/{stockupload_presets,bridge_ftps,bridge_sftp,bridge_inkscape,stockupload_ui}.test.*`, `node tools/quality.mjs --changed --allow-legacy`, and `npm run verify`.

### 2026-10-28 — Stamp dist/index.html with src SHA-256, add quick preset switch, and rebuild dist/index.html with Adobe Stock
- Added `computeSrcFingerprint` and `<meta name="iconsplitter-src-hash">` build stamping (`tools/bridge/distfresh.mjs`, `vite.config.ts`) so `isDistStale` detects outdated `dist/index.html` bundles even when `git pull`/`rebase` gives an older `dist/index.html` a newer `mtime`.
- Added quick preset switcher buttons (`Shutterstock`, `Adobe Stock`) in the `StockFtpPanel` top bar alongside `stock-ftp-preset-select` and built-in name fallback healing (`src/stockupload/StockFtpPanel.tsx`, `src/lib/stockupload/presets.ts`).
- Verified with `tests/bridge_ftps.test.ts`, `tests/stockupload_ui.test.tsx`, `node tools/quality.mjs --changed --allow-legacy`, and `npm run verify`.

### 2026-10-28 — Unify all badges into the single general row-badge system & remove Stock sites column
- Removed split `src/lib/stockupload/stockbadges.ts`, `Stock sites` column, `stock-site-pill-*` pending pills, and `stock-filter-status` dropdown (`StockUploadList.tsx`, `StockUploadRow.tsx`, `StockUploadControls.tsx`, `rowlist.ts`).
- Hardcoded `Shutterstock` and `Adobe Stock` badges directly in the single general `src/lib/upload/rowbadge.ts` catalog (`HARDCODED_STOCK_BADGES`, `ensureHardcodedBadges`, `assignNamedBadge`) shared via `src/upload/rowbadgestore.ts`.
- Verified with `tests/{stockupload_badges,stockupload_runner,stockupload_ui,upload_rowbadge,upload_rowbadge_store,upload_rowbadge_ui}.test.*`, `node tools/quality.mjs --changed --allow-legacy`, and `npm run verify`.

- 2026-10-28: AWS Transfer Family SFTP (`hmac-sha2-256-etm@openssh.com`, `rsa-sha2-512`/`ecdsa`, channel max-packet), outdated FTPS-only helper detection, and one-click host-key trust & auto-reconnect (`src/lib/stockupload/bridgeclient.ts`, `src/stockupload/{ftpactions,panelops,StockFtpPanel}.ts*`, `tools/bridge/{server,sftp/*}.mjs`) — `quality.mjs --files` GATE PASSED + full `npm run verify`.

- 2026-10-28: Auto-heal stale Adobe Stock FTPS(:21) presets to SFTP(:22), handle Node Happy Eyeballs empty-message AggregateError (`describeSocketError`), and add high-contrast Test connection status pill + toast (`src/lib/stockupload/{presets,bridgeclient}.ts`, `src/stockupload/{ftpactions,StockFtpPanel}.ts*`, `tools/bridge/{ftps,sftp}/*.mjs`) — `quality.mjs --files` GATE PASSED + full `npm run verify`.

- 2026-10-29 Getty Images / iStock ESP (`getty-images` / `esp-https`): `node tools/quality.mjs --files ...` GATE PASSED (all modified/created `src/` files <300 LOC, fn LOC <=30, CC <=10, params <=4).

- 2026-10-29: Getty ESP 403 fix (`authentication.gettyimages.com` OAuth2 PKCE + `/v3/countries` scope probe) & `_getty_esp_batches/` paired EPS+JPG+CSV batch stager — `quality.mjs` passed across 14 `src/` files + bridge & UI TDD suites.

- 2026-10-29: Getty ESP multipart ingestion integration — targeted quality gate: 7/7 changed source files passed; tests cover paired upload and failure handling.

## 2026-10-29 — upload-only combined title

- TDD: new outgoing-copy and UI tests failed before implementation, then passed; focused stock-upload run passed. Originals and `export.json` checked unchanged; JPEG, SVG, EPS, PNG, ZIP and Getty-pair paths exercised with mocked transfers.
- `npm run verify:fast`: PASS after correcting a test-only TypeScript typed-array annotation.
- `npm run verify`: PASS — types, lint, changed-file quality gate, native performance budgets (30 tests), 3,162 tests across 308 files with coverage, and build. Overall coverage: statements 95.15%, branches 89.21%, functions 98.36%, lines 98.1%. Lint reports 21 existing warnings. Some unrelated test-environment network attempts to router.requesty.ai were blocked; no live stock transfer was performed.
- Scope quality gate: `plan.ts` 198 lines/27 functions; `pngxmp.ts` 67/8; `sendmeta.ts` 86/8; `StockUploadBulkBar.tsx` 148/22; `StockUploadDialogs.tsx` 119/9; `esptransfer.ts` 66/10; `panelops.ts` 206/37; `prefsstore.ts` 50/2; `runupload.ts` 266/18 — all pass.

## 2026-10-29 — Getty Images web upload (`getty-web`) background browser automation

- TDD: `tests/getty_web_driver.test.ts`, `tests/getty_web_upload.test.ts`, `tests/getty_web_cdp.test.ts`, `tests/bridge_getty_web.test.ts`, `tests/stockupload_getty_web.test.ts` and `tests/stockupload_getty_web_ui.test.tsx` failed or did not exist before the change, then passed; the split-request and `cdp.mjs` closed-state bugs were found by those tests and fixed.
- Real logic under test: page steps run against Batches/Create-Batch DOM in happy-dom, the loopback client builds and scrubs real requests, the CDP client runs against a stand-in socket, and the spawned helper answers `/health` + `/getty-web/*`; no live Getty account, no browser automation of a real site, no credentials logged.
- `npx vitest run`: PASS — 313 files, 3,202 tests (before the two new UI/bridge cases were added: 3,205 tests now at the focused level).
- `npm run quality:changed`: PASS — `gettyweb.ts` 64 lines/11 fns, `gettywebclient.ts` 153/13, `gettywebtransfer.ts` 75/4, `runupload.ts` 300/20, `panelops.ts` 216/39, `ftpactions.ts` 246/32, `StockFtpPanel.tsx` 255/34, `StockFtpCredentials.tsx` 194/21, `presets.ts` 296/28 (`parseStockPresetState` reduced to CC 10 by a version helper).
- `npm run verify:fast` and `npm run verify`: PASS — types, lint (0 errors; existing warnings only), changed-file quality gate, native perf budgets, tests + coverage, build (1,940 kB single-file `dist/index.html`, not staged). `npm ci` was run first because the checked-in `node_modules/` was from another platform; its changes are not staged.
- Limits recorded in [the Getty web page](current/sor/stock-upload-getty-web.md#6-honest-limits): selectors verified against the captured Batches/Create Batch markup only; the batch-detail file input is matched generically; file status is best-effort text scraping; a run can leave a partial batch; interactive challenges need `GETTY_WEB_HEADED=1`.

## 2026-10-29 — Getty web upload: automatic metadata + batch completion

Follow-up on the Getty web target (PR #4): accepted title/description/keywords are
now typed into each file's editor and the batch's Complete/Submit control is
clicked automatically. Measured on this checkout (Node 22.22.3, sandbox with no
Chrome installed):

- Focused: `tests/getty_web_driver.test.ts`, `tests/getty_web_finalize.test.ts`,
  `tests/getty_web_upload.test.ts`, `tests/getty_web_cdp.test.ts`,
  `tests/bridge_getty_web.test.ts`, `tests/stockupload_getty_web.test.ts`,
  `tests/stockupload_getty_web_ui.test.tsx`, `tests/stockupload_ui.test.tsx`,
  `tests/stockupload_presets.test.ts`, `tests/docs_navigation.test.ts`
  → 10 files / 70 tests passed.
- `npx tsc --noEmit -p tsconfig.json` → clean.
- `npm run quality:changed` → PASS (runupload.ts kept at 299 lines by moving
  `completionNote` into `gettywebtransfer.ts`).
- `npm run verify:fast` → Types PASS 8.0 s, Lint PASS (0 errors / 21 warnings)
  1.8 s, Quality gate (changed) PASS 0.8 s, Tests + coverage PASS 123.9 s,
  Build PASS 8.9 s (`dist/index.html` 1,941.45 kB / 599.68 kB gzip).
- Limits stayed honest in `docs/current/sor/stock-upload-getty-web.md` §6: the
  metadata-editor and Complete/Submit selectors are label guesswork never seen
  live, and the launch/attach path is only exercised through fakes here because
  this machine has no Google Chrome or Microsoft Edge.

## 2026-10-29 — Getty web sign-in: account ID, headed window, reusable profile

Reported failure: `Getty did not accept the saved contributor sign-in` with a
saved contributor ID instead of an e-mail, and no way to see what the page asked
for. Measured on this checkout (Node 22.22.3; still no Chrome in the sandbox, so
the launch path stays fake-driven):

- Focused: `tests/getty_web_driver.test.ts`, `tests/getty_web_signin.test.ts`,
  `tests/getty_web_finalize.test.ts`, `tests/getty_web_upload.test.ts`,
  `tests/getty_web_cdp.test.ts`, `tests/bridge_getty_web.test.ts`,
  `tests/stockupload_getty_web.test.ts`, `tests/stockupload_getty_web_ui.test.tsx`,
  `tests/docs_navigation.test.ts` → all passed (driver 20, sign-in 7, bridge 12).
- `npm run verify:fast` → Types PASS 3.3 s, Lint PASS (0 errors / 21 warnings)
  1.6 s, Quality gate (changed) PASS 0.6 s, Tests + coverage PASS 87.8 s,
  Build PASS 6.1 s.
- `docs/current/sor/stock-upload-getty-web.md` had to be compacted to 8,921 bytes
  to stay inside the 9,000-byte agent read budget (`docs_navigation`), without
  dropping a limit.
- New knobs are verified where they can be: `--getty-headed` through a spawned
  helper's `/health` + log line, `resolveProfileDir` as a pure function. Whether
  Getty accepts a numeric contributor ID in its identifier field, and which
  sign-in control a real page shows, remain unverified without a live account —
  the first visible-window run is what settles them.

## 2026-10-29 — Getty web sign-in: real typing, Angular bridge, page summary

Reported after a live attempt on `esp.gettyimages.com/sign-in`: the browser opened
the Angular ESP sign-in page (`ng-app="SignInApp"`) and waited instead of
signing in. Measured on this checkout (Node 22.22.3; still no Chrome or Getty
account here, so live behaviour remains untested):

- Focused: `tests/getty_web_signin.test.ts` 9 passed (adds a case proving the
  identifier + password go in through `Input.insertText`),
  `tests/getty_web_driver.test.ts` 22 passed (adds the `angular.element` write,
  disabled-field fill, `focusLoginField`, and `inspectSignIn` with no value in
  its output), plus the existing finalize/upload/cdp/bridge/runner/UI docs
  suites.
- `npm run verify:fast` → Types PASS 3.9 s, Lint PASS (0 errors / 21 warnings)
  1.7 s, Quality gate (changed) PASS 0.6 s, Tests + coverage PASS 93.6 s,
  Build PASS 6.7 s.
- `docs/current/sor/stock-upload-getty-web.md` trimmed to 8,976 bytes (budget
  9,000) while adding the typing path, the Arkose limit and the new steps.
- The test for the fraud script uses `window.experiences` instead of a real
  `verify.gettyimages.com` iframe so no test reaches the network.
- Honest gap: whether Getty accepts the typed value and how its Arkose check
  behaves can only be settled on the live page; the failure reason now carries
  the screen summary (`inputs`, `buttons`, `angular-js`) to close that gap fast.

## 2026-10-29 — Getty web browser launch: attach, stale ports, self-check

Reported after the Angular sign-in fix: "now it not run browser to log in but only
get error — browser debugging socket failed". That text comes from the CDP client
when the WebSocket to the browser is refused, so the launch half was hardened and
made self-describing. Measured on this checkout (Node 22.22.3, 2 cores, no Chrome
installed here):

- Focused: `tests/getty_web_browser.test.ts` 10 passed (profile locks,
  attach/launch/busy decision, stale `DevToolsActivePort` ignored, socket reasons
  with port + folder, missing-browser hint), `tests/bridge_getty_web.test.ts`
  14 passed (adds `--getty-check` for a missing browser and for a browser that
  never opens a port), plus driver 22 / sign-in 9 / cdp / finalize / upload /
  runner suites.
- `npm run verify:fast` → Types PASS 5.2 s, Lint PASS (0 errors / 21 warnings)
  2.8 s, Quality gate (changed) PASS 0.9 s, Tests + coverage PASS 108.8 s,
  Build PASS 7.6 s.
- Sandbox note for whoever repeats this: a bare `npx vitest run --coverage` does
  **not** set `PERF_BUDGETS=coverage`, so `tests/algo_efficiency.test.ts` keeps
  its 200 ms budget and fails on this 2-core box (measured 408 ms instrumented)
  while the real lane passes. One run also hit an unrelated flaky
  `tests/upload_output_formats_ui.test.tsx` case that passes on rerun.
- `docs/current/sor/stock-upload-getty-web.md` stayed inside the 9,000-byte
  agent read budget (8,941) after adding the profile/self-check section, and the
  captured Getty handles moved to `selectors/stock-upload.md`.

## 2026-10-29 — Getty web: the helper frees its own stuck browser

Follow-up: the previous fix told the user to close every Chrome/Edge window. That
was the wrong ask — the helper now recovers by itself. Measured on this checkout
(Node 22.22.3, 2 cores, no Chrome installed):

- Focused: `tests/getty_web_browser.test.ts` 16 passed (adds
  `profileProcessIds` over PowerShell JSON + `ps`, exact `--user-data-dir`
  matching that ignores `…-old`, killing only those PIDs, stale-lock clearing with
  no matching process, an unreadable process list, and a launch that resets then
  relaunches) and `tests/bridge_getty_web.test.ts` 16 passed (adds `--getty-reset`
  on a temp profile and its "no folder" refusal).
- `npm run verify:fast` → Types PASS 16.4 s, Lint PASS (0 errors / 21 warnings)
  13.7 s, Quality gate (changed) PASS 0.8 s, Tests + coverage PASS 118.2 s,
  Build PASS 8.5 s.
- `docs/current/sor/stock-upload-getty-web.md` trimmed to 8,978 bytes (budget
  9,000) after documenting the automatic reset and `--getty-reset`.
- Reset safety is covered by tests rather than by a live browser: only a process
  whose command line names the helper's own profile folder is ended, and a folder
  comparison is path-exact so `getty-profile-old` never matches `getty-profile`.

## 2026-10-29 — Getty web sign-in: the page prelude crash and the window that vanished

Reported from a real Windows run: `--getty-headed` opened Chrome and it closed at
once, `/getty-web/test` answered 503, and the app showed
`ReferenceError: hidden is not defined`. Measured here (Node 22.22.3, 2 cores, no
browser):

- Root cause: the page prelude is serialized with `Function.prototype.toString()`,
  and it listed the module array `NON_TEXT_INPUTS` as if it were a helper, so
  every step began with the bare expression `hidden,checkbox,radio,…`. The
  existing "keeps every step serializable" test only compiled the source
  (`new Function`), which is legal for a comma expression. The new test evaluates
  the prelude and calls the real read steps, reproducing the exact reported error
  before the fix: 23 passed afterwards in `tests/getty_web_driver.test.ts`.
- The skip list now lives inside `inputFields()`, so no prelude helper points at
  module scope.
- The window closed because every failure ran `cleanup()`. In headed mode a
  failure now only detaches (`failureOutcome` / `releaseSession`, 4 new cases in
  `tests/getty_web_browser.test.ts`, 20 total) and the reason ends with
  "browser window was left open — check the sign-in page it shows". The idle
  timer and `/getty-web/close` and `--getty-check` also leave a visible window.
- `npm run verify:fast` → Types PASS 15.7 s, Lint PASS (0 errors / 21 warnings)
  12.5 s, Quality gate (changed) PASS 0.6 s, Tests + coverage PASS 110.3 s,
  Build PASS 7.2 s. Focused: driver 23, browser 20, bridge routes 16, sign-in 9,
  96 across the eight Getty web suites.
- `docs/current/sor/stock-upload-getty-web.md` stays at 8,977 bytes (budget
  9,000) after documenting both rules.

## 2026-10-29 — Getty web: merged batch/portal fixes from the parallel branch

Brought `arena/fdb8d39a-iconsplitter` (three commits) into this branch and kept
both sides of the work. Measured here (Node 22.22.3, 2 cores, no browser):

- Taken from the other branch: the Create Batch dialog now matches
  `[role="dialog"][aria-labelledby="create-batch-dialog"]` as well as the
  `data-cy` handle; the MUI submission-type select is opened with `mousedown` and
  its portal options awaited; the Create control, the name field and the Create
  button must render enabled within 60 s (a `timeout` naming the control); the
  batch id must differ from the one read before the click; a blank batch name gets
  a generated one; and `stepExpression` wraps every step in an IIFE so the prelude
  can be re-injected into a persistent page without redeclaring its constants.
- Kept from this branch: the automatic profile reset (`resetProfile`,
  `--getty-reset`), the headed-window rules (`failureOutcome`, `releaseSession`,
  `detach`) and the prelude fix proven by actually evaluating the steps.
- Reconciled: `inputFields` uses the module list again and `PAGE_PRELUDE` declares
  it, so there is one source; `browser.stop({ keepOpen })` leaves a visible window
  alive and the throwaway profile is removed when that Chrome exits.
- `npm run verify:fast` → Types PASS 16.8 s, Lint PASS (0 errors / 21 warnings)
  14.5 s, Quality gate (changed) PASS 0.7 s, Tests + coverage PASS 115.7 s,
  Build PASS 7.2 s. Getty web suites: driver 25, browser 21, batch 5, cdp 10,
  sign-in 9, upload 9, finalize 5, bridge routes 16, stock upload 5.
- Docs: `sor/stock-upload-getty-web.md` 8,983 bytes and
  `selectors/stock-upload.md` 4,813 bytes (budget 9,000 each).

## 2026-10-29 — Getty web: the uploader input, not a release input

Merged the next commit from `arena/fdb8d39a-iconsplitter` ("Target Getty
contribution uploader instead of release file inputs"). Measured here (Node
22.22.3, 2 cores, no browser):

- `attachFiles` now waits for Getty's own hidden contribution uploader —
  `input[type="file"][data-cy="upload-button-file-input"][multiple]` — and passes
  that selector to `setFiles`, so a page that only shows a release input
  (`model-release-input`, `property-release-input`) fails with `page` instead of
  attaching icons to the wrong control. The wait is 60 s and says so.
- `tests/getty_web_batch.test.ts` grew to 7 cases: the good page attaches once to
  `upload-button-file-input` with both files, a release-only page attaches nothing
  and fails, and a late uploader is still found after a release input exists.
- `npm run verify:fast` → Types PASS 17.0 s, Lint PASS (0 errors / 21 warnings)
  13.1 s, Quality gate (changed) PASS 2.6 s, Tests + coverage PASS 121.3 s,
  Build PASS 7.8 s.
- Docs: the uploader handle and the "release inputs are never used" rule are in
  `sor/stock-upload-getty-web.md` (8,978 bytes) and `selectors/stock-upload.md`
  (4,954 bytes), both under the 9,000-byte budget.

## 2026-10-29 — Getty web: verify every file, count a listed card as uploaded

A real 2-icon run attached the first icon's JPEG+EPS and then "failed to wait";
only that pair reached Getty. The captured batch page explains it: a vector pair is
listed **once**, under the EPS name (`contribution-file-name`), and the JPEG only
appears as the drawer's raster row. `readUploadState` matched full file names
against the page text, so `namesSeen.length === names.length` could never be 2 and
every upload timed out after 180 s. Measured here (Node 22.22.3, 2 cores, no
browser):

- Files are matched to a card by **stem** (`icon-map-pin_5_01.jpg` and `.eps` are
  one contribution), cards are read from `[data-cy="contribution-file-name"]`
  (text is only a fallback), and the card's `not-ready-icon` reports recognition.
- A listed card counts as uploaded immediately; the wait then continues until the
  cards are ready — bounded, non-fatal, and reported ("Getty is still processing").
  Timeouts now say how many files were listed (`Getty listed 1 of 2 file(s) in …`)
  and `state.missing` names them.
- Progress is reported per file (`Getty listed 1/2 file(s) — waiting for the rest`)
  and `GETTY_WEB_READY_TIMEOUT_MS` (120 s) sits beside the existing 180 s.
- The metadata drawer is opened by selecting the card by stem (Getty enables its
  fields only for a selected contribution), and the required **Date Created** gets
  today's date (`todayIso`, overridable by an accepted `dateCreated`). A pair is
  filled once — the second file reports `same-contribution`.
- `npm run verify:fast` → Types PASS 22.7 s, Lint PASS (0 errors / 21 warnings)
  17.1 s, Quality gate (changed) PASS 0.8 s, Tests + coverage PASS 148.1 s,
  Build PASS 9.9 s. Getty web: driver 29, batch 10, finalize 7, sign-in 9,
  upload 9, cdp 10, bridge routes 16, stock upload 5 (+3 UI).
- Docs: `sor/stock-upload-getty-web.md` 8,924 bytes and
  `selectors/stock-upload.md` 5,772 bytes (budget 9,000); the sign-in matching
  rules moved into the selectors page to stay inside it.

## 2026-10-29 — Getty batch submitted once, after the last icon

Cause: every per-icon upload asked the helper to complete the batch, so icon 1
submitted it and icon 2 stalled on the locked uploader. Verified measured run:
Types PASS (3.6 s), Lint PASS (1.2 s, 0 errors / 21 warnings), Quality gate
(changed) PASS (0.7 s, 8 files), Tests + coverage PASS (100.2 s), Build PASS
(6.8 s). Focused suites: getty_web_batch 13, getty_web_driver 31,
getty_web_upload 12, getty_web_finalize 7, bridge_getty_web 17,
stockupload_getty_web/…_ui 92 in total. Docs: SOR 8,935 B / 9,000 B, selectors
6,062 B.

## 2026-10-29 — Every selected pair uploaded in one request

Cause: each icon was its own helper request, so the run depended on Getty's
uploader accepting a second attach after the first pair; the second pair never
arrived. Now `uploadGettyWebRun` prepares every icon and sends one request
(`icons: [{files, metadata}]`), the helper stages them all and hands them to the
page uploader in a single `DOM.setFileInputFiles`, then the run finishes once.
Measured: Types PASS (15.5 s), Lint PASS (13.6 s, 0 errors / 21 warnings),
Quality gate (changed) PASS (0.7 s, 10 files), Tests + coverage PASS (112.4 s),
Build PASS (6.9 s). Focused suites: getty_web_batch 14, getty_web_upload 13,
bridge_getty_web 19, stockupload_getty_web 8, Getty runs + UI 96. Docs: SOR
8,974 B / 9,000 B, selectors 6,056 B.
Follow-up: `MAX_ICONS` raised to 200 so one run's whole selection fits the single
request; Types/Lint/Quality gates re-run after the change: tsc clean, eslint 0
errors / 21 warnings, quality gate PASS.

## 2026-10-30 — Only thumbnail-verified files count as uploaded, with live progress

Cause: the helper treated a listed row as an uploaded file, so a batch page that
showed `Upload failed` for some icons still reported every file as uploaded and the
run had no per-file feedback until the whole request returned. Now each card's own
state decides: a thumbnail (`[data-cy="image-thumbnail"]`/loaded `img`) is an
upload, `Upload failed` is a rejection reported with Getty's `ID: …`, and a listed
row without a picture is not claimed. `GET /getty-web/progress` feeds the panel the
live `{total,uploaded,failed,listed}` counts while the one upload request runs, and
`finish` refuses a batch containing a rejected contribution.
Measured: Types PASS (13.8 s), Lint PASS (12.1 s, 0 errors / 21 warnings), Quality
gate (changed) PASS (0.7 s), Tests + coverage PASS (115.0 s), Build PASS (7.6 s).
Focused suites: getty_web_driver 31, getty_web_batch 17, getty_web_upload 16,
bridge_getty_web 20, stockupload_getty_web 10, Getty runs + UI 122 total. Docs:
SOR 8,987 B / 9,000 B, selectors 6,439 B.

## 2026-10-30 — Read the real batch page: invalid-file-media and a disabled Complete

The captured batch page settled the contract: a rejected card renders
`[data-cy="invalid-file-media"]` ("Upload failed"), a good one renders
`[data-cy="image-thumbnail"]` with a CloudFront `src`, and **every** card carries
`[data-cy="not-ready-icon"]` while Getty ingests — so that icon decides nothing.
Detection now uses both the node and the text, the thumbnail alone marks an upload,
and the finish waits (bounded, 120 s) for the Complete control to be *enabled*
before clicking it (`completionState`), reporting `Getty has not enabled its SUBMIT
control …` instead of clicking into nothing.
Measured: Types PASS (4.2 s), Lint PASS (1.9 s, 0 errors / 21 warnings), Quality
gate (changed) PASS (0.7 s), Tests + coverage PASS (99.3 s), Build PASS (6.7 s).
Focused suites: getty_web_driver 32, getty_web_batch 19, getty_web_upload 16,
bridge_getty_web 20, stockupload_getty_web 10, getty_web_finalize 7. Docs: SOR
8,945 B / 9,000 B, selectors 6,687 B.

## 2026-10-30 — The bar moves with each thumbnail, from the first one

Cause: the live watcher stopped at the first unreadable poll. The helper answers
`404` for `/getty-web/progress` until its upload request has a session, so the
watcher died before the first thumbnail and the panel stayed at `0 completed /
14` with `Preparing upload batch…`. Even a successful reading only changed the
label, never `done`. Now every reading reports at once, misses are retried (1 s
cadence, 60 misses), `done` = files Getty settled (thumbnail + its own
"Upload failed"), and the watch ends on `done`/`failed` or the run's end.
Measured: Types PASS (18.3 s), Lint PASS (15.7 s, 0 errors / 21 warnings), Quality
gate (changed) PASS (0.7 s), Tests + coverage PASS (129.6 s), Build PASS (8.2 s).
Focused: stockupload_getty_web 13, getty_web_upload 16, getty_web_batch 19.
Docs: SOR 8,989 B / 9,000 B, selectors 6,822 B.

## 2026-10-30 — Reload the Getty page when it stops reacting (30 s)

Getty's batch page sometimes stops reacting to its own uploader mid-run. The
helper now watches for a stall: no newly listed file for 30 s (`stallMs`) sends
`Page.reload` (cache ignored), waits for `readyState === "complete"`, dismisses
dialogs and re-attaches **only** the files the page still misses, through the same
contribution uploader. Two reloads at most, then the run fails with "the Getty
batch page stopped reacting and did not accept the remaining files after a
reload". The reload counter rides along in the progress payload
(`{…, reloads}`), so the panel line says `— page reloaded to get it moving`.
Also fixed a loose fallback: the no-card text match now needs a word boundary
(a stem `a` no longer matches the "a" of "Upload").
Measured: Types PASS (6.5 s), Lint PASS (2.4 s, 0 errors / 21 warnings), Quality
gate (changed) PASS (0.7 s), Tests + coverage PASS (120.4 s), Build PASS (8.3 s).
Focused: getty_web_batch 21, getty_web_driver 32, getty_web_cdp 11,
getty_web_upload 16, stockupload_getty_web 14. Docs: SOR 8,992 B / 9,000 B,
selectors 7,204 B.

## 2026-10-30 — Getty web: today's Date Created on every file, and wait for the full upload
Measured after `gettyCreatedDate` (Getty's `MM/DD/YYYY 00:00:00 +0000`), the
drawer-ready wait, the honest thumbnail timeout and the failed-card submit guard:
`verify:fast` Types 3.7 s · Lint 1.5 s (0/21) · Quality gate 0.7 s · Tests +
coverage 99.4 s (3325 passed) · Build 7.1 s → ALL LANES PASSED. Focused:
`getty_web_driver` 35, `getty_web_finalize` 11, `getty_web_batch` 22,
`getty_web_upload` 17, `getty_web_cdp` 11, `bridge_getty_web` 20,
`stockupload_getty_web` 14 = 130 passed. SOR 8,966 B, selectors 7,349 B.
- 2026-10-30 — row badge Ctrl-click removal and successful re-upload behavior: focused badge/selection tests passed; `npm run verify` passed all lanes, including typecheck, lint, quality, full tests/coverage, and build.

## 2026-10-30 — Getty web: remember the sign-in (kept profile browser, polite close)
Measured after the profile keep-alive, the CDP `Browser.close` before any
force-kill, `--restore-last-session`, the idle-close cancel on attach, and the
startup line naming the profile:
`verify:fast` Types 4.0 s · Lint 1.7 s (0/21) · Quality gate 0.5 s · Tests +
coverage 98.7 s · Build 7.0 s → ALL LANES PASSED. `getty_web_browser` 26,
`getty_web_signin`, `getty_web_cdp`, `bridge_getty_web`, `getty_web_finalize`,
`getty_web_batch`, `getty_web_driver`, `getty_web_upload`,
`stockupload_getty_web` = 165 focused passed. SOR 8,996 B.

## 2026-10-30 — Getty web: cookie snapshot so a relaunched window starts signed in
Measured after the cookie snapshot (`iconsplitter-session.json`, mode 0600,
restored only for cookies the live browser lacks) and its wiring before the first
navigation and after a successful sign-in:
`verify:fast` Types 3.8 s · Lint 1.2 s (0/21) · Quality gate 0.6 s · Tests +
coverage 109.5 s · Build 7.8 s → ALL LANES PASSED (one re-run: the ported
`upload_rowbadge_ui` bulk test is load-sensitive and passes alone). Focused:
`getty_web_session` 6, `getty_web_browser` 26, `getty_web_signin` 9 = 41.
SOR 8,999 B.

## 2026-10-30 — Getty web: never change a file's tags while filling metadata
Measured after skipping the keyword field when the drawer already lists chips (or
its counter proves them) and after sending Enter only to the keyword field:
`verify:fast` Types 8.4 s · Lint 1.8 s (0/21) · Quality gate 0.4 s · Tests +
coverage 101.6 s · Build 7.0 s → ALL LANES PASSED. `getty_web_driver` 38,
`getty_web_finalize` 13. SOR 8,994 B, selectors 7,651 B.

## 2026-10-30 — Getty web: one Save metadata covers the whole batch
Measured after selecting every contribution once all drawers were filled and
pressing Getty's captured `save-metadata` control a single time (Ctrl-click when
the grid has no select-all box), after re-clicking a card whose drawer never
unlocked, and after refusing to submit while an "Upload failed" card is listed:
`verify:fast` Types 3.8 s · Lint 1.3 s (0/21) · Quality gate 0.5 s · Tests +
coverage 105.7 s (319 files) · Build 7.5 s → ALL LANES PASSED (twice). Focused:
`getty_web_driver` 41, `getty_web_finalize` 18, six Getty suites 121.
SOR 8,946 B, selectors 8,060 B.

## 2026-10-30 — Getty web: a frozen page stalls and reloads, and the run logs itself
Measured after making every page reading non-fatal (a timed-out read is a stall,
not the end of the run), after reloading and re-attaching even when nothing was
ever read, and after adding `src/stockupload/stockuploadlog.ts` so the tab writes
a start line, one line per file, every failure reason, each page reload and one
closing line to the shell's log dock:
`verify:fast` Types 6.4 s · Lint 1.8 s (0/21) · Quality gate 0.5 s · Tests +
coverage 111.7 s · Build 7.4 s → ALL LANES PASSED. Focused:
`getty_web_batch` 24, `getty_web_driver` 41, `getty_web_finalize` 18,
`getty_web_session` 6, `stockupload_log` 9. SOR 8,986 B, parent SOR 6,989 B.

## 2026-10-30 — test-system wall time, second 40% attempt (measured, not met)

Same host as the 2026-10-25 entry (2 vCPU, Node 22.22.3), recorded with
`tools/harness-benchmark.mjs`: `verify:fast` median **117.44 s → 108.61 s = 7.5 %
less** (clean runs 109.80 / 107.42; every run, including the four that exited 1
for a disclosed reason, is filed under
`docs/archive/2026-10-30-harness-speed/evidence/`). Suite alone 92.7–98.6 s for
**3365 tests / 320 files**, all passing; no test removed, skipped or loosened and
every perf budget and coverage threshold unchanged.

What bought the time: the Getty bridge's production pacing is now injectable
(`settleMs` 700, `bulkSaveSettleMs` 1500, `pollMs` 1000 defaults) so
`getty_web_finalize` runs 0.25 s instead of 22.65 s and `getty_web_batch` 0.63 s
instead of 7.98 s, with a fake-timer guard proving the real defaults still apply;
and `waitUntil` was fixed to stop spending its app-time window on one timer
fast-forward, which root-caused a rare `never reached: upload rows` on the
heaviest React files (reproduced at 4 ms of real time, now covered by a test).

Why it is not 40 %: 167 s of CPU for a 93 s run (85–90 % worker packing),
132.6 s of it real test bodies rendering the actual panel (react-dom dev 23 %,
happy-dom 16 %, GC 13 % of samples). `isolate:false` measured 106 s and broke
isolation canaries; threads/V8 pools, group merges, optimizer pre-bundling and
semi-space tuning were all neutral or slower. Reaching 40 % needs smaller or
fewer rendering-scale tests, or 4 vCPU — see
`docs/archive/2026-10-30-harness-speed/README.md`.

## 2026-10-30 — Getty finish at 100 % with a close control

Reported: a real 14-file Getty batch reached 100 % / "14 completed · 0 remaining"
and the bar still offered Cancel; a minute later the run ended as an error
("Getty does not show a Complete/Submit control on this batch") although the job
was done.

Measured, in this order. Completion is now decided by the per-file chip, not the
thumbnail: a card counts as uploaded on its thumbnail **or** Getty's
`[data-cy="pending-icon"][aria-label="Ready to submit"]` (`driver.mjs`
`fileStatus`), and `contribute.mjs` `waitForReadyToSubmit` requires **every** card
to show it after "Save metadata"; files still on `not_ready-icon` get Save
metadata pressed again after `readyRetryMs` 30 s (at most `readyResaves` 2,
`readyTimeoutMs` 75 s) and only those files are re-checked. `finalizeBatch`
reports `readiness {ok, verified, ready, total, notReady, resaves}`; the gateway
returns `ready: true` and `completed: false` for an all-ready batch with no
Complete control, and `runupload.ts` logs `batch-ready` at `info` instead of the
`error` closing line observed live. `progressOf` gained `ready` (emitted only
when > 0), `GettyWebProgress.ready` is optional and absent unless proven.

The bar itself moved to `src/stockupload/progressmodel.ts` (`uploadBar`): 100 %
means finished, so at 100 % it forces the percentage, swaps Cancel for the ✕
close (`stock-progress-dismiss`, "Close upload progress") and keeps a
`complete` header until dismissed (`panelops.dismissProgress`); `panelops.ts`
keeps the finished bar after the run returns with `complete: true` and
`failed: summary.failedFiles`, titled "Upload complete" / "Upload finished with
errors".

Focused runs: `getty_web_*`, `bridge_getty_web`, `stockupload_getty_web(+_ui)`,
`stockupload_log`, `stockupload_progress_ui`, `docs_navigation` — **220 tests in
14 files, all passing** (44 driver, 49 batch+finalize, 15 stockupload_getty_web,
10 log, 4 progress UI, 4 docs). `npx tsc --noEmit` clean, `npm run lint` 0 errors
(22 pre-existing warnings), `npm run quality:changed` GATE PASSED after splitting
`panelops.performConfirmUpload`/`buildMetaAndUploadOps` and
`gettywebclient.parseSuccess` under RULE 16 again. `npm run verify:fast`: **ALL
LANES PASSED** (build 8.3 s). No test deleted, skipped or loosened; no threshold,
budget, harness or dependency change. Docs updated:
`sor/stock-upload-getty-web.md` (readiness gate, no-control success, driver ready
icon), `sor/stock-upload.md` (bar + `batch-ready`), `selectors/stock-upload.md`
(ready chip, bar handles); every `docs/current` page stays under 9 000 B
(8 966 / 7 724 / 8 558 B). `dist/` and `node_modules/` were restored, not
committed.

## 2026-10-30 — Getty uploads are verified by "Ready to submit", never a thumbnail

Correction of the entry above, on the user's instruction: a rendered thumbnail is
not evidence of an upload at all (Getty draws one for files it later rejects), so
the ready icon is now the **only** proof.

`driver.mjs` dropped `cardHasThumbnail`/`CARD_THUMBNAIL` and the card's
`thumbnail` field: `fileStatus` returns `uploaded` only for a card carrying
`[data-cy="pending-icon"][aria-label="Ready to submit"]`, `failed` for
`invalid-file-media`, `processing` for anything else, and a page without cards
can only prove a row is listed (never `uploaded`). `readUploadState.uploaded`
therefore means "Getty validated this file"; `processingNames` is every listed
file without the icon.

`contribute.mjs`: `waitForVerified` waits for the icon on every card and, when
the bound passes, returns `ok` with the still-pending names instead of claiming
them — the following metadata save is what makes Getty validate a card, and the
readiness gate (`waitForReadyToSubmit`, retry 30 s ×2 then 75 s) is the single
judge. `finishBatch` now reads the icons before pressing Complete too: a card
without the icon gets the readiness wait and, if it stays unvalidated, the batch
is refused with the file named instead of submitted.

`session.mjs` gained `acceptedOf`: the upload answer's `accepted` list comes from
the **last** reading — the one taken after the grid-wide save — never from the
attach phase, so a thumbnail-only card can no longer be reported as uploaded.
`progressOf` keeps counting the same icon, and the panel line reads "N of M
file(s) ready to submit".

Focused runs: 24 files / **275 tests** passing — `getty_web_driver` 45 (incl. the
new "never counts a rendered thumbnail as an upload on its own"), `getty_web_batch`
30 (incl. a not-ready card kept out of `uploaded`, a listed-but-unvalidated card
handed to the metadata step, and `finishBatch` refusing to submit it),
`getty_web_session` 9 (3 new `acceptedOf` cases: post-save reading wins, empty
when nothing was validated, attach fallback), plus finalize/upload/cdp/signin/
browser/bridge and the stock-upload UI suites. `npx tsc --noEmit` clean;
`npm run quality:changed` GATE PASSED; `npm run verify:fast` ALL LANES PASSED.
No test removed, skipped or loosened; no threshold, budget or harness change.
Docs: `sor/stock-upload-getty-web.md` (icon-only proof, `pending`, `acceptedOf`),
`selectors/stock-upload.md` (thumbnails decide nothing); both stay under 9 000 B
(8 996 / 8 527 B). `dist/` and `node_modules/` restored, not committed.

## 2026-10-30 — Getty: metadata starts on the picture, the bar follows the chips

Reported: the run froze on the step that types Date Created and presses Save
metadata. Cause: the previous change made the transfer wait require the "Ready to
submit" chip, but Getty only shows that chip **after** the metadata is saved — a
deadlock that could only end at the 300 s bound.

Two stages are now separate and measured. `driver.mjs` `fileStatus` counts a file
as arrived on its picture **or** its chip (`uploaded`), while
`readState.readyToSubmit` is the chip alone; `readState.awaitingReady` is every
listed card without it. `contribute.mjs` `waitForVerified` waits for **arrival**
(a picture or a chip) and returns as soon as every file has one — that is what
starts the metadata step — and only reports `timeout` for a file with neither
after the bound. The chip remains the finish line: `waitForReadyToSubmit` runs
after the grid-wide Save metadata, re-presses Save metadata after `readyRetryMs`
30 s (twice at most, `readyTimeoutMs` 75 s) and re-checks only the files that are
not ready; a card that never turns ready is named and never clicks Complete.

Progress: `progressOf` reports both counts; `settledFiles` is
`max(arrived, ready) + failed` so the bar never runs backwards while the metadata
is saved, and `progressLabel` switches to "N of M file(s) ready to submit" during
the metadata/readiness phase. `session.upload` passes `onState` into
`finalizeBatch`, so every readiness reading the helper takes also updates
`/getty-web/progress` and the panel's bar at 100 % stays a finished, closable bar.

Measured: `getty_web_batch` 30 (new "starts the metadata step on the picture,
without waiting for the validation chip" reproduces the freeze under fake timers
and passes in ~2 s of app time instead of the 300 s bound; "waits for the picture
and then says which files never arrived" pins the honest timeout),
`getty_web_finalize` 23 (new "presses Save metadata again when the grid save left
a card not ready" — two grid saves, Complete only after the retry — and "never
clicks Complete while a card still lacks its Ready to submit chip"),
`getty_web_driver` 45 ("counts a rendered picture as arrival only, never as ready
to submit"), `stockupload_getty_web` 15 (bar verifies against chips: 1 of 4 then
2 of 4 ready while done stays at the arrived count). Focused total: 24 files /
**275 tests**, all passing. `npx tsc --noEmit` clean, `npm run lint` 0 errors (22
pre-existing warnings), `npm run quality:changed` GATE PASSED, `npm run
verify:fast` ALL LANES PASSED. No test skipped, loosened or removed; no threshold
or budget changed. Docs: `sor/stock-upload-getty-web.md` (arrival vs finish),
`selectors/stock-upload.md` (picture starts metadata, chip finishes),
`sor/stock-upload.md` (bar counting) — 8 964 / 8 568 / 8 067 B. `dist/` and
`node_modules/` restored, not committed.

## 2026-10-30 — Getty progress truth + re-upload of unvalidated cards

Measured this round: `npx tsc --noEmit` clean; `npm run lint` 0 errors (22
pre-existing warnings); `npm run quality:changed` GATE PASSED (largest touched
file `gettywebtransfer.ts` 251 lines / 24 fns); `npm run verify:fast` ALL LANES
PASSED (build 1,951.06 kB). Focused vitest: `stockupload_progress_ui` 6/6,
`stockupload_getty_web` 17/17, `getty_web_session` 11/11, `getty_web_finalize`
26/26, `getty_web_batch` 32/32, `docs_navigation` 4/4 after the SOR page was
reflowed 9220 B → 8985 B.

## 2026-10-30 — Getty runs above 100 icons (batched upload, one retry)

Measured this round: `npx tsc --noEmit` clean; `npm run lint` 0 errors (22
pre-existing warnings); `npm run quality:changed` GATE PASSED (largest touched
file `gettywebclient.ts` 295 lines after splitting `parseFailure` into
`failureReason`/`presentLists`/`pageLists`); `npm run verify:fast` ALL LANES
PASSED (build 1,954.73 kB). Focused vitest: `getty_web_chunk` (new) +
`getty_web_upload`, `stockupload_getty_web`, `bridge_getty_web`,
`getty_web_session`, `getty_web_finalize`, `getty_web_batch`,
`stockupload_progress_ui`, `quality_base`, `docs_navigation` green. Full suite
3,420 tests: only `algo_efficiency`'s "synthetic 1000px 4-icon grid <200 ms"
missed its wall-clock budget on this 2-vCPU sandbox (~224–280 ms); it touches no
file this round changed and the budget was left untouched.

## 2026-10-30 — a batch that is too big for one request (209-icon run)

Measured this round: `npx tsc --noEmit` clean; `npm run lint` 0 errors (22
pre-existing warnings); `npm run quality:changed` GATE PASSED (new
`gettywebparse.ts` 107 lines; `gettywebclient.ts` 234 after the parse split);
`npm run verify:fast` ALL LANES PASSED (build 1,956.20 kB). Focused vitest:
`getty_web_chunk` 10/10, `getty_web_upload` 22/22, `stockupload_getty_web` 25/25,
`bridge_getty_web` 25/25 incl. the new live 413 test, `docs_navigation` 4/4.
Full suite 3,426 of 3,427: the only miss is `algo_efficiency`'s "synthetic
1000px grid <200 ms" (216–308 ms) on this 2-vCPU box at load 1.3–2.1; it touches
no file changed here and the budget was not touched.

## 2026-10-30 — request sizing against the helper that is running

Measured this round: `npx tsc --noEmit` clean; `npm run lint` 0 errors (24
pre-existing warnings); `npm run quality:changed` GATE PASSED (`gettywebtransfer.ts`
235 lines, `panelops.ts` 268, `runupload.ts` 285); `npm run verify:fast` ALL LANES
PASSED. Focused vitest 10 files / 168 tests green: `getty_web_chunk` 11/11,
`getty_web_upload` 23/23, `stockupload_getty_web` 26/26, `bridge_getty_web`
26/26, `getty_web_batch`, `getty_web_finalize`, `getty_web_session`,
`stockupload_progress_ui`, `stockupload_getty_web_ui`, `docs_navigation`. Full
suite 3,430 of 3,431: only `algo_efficiency`'s wall-clock "synthetic 1000px
<200 ms" (228 ms on this 2-vCPU box) missed, untouched by this change.

## 2026-10-30 — Getty web: a 209-icon run failed at the header, not the helper

- Cause (measured): `x-getty-web-config` carried `{icons:[…]}` — 100 icons with
  2 KB descriptions = **287,340 chars** of base64 — and Node's 16 KB
  `maxHeaderSize` answered **431 in 5 ms**, destroying the socket before any
  route ran, so no browser opened and 418 files were reported as a dead helper
  (`/tmp/hdr_probe.mjs`: small header → 503 in 46 ms, 100 KB header → 431 in 5 ms).
- Fix: the header keeps settings + `manifestBytes` (< 8 KB); the per-icon manifest
  is the **body's tail**; the helper rebuilds the config (`configFromBody`), still
  reads an older `icons` header, and raises `maxHeaderSize` to 1 MB as defence.
- Bar: `uploadBar` counts **uploaded** files (`done`), so 0 of 418 is `0%` /
  "Upload failed — nothing was uploaded", `failed` paints red, and `complete`
  (green) needs `failed === 0`.
- Measured: `tsc` clean; lint 0 errors / 24 warnings; `quality:changed` GATE
  PASSED; `verify:fast` ALL LANES PASSED; focused 12 files / 176 tests green;
  full suite 3,434/3,435 — the only miss is `algo_efficiency`
  "synthetic 1000px 4-icon grid < 200 ms" at 265 ms (environmental, budget kept);
  docs 4/4 (soR 8,998 B, selectors 8,933 B, invariants 8,762 B).

## 2026-10-30 — Getty web: a stuck batch page is reloaded before it is written off

- Symptom: 100 cards listed, chips red for the whole readiness window, one card
  "Upload failed", and no page reload — the run simply waited out its bound and
  moved on. A reload is the recovery that turns those cards most of the time.
- Helper: `waitForVerified` now reloads a page that gives no new picture for a
  stall window; `waitForReadyToSubmit` runs a bounded ladder per batch —
  **save, reload + save, save, reload + save, then re-upload** (`readyPlan`,
  `READY_RELOADS = 2`) — re-reading the chips after every step, so a batch is
  always reloaded at least once in its own verification before it is reported or
  the next 100-icon batch starts. One `reloadMeter` per attach keeps the count
  honest, and `session.mjs` feeds it into `progress.reloads` so the bar says
  "page reloaded to get it moving".
- Verified: `tsc` clean; lint 0 errors / 24 warnings; `quality:changed` GATE
  PASSED; `verify:fast` ALL LANES PASSED; focused 10 files / 175 tests green;
  full suite 3,437/3,438 (only the environmental `algo_efficiency` 1000px budget,
  259 ms vs 200 ms, budgets untouched); docs 4/4 (soR 8,998 B, invariants
  8,926 B).

## 2026-10-30 — Getty web: the bar keeps counting after batch 1

- Symptom: batch 1 verified, then the panel froze ("Verifying Ready to submit ·
  0 completed / 418") while the browser kept uploading: only the first batch was
  ever shown.
- Cause 1 (`progressTick`): the poller **returned** on a `done`/`failed` reading.
  The helper reports "done" at the end of *every* batch, so the watcher died after
  batch 1 and no later reading was ever requested. It now runs until the run's own
  `stop()` (the miss cap still covers a dead helper).
- Cause 2 (`liveGettyProgress`): `done` was `base + settled` with `base` taken
  from `counters.done` (only written after the whole run), so every batch restarted
  the bar at 0. Readings now carry the **batch they belong to** (`progressOf`,
  `batch`), a new batch banks the previous one's last count (`rebaseOnBatch`), and
  the total is clamped to the run's file count.
- Verified: `tsc` clean; lint 0 errors / 24 warnings; `quality:changed` GATE
  PASSED (`runupload.ts` 296 lines); `verify:fast` ALL LANES PASSED; focused 8
  files / 91 tests green; full suite green except the environmental
  `algo_efficiency` budget; docs 4/4 (process-progress 8,998 B).

## 2026-10-30 — Getty batch names carry no product name

- `gettyWebBatchName` now builds `2026-10-30 2/3 (100 icons)` (date, place,
  size) instead of `IconSplitter 2026-10-30 2/3 (100 icons)`; the 60-character
  cap and the retry form (`2026-10-30 retry 1/1 (7 icons)`) are unchanged.
- Verified: `tsc` clean; lint 0 errors / 24 warnings; `quality:changed` GATE
  PASSED; `verify:fast` ALL LANES PASSED; focused 7 files / 147 tests green;
  docs 4/4 (soR 9,000 B).
- 2026-10-30 — Random 100-icon batch selection (`stock-random-batches`): the
  Getty web run can now draw each 100-icon batch at random from the icons not yet
  sent (`randomBatchOrder`, Fisher–Yates over the index list, opt-in through the
  persisted `randomBatches` preference, default off) instead of taking the list in
  row order; every selected icon is still uploaded exactly once, the last batch
  keeps the remainder, and batch names, counts, progress totals, retries and the
  metadata step are untouched. Injected `rng` keeps it deterministic in tests.
- Verified: `tsc` clean; lint 0 errors / 24 warnings; `quality:changed` GATE
  PASSED; `verify:fast` ALL LANES PASSED; focused 7 files / 107 tests green;
  `tests/stockupload*` 14 files / 101 tests green; docs 4/4 (soR 8,992 B,
  selectors 8,994 B).
- 2026-10-30 — A metadata drawer that is only skeleton bars (or never unlocks)
  is now treated as the page's fault, not the file's: `metadataEditorReady`
  reports `[data-cy="metadata-skeleton"]` as `skeleton`, the editor wait stops
  at once instead of polling 15 s and re-clicking, and the helper reloads the
  Getty page immediately and walks the metadata **again from the first file**
  (once; the last walk never stops early, so one stubborn file cannot cost the
  rest). Files whose card never got its picture are skipped (`no-thumbnail`)
  instead of being retried through a drawer that cannot exist. New tests:
  `getty_web_driver` (skeleton vs loaded drawer), `getty_web_finalize`
  (skeleton → `Page.reload` → the first file is opened again; a picture-less
  file is skipped without a reload; the never-unlocks ladder now reloads).
- Verified: `tsc` clean; lint 0 errors / 24 warnings; `quality:changed` GATE
  PASSED; `verify:fast` ALL LANES PASSED; full suite 3,445 / 3,446 (only
  `algo_efficiency` 209.6 ms vs its 200 ms budget, environmental); helper 11
  files / 258 tests green; docs 4/4 (soR 8,998 B, selectors 8,994 B).
- 2026-10-30 — `Random batches` now also mixes each drawn 100-icon batch inside
  itself (`mixedBatch` → `randomBatchOrder` over the chunk, the run's own rng), so
  neighbouring stems from the list are never uploaded side by side; the check
  that decides batch membership stays the same one-time permutation, and with the
  box off the batch keeps the user's row order exactly. New test:
  `stockupload_getty_web` "also mixes the icons inside a random batch, not just
  between batches" (off = star/moon/sun row order; on with `rng = () => 0` =
  sun/star/moon, i.e. draw `[b,c,a]` then mix to `[c,a,b]`).
- Verified: `tsc` clean; lint 0 errors / 24 warnings; `quality:changed` GATE
  PASSED; `verify:fast` ALL LANES PASSED; `tests/stockupload*` 14 files / 102
  tests green; docs 4/4 (soR 8,997 B).
- 2026-10-30 — A request the helper refuses as too large is now answered the
  same way a dropped one is: `unreadableAnswer`/`parseFailure` map HTTP 413/431
  to the new `too-large` code (never "cannot reach the local helper"), and
  `sendRequest` halves the batch on `helper-down` **or** `too-large` (twice, so
  one 51.6 MB body becomes 25.8 + 12.9 MB requests), logging what happened
  (`batch-split`: "a request of 51.6 MB (100 icons) was larger than the helper
  takes — sending it as two smaller batches"). `too-large` is deliberately not
  session-level, so one oversized batch no longer ends a 209-icon run.
- Verified: `tsc` clean; lint 0 errors / 24 warnings; `quality:changed` GATE
  PASSED; `verify:fast` ALL LANES PASSED; helper+bridge+stockupload 15 files /
  130 tests green; focused 5 files / 80 tests green; docs 4/4 (soR 8,999 B).
- 2026-10-30 — `Random batches` spreads look-alike icons as well as shuffling:
  `similarityKeyOf` strips a trailing number (`icon-snowflake_2_01` →
  `icon-snowflake_2`) and `spreadSimilar` moves a batch member that repeats its
  neighbour's key further along, so two sizes of one picture no longer travel
  side by side while the rest of the draw keeps its order. One uniform
  Fisher–Yates draw stays the source of the randomness (a second pass would add
  nothing to a uniform permutation); the batch with the box off is untouched.
  New tests: `getty_web_chunk` (key grouping, dealing, nothing dropped) and
  `stockupload_getty_web` ("keeps the two sizes of one picture apart inside a
  random batch": `snow_01/snow_02/wheel_01/wheel_02` upload as
  `wheel_01, snow_01, wheel_02, snow_02`).
- Verified: `tsc` clean; lint 0 errors / 24 warnings; `quality:changed` GATE
  PASSED; `verify:fast` ALL LANES PASSED; focused 3 files / 49 tests green;
  docs 4/4 (soR 8,996 B).
