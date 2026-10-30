# Results — test-time work, 2026-10-30 (implemented)

Plan: [`PLAN.md`](PLAN.md). Evidence for the baseline: [`EVIDENCE.md`](EVIDENCE.md).
Host: Linux x64, **2 vCPU**, Node 22.22.3, repo `1306908` + this change.

## Verdict

**The ≥40% target is NOT met.** Two test-side changes landed — the bridge suites run
on a virtual clock, and the profiling fixtures run on a render budget — and together
they move full verification from **140.03 s to 130.30 s (−6.9 %)**. The suite is still
CPU-bound: **~168 CPU-seconds at 1.8 of 2 cores**, i.e. a ~84 s floor for the coverage
lane and a ~102 s floor for full verification on this host.

| Warm `npm run verify` | s |
|---|---:|
| baseline (median of 140.33 / 139.72) | 140.03 |
| + virtual clock (136.07 / 133.33 / 134.59) | 134.59 |
| + render budget (127.46 / 130.20 / 130.30 / 132.71 / 134.42) | **130.30** |

The repo comparator against `warm1` reports `reductionPct 5.43` (median of the three
recorded candidate runs) and `passed: false` for `--required-reduction 40`; run-to-run
noise is ±5 s, so quote the range 127.5–134.4 s, not a single number.

## What shipped

Virtual clock for the two bridge suites (`tests/helpers/virtualclock.ts`,
`tests/virtual_clock.test.ts`):

| File | Before | After |
|---|---:|---:|
| `tests/getty_web_finalize.test.ts` (18 tests) | 22.75 s | **0.58 s** |
| `tests/getty_web_batch.test.ts` (24 tests) | 7.60 s | **0.19 s** |
| suite, uninstrumented, warm | 99.81 s | 97.82 s |
| coverage lane, warm | 117.50 s | 113.0 s |
| **full `npm run verify`, warm median** | **140.03 s** | **134.59 s** |

The helper fakes only `setTimeout`/`clearTimeout`/`Date`, so poll deadlines advance in
lockstep with the timers while promises, the DOM and `performance.now()` stay real; a
canary proves a one-step-short advance cannot fake a wait. Production code is untouched:
`BULK_SAVE_SETTLE_MS 1500`, `UPLOAD_POLL_MS 1000`, `CONFIRM_SETTLE_MS 700`,
`EDITOR_POLL_MS 500`, `LOGIN_POLL_MS 1500` are unchanged.

Why so little end-to-end gain: those 30 s never idled the machine. With two workers over
321 files, the second worker filled the CPU while the first slept (utilisation 1.66/2).
Removing the sleeps raised utilisation to 1.81/2 — the wall clock fell by exactly the
slack that was left, not by the 30 s that was removed.

## CPU accounting (the reason the target fails)

```
time PERF_BUDGETS=coverage npx vitest run --coverage
real 1m53.8s   user 3m15.2s   sys 0m11.1s     -> 206 CPU-s / 113.8 s wall = 1.81 of 2 cores
```

* Instrumented test bodies: 165.7 s of per-file time; import/worker/environment: ~25 s.
* Istanbul instrumentation: +17.7 s (+18%) against the uninstrumented suite.
* Coverage-lane floor on 2 cores: 206 / 2 ≈ **103 s**; measured 113 s (91% packing).
* Full verify floor: 103 s + native 4 s + ~18 s of static gates ≈ **125 s**; measured 134.6 s.
* 40% of 140 s = 84 s ⇒ the suite would need ≤ **124 CPU-seconds**, i.e. **~80 CPU-seconds
  of genuine test computation removed** (or twice the cores).

## Render budget (second change)

The research/profiling suites guard production memoisation by *counting work per
gesture* — download plans, bulk summaries, settings resolutions. Those assertions do
not depend on the row count, but the row count drove most of the render CPU.

`tests/helpers/scale.ts` owns one knob; `ICONSPLITTER_TEST_SCALE=full` restores every
historical number, and a typo cannot shrink evidence silently
(`tests/harness_scale.test.ts` pins that).

