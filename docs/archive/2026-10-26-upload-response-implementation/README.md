# Upload response implementation

Date: 2026-10-26. Baseline: aba2474 (research delivery).

## Plan before production changes

Implement the measured Upload-specific redesign in `docs/current/sor/upload-response.md`.
Preserve all controls, exact export preparation, accepted-metadata approval,
canonical gestures/sorts/navigation, global undo, request/full cancellation and
completion audio. Do not alter test harness isolation, assertions, native alarms
or coverage thresholds. Do not make live provider calls.

1. Add failing complete-panel work budgets for mount-only boot reads, no active-only
   summary/planner work, and one effective-settings resolution per checked icon in
   the settings dialog. Add reducer property-read budgets and stale-projection
   tests, including applied decorations. Add artifact-count/planner parity tests.
2. Lazily initialize mount-owned boot/refs. Replace broad summary invalidation with
   explicit row/check/override dependencies and one-pass metadata counts. Reuse the
   artifact eligibility predicate for count-only summaries; leave exact download
   planning at execution unchanged.
3. Apply override patches with one immutable map clone. Project stale state only
   for changed local ids and changed metadata/run rows, with defaults→applied→pins
   precedence. Preserve immutable unchanged rows and all running/status behavior.
4. Resolve selected effective settings once for open-dialog decoration summaries;
   retain current summary entry points/semantics and the closed-dialog guard.
5. Repeat the same real-panel/reducer diagnostics and retain before/after evidence.
   Run existing real preview/export/decorations/metadata/undo tests and every normal
   verification gate. Update current contracts/owners, append the quality ledger
   without reading it, commit and push this branch.

Cold-preview executor replacement remains conditional in the researched design:
no browser profiling was available. Do not invent browser results or rewrite exact
geometry speculatively. Existing exact preparation/debounce/cache behavior remains
covered by the real live-preview/export suites. This change finishes the measured
orchestration, bulk-update and popup redesign, not an unmeasured worker project.

## Implementation

Measured P0/P1/P2 work is implemented, without control removals or changed export
geometry. `useUpload` lazily owns boot/refs and memoizes action context by actual
inputs. Render summaries have explicit row/check/pin scopes, not the whole API.
A one-pass metadata/artifact summary replaces multiple selected scans and full
name-planning allocations; artifact eligibility is shared with the unchanged
collision-safe execution planner.

`patchSettingsMap` atomically replaces/deletes a batch on one clone, and also
backs the compatible `mergeApplied` export. Single-row metadata/run events and
local batches project stale state only for changed loaded ids. Global defaults
skip semantically equal nested values and rows whose changed fields are pinned
or applied. Array traversal remains O(rows); expensive effective-setting creation
and hashing are limited to relevant rows. Running status and unaffected row
identity are preserved.

The previously suspected correctness issue was reproduced: an applied shadow
package became falsely stale after an unrelated metadata/run event because the
projection omitted `applied`. Projection now calls the same `rowSettings` merge
as previews/export: defaults, then applied decorations, then local pins. Local
false/null values remain authoritative. This is an intentional, tested correction,
not an unnoticed change to the export algorithms.

The open settings child memoizes one resolved effective-settings array shared
by shadow, badge and size-guide summaries. Closed settings do not derive them.
Standalone helper APIs, empty/default, mixed geometry, hidden checks and explicit
Apply-as-local semantics remain compatible.

### Additional cold-preview evidence and narrow fix

A real-preparation test demonstrated that 20 identical subscribers scheduling
cold debounce callbacks caused **20 identical `prepareExportSvg` calls**, even
after the first callback cached the result. `buildPreview` now rechecks the cache
at execution time; the same test performs **one** call and all 20 outputs match
real preparation exactly. Distinct keys still prepare independently; superseded
and unmounted subscribers do not run. Debounce timing, result-cache bound, exact
geometry, failure/source fallback and per-row scheduling are unchanged. This is
a measured duplicate-work correction, not a new unprofiled executor/worker.

## TDD evidence

Logs: `/home/user/upload-response-implementation/` (not committed generated logs).

- `tdd-panel.log`: **4 failures** — active changes reloaded boot settings once.
- `tdd-panel-summary.log`: after lazy boot, **4 failures** — active changes still
  allocated one full download plan. Counter assertions log numbers, not context,
  settings payloads or credentials.
- `tdd-panel-dialog.log`: after summary isolation, **4 failures** — popup-open
  resolved 3N settings instead of N (3,000 versus 1,000).
- `tdd-model.log`: **7 failed / 1 passed** — stale work visited 1,000 rows instead
  of one; empty/unknown patches still re-projected unrelated rows; applied
  decorations were omitted. All now pass, with an additional global-inheritor
  budget, nested-default equality and explicit off-pin regression.
- `tdd-preview.log`: **1 failed / 1 passed**, 20 prepares instead of one for a
  common cold key; the distinct/superseded/unmounted case already passed.
