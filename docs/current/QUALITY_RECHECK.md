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
