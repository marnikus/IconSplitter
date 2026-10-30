# Test system: plan for a further ≥40% reduction in full-verification time

Status: **plan only — no implementation in this change.**
Date: 2026-10-30. Owner-relevant pages for the implementation phase:
[`TEST_HARNESS.md`](../../current/TEST_HARNESS.md), [`CODE_VERIFICATION.md`](../../current/CODE_VERIFICATION.md),
[`sor/TESTS.md`](../../current/sor/TESTS.md).

Companion evidence: [`EVIDENCE.md`](EVIDENCE.md) (every number below is a measurement
taken on the host described there, not an estimate from a microbenchmark).

---

## 0. Executive summary

**Request.** Cut complete `npm run verify` wall time by ≥40% versus the current state,
without removing a test, an assertion, a gate, coverage scope, isolation or a real
computation.

**Measured baseline today (warm, same host).** `npm run verify` = **140.0 s** median of
two runs (140.33 / 139.72). Requirement therefore is **≤ 84.0 s**.

**What the measurements say.**

1. The lane is CPU-bound, not scheduling-bound. 2 CPUs; the coverage lane spends 85–87%
   of its wall time inside test bodies; only ~12% is import/worker/environment/setup and
   ~1% transform (caches already work).
2. ~**30 s of that test-body time is unconditional real-time `sleep()`** inside two
   bridge suites (`getty_web_finalize`, `getty_web_batch`). Sleeping consumes no CPU, so
   it is the direct cause of the measured 0.69–0.77 CPU utilisation (1.4–1.5 of 2 cores).
3. Static lanes are 18.3 s of the 140 s and are almost entirely hideable: measured
   `--overlap` runs at **126.8 s (−9.4%)** today, with every lane still green.
4. Istanbul is the correct coverage provider here: the supported V8 provider measures
   **216.7 s** (+84%) on this suite. Rejected, not re-opened.
5. Worker oversubscription works only because of the sleeps: 4 workers on 2 CPUs bought
   −18% on the uninstrumented run but broke the native timing alarm (225 ms > 200 ms
   budget) and one readiness assertion. It cannot ship as-is; 3 workers under coverage
   measures −5.6 s and is safe only with the native lane isolated.

**Honest projection.** Removing waste (sleeps, unhidden static work, contention, worker
starvation) lands at **≈ 95–105 s (−25% to −32%)**. A 40% cut (≤ 84 s) additionally
requires **~20–35 CPU-seconds of genuine test-body work to disappear** — see §5 (W5) and
the floor arithmetic in §3. The plan therefore ships the provable wins first, then runs a
profiling phase whose acceptance criterion is measured, not aspirational, and reports the
residual gap honestly if W5 cannot reach it (precedent: `docs/archive/2026-10-25-harness-40/results.md`).

---

## 1. Acceptance contract (fixed before any edit)

| Item | Contract |
|---|---|
| Measured command | `npm run verify` (`--full`), recorded by `tools/harness-benchmark.mjs` |
| Interpretation of "40% faster" | **≥40% less wall time** (`≥1.667×` throughput), not 1.4× |
| Baseline | 3 fresh warm runs on the implementing host, median; the old 91 s / 2 849-test figure is history |
| Candidate | 3 fresh warm runs, median; all must exit 0 |
| Comparison | `node tools/harness-benchmark.mjs --compare base1 base2 base3 cand1 cand2 cand3 --required-reduction 40` |
| Cold | `--cold` reported separately (one reference + one candidate pair); never mixed with warm |
| Failures | kept in evidence; a best-of-3 substitution is forbidden |
| Equivalence | test count/assertions unchanged (baseline today: **3 363 tests / 320 files**), `src/lib` coverage unchanged (today **95.02 / 88.91 / 98.35 / 97.93**), native budgets unchanged, isolation canaries unchanged |
| Honesty | if the median misses 84.0 s, the result is reported as a measured gap, not rounded up |

Noise budget: repeat measurements on this host varied by ±5–8% (e.g. identical coverage
lane: 111.9 / 117.5 / 122.0 / 121.1 s). One run proves nothing; medians of 3 do.

---

## 2. Where the 140 s actually goes (measured)