- Focused integration `focused.log`: **95 tests / 10 files passed**, including
  real live previews, Apply-as-local, undo, downloads, compact controls and the
  response/model/summary cases. `final-smoke.log`: model, preview dedup and docs
  **15/15 passed**. Research/reducer diagnostics also pass; no native/performance
  alarm, coverage threshold, existing assertion or test isolation was weakened.

New semantic/work owners: `upload_response_model.test.ts`,
`upload_response_summary.test.ts`, `upload_preview_dedup.test.tsx`.
The existing `upload_response_research.test.tsx` is strengthened with zero warm
boot/planner work, scoped summary budgets, N popup resolutions, and fresh saved
settings on remount. Original canonical active/checked/selected assertions remain.

## Before/after diagnostics

Raw final measurements: [after.json](after.json). Historical unchanged raw baseline:
[baseline.json](../2026-10-26-upload-response-research/baseline.json).
Node 22.22.3 / Vitest 5.0.3 / isolated main lane / Happy DOM. These are diagnostic
`act()` and pure reducer durations with spies, **not browser event→paint**.

| Work | Before | After |
|---|---:|---:|
| Saved-settings reloads per warm gesture | 1 | 0 |
| Boot key reads per warm gesture | 5 | 0 |
| Full destination plans per warm gesture | 1 | 0 |
| Selected-row summaries on active-only change | repeated | 0 |
| Selected-row summaries after checks change | repeated helpers | 1 shared pass |
| Popup effective-settings resolutions at 1,000 checked | 3,000 | 1,000 |
| Stale projections per one-row metadata/run/local change (1,000 loaded) | 1,000 | 1 |
| Real prepares for 20 identical cold subscribers while result stays cached | 20 | 1 |

Isolated zero-row reducer samples (one run per count; map work only):

| Existing/changed pins | Old patch / reset (ms) | New patch / reset (ms) |
|---|---:|---:|
| 100 | 0.443 / 4.514 | 0.487 / 0.060 |
| 1,000 | 231.719 / 1,233.745 | 5.950 / 1.002 |
| 2,000 | 913.074 / 1,577.094 | 1.751 / 1.673 |

JIT warmup, object shapes and GC affect individual timings; the 2,000-key sample
need not take twice the 1,000-key sample. Code establishes one clone plus a single
patch-entry loop, not a fitted latency model. No hard VM timing threshold is
introduced as a substitute for native alarms.

Three isolated final warm runs at 1,000 rows / full saved snapshots (837,866 JSON
characters) gave these diagnostic `act()` ranges and medians:

| Gesture | Range (ms) | Median (ms) |
|---|---:|---:|
| Activate next | 7.934–9.060 | 8.555 |
| Check one | 8.631–8.996 | 8.841 |
| Select visible | 27.677–42.389 | 29.964 |
| Active with all checked | 6.262–6.666 | 6.383 |
| Open Export settings | 29.115–40.038 | 34.486 |

The original baseline was one run, not a statistically controlled browser A/B
comparison, so no overall ≥80% latency claim is made. `after.json` also retains
an earlier mixed development run (before final context memo cleanup) with 86–120 ms
warm outliers; those values are not silently removed. Work budgets are the
repeatable evidence; cold complex-art geometry, actual browser frames and hardware
variability remain separate. Original AS-IS/source/package fixture limitations
still apply; real export suites, not seeded package records, validate export bytes.

## Verification

Types, lint (0 errors / 20 existing warnings), changed-production quality (14
production files), whitespace and docs navigation pass.

Both aggregate commands against `aba2474` passed on their first implementation
attempt, with no gate retries, timeout relaxations or harness changes:

- `verify:fast`: **ALL LANES PASSED** — types 8.8 s, lint 1.5 s, quality 0.6 s,
  coverage suite **3,066 tests / 292 files** in 81.8 s, build 6.1 s.
- `verify`: **ALL LANES PASSED** — types 3.4 s, lint 1.2 s, quality 0.6 s,
  uninstrumented native performance **30 tests / 5 files** in 3.2 s, coverage suite
  **3,066 tests / 292 files** in 85.6 s, build 6.7 s.
- Coverage statements/branches/functions/lines: **95.54 / 90.23 / 98.32 / 98.37%**,
  all unchanged or improved from 95.52 / 90.21 / 98.31 / 98.37%.
  Both `lib/upload/settingspatch.ts` and `lib/upload/download.ts` have **100%**
  statements, branches, functions and lines.

Full logs: `/home/user/upload-response-implementation/verify-fast.log` and
`verify-full.log`. Existing tests attempted unavailable Requesty catalog GETs
and logged network failures; no live provider generation was used. Keyless research
fixtures explicitly reject transport and assert zero fetches. No generated
node_modules/build/coverage/logs, manifest or lock changes are included. The
append-only quality ledger records this measured delivery without being read.

The requested measured redesign is complete. Browser-frame profiling of distinct
complex cold artwork remains a stated measurement limit, not a claimed result
or a partially installed worker/queue mechanism.
