# Shared batch process progress — plan (2026-10-21)

## Problem

SVG to upload publishes an ephemeral done/total text line, not the persistent
visual progress headers used by Batch and Generate SVG. Its panel also
unmounts on tab switches. Batch and SVG duplicate the header/track markup.
Upload metadata and export can overlap, so a single progress slot must not
let one run overwrite or clear another.

## Contract

- Show metadata generation/regeneration and export progress from the actual
  runner: count, total, percent, remaining, current work and Cancel.
- Reuse one shared visual header/accessible progress track in Batch, Generate
  SVG and Upload; preserve existing selectors, thumbnails and actions.
- A reusable plain-data process model/reporter supports future batch tasks.
  Keep metadata/export snapshots separate and retain finished summaries until
  dismissed or replaced by a new run of that kind.
- Portal Upload progress into the shell above navigation, visible across tabs.
  Keep Upload mounted after first visit, with its hidden-tab hotkeys disabled.
- Cancellation stops unsent work and keeps finished results. Cancelled runs
  show their actual processed percentage, not a false 100% success. Existing
  provider confirmation remains required; progress rendering sends nothing.
- Chained Export selected shows metadata then export, and cancellation during
  metadata must prevent the promised export phase from starting.

## Steps

1. Add failing tests for shared progress arithmetic/presentation, metadata and
   export runner progress, cancellation, chain handoff and shell persistence.
2. Extract common header/track UI and reuse it in both existing headers,
   retaining their domain-specific cancellation/thumbnail/review behavior.
3. Add generic process snapshots/reporting; publish Upload runner starts,
   item completions and terminal states into independent reducer slots.
4. Add Upload's reusable header adapter, cancel/dismiss/review actions and
   shell portal; keep its panel alive lazily and gate hidden-tab hotkeys.
5. Verify real pipelines over test filesystem/transport gates (no live calls),
   shared UI and existing header regressions; run types/lint/quality, fast and
   full verification. Update current owners/selectors/routes and append the
   measured quality ledger. Commit and push only scoped changes, not dist.

## Results

Implemented all steps. `ProcessProgressBar` is shared by existing Batch and
Generate SVG headers and the new Upload adapter. `lib/processprogress` provides
reusable immutable snapshots, bounded totals and terminal-once reporting.
Upload keeps independent metadata/export slots, publishes actual runner
completions, excludes aborted work from completed counts and retains terminal
summaries. Metadata cancellation now blocks the chained export phase.

Upload is lazily mounted on first visit, then parked hidden; a portal above
navigation stays visible and Review results opens the existing panel. Hidden
Q/E and arrow listeners are disabled. The original Upload toolbar counter is
derived from running snapshots, not separately updated. Existing Batch/SVG
selectors, cancellation dialogs, thumbnails and review actions are preserved.
Metadata worker orchestration moved from hooks into `metabatch.ts`, keeping
files/functions within limits and terminal cleanup explicit.

### Verification

- TDD: three newly added UI regressions failed before implementation; the new
  shared-model/UI suite could not load its not-yet-created modules. Final
  focused suites: **112/112 passed** across seven files.
- Tests drive real metadata/export logic with gated test transports, a test
  filesystem and canvas encoders, observing actual **0/50/100%** updates,
  regeneration after dismissal, metadata cancellation blocking chained export,
  aborted export exclusion, committed outputs and independent/stale snapshots.
- A full Workbench test parks Upload mid-export, confirms the header remains
  above navigation, completes the export while hidden, checks silent hidden
  hotkeys and reviews the same panel without remounting.
- Queue-test teardown now stops unfinished SVG runners before releasing their
  fake transports; shell model discovery is stubbed too. Focused final run
  contained no Requesty transport escape errors.
- `npm run verify:fast`: **all five lanes passed**.
- `npm run verify`: **ALL SIX LANES PASSED** — types **13.6 s**, lint
  **10.3 s**, changed quality **0.7 s**, native performance **2.5 s**,
  coverage **172.2 s**, build **6.4 s**.
- **2431/2431 tests in 227 files** passed. Library line coverage **97.81%**;
  new `lib/processprogress.ts` has **100% statements, branches, functions and
  lines**. Explicit-base changed-file quality gate passed; no thresholds or
  timing budgets changed, no dependencies added.
- Current contract/API/reuse instructions and selector handles are documented
  in `docs/current/sor/process-progress.md` and indexed from Upload/shared
  routes. Generated `dist/index.html` is deliberately excluded from commits.
