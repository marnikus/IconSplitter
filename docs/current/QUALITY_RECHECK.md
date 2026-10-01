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

# Quality re-check — 2026-10-01 (batch folders shipped)

Full `npm run verify` after building the recursive batch tool (design:
`docs/archive/2026-10-01-batch-folders/DESIGN.md`). Legacy hotspots
(`src/App.tsx`, `src/lib/detect.ts`, `src/lib/render.ts`) untouched — new code
only, behind the `Batch folders` tab.

## What changed

* `src/batch/` (8 modules) — pure batch domain + File System Access boundary
  + review-state reducer; pixel math reuses `src/lib/*`, never hand-rolled
* `src/ui/Shell.tsx` + `src/ui/batch/` (7 components, 3 flow modules) —
  folders, presets, settings, review list, process bar; flows hold
  scan/process orchestration with no JSX
* `src/main.tsx` renders `Shell` instead of `App` (4-line diff)
* `tests/batch/` (84 tests) + `tests/shell.test.tsx` (6 tests) — fake-FS
  end-to-end for flows and a full UI run; `@testing-library/react` 16 added
  as a devDependency
* `tools/quality.mjs` — `--changed` now fails safe (gates all src files) when
  no base commit exists (shallow / single-commit checkout) instead of crashing
* RULE 18 splits during the build: `flows.ts` (331 lines) → `scanFlow.ts` /
  `processFlow.ts` / `presetFlow.ts` by lifecycle concept; `SplitSection`
  yielded `MergeControl`; `runScan` yielded `reportEmptyScan`

## The numbers (measured, not estimated)

| File | Lines | Functions | Gate state |
|---|---:|---:|---|
| `src/App.tsx` | 607 | 76 | LEGACY (held, unchanged) |
| `src/lib/detect.ts` | 307 | 15 | LEGACY (held, unchanged) |
| `src/lib/render.ts` | 106 | 8 | LEGACY (held, unchanged) |
| `src/batch/fs.ts` | 156 | 22 | OK |
| `src/batch/naming.ts` | 85 | 13 | OK |
| `src/batch/paths.ts` | 29 | 7 | OK |
| `src/batch/presets.ts` | 255 | 26 | OK |
| `src/batch/process.ts` | 298 | 24 | OK (2 lines under the 300 ceiling) |
| `src/batch/reducer.ts` | 136 | 18 | OK |
| `src/batch/scan.ts` | 142 | 16 | OK |
| `src/batch/status.ts` | 247 | 28 | OK |
| `src/main.tsx` | 11 | 0 | OK |
| `src/ui/Shell.tsx` | 45 | 5 | OK |
| `src/ui/batch/BatchPanel.tsx` | 105 | 24 | OK |
| `src/ui/batch/BatchSettings.tsx` | 161 | 28 | OK |
| `src/ui/batch/FolderPickers.tsx` | 36 | 2 | OK |
| `src/ui/batch/PresetBar.tsx` | 115 | 19 | OK |
| `src/ui/batch/ProcessBar.tsx` | 37 | 5 | OK |
| `src/ui/batch/ScanList.tsx` | 40 | 2 | OK |
| `src/ui/batch/ScanRow.tsx` | 45 | 4 | OK |
| `src/ui/batch/presetFlow.ts` | 20 | 2 | OK |
| `src/ui/batch/processFlow.ts` | 111 | 13 | OK |
| `src/ui/batch/scanFlow.ts` | 220 | 25 | OK |
| `src/utils/cn.ts` | 7 | 1 | OK |

* Tests: **107 passed** (14 files) — 17 sheet + 84 batch + 6 shell
* Coverage `src/lib`: **lines 100%, branches 95%** (threshold lines ≥ 80%)
* Lanes: tsc ✓ · eslint 0 errors / 8 legacy warnings · gate ✓ (GATE PASSED) ·
  tests ✓ · coverage ✓ · build ✓ — **ALL LANES PASSED**
* `dist/index.html` single-file build: 386 kB (gzip 113 kB)

## Baseline decision

Untouched. No legacy value grew (ratchet held on all three hotspots) and all
new files meet the hard lines — nothing to re-record.

## Known debt carried (added this round)

* `src/batch/process.ts` at 298/300 lines — next functional touch there must
  split by concept first (output-tree writing vs status updates are the seam).
* Prior debt unchanged: `App` 553 LOC, `detect()` cc 32 (see 2026-09-30).
