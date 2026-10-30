# Evidence — test-time investigation, 2026-10-30 (measurements only, no code change)

Host: Linux x64, **2 vCPU**, 3.0 GiB RAM visible (`totalmem` ~4.13 GB constrained),
Node **22.22.3**, npm 10.9.8, repo at `1306908` (`dist/` and caches warm after
`npm ci --prefer-offline`: 309 packages, 6.7 s).

Suite as measured: **3 363 tests / 320 files**, three projects (`main` 311,
`geometry` 4, `native` 5). Coverage `All files 95.02 / 88.91 / 98.35 / 97.93`.

---

## 1. Full verification baseline (the acceptance number)

| Run | Command | Wall | Result |
|---|---|---:|---|
| warm 1 | `npm run verify` | **140.33 s** | ALL LANES PASSED |
| warm 2 | `npm run verify` | **139.72 s** | ALL LANES PASSED |
| median | | **140.03 s** | target ≤ **84.02 s** |

Per-lane (warm, from the runner's own timestamps):

| Lane | run1 | run2 |
|---|---:|---:|
| Types (`tsc --incremental`) | 4.1 s | 4.1 s |
| Lint (`eslint --cache`) | 1.6 s | 1.5 s |
| Quality (`--changed`, clean tree) | 0.6 s | 0.6 s |
| Perf budgets (native, uninstrumented) | 4.0 s | 3.8 s |
| Tests + coverage | 122.0 s | 121.1 s |
| Build | 7.9 s | 8.3 s |

Static lanes cold, measured individually: `tsc` (no tsbuildinfo) **17.85 s**,
`eslint` (no cache) **15.94 s**, `quality.mjs` full **2.64 s**, `vite build` **7.78 s**.
→ cold verify ≈ 170 s.

## 2. Overlap (W2) — measured candidate

```
npm run verify -- --overlap   →  126.82 s, ALL LANES PASSED   (−9.4% vs 140.03 s)
```
Lane times inflate under contention (Types 7.0 s, Lint 2.2 s, Quality 0.7 s,
Build 11.4 s, Tests+coverage 122.7 s) while the total shrinks by 13.2 s.

## 3. Coverage lane internals

| Configuration | Wall | Reported breakdown |
|---|---:|---|
| plain, warm (`npx vitest run`) | **99.81 s** | tests 87%, import 6%, worker 3%, env 2%, setup 1%, transform 1% |
| istanbul, warm (`PERF_BUDGETS=coverage npx vitest run --coverage`) | **117.50 s** | tests 85%, import 9%, worker 3%, env 2%, setup 1%, transform 1% |
| istanbul, warm, 3 workers | **111.85 s** | tests 82%, import 10%, worker 4%, env 2%, transform 1%, setup 1% |
| istanbul, 4 workers (probe) | 110.6 s | — |
| **v8 provider** | **216.71 s** | rejected |

Istanbul instrumentation cost = **+17.7 s (+18%)**. V8 is +84% worse than istanbul for this
suite (report remapping dominates), so the current provider stays.

Per-project tracked time (istanbul, per-file start/end):

| Project | Files | Sum | Workers | LPT bound |
|---|---:|---:|---:|---:|
| main | 311 | 157.3 s | 2 | 78.6 s |
| geometry | 4 | 19.6 s | 2 | 11.2 s |
| native | 5 | 2.9 s | 1 | 2.9 s |
| total | 320 | 179.8 s | | 92.8 s ideal vs 117.5 s actual |

Distribution: 259/320 files < 0.5 s; 17 files are ~62 s of the 180 s.
DOM files 210 / 156.7 s; node files 110 / 23.2 s. 122 DOM files < 0.15 s.

Top files (istanbul): `getty_web_finalize` 22.3, `upload_response_research` 12.6,
`upload_centred_fit` 11.2, `upload_ui` 8.9, `upload_auto_repair` 8.4, `getty_web_batch` 7.7,
`svg_imgreg_ui` 4.7, `svg_queue_ui` 4.5, `upload_live_preview` 3.8, `batch_row_merge` 3.4,
`selection_response` 3.2.

## 4. The sleeps (W1)

`tools/bridge/gettyweb/contribute.mjs`: `LOGIN_POLL_MS 1500`, `UPLOAD_POLL_MS 1000`,
`CONFIRM_SETTLE_MS 700`, `BULK_SAVE_SETTLE_MS 1500`, `EDITOR_POLL_MS 500`.

Verbose run of `tests/getty_web_finalize.test.ts` (18 tests, file duration 22.75 s):
14 tests at ≈1 500 ms each, 2 at ≈2 900 ms, 3 at ≈1 ms. `tests/getty_web_batch.test.ts`
shows the same 1 000 ms pattern (2.00 / 1.41 / 1.02 / 1.01 / 1.01 / 1.00 s).
**≈ 30 s of unconditional sleeping in two files**, on an idle CPU.

Cross-check: excluding those two files from the coverage lane gives 126.7 s (vs 117.5 s
warm / 131.7 s cold-equivalent) — i.e. ~5 s of wall, because the run is CPU-bound and the
other worker keeps working. This is why W1's value must be *measured*, not assumed, and why
W1 alone cannot deliver the target.

## 5. Per-file overhead probe (why file merging is rejected)

Serialised with `--maxWorkers=1`, two matched 24-file sets:

| Set | Files | 1 file | 6 | 12 | 24 | Marginal/file | Tracked bodies |
|---|---:|---:|---:|---:|---:|---:|---:|
| node-env micro tests | 24 | 0.21 s | 1.06 s | 1.69 s | 2.08 s | ≈ 87 ms | 1.38 s |
| DOM micro tests | 24 | 1.41 s | 3.49 s | 5.32 s | 9.93 s | ≈ 414 ms | 9.16 s |

Untracked environment cost ≈ **33 ms per DOM file**, ≈ 40 ms per node file. Consolidating
files therefore buys ~1 s per 30 files merged while breaking the one-file-per-owner
contract → rejected.

## 6. Worker-count experiments

| Configuration | Wall | Outcome |
|---|---:|---|
| plain, 2 workers (policy default) | 107.3 s (cold transform) / 99.8 s warm | baseline |
| plain, 4 workers | 88.3 s (−18%) | **2 failures**: `algo_efficiency` 225.65 ms > 200 ms budget; `upload_ui` "1 invalid" readiness assertion |
| istanbul, 3 workers | 111.85 s (−5.6 s) | green |
| istanbul, 4 workers | 110.6 s | green in that run (flaky by nature) |

Conclusion: oversubscription only buys time while workers are asleep; it also breaks
timing alarms, so it is admitted only as 3 workers for `main` with the native lane quiet.

## 7. Reproduction commands

```sh
node tools/harness-benchmark.mjs --output /tmp/base-warm1.json --label warm1 -- npm run verify
node tools/harness-benchmark.mjs --output /tmp/base-warm2.json --label warm2 -- npm run verify
node tools/harness-benchmark.mjs --output /tmp/overlap.json  --label overlap -- npm run verify -- --overlap
PERF_BUDGETS=coverage npx vitest run --coverage --reporter=default --reporter=json --outputFile.json=/tmp/cov.json
PERF_BUDGETS=coverage npx vitest run --coverage --coverage.provider=v8 --coverage.reporter=text-summary
npx vitest run --reporter=json --outputFile.json=/tmp/plain.json
node tools/harness-benchmark.mjs --compare base-warm1.json base-warm2.json cand1.json cand2.json cand3.json --required-reduction 40
```

Raw recorder JSON from this investigation: `/tmp/baselines/{warm1,warm2,overlap}.json`
(scratch, outside Git). Per-file JSON: `/tmp/{plain,cov,covWarm}.json`.
