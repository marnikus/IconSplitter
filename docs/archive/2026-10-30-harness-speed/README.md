# Test-system time: research, plan, implementation and measured result

Date 2026-10-30. Branch `arena/a6acc057-iconsplitter`.
Host: 2 vCPU (Intel Xeon 2.60 GHz), 4 GiB, Linux 6.1, Node 22.22.3, Vitest
5.0.3, official Istanbul 5.0.3, happy-dom 20.0.11, `vmThreads` per-file
isolation. Predecessor: [2026-10-25-harness-40](../2026-10-25-harness-40/README.md)
— same 40 % goal, concluded **not achieved** (warm 94.00 s → 91.23 s, 2.95 %)
after rejecting a custom non-contextified VM, pool/provider switches,
oversubscription and blanket pending-work cancellation. This round does not
repeat those; it re-measures today's tree and attacks waste that appeared
*after* that report.

## 1. Cost model — where the time goes

Measured on this tree (`npx vitest run --coverage`, wall from `time`, per-test
data from the JSON reporter):

| Quantity | Value |
|---|---:|
| Wall time, suite + coverage | 92.7 s (3364 tests), 96.6 s, 98.1 s — median **~96 s** |
| Process CPU for the 92.7 s run (`time`: user 158.3 + sys 8.6) | **166.9 s** |
| Aggregate test-body time (JSON report, 3364 tests) | **132.6 s** |
| `npm run verify:fast` end to end (warm) | **117.4 s** → **109.8 s** |

Four consequences drive every decision below.

1. **The suite is CPU-bound, not wait-bound.** 167 s of CPU on two cores puts
   the hard floor at ~83 s; a run lands at 93–98 s, i.e. **85–90 % packing
   efficiency**. Removing an idle wait usually does not shorten the run — the
   freed worker immediately takes the next queued file.
2. **`isolate: false` — the obvious 2× lever — is a measured regression here:**
   106.0 s with four failures (`tests/harness_geometry_isolation_a.test.ts`,
   `harness_policy` ×2, `algo_efficiency`) versus 92.7 s isolated. Reverted.
3. **Real application work dominates the profile.** Thread profile of the
   heaviest React file (`tests/upload_ui.test.tsx`, 84 tests, 8.6 s sampled on
   its worker thread): `react-dom` client dev build 1.94 s (23 %), GC 1.08 s
   (13 %), `react-jsx-dev-runtime` 0.84 s (10 %), happy-dom `Node` 0.72 s +
   `Element` 0.29 s + `NamedNodeMap` 0.17 s + `QuerySelector` 0.13 s +
   `EventTarget` 0.10 s = 1.41 s (16 %), Vitest module evaluator 0.16 s. The
   repository's own algorithms do not reach the top ten: the fixture is driving
   the real panel.
4. **React's production build is not available to us.** Only
   `react.development.js` exports `act`, and every DOM test here drives React
   through `act`; the 28 % of samples in React dev builds cannot be removed
   without deleting the assertions that make the tests meaningful.

## 2. Found wasteful, fixed

The Getty web suites are driven through a fake CDP connection but were paying
**real wall-clock sleeps** that belong to production pacing. Measured by
reverting only the two test files to `HEAD` (same production module, defaults):

| Suite | Before | After | Tests |
|---|---:|---:|---:|
| `tests/getty_web_finalize.test.ts` | **22.65 s** | **0.25 s** | 18 → 19 (guard added) |
| `tests/getty_web_batch.test.ts` | **7.98 s** | **0.63 s** | 24 (unchanged) |
| both, one command | 22.80 s | 1.63 s | 42 → 43 |

Production pacing: 700 ms after each Complete click, 1 500 ms after the
grid-wide Save metadata, 1 s between upload polls. Against Getty those waits
are correct; in a unit test they were pure loss.

**Fix — behaviour preserving:** the pacing is now injectable on
`finalizeBatch` / `finishBatch` / `createBatch` / `attachFiles` —
`settleMs` (default 700), `bulkSaveSettleMs` (default 1 500), `pollMs`
(default 1 000). Same steps, same order, production defaults unchanged. A new
test, `keeps Getty's real settle windows unless a caller injects faster ones`,
advances fake timers and proves the **default** pacing still applies, so a
future default of `0` cannot ship silently.

Also: 23 pure-logic files now open with `// @vitest-environment node`, the
harness's documented fast path (no happy-dom realm, no DOM setup) —
`getty_web_*`, `stockupload_*`, `upload_response_*`, `selectiondelta`,
`harness_quiet`, `svg_regen*`, `batch_nonblocking`, `batch_perf_regression`,
`algo_efficiency`, `prompttasks`, … 25 further candidates that *looked* pure
were tried and reverted: they import modules that build canvas/JPEG fixtures at
import time, which the node environment proves by failing. Net suite effect is
inside run-to-run noise; the tags are kept because they are the documented
correct realm and remove DOM setup from files that never use it.

## 3. Rejected experiments (each a complete run on this host)

| Experiment | Result | Verdict |
|---|---|---|
| `isolate: false` (root + all projects) | 106.0 s, 4 failures | rejected: slower **and** breaks isolation canaries |
| `--pool=threads` for the main project | 135.3 s | rejected: happy-dom realm per worker |
| `coverage.provider=v8` | 152.6 s | rejected: v8 collection under `vmThreads` |
| all projects in one execution group (`groupOrder`) | 109.9 s, 1 perf failure | rejected: three pools thrash 2 cores |
| `deps.optimizer.web` (pre-bundled React) | 107.7 s | rejected |
| `NODE_OPTIONS=--max-semi-space-size=64` | 98.1 s vs 98.6 s baseline | rejected: noise, not a gain |
| two `--shard` processes × 1 worker | ~88 s, per-shard counts mis-attributed | rejected: cannot attribute coverage/inventory honestly |
| shrink/skip the 1000-row profiling fixtures | would save ~12 s | **not taken**: that is weakening tests |

