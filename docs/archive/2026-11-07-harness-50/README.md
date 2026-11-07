# Test-system time: a 50 % target, measured (2026-11-07)

**Verdict: not reachable by any test change on this host. Nothing was changed.**

Predecessors: [2026-10-25-harness-40](../2026-10-25-harness-40/README.md) (2.95 %,
failed), [2026-10-30-harness-speed](../2026-10-30-harness-speed/README.md) (7.5 %,
failed, and already concluded "40 % needs fewer/scaled-down rendering tests or
4 vCPU"). This round asked for **50 %** and re-measured from scratch rather than
trusting those numbers at today's revision (`c75aecf`, 4274 tests, 407 files).

Host: 2 vCPU, 3 GiB, Linux, Node 22.22.3, Vitest 7.3.2, happy-dom, `vmThreads`
per-file isolation. Baseline and every experiment: `evidence/runs.json` (same shape as the
2026-10-30 evidence).

## 1. The ceiling is arithmetic

| Quantity | Measured |
|---|---:|
| Wall time (warm) | **108.8 s** |
| CPU time (`time` → user) | **181.6 s** |
| Utilisation | **1.67 of 2 cores** |
| Perfect-packing floor for today's workload (181.6 / 2) | **90.8 s** |
| Best case from scheduling alone | **16.5 %** |
| Wall needed for 50 % | 54.4 s |
| CPU that implies (2 cores) | **≤ 108.8 s** → remove **40 % of all CPU** |

Scheduling cannot get there: even a perfect pack of the work that exists lands at
90.8 s. So the question is only "can 40 % of the CPU be removed without giving up
assertions?" — and the answer, measured five ways, is no.

## 2. Every door that looked open, closed by measurement

| Hypothesis | Measurement | Verdict |
|---|---|---|
| The pool has idle time / bad packing | 2 s buckets: **55 of 55** at ≥ 95 % of both cores; a file is active in **107 of 108** seconds; only 2 seconds ever had one file | saturated — nothing to reclaim |
| Per-file worker/DOM setup dominates | 12 trivial DOM files: **1.54 s** total (~0.03 s/file). Setup *inside* files: **273 ms of 177 s** | negligible |
| Fixed sleeps inflate the run | every `settle(n)` for n ∈ {100…2000}: **0–1 ms real** (timers are warped). The 8 s bridge timers are guards cleared in `finally` | none to remove |
| Production React is much faster | `act` **does not exist** in the production build; 400+ files call it | dead end (would rewrite the suite) |
| `threads` pool beats `vmThreads` | main project alone: **215 s** vs 108.8 s | 2× worse — rejected |
| Production JSX transform (`jsxDev:false`) | 3 heaviest DOM files: 15.8 s → 14.9 s (**~6 %**), loses JSX stacks in failures. Full-suite confirmation not run: 6 % cannot reach 40 % | not worth the loss |
| There is an app hot spot to optimise | CPU profile of `upload_ui` (10 386 samples): happy-dom **26.8 %**, react-dom **24.8 %**, GC **8.4 %**, React **7.8 %**, harness/node **9.7 %**, **app code 9.5 %**, test code **0.7 %** | no hot spot; the cost *is* rendering real panels |
| Re-run the classic scope cut | deleting `upload_response_research`'s three 1000-row cases — **10.7 s of test work** — moved wall **108.8 → 105.6 s = 3 %** | the decisive result |

That last row explains both earlier failures. On 2 cores, deleting a 10 s file
buys ~3 s, because the deleted work was already overlapping other files. To reach
50 % you would have to delete roughly **two thirds** of all rendering tests — the
tests that are the product's only real coverage.

## 3. What would reach 50 %

Neither is a fix; both are decisions:

* **4 vCPU.** The same workload at the measured 1.9–2.0 cores of demand lands near
  **55–60 s** with no test, gate or coverage change. This is the only path that
  does not trade assertions for speed, and it matches the conclusion of the
  2026-10-30 report.
* **Split the suite into two documented lanes**: an everyday lane without the
  scale/perf fixtures (1000-row `upload_response_research`, `batch_row_merge`,
  `selection_response`, the `bridge_*` family, `getty_web_batch`) and an opt-in
  pre-push lane that keeps them. Honest and useful for iteration, but it is scope
  moved out of the fast number, not CPU saved.

## 4. What was deliberately not done

No test was deleted, skipped, weakened or moved; no gate was relaxed; no app
behaviour changed to make a test cheaper. The working tree at the end of this
investigation is identical to `c75aecf`.

The one improvement worth having regardless of the target — cache the expensive
per-test fixture world (mount + async scan ≈ 290 ms × 84 tests in `upload_ui`
alone) — is an unsafe refactor: the suite's strength is that each test rebuilds
from a clean store and filesystem, and the earlier rounds found state leakage
every time isolation was traded for speed.
