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