| Lane (warm) | Time | Share |
|---|---:|---:|
| Types (tsc, incremental warm) | 4.1 s | 2.9% |
| Lint (eslint, content cache warm) | 1.5 s | 1.1% |
| Quality gate (`--changed`, no diff) | 0.6 s | 0.4% |
| Perf budgets (native, uninstrumented) | 3.9 s | 2.8% |
| **Tests + coverage** | **121.5 s** | **87%** |
| Build (vite single-file) | 8.1 s | 5.8% |
| **Total** | **140.0 s** | |

Cold static lanes measured separately: tsc 17.9 s, eslint 15.9 s, full quality 2.6 s,
build 7.8 s → cold verify ≈ 170 s.

Inside the coverage lane (warm, 117.5 s standalone / 121.5 s inside the runner):

| Component | Evidence |
|---|---|
| Test bodies | 85% of wall; instrumented sum of per-file time **179.8 s** across 320 files |
| Of that, sleeping | **≈ 30 s** (two files, see W1) |
| Istanbul instrumentation | **+17.7 s** (99.8 s uninstrumented → 117.5 s instrumented, +18%) |
| Module import / worker / environment / setup | 9% + 3% + 2% + 1% |
| Transform | 1% (cache warm — already optimal) |

Project split (instrumented per-file sums): `main` 311 files **157.3 s** (2 workers),
`geometry` 4 files **19.6 s** (2 workers, own phase), `native` 5 files **2.9 s**
(1 worker, own phase). Phases are serial, so the geometry tail runs after main with only
one long file (11.2 s) left to pack.

Distribution: 259 of 320 files finish under 0.5 s; the top 17 files are ~62 s of the
180 s. `DOM` files: 210 files / 156.7 s; `node` files: 110 files / 23.2 s.

Per-file fixed cost measured directly (identical files serialised with `maxWorkers: 1`):
24 node-env micro-files = 2.08 s (87 ms/file, ~50 ms of it body) and 24 DOM micro-files =
9.93 s (414 ms/file) whose *tracked* bodies are 9.16 s — i.e. only ~33 ms/file of
untracked environment cost. **File count is not the lever it appears to be**; see the
rejected list in §7.

---

## 3. Floor arithmetic (why 40% is at the edge, and what it needs)

Let `C` = CPU-seconds of real test work (excluding sleeps).

Measured today: instrumented body sum 179.8 s, of which ~30 s is sleeping → `C ≈ 150 s`;
plus import/env ≈ 16 s instrumented, plus report generation, on 2 cores.

```
coverage_lane_floor ≈ (C + env) / 2 + tail      (utilisation cannot exceed 100%)
                    ≈ (150 + 16) / 2 + tail    ≈ 83 s + tail
verify_floor        ≈ coverage_lane_floor + unhidden static (≈ 3–5 s with overlap)
                    ≈ 86–92 s
```

The requirement is 84.0 s. So:

* Deleting every sleep, hiding every static lane and saturating both cores lands the
  project **at** the requirement, not comfortably under it — every remaining second of
  measurement noise or scheduler tail becomes the difference between pass and miss.
* Closing the last ~8–10 s means shrinking `C` itself (W5), or a 3+ core host.
  Nothing in the harness configuration can manufacture it.

This arithmetic is the reason the plan is staged with **decision gates** (§6) instead of
promising −40% up front.

---

## 4. What is already optimal (do not re-litigate)

Measured or documented, and unchanged by this plan: incremental tsc cache (−13.8 s),
content-hashed eslint cache (−14.4 s), `fsModuleCache` transform cache, isolated
`vmThreads` for the DOM majority, `threads` for geometry/native, `silent: "passed-only"`,
`include: ["src/lib/**"]` coverage scope, the `settle`/`waitUntil` quiet helper, and the
per-file isolation model. The 2026-10-25 investigation rejected a custom direct-global VM,
global thread/V8 switching, blanket pending-work cancellation and four-worker
oversubscription; those remain rejected unless a *new* measurement contradicts them
(one does: overlap, see W2).

---

## 5. Workstreams (ranked by measured value ÷ risk)

Each workstream lists: hypothesis → measured/expected saving at verify level → how it is
proved equivalent → risk → rollback.

### W1 — Delete the two files' unconditional real-time sleeps (saves ~30 s of occupancy; expect 6–12 s of wall)

