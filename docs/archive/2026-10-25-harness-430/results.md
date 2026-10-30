# Harness redesign — measured results, 2026-10-25

**The requested +430% speed /5.3x target is NOT achieved.**
[Preimplementation plan and chronological research](README.md).
Current contract: [test harness](../../current/TEST_HARNESS.md).

## Delivered architecture

1. Exact-once, isolated project partition: ordinary suites stay in vmThreads;
   the two profiled geometry hotspots use native threads with their own isolation
   canaries; the unchanged native timing/realm inventory follows serially.
   Sequential pool groups respect the shared CPU/memory budget and avoid worker
   churn/oversubscription. Full verification still runs every test once with
   coverage and the five native alarm files separately without instrumentation.
2. Correct `waitUntil` ordering: flush queued Promise/React/immediate work and
   recheck readiness before fast-forwarding a future timer. A deterministic new
   regression failed on the original helper (future4s expiration fired before
   an already-queued Promise was observed). No larger budgets, assertion removal
   or disabled timers. Required timers still fire; unreachable states still fail.
3. Benchmark comparator accepts `--required-speedup 5.3`, reports multiplier,
   throughput gain AND time reduction, preserves default60% and requested50%
   reductions, rejects invalid/ambiguous targets and failed/different-host reports.
   This tooling is not itself a speed improvement.

No changes to application code, algorithms, supplied SVG/image assets, existing
feature assertions, Istanbul scope/thresholds or the lane runner. Only the old
policy assertions were expanded to require the new three-way exclusive partition.

## Full-system measurements

Node22.22.3, Linux x64, 2 CPUs, 4,131,278,848 bytes RAM, same recorded host/kernel
and CPU model. Every successful row includes types, lint, changed quality gate,
native uninstrumented alarms, every test with real coverage, and production build.

| Configuration / cache state | Seconds | Result |
|---|---:|---|
| Original824e6c8, warm reference |118.14| PASS2839/264 +native30/5 |
| Original824e6c8, cache-bypassed |142.69| PASS2839/264 +native30/5 |
| Original repeat2, warm |88.95| FAIL row-badge rows not reached; excluded from successful comparisons |
| Original repeat3, warm |91.28| FAIL empty metadata toast; excluded from successful comparisons |
| Candidate first transforms after config change |105.13| PASS2849/267 +native30/5 |
| Candidate warm2 |91.02| PASS2849/267 +native30/5 |
| Candidate warm3 |91.47| PASS2849/267 +native30/5 |
| Candidate cache-bypassed |122.60| PASS2849/267 +native30/5 |

Warm candidate median **91.2421s**, compared with the successful118.1429s
reference: **1.2948x**, +29.48% throughput, 22.77% time reduction. Required
**5.3x**, +430% throughput, 81.132% time reduction, <=22.2911s. Comparator
returns **exit1 /passed:false**, as it must. Cold122.6012s vs142.6921s is
1.1639x, not5.3x; its comparator also returns exit1.

**Uncertainty:** only one original warm full run passed; subsequent failed
original runs had substantially shorter coverage phases (~74–76s vs97s).
Therefore these comparisons do NOT prove a stable29.48% throughput improvement
across machine load. Do not relabel failed runs as fast successes, omit their
existence, compare cold-to-warm, or advertise the historical255s baseline against
this changed suite. Candidate executes ten additional harness assertions/tests.
The Promise-ordering defect is proven; these runs do not establish the cause
of every prior intermittent UI failure or guarantee a flake-free suite.

## Research and rejected configurations

- Two hot files, same108 tests, no coverage: VM21.03s vs native17.46s, both PASS.
- Worker CPU profiles: most samples in `offset.ts` nearest-distance/error search,
  `pen.ts` point evaluation and garbage collection, not test startup or sleeps.
- Private mixed full-coverage probe: first105.00s, warmed76.37s, PASS2839/264.
  It retains baseline95.32/89.72/98.20/98.29 aggregate coverage percentages.
- Global isolated threads + official V8:148.71s **for coverage alone**, PASS,
  but much slower DOM setup. Rejected; no provider switch shipped.
- The first native probe used mergeConfig, which concatenated projects and ran
  duplicate tests. INVALID comparison; retained evidence, corrected config.
- `/usr/bin/time` is unavailable; its exit127 probes contain no measurements.
- Speculative parallel verification stages were not shipped: CPU-bound tests
  dominate, native alarms must remain uncontended, and lane diagnostics/order
  should not be changed without evidence of full-system benefit.

## Verification and retained evidence

Genuine RED→GREEN: geometry project policy (1failed/3passed), Promise ordering
(1failed/3passed), throughput comparator (3failed/6passed). Focused contracts
32/9 PASS; geometry isolation run explicitly with one worker2/2 PASS.
Coverage remains **95.32% statements /89.72% branches /98.20% functions /
98.29% lines**, identical aggregate percentages to the reference. Build remains
1,808.95kB (560.34kB gzip). No generated dependency/build/profile/report artifacts
are committed.

Raw reports/logs/profiles: `/home/user/harness-430/`, including
`baseline-{warm,cold}.json`, failed `baseline-warm{2,3}.json`,
`candidate-warm{1,2,3}.json`, `candidate-cold.json`, and
`{warm,cold}-comparison.json`. Matching `.log` files preserve all lane output.
CLI comparator examples (the following correctly FAIL this unmet target):

```sh
node tools/harness-benchmark.mjs --compare \
  /home/user/harness-430/baseline-warm.json \
  /home/user/harness-430/candidate-warm2.json \
  /home/user/harness-430/candidate-warm3.json --required-speedup 5.3
node tools/harness-benchmark.mjs --compare \
  /home/user/harness-430/baseline-cold.json \
  /home/user/harness-430/candidate-cold.json --required-speedup 5.3
```

## Remaining boundary

This is a partial improvement, not completion of the speed acceptance criterion.
The measured architecture is nowhere near a22s full run on two CPUs. Further
research must address actual geometry computation and/or distributed compute,
then benchmark the complete verification path including setup/merge/gates.
Neither additional compute nor an unmeasured algorithm rewrite is presented as
an achieved solution. Existing correctness, isolation and performance alarms
remain enforceable rather than being traded for a multiplier.

### Final gates

Final `npm run verify:fast -- --base 824e6c8` and
`npm run verify -- --base 824e6c8` **ALL LANES PASSED**, 2849/267;
full adds native30/5. Types PASS, lint0errors/23existing warnings, changed-quality
PASS (no application source edits), docs navigation4/4 PASS, whitespace PASS.
The final full coverage lane was76.9s; final fast paid fresh transforms after a
configuration-comment change (89.4s coverage lane), not a faster cache condition.
Isolation negative control intentionally disabled isolation in a private config
with one worker: the second canary FAILED on leaked global state. The same
canaries with production isolation and one worker PASS2/2. That private broken
config is not shipped. Final logs: `final-{fast,full}.log`,
`serial-isolation.log`, `isolation-negative-control.log` in the evidence directory.
