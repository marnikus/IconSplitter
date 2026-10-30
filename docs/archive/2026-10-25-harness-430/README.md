# Full-system test architecture: target +430% throughput

## Request and interpretation (plan before implementation)

Research, redesign and implement a substantially faster full-system test harness.
A +430% speed increase means **5.3× throughput**, or at most **1/5.3 = 18.868%**
of the baseline wall time (81.132% time reduction). This is not a 430% reduction
in duration. Measure the complete `npm run verify`, not a focused test subset.

## Initial measurement and research

- Active baseline commit `824e6c8`, Node22.22.3, Linux, 2 available CPUs,
  ~3.85GiB RAM. No application changes permitted by this plan: preserve actual
  algorithms, test bodies/assertions, file isolation, full src/lib coverage scope,
  thresholds, native performance alarms and all verification gates. No test-result
  caches, skips, no-isolate shortcuts or fake benchmarks.
- Real warm full baseline **118.14s**, exit0: **2839 tests / 264 files** plus
  **native30/5**. Evidence `/home/user/harness-430/baseline-warm.{json,log}`.
  Types5.6s / lint1.9s / quality0.8s / native4.2s / coverage97.7s / build7.9s.
  Required full-system duration: **<=22.29s** on this machine.
- Coverage test phase reports 85% of tracked worker time in tests, not setup.
  Those percentages are *summed worker phases*, not wall-time shares. Largest
  files: centred-fit27.37s, automatic-repair18.30s, UploadUI10.17s. This is a
  workload change since the earlier harness investigations, not just slower boot.
- Upstream research retrieved with `gh api`:
  `vitest-dev/vitest/docs/guide/improving-performance.md` (main): profile first;
  VM pools reuse environment imports but retain per-file contexts; disabling
  isolation is an explicit tradeoff and is rejected here. A tests-dominated
  run has limited benefit from configuration-only startup tuning.
  `docs/guide/profiling-test-performance.md`: worker execArgv CPU profiling,
  distinguish worker profiles from Vite/main-thread profiles.
  Copies are outside Git at `/home/user/harness-430/upstream-*.md`.
- Existing current architecture: isolated vmThreads main project, isolated native
  threads project; 2 workers on this host, full coverage using official Istanbul;
  static caches are compiler-owned/content-addressed only. Prior investigations
  already rejected global thread switching and dependency prebundling. Do not
  repeat them blindly; investigate selective CPU-bound placement and actual profiles.

## Steps

1. Baseline complete warm verification, inventory, coverage and machine identity;
   record a cache-bypassed full baseline too. Preserve failures rather than using
   only a best run. Collect focused worker profiles/timings for current hot files.
2. Experiment privately with a separate native-realm CPU-heavy project, leaving
   DOM-heavy UI suites on isolated VMs. Compare identical focused work with real
   coverage first, then all tests. Retain native perf execution without competing
   lanes. Reject configuration changes if tests, coverage accounting, memory or
   full-system time regress.
3. Based on measured results, design a bounded verification DAG: independent
   static checks/build may overlap where safe; native timing alarms must run
   without another verification lane. Avoid CPU oversubscription on 2-CPU hosts.
   Preserve individual logs, failure propagation, cancellation and command plans.
4. Implement only evidence-backed changes, with failing harness contract tests
   first. Keep original test assertions and scope. Add tests for inventory,
   resource budgeting, isolation, full coverage and runner failure handling as
   required by the chosen architecture. Do not edit application algorithms.
5. Validate all harness canaries and full suite; compare at least two successful
   warm candidate runs and a cold run against corresponding baseline conditions.
   Report absolute seconds, ratio and percent, including any unmet target.
   Use existing benchmark comparator at reduction81.1320754716981 (5.3×).
6. Update current harness/verification docs and router with the measured truth,
   not a promised multiplier. Append quality ledger without reading it. Run all
   required gates, commit scoped changes with attribution and push only the
   active branch. Keep profiles/reports/dependency/build artifacts out of Git.

## Acceptance

Success requires <= baseline/5.3 for complete equivalent verification, with all
existing tests/algorithms/assertions, real coverage and native budgets preserved.
If the 2-CPU workload cannot meet it, explicitly report the shortfall and measured
bottleneck; do not rename partial improvements as target achievement.

## Status

Plan and baseline recorded. Experiments and implementation pending.

## Research checkpoint and chosen implementation

- Cold baseline full verification: **142.69s**, all gates pass. Evidence
  `/home/user/harness-430/baseline-cold.{json,log}`; cold target <=26.92s.
- Same 108 hottest geometry tests, uninstrumented diagnostic: isolated VM
  **21.03s**, isolated native threads **17.46s**, both pass. Inspector worker
  profiles show most samples in real `geom/expand/offset.ts` distance/error
  searches and `pen.ts` point evaluation, plus garbage collection. These are
  application computations, not sleeps or harness module startup.
- An initial private config accidentally concatenated project arrays via
  mergeConfig, duplicating 108 tests. That run is INVALID for comparison and
  is retained (`hot-threads.json`). Corrected configurations replace arrays.
- Selective geometry-thread project, full unchanged coverage suite: first
  transformed run **105.00s**, warm repeat **76.37s**, all **2839/264** tests
  and exactly the baseline coverage percentages. Native-realm geometry is
  beneficial only selectively and after measuring full startup cost.
- All-native-thread + official V8 full-suite experiment: **148.71s**, all tests
  pass, but DOM environment creation becomes 20% of tracked time. Reject it;
  do not change provider or the general isolated-VM pool. Coverage differs
  by provider (branch89.79 vs89.72), as expected; not comparable hit accounting.
- `/usr/bin/time` is absent (exit127); switched to the existing real-command
  benchmark recorder, not synthesized timings. All reports/profiles stay outside Git.

Implement the measured selective geometry project (two genuinely hot files),
plus native-realm isolation canaries and exact-once inventory tests. Retain main
VMs and official Istanbul. Then implement bounded overlap of independent static
checks only if measured and safe, with the native wall-clock lane kept alone.
The 5.3x target is still unproven and unlikely on two CPUs: do not claim it.

### Reliability and comparison checkpoint (before implementation)

Two additional unchanged-harness warm runs failed: **88.95s** (row-badge rows
not reached) and **91.28s** (metadata toast already empty). They are retained,
NOT successful benchmark evidence; their much shorter coverage phases also
show host/cache variation. One 118s baseline cannot establish a robust speedup.

A new deterministic quiet-helper test is RED: a pending Promise sets readiness,
but `waitUntil` fires a future 4s expiration first. Correct timer ordering must
flush already-queued work and recheck the predicate before advancing time. Keep
all existing time budgets and failure behavior; add explicit canaries for a
needed timer, immediate work and an unreachable predicate. This is a proven
ordering bug, not a claim to have explained every historical flaky test.

Implement that fix, the selectively isolated geometry project with exclusive
inventory/canaries, and a comparator `--required-speedup 5.3` that reports both
throughput gain and time reduction. Do not ship speculative stage overlap:
geometry/coverage is the critical path and overlap must not contaminate native
alarms or trade away diagnosable lane ordering. Keep the existing lane runner.
The benchmark flag is evidence tooling, not an optimization or target success.

## Outcome

Implementation and complete measurements: [results](results.md). All ten new
harness tests execute. Warm candidate91.02/91.47s; cold122.60s; target comparisons
correctly fail. **5.3x acceptance remains unmet**. Read the timing-variation caveat
before interpreting the apparent improvement over the118.14s successful reference.