*Evidence.* `tools/bridge/gettyweb/contribute.mjs` waits with fixed constants:
`LOGIN_POLL_MS 1500`, `UPLOAD_POLL_MS 1000`, `CONFIRM_SETTLE_MS 700`,
`BULK_SAVE_SETTLE_MS 1500`, `EDITOR_POLL_MS 500`. The tests drive the **real** helper with a
recording fake CDP connection, so every wait runs in full:
`tests/getty_web_finalize.test.ts` = 22.3 s for 18 tests, of which 14 sit at exactly
≈1.50 s; `tests/getty_web_batch.test.ts` = 7.7 s for 24 tests with the same pattern.
≈30 s of the suite is `setTimeout` on an idle CPU — it is the reason utilisation is 0.7.

*Change (test-side first, production only if needed).*
1. Wrap these two files in `vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })`
   and drive the helper with `vi.advanceTimersByTimeAsync(...)`; keep `Date` unfaked (or
   pin `vi.setSystemTime`) so `gettyCreatedDate` / "today" logic stays real.
2. Only if a wait cannot be advanced deterministically: add explicit
   `settleMs`/`uploadPollMs`/`confirmSettleMs` options with the **current constants as
   defaults**, and pass `0` from tests.

*Equivalence canaries (must be RED before, GREEN after).*
* Same ordered `cdp.steps` arrays, same `report` payloads, same failure messages.
* A canary asserting the production defaults are still 1500/1000/700/1500/500 so a
  refactor cannot silently make production polling more aggressive.
* A negative control: if the fake clock is advanced 1 ms short of the settle, the test
  must fail — proving the wait is genuinely exercised, not skipped.

*Risk.* Fake timers interacting with `AbortController`/promise ordering. Mitigation: the
two files are `@vitest-environment node` and use no DOM; advance in the same order the
helper awaits. *Rollback:* per-file, no production dependency.
*Effort:* 0.5 day. *Gate:* both files ≤ 2 s each, zero assertion changes.

### W2 — Make bounded overlap the default (measured −13.2 s, −9.4%)

*Evidence.* Today: serial 140.0 s; `npm run verify -- --overlap` = **126.8 s**, all lanes
PASS (Types 7.0 s, Lint 2.2 s, Quality 0.7 s, Build 11.4 s inflate under contention, but
total drops). This contradicts the 2026-10-25 "no gain" finding because the suite has
grown ~30% since; the static share is now large enough to hide.

*Change.* In `tools/verify.mjs` / `tools/verify-execution.mjs`: default to overlap when
`canOverlapVerification()` (≥2 CPUs, ≥3 GiB) and no `--serial`; keep the canonical lane
inventory and `executionGroup` metadata in `--plan`; keep native isolated **first**
(timing alarms must never share the machine with the suite); start the static queue with
the cheapest lane (quality → lint → types) so the tail is the one that can be absorbed.

*Equivalence canaries.* Extend `tests/verify_execution.test.ts` (real child fixtures):
overlap is the default when resources allow; `--serial` wins; low-resource hosts fall
back; failures still propagate; SIGINT/SIGTERM still kill trees. `tests/verify_runner.test.ts`
plan contract updated for `executionMode: "overlap"`.

*Risk.* Log interleaving and inflated per-lane times (already labelled). *Rollback:*
`--serial` flag and one constant. *Effort:* 0.5 day.

### W3 — Worker budget: 3 for `main`, native pinned and run quiet (measured −5.6 s; expect 3–6 s in combination)

*Evidence.* Coverage lane: 2 workers 117.5 s, **3 workers 111.9 s**, 4 workers 110.6 s but
with a broken native alarm (225 ms vs 200 ms) and one readiness flake.

*Change.* `mainWorkerBudget()` → `min(3, cpus, memorySlots)` with the existing
768 MiB/worker guard, and a policy that the *native* project keeps `maxWorkers: 1` and
runs in a quiet phase (already group 2; move it first in the overlap plan, which W2
already does). Do **not** raise to 4.

*Equivalence canaries.* `tests/harness_policy.test.ts` budget matrix (1 CPU → 1,
2 CPU → 3, low RAM → 1, never > 3); native alarm green in 5 consecutive full runs;
isolation canaries unchanged (every file still gets a fresh VM/DOM).

