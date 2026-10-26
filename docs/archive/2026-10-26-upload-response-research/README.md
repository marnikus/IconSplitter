# SVG to upload response — research and redesign

Date: 2026-10-26. Baseline: 01e0814 (imported shared selection redesign).

## Request

Selection V2 and Generate SVG now respond well; SVG to upload still feels slow.
Research the remaining upload-specific work and design a fix. This work records
measured evidence and a staged implementation plan, not an unmeasured claim of a
production speedup.

## Investigation plan (before measurements)

1. Trace the complete UploadPanel/useUpload path, not only UploadList. Separate
   warm gestures, settings popup work, metadata updates and cold preview work.
2. Reproduce real panel interactions using deterministic local filesystem fixtures
   and original production algorithms. Measure work counts and diagnostic times
   with realistic stored override maps, selection sizes and committed packages.
   No provider requests, credentials, skipped assertions or substituted geometry.
3. Explain why existing list-only benchmarks can pass while the tab is slow.
   Compare active-only, checkbox/header and popup-open invalidation with preview
   preparation and persistence. Distinguish observed facts from hypotheses.
4. Specify target component/state/cache boundaries, safe invalidation, complexity
   and regression budgets. Preserve all controls, exact previews/export algorithms,
   checked/active/anchor semantics, state sorting, metadata acceptance, cancellation,
   global undo and completion cues. No virtualization or deferred selection.
5. Publish a prioritized redesign plus reproducible evidence/current-doc routes.
   Verify diagnostics/docs and normal gates; append quality ledger without reading
   it, commit/push the scoped research artifacts on the current branch.

## Findings and measurements

Research completed; **no production changes are part of this delivery**.
Current implementation proposal / phase owners / regression targets:
[Upload response redesign](../../current/sor/upload-response.md).
Raw single-run diagnostics: [baseline.json](baseline.json).

### Method

- Node 22.22.3, Vitest 5.0.3, isolated main lane/Happy DOM. No installed Chromium
  was found. `act()` duration includes React/test harness work, not browser paint.
  Spies add overhead. No median/p95, hardware-general or ≥80% claim is made.
- `tests/upload_response_research.test.tsx` mounts **UploadPanel + HistoryProvider**,
  restores a local fake directory handle, discovers approved real SVG text and
  assembles rows/committed export records through original production code.
  `BinDir`/`BinFile`, persisted handle lookup and unavailable network are fixture
  boundaries. Settings parsing, selectors, reducers, previews and download planner
  are not replaced; a timed settings-load spy calls the original implementation.
- Fixtures contain 100/1,000 rows in separate subdirectories; all have seeded
  committed SVG/JPEG/EPS output records. The package helper uses synthetic hashes
  and record metadata, so this does not establish actual export byte correctness
  or metadata-edit latency. PNG placeholders are not sent anywhere.
- Warm source previews deliberately use actual **AS-IS** settings. Let source
  reads/effects settle before profiling. Each action checks canonical app state;
  select-visible must check every row; settings-open must display its backdrop.
  Every case asserts no fetch. Spies are cleared between actions to avoid retaining
  old settings maps. Zero prepare calls during these gestures is observed, not
  evidence that cold preparation is cheap.
- Pins: none (867 stored characters); 1,000 sparse 3-field pins (72,866);
  1,000 full `localSettingsSnapshot` pins (837,866). Sizes are JSON string lengths,
  not storage-engine byte accounting. The latter uses the real Apply-as-local
  snapshot algorithm; no enormous arbitrary payload is needed to see repeat work.
- `tests/upload_response_reducer_research.test.ts` separately invokes the original
  reducer on existing pin maps with **zero rows**, so it isolates map manipulation,
  excluding stale projection, React, persistence and SVG work. It checks full
  replacement/reset and input immutability. Timings are samples, not test gates.

### Warm complete-panel observations

Each measured active/check/header gesture caused **one `loadUploadSettings`, five
`readKey` calls, one `idsNeedingMetadata` scan and one `downloadPlanOf`**. The latter
allocates collision-safe destination items even when nothing about the records or
checked ids changed. There are additional metadata summary helpers; the single
scan count is for the instrumented helper only, not all metadata work combined.

| Rows / saved pins | Activate next (act ms) | Check one | Select visible | Active with all checked | Settings open | Settings-load range across six actions |
|---|---:|---:|---:|---:|---:|---:|
| 100 / none | 7.859 | 9.930 | 6.199 | 6.015 | 42.755 | 0.066–0.180 ms |
| 1,000 / none | 10.681 | 11.280 | 31.973 | 9.591 | 30.516 | 0.052–0.093 ms |
| 1,000 / sparse | 11.288 | 11.604 | 28.594 | 10.237 | 26.671 | 1.965–4.931 ms |
| 1,000 / full snapshot | 30.019 | 29.547 | 41.305 | 31.696 | 58.496 | 16.326–20.776 ms |

Settings-open caused one extra storage read and **3 × selected count** calls to
`rowSettings`: 300 at 100 checked, 3,000 at 1,000. Closed dialogs already guard
these summaries; do not diagnose a nonexistent closed-popup scan. All 24 warm
samples had zero `prepareExportSvg` calls.

### Isolated bulk override reducer observations

| Existing/changed pins | Patch (ms) | Reset (ms) | Rows |
|---|---:|---:|---:|
| 100 | 0.443 | 4.514 | 0 |
| 1,000 | 231.719 | 1,233.745 | 0 |
| 2,000 | 913.074 | 1,577.094 | 0 |

Do not fit a latency model to these three one-off samples (warmup/object-shape/GC
can affect reset especially). The **code** establishes the complexity:
`overrides-patch` loops over changes, calling `setOverride`; each call spreads the
whole current map. Updating N existing keys visits roughly N² map properties;
resetting them visits N + (N−1) + … + 1. A 1,000-icon local operation can already
spend hundreds of milliseconds to over a second here without rendering any rows.
This is the clearest bulk-operation bottleneck in the investigation.

