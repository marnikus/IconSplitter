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

# Quality re-check — 2026-10-05 (final-prompt confirmation preview + global activity log)

Closing check-in for this change set: the confirmation now shows the
FINAL prompt and the request wire fields byte-for-byte before anything is sent,
and a single global log dock records user actions, state changes, generation
stages, requests, retries, errors, tokens and cost on every tab. Design record:
[`docs/archive/2026-10-05-svg-confirm-log/design.md`](../archive/2026-10-05-svg-confirm-log/design.md).

## What changed

* `src/lib/log.ts` (new) — the pure log core: `LOG_VERSION = 1`, the entry
  schema, sanitising/redaction (sensitive names dropped, key-shaped text and
  `data:` URLs masked, numeric `tokens`/`cost` kept, detail/value/ids truncated),
  `clampLogMax`, `appendEntry` (cap by trimming the oldest), `createEntry`,
  `formatEntry`/`formatEntryBody`/`formatLogText`, and the payload
  (de)serialiser that ignores a foreign version or a corrupt row.
* `src/log/*` (new module) — `logstore.ts` (the one live list: cap, minimized,
  debounced 150 ms writes, `flushLog`, `resetLogStore`, subscription),
  `useLog.ts` (the React bridge), `scroll.ts` (`LOG_BOTTOM_SLACK_PX = 24`,
  `isAtBottom`), `useAutoScroll.ts` (follow the tail only while at the bottom),
  and the dock `LogDock`/`LogHead`/`LogList`/`LogRow` (minimize/restore, cap
  select, Copy all, Clear; the note says so when the clipboard is blocked).
* `src/svg/SvgPromptPreview.tsx` (new) — the confirmation's verbatim preview:
  the prompt text exactly as `lib/svgpayload` built it and, once the page's
  composite exists, that request's wire fields; until then it says what it is
  waiting for instead of guessing.
* `src/svg/SvgConfirm.tsx` — refactored (265 → 264 lines including the new
  preview) so the pager head, the facts, the ordered manifest and the composite
  each keep their own small component; the dialog still sends nothing by being
  opened.
* Wiring: `runlog.withRunLog(sink)` (UI sink first, then the log) applied in
  `actions.ts`; `HistoryProvider` (push/push-gesture/undo/redo/apply-failed),
  `scan.ts` (scan + warnings + failure), `keystore.ts` (mask-only key
  save/clear), `actions.ts` (root picked, prompt reset, config/sampling
  changes, review decision, confirm opened, generate confirmed, cancel
  requested) and `Workbench.openTab` now emit entries.
* CSS for `.svg-payload-*`; docs: `SYSTEM_OF_RECORD.md` (§2, §6, §7, §8, §11,
  I-22…I-26, §13), `UI_SELECTORS.md` (§P source list + preview row, new §Q for
  the dock), `docs/README.md`.

## The numbers (measured)

| lane | before | after |
|---|---|---|
| `tsc --noEmit` | clean | clean |
| eslint | 0 errors / 8 warnings | 0 errors / 8 warnings |
| `tools/quality.mjs --changed --allow-legacy` | GATE PASSED | GATE PASSED (23 changed files) |
| tests | 61 files / 574 | **68 files / 641** |
| coverage (all files, stmts/branch/funcs/lines) | 97.34 / 92.85 / 96.94 / 98.11 | **97.33 / 92.95 / 97.10 / 98.21** |
| jscpd `src --min-tokens 60` | 12 clones | 12 clones (no new TS/TSX clone) |
| build `dist/index.html` | 608.20 kB / gzip 178.81 kB | 626.63 kB / gzip 184.40 kB |

`bash tools/pre_push_check.sh` → **ALL LANES PASSED** (6/6).
`npx knip` still cannot run in this sandbox (`oxc-parser` fails to allocate its
`ArrayBuffer`, on `HEAD` as well) — the dead-code lane stays unverified here.

## RULE 18 / RULE 16 re-check

New/changed production files, every one inside the 150–300-line ideal or
explained by a single responsibility: `lib/log.ts` 211, `svg/actions.ts` 299,
`svg/SvgConfirm.tsx` 264, `state/HistoryProvider.tsx` 154, `log/logstore.ts`
119, `svg/runlog.ts` 114, `svg/scan.ts` 107, `ui/Workbench.tsx` 80,
`svg/keystore.ts` 77, `log/LogHead.tsx` 76, `svg/runtypes.ts` 74,
`svg/SvgPromptPreview.tsx` 55, `log/LogDock.tsx` 44, `log/useAutoScroll.ts` 43,
`log/LogList.tsx` 29, `log/LogRow.tsx` 22, `log/scroll.ts` 16, `log/useLog.ts` 10.

The gate caught four real offenders in the first cut and each was fixed in
RULE 19 order by extracting a responsibility, never by padding or renaming:
`LogDock`'s 38-line component → the header moved to `LogHead`; `SvgConfirm`'s
38-line `BatchPager` → `PagerHead` + `PagerFacts` + `BatchItems`; `actions.ts`
at 302 lines and a 31-line hook → `refreshModelsNow()` moved out; and
`runbatch.waitToRetry`'s 5 params → the `RetryPlan` object. `lib/log.toEntry`
was at CC 12 → `isStoredEntry` predicate. No function is above 30 lines /
4 params / CC 10 / nesting 4, and no anti-gaming name pattern is used. The full
gate still reports only the three recorded legacy files (`src/App.tsx`,
`src/lib/detect.ts`, `src/lib/render.ts`), unchanged.

Baseline: **untouched** — `tools/quality_baseline.json` is not re-recorded.

Context files stay above the RULE 18 200-line ideal (`SYSTEM_OF_RECORD.md` 850,
this log 857, `UI_SELECTORS.md` 442) — the same recorded debt as before, with the
design detail pushed to `docs/archive/`.

## Regression tests (RULE 8 — each fails if the behaviour is deleted)

* `tests/log_lib.test.ts` — the schema, sanitising, clamping, trimming,
  formatting, payload round-trip and the corrupt/foreign refusals.
* `tests/log_store.test.ts` / `tests/log_scroll.test.ts` — debounced writes,
  cap change, clear-leaves-one, minimize/restore, and the bottom-slack rule.
* `tests/log_ui.test.tsx` — the dock on every tab with ONE instance and one
  history, minimize/restore, Copy all and the blocked-clipboard note, Clear,
  the cap select and the follow/pause status.
* `tests/log_wiring.test.tsx` — the emitters: history push/undo/apply failure,
  scan warnings, key save/clear (mask only, never the key).
* `tests/svg_runlog.test.ts` — every `RunEvent` → entry mapping (stages,
  retries, failures, tokens, cost) and that no entry carries the composite
  data URL.
* `tests/svg_confirm.test.tsx` — the preview equals `buildPayload`'s prompt and
  `payloadLines`' wire fields for the same page, page by page.
* `tests/svg_runner.test.ts` — the text actually sent equals that same
  `buildPayload` value (single and batch), which closes the
  preview → payload chain.
* `tests/secret_hygiene.test.ts` — the stored log, its formatted text and the
  copied text never contain the key.