*Risk.* Oversubscription noise on 2-core hosts can surface readiness timeouts
(observed once). Mitigation: the flakiness soak in §6 gate G3 (5 consecutive runs) plus
no new real-time budgets. *Rollback:* one constant. *Effort:* 0.5 day.

### W4 — Move the four child-process "meta" suites out of the saturated pool (expect 4–8 s)

*Evidence.* `tests/quality_base.test.ts` (2.0 s) spawns the real RULE 16 gate (node +
TypeScript), `tests/harness_static_cache.test.ts` (1.8 s) spawns `tsc`, and
`tests/verify_execution.test.ts` (1.9 s) + `tests/harness_benchmark.test.ts` (2.0 s) spawn
Node children. They run inside `main` while two VM workers saturate both cores, so a
spawned compiler competes with the pool for a CPU — the cheap-looking 2 s costs more than
2 s of makespan.

*Change.* Add a fourth project `meta` (`pool: "threads"`, `maxWorkers: 1`,
`groupOrder` before `main`) holding exactly those four files (plus
`tests/verify_runner.test.ts`); keep the files, assertions and real child processes
untouched. Document the exact-once inventory rule (every file in exactly one project).

*Equivalence canaries.* `tests/harness_policy.test.ts` already guards "every test file in
exactly one project"; extend it for `meta`. `tests/harness_isolation_*` unchanged.
*Risk.* Phase boundaries change scheduling; measure before/after. *Rollback:* move the
four names back. *Effort:* 0.5 day.

### W5 — Shrink genuine test-body CPU with equivalence proofs (target 10–25 s; the only route past ~32%)

Only *setup* may change; the code under test and every assertion stay. Candidates, in
order of measured weight:

| File | Coverage-lane time | Candidate |
|---|---:|---|
| `upload_response_research.test.tsx` | 12.6 s | 3 of its 5 tests build a 1 000-row virtual FS + React tree + localStorage each; hoist the immutable `BinDir`/`PkgFile` graph into a module-scope factory with structural sharing, keep every gesture measurement and budget assertion intact |
| `upload_ui.test.tsx` | 8.9 s / 84 tests | profile per-test setup (real SVG fixtures re-read/re-parsed per test) → module-scope parse cache |
| `upload_auto_repair.test.ts` | 8.4 s / 88 tests | same fixture-read pattern |
| `batch_row_merge.test.tsx`, `selection_response.test.tsx` | 3.4 + 3.2 s | shared immutable row models between cases |
| `assets/*` reads across suites | — | one read/parse per file per module (`sourceOf` currently re-reads in every test) |

**Hard rule:** a W5 change is accepted only if (a) the test still fails when the feature
is deleted (RULE 8 mutation check), (b) row counts, tolerances, timeouts and timing
budgets are unchanged, and (c) coverage numbers are identical. Reducing fixture *scale*
(e.g. 1 000 rows → 100) is **not** allowed: that deletes measured evidence.

*Effort:* 1.5–2 days, profiling-first (`--reporter=verbose` per file + per-test durations;
only the top of the list is touched). *Rollback:* per file.

### W6 — Keep the long tail cheap (expect 1–3 s)

Node-env micro-files already cost 87 ms each; do **not** merge files for overhead reasons
(measured 33 ms/file of environment cost — the churn buys nothing and breaks the
one-file-per-owner doc contract). Only do the free wins: `// @vitest-environment node` on
any remaining file that never touches `document`/`window` (currently 110 node / 210 DOM),
and module-scope asset parsing (shared with W5).

---

## 6. Phased execution with decision gates

| Phase | Work | Gate (measured, same host, 3 runs) | Expected verify time |
|---|---|---|---:|
| P0 | Baseline: 3 warm + 2 cold runs, snapshot coverage/native/test counts | Baseline recorded; noise < 8% | 140.0 s |
| P1 | W1 + W2 (test-side sleeps, overlap default) | G1: lanes green, 3 363 tests, coverage identical, native alarms green | ≈ 117–121 s (−14%) |
| P2 | W3 + W4 (worker budget, meta project) | G2: no new flake in 3 runs; policy canaries green | ≈ 111–116 s (−18%) |
| P3 | W5 profiling + setup-sharing on the top 5 files | G3: **soak** — 5 consecutive full runs, zero failures; RULE 8 mutation check per touched test; coverage identical | ≈ 95–105 s (−25…−32%) |
| P4 | Decision point | If median > 84.0 s: report the gap, or escalate with the numbers below | — |
| P5 | Only if P4 says "escalate" | Options: (a) more CPUs (host change, not code); (b) W5b: the two 1 000-row research suites run in an uninstrumented `research` project that the default gate still executes (removes their istanbul share only, ~3–4 s); (c) honest stop | — |

