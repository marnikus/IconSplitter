# Results — test-time work, 2026-10-30 (implemented part)

Plan: [`PLAN.md`](PLAN.md). Evidence for the baseline: [`EVIDENCE.md`](EVIDENCE.md).
Host: Linux x64, **2 vCPU**, Node 22.22.3, repo `1306908` + this change.

## Verdict

**The ≥40% target is NOT met, and on this host it cannot be met by harness work.**
The shipped change removes 30 s of real sleeping from the suite and makes two bridge
suites deterministic, but the whole verification only moves from **140.03 s to
134.59 s (−3.9%)** because the suite is CPU-bound: measured **206 CPU-seconds at
1.81 of 2 cores**, i.e. a hard floor of ~103 s for the coverage lane alone.

Three candidate warm runs: 136.07 / 133.33 / 134.59 s. The repo comparator against
baseline `warm1` (140.33 s) reports `reductionPct 4.09`, `speedup 1.043`,
`passed: false` for `--required-reduction 40`.

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

`--overlap` therefore stays an explicit opt-in; the default stays serial.

## What would actually reach 40%

1. **More cores.** The same code and suite on 4 vCPUs: 206 CPU-s / 4 ≈ 52 s coverage
   lane, full verify ≈ 65–75 s (−46% to −54%). No test, gate or coverage change.
2. **Fewer real computations.** ~80 CPU-s has to come out of test bodies. The measured
   weight is concentrated: `upload_response_research` 15.3 s (three 1 000-row gesture
   profiles), geometry `upload_centred_fit`/`upload_auto_repair` 19.2 s,
   `upload_ui` 12.5 s, `svg_*` UI suites ~20 s. Halving the profiling suites' row counts
   or dropping sythetic scale is a product/evidence decision, not a harness one — it is
   deliberately **not** done here.
3. Dropping Istanbul (−17.7 s) would violate the coverage contract; V8 is worse.

No assertion, gate, coverage scope, isolation guarantee or native timing budget was
changed, and no test was removed or skipped (3 367 tests / 321 files before and after;
coverage 95.02 / 88.91 / 98.35 / 97.93 unchanged).