## Root causes and boundaries

1. **Boot read on every render:** `useRef(loadBoot())` evaluates `loadBoot` before
   React receives its argument, even though React retains only the first value.
   It reparses/validates all stored defaults/overrides/applied settings plus four
   other boot keys on active, checkbox and dialog updates. Full snapshots make
   this particularly material. `useRef(newRefs())` also allocates every render,
   but `createStoredJournal()` creates closures; it does **not** itself read disk.
2. **Broad panel invalidation:** `useBulkSummary` depends on `[g]`, the complete
   flattened API. Its comment says ONE pass but it calls separate summary helpers
   and the full destination planner. Memoized row arrays do not stop parent work.
   `useUploadCtx` also depends on a fresh parameter object; this defeats that
   memo, but stable action slices already mitigate it. Do not claim every row's
   content rerenders merely because the context object changes.
3. **Quadratic local maps:** measured above. Fix one immutable batch map, not
   history compression or a faster component memo around the same algorithm.
4. **Broad stale projection (inspection, not timed):** both a single metadata
   edit and a local settings update walk all rows, construct effective settings
   and call `staleOf`. Actual work can short-circuit on source mismatch; do not
   extrapolate from null-record fixtures to committed production projects.
   `restaleRows` omits the `applied` decoration layer; audit as a separate
   correctness concern while designing targeted invalidation.
5. **Popup duplication:** three summaries rebuild effective settings for the
   same selected ids. Fix within the open dialog; retain the existing closed guard.
6. **Cold previews (hypothesis, not measured here):** per-row 120 ms timers run
   synchronous exact export preparation on the main thread, with no global
   concurrency/yield budget. Cache capacity is 400 and keys hash source/settings
   on relevant preview renders. A 1,000-distinct-icon cold settings change can
   schedule much more work than warm AS-IS selection. Existing inner row memo
   means active-only clicks need not re-enter preparation. Profile before changing
   algorithms or introducing workers/virtualization.

The existing list-only fixture omits boot loads, panel summaries and realistic
persisted maps/committed packages. Passing its row identity and gesture budgets
is necessary, but cannot establish full-tab responsiveness. This explains the
user's report without rejecting the successful shared selection optimization.

## Staged redesign and release gates

The linked current proposal specifies P0 boot isolation and one-copy batch maps,
P1 explicit summary dependencies and targeted stale projection, then P2 dialog
aggregation and conditionally a bounded exact-preview queue. Implement in that
order, with **failing work/semantic regressions before each production phase**.
Do not commit timing thresholds derived from this VM as browser acceptance.

Measure the actual complete browser tab before/after with distinct simple and
complex art, saved snapshots, committed/partial packages, metadata editing,
settings-open, bulk apply/reset and input while cold previews/progress run.
Record event→paint p50/p95 and geometry job counts independently. No deferred
checked state, hidden controls, fake preview success, altered export geometry,
weakened assertions or omitted real-format fixtures. All original export,
metadata, decoration, sorting, undo, navigation and cancellation gates remain.

## Reproduction

From the repository root after the locked `npm run setup`:

```bash
UPLOAD_RESPONSE_REPORT=/home/user/upload-response-research/measurements.json \
  npx vitest run tests/upload_response_research.test.tsx
UPLOAD_RESPONSE_REDUCER_REPORT=/home/user/upload-response-research/reducer.json \
  npx vitest run tests/upload_response_reducer_research.test.ts
```

Without report environment variables, tests still verify fixtures/semantics but
write no diagnostic files. Normal full-suite runs may have different timings;
`baseline.json` preserves the isolated research runs, not concurrent gate output.

## Verification

Focused diagnostics: **7/7 passed**. Types passed; lint **0 errors / 20 existing
warnings**. Docs navigation: **4/4 passed** after shortening the router link to
stay below its existing 5,000-byte budget (initial route addition exceeded it by
six bytes; no budget/assertion change). Changed-production quality reports no
production files changed; whitespace checks pass.

`npm run verify -- --base 01e08142`: **ALL LANES PASSED** — native performance
30 tests / 5 files; coverage suite **3,042 tests / 289 files**; types, lint, quality
and single-file build pass. Coverage statements/branches/functions/lines:
**95.52 / 90.21 / 98.31 / 98.37%** (unchanged). Full-suite coverage lane 88.7 s;
native lane 3.7 s. No new latency percentage is established.

Earlier two `verify:fast` attempts each passed 3,041 tests but failed the same
existing `upload_ui.test.tsx` assertion waiting for the transient “Metadata ready”
toast (line 1772). Focused unchanged Upload UI tests passed **84/84**; the complete
full gate subsequently passed all 3,042, including that assertion. This is evidence
of a timing-sensitive check under this workload, **not proof its cause is fixed**.
No test, timeout, coverage threshold, native alarm or harness isolation was altered
to get a pass. Final `verify:fast` recheck: **ALL LANES PASSED**, 3,042 tests /
289 files, unchanged coverage, coverage lane 89.2 s. Both aggregate commands have
now completed successfully; the earlier failures remain recorded above.

Logs are under `/home/user/upload-response-research/`: `profile.log`, `reducer.log`,
`docs.log`, `types.log`, `lint.log`, `quality.log`, `upload-ui-recheck.log`,
`verify-fast.log`, `verify-fast-recheck.log`, `verify-full.log`,
`verify-fast-final.log`. Raw baseline observations are retained in `baseline.json`.
Production code, package manifest/lock and existing performance assertions are
unchanged. Generated dependencies/build/coverage are not included in the commit.