**Gate rules.** A phase ships only if its own gate passes *and* the cumulative median does
not regress. Any new intermittent failure blocks the phase (the 2026-10-25 attempt's
lesson: an unproved lifecycle change cost 13 timeouts and 291 s). No phase may raise a
timeout, lower a budget, skip a test or accept a coverage delta.

**Escalation arithmetic for P4** (so the decision is not a guess): to reach 84.0 s the
coverage lane must run at ≤ 80 s, i.e. ≤ ~160 CPU-seconds instrumented. After P1–P3 the
instrumented CPU is ~165–175 s. Closing that gap requires either ~10 s of genuine test
CPU (W5b) or ~15% more core throughput.

---

## 7. Rejected by measurement (do not retry without new evidence)

| Idea | Measurement | Verdict |
|---|---|---|
| V8 coverage provider | 216.7 s vs 117.5 s istanbul (+84%) | reject |
| 4 workers everywhere | uninstrumented 88.3 s (−18%) but native alarm 225 ms > 200 ms and one readiness assertion failed | reject |
| Merge micro DOM files to amortise setup | measured 33 ms/file untracked environment cost | reject (churn > gain) |
| Excluding the two sleepy bridge files instead of fixing them | 126.7 s (−5 s only), and it deletes 42 real tests from the gate | reject |
| Custom non-contextified VM / global threads / no-isolate | prior task: identical coverage totals, 80.6 s vs 76–81 s reference | reject |
| Blanket pending-work cancellation | 13 IndexedDB timeouts, 291.75 s failed run | reject |
| Caching test results / partial suite runs | removes gate evidence | reject |

---

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Fake timers change promise ordering in the bridge helpers | node-env files only; advance in awaited order; canary that a 1 ms-short advance fails |
| Oversubscription exposes load-sensitive readiness helpers | G3 soak (5 runs); fix the helper's real-time floor only via the documented `settle`/`waitUntil` contract, never by loosening assertions |
| Overlap inflates individual lane times | per-lane times stay in the log and the docs; only the total is the acceptance number |
| Host variance (±5–8%) | medians of 3, same host, `harness-benchmark --compare`, failures retained |
| Windows | no timing claim; `taskkill` tree cleanup unchanged; overlap admitted only on ≥2 CPU/≥3 GiB |
| Doc caps (current pages ≤ 9 KB; `TEST_HARNESS.md` is already 8 952 B) | implementation must compress the harness page while updating it (move measurements to `docs/archive/`), and update `CODE_VERIFICATION.md`, `sor/TESTS.md`, `sor/OWNERS.md` in the same change |
| Ledger | append one measured dated entry to `docs/current/QUALITY_RECHECK.md` without reading it |

---

## 9. Deliverables of the implementation change (for the later coding phase)

1. Test-side: `tests/getty_web_finalize.test.ts`, `tests/getty_web_batch.test.ts` under a
   deterministic clock (+ canaries).
2. Harness: `tools/test-harness-policy.ts` (worker budget, `meta` project inventory),
   `tools/verify.mjs` + `tools/verify-execution.mjs` (overlap default, lane order).
3. Tests for the harness itself: `tests/harness_policy.test.ts`,
   `tests/verify_execution.test.ts`, `tests/verify_runner.test.ts` (RED first).
4. W5 setup-sharing patches, each with a RULE 8 mutation check recorded in the evidence.
5. Docs: `TEST_HARNESS.md` §1 evidence table + §2/§3 contracts, `CODE_VERIFICATION.md`
   commands/default, `sor/TESTS.md` ownership rows, quality ledger entry.
6. Evidence: baseline and candidate recorder JSON + logs (kept outside Git or compressed
   under `docs/archive/2026-10-30-test-time-40/evidence/`), the three `--compare` results
   including any that fail, and a `RESULTS.md` stating the measured outcome.