| Suite | Fixture | Before | After |
|---|---|---|---|
| `upload_response_research` | 3 × 1 000-row gesture profiles + 1 × 100 | 15.3 s | 8.7 s |
| `batch_row_merge` | "high perf: 1 000 rows" | 4.1 s | 2.4 s |
| `selection_response` | 4 tabs × 100 rows | 3.6 s | 2.6 s |
| `svg_ui_config` | slider sampled every 4 px (189 renders) | 3.1 s | 2.1 s |

Scale evidence is kept: `upload_response_research` always runs one full 1 000-row case;
the pinned variants run at `PROFILE_ROWS = 250`; the slider still covers 48…800 px,
every 16 px instead of every 4 px.

**RULE 8 canary (witnessed, then reverted):** removing the `useMemo` around
`uploadBulkSummary` in `src/upload/UploadPanel.tsx` made **all four** profiling cases
fail — including both 250-row ones — with `activate-first: recount only changed
rows/checks: expected 1 to be +0`. The reduced fixtures still bite.

Coverage is unchanged (95.02 / 88.91 / 98.35 / 97.93), tests went 3 367 → 3 369
(the new scale canary), files 321 → 322, and no production file changed.

## Experiments measured and rejected in this change

| Experiment | Measurement | Decision |
|---|---|---|
| 3 workers on `main` (plan W3) | coverage lane 115.8 s vs 112.5 s at 2 workers | reject: oversubscription only paid while workers slept |
| 4 workers | 114.3 s, and earlier a native budget breach (225 ms > 200 ms) | reject |
| `meta` project for the four child-process suites (W4) | 112.5 s vs 113.4 s with them in `main` | reject: within noise, extra phase |
| Project groups fully concurrent (main+geometry+meta) | 120.75 s warm | reject: pools thrash on 2 cores |
| `--pool=threads` for the DOM majority | 194.2 s (environment 25%, import 18%) | reject: confirms `vmThreads` |
| Overlap as the default (W2) | 134.93 / 137.49 s vs 133.33–136.07 s serial | reject: neutral at saturation (it helped 140.03 → 126.82 only while the suite had idle CPU) |
| V8 coverage provider | 216.7 s | reject (already documented) |
| Geometry files back in `vmThreads` (phase tail −11 s) | 24.3 s vs 18.2 s for the four files (+34 %) | reject: the tail costs less than the slowdown |
| Meta tests moved to a push-only lane | ~8 s of bodies + spawns | not taken: it removes tool coverage from the measured gate |

`--overlap` therefore stays an explicit opt-in; the default stays serial.

## What would actually reach 40%

1. **More cores.** The same code and suite on 4 vCPUs: 206 CPU-s / 4 ≈ 52 s coverage
   lane, full verify ≈ 65–75 s (−46% to −54%). No test, gate or coverage change.
2. **Fewer real computations.** After the render budget the weight is
   `upload_ui` 12.6 s (84 feature tests), geometry `upload_centred_fit` 10.6 s +
   `upload_auto_repair` 8.3 s (real 37-pass fits, already optimized once),
   `upload_response_research` 8.7 s, `svg_imgreg_ui`/`svg_queue_ui` 10.6 s combined.
   These are feature evidence, not fixtures: cutting them means deleting assertions.
3. Dropping Istanbul (−17.7 s) would violate the coverage contract; V8 is worse.

No assertion, gate, coverage scope, isolation guarantee or native timing budget was
changed, and no test was removed or skipped (3 367 tests / 321 files before and after;
coverage 95.02 / 88.91 / 98.35 / 97.93 unchanged).

## Stability note (honest)

Six `npm run verify` runs were recorded after the render budget: 127.46, 130.20,
130.30 (manual), 132.71 and 134.42 s pass, and one run at 134.09 s in which **one lane failed**
and the log was not retained. `tests/upload_apply_local_ui.test.tsx` was the only
suspect (it had already failed once on the untouched baseline with
`never reached: upload rows`) and passed 5/5 in isolation afterwards; no assertion,
timeout or budget was changed to make it pass. The flake predates this change and is
recorded, not explained away.