## 4. Measured result

Recorded with the repository's own `tools/harness-benchmark.mjs`
(`evidence/before*.json`, `after*.json`; successful runs only, same host, warm):

| `npm run verify:fast` | Runs (s) | Accepted | Median |
|---|---|---:|---:|
| Before (work stashed) | 146.70\*, 117.44, 117.39 | 2 | **117.44** |
| After | 109.80, 110.82†, 107.79‡, 107.23§, 112.62¶, 107.42 | 2 | **108.61** |

\* first run after stashing invalidated the transform cache — disclosed, not used.
† exit 1: `algo_efficiency` budget exceeded under load; re-run clean.
‡ exit 1: `tsc` failed on the not-yet-written `.d.mts` docs — invalid, kept for disclosure.
§ exit 1: the `waitUntil` flake of §6, now root-caused and fixed.
¶ exit 1: lint error in the new regression test (fixed); tests themselves 3365 pass.
All runs are `evidence/*.json`; nothing is discarded silently.

**Reduction: 7.5 % of full validation time** (117.44 s → 108.61 s, the median of
the two clean runs 109.80 / 107.42). Suite alone 92.7–98.6 s (median of five
complete runs ≈ 96 s); final `verify:fast` lanes: types 3.9 s, lint 1.3 s,
quality 0.5 s, tests 94.8 s, build 6.7 s = 107.4 s wall.

**Verdict: 40 % is NOT met.** §1 shows why that is not a tuning problem: perfect
packing of today's workload already yields 83 s (a 12 % best case from the
current 93 s), 80 %+ of the measured CPU is application-driven DOM/React/GC work
inside test bodies that must keep asserting, and the five static lanes do not
shrink with them. A 40 % cut needs ~56 s of wall, i.e. ~110 s of CPU removed
that does not exist at this test inventory.

## 5. What reaching 40 % would actually require (scope decisions)

| Change | Saves (CPU) | What it gives up |
|---|---:|---|
| Move the 1000-row profiling fixture `upload_response_research` (5 tests, 12.3 s) to the pre-push lane | ~12 s | fast lane no longer asserts 100/1000-row invariants |
| Cut the scale cases in `batch_row_merge`, `selection_response`, `upload_ui` to ~100 rows | ~8 s | real render-count budgets weaken |
| Move the `spawnSync` harness meta tests to the pre-push lane | ~6 s | the verifier itself stops being covered every commit |
| Merge ~120 two-or-three-test files into per-feature files | ~6 s | large mechanical churn, harder blame |

Together ≈ 32 s of CPU ≈ 30 % end to end — still short of 40 % while giving up
per-commit coverage of scale behaviour and of the verification system itself.
Those are product decisions; this round does not take them. The honest path
that does reach 56 s is hardware: the same workload on 4 vCPU, at the measured
1.9–2.0 cores of utilisation, lands near 55–60 s with no test or gate change.

## 6. A real flake found, root-caused and fixed (not timed out)

Complete runs also exposed a rare failure in the heaviest React file: mount's
`waitUntil(..., "upload rows")` threw after 25 ms with 2 000 ms of its real
budget still unused. Instrumenting `waitUntil` printed the cause:

```
DBG-WAIT-TIMEOUT upload rows warp 3997 spentReal 4 immediates 0 timers 3
```

`warp` is the app-time fast-forwarded by earlier settles in the same file. The
wait's guard was `now() < deadline` with `now() = Date.now() + warp`, so one
`step()` that advanced the clock onto a panel timer due at the window edge
consumed the **entire** app-time budget; the loop then exited immediately and
reported a timeout the app never caused. Earlier settles leave `warp` near the
budget, which is why it only fired occasionally and only on the files that keep
a panel mounted.

Fix (`tests/helpers/quiet.ts`): a fast-forward is not waiting — after each step
the deadline is given back by exactly the amount the clock jumped
(`deadline += warp - before`). The real-time ceiling
(`max(budgetMs, 2000)`), the window for *selecting* a timer, and the failure
message are unchanged. Regression test added first and seen failing (7 ms, same
message), then passing: `does not spend the app-time window on a single
fast-forward` in `tests/harness_quiet.test.ts`, which now installs quiet
tracking explicitly (DOM files get it from `tests/setup/dom.ts`) and asserts the
wait finishes in <60 ms real, i.e. by fast-forward, not by sleeping.

Measurement artefact to remember: `npx vitest run --coverage` **without**
`PERF_BUDGETS=coverage` fails `algo_efficiency`, because instrumentation widens
its budgets only when that variable is set. That is not a flake; the harness
lane runner always sets it.

## 7. Files touched

- `tools/bridge/gettyweb/contribute.mjs`, `contribute.d.mts` — injectable
  `settleMs`, `bulkSaveSettleMs`, `pollMs`; production defaults unchanged.
- `tests/getty_web_finalize.test.ts`, `tests/getty_web_batch.test.ts` — use the
  knobs; new guard test pins the real defaults.
- 23 `tests/*.test.ts(x)` — `// @vitest-environment node`.
- `tests/helpers/quiet.ts` — `waitUntil` no longer spends its app-time window
  on one fast-forward (§6); `tests/harness_quiet.test.ts` regression test.
- `docs/current/TEST_HARNESS.md` — evidence, pacing-knob contract, measured
  numbers (kept inside the 9 000-byte agent read budget).
