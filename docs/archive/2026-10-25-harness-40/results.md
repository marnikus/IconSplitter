# Additional40% full-system speed investigation — results (2026-10-25)

## Verdict: requirement NOT met

Reference:281edd6, not the previous task's118s or historic255s suite. Interpret
"40% faster" as at least40% less complete-verification wall time, not a1.4x
throughput target. A1.4x target would also fail. No successful narrow benchmark,
failed fast run or best prototype is substituted for the full-system result.

| Complete default serial verification | Reference | Retained implementation |
|---|---:|---:|
| Warm run1 |91.85s|92.14s|
| Warm run2 |96.16s|90.31s|
| Warm median |94.0039828435s|91.227626289s|
| Cache-bypassed run |129.92s|117.85s|

Nominal warm reduction **2.9534%**, throughput1.03043x; cold reduction **9.2913%**.
Required warm median <=56.40239s. Variation is substantial: this is not a
reliable advertised speed multiplier. All six timed reference/retained commands
exited0 with ALL LANES PASSED, including uninstrumented native alarms.

The real comparator was invoked with `--required-reduction 40` against EACH
reference warm report and against the cold report. **All three return1/FAIL**.
`summary-only.json` is descriptive arithmetic, NOT a fabricated schema1 run.

## Plan, research and implementation

The [dated plan](README.md) preceded implementation and contains incremental
scope decisions. Consult the final lifecycle disposition, not superseded proposals.

1. Record fresh complete warm/cold baselines with the existing recorder.
2. Research/profile the actual workload, not just VM microbenchmarks. Sources:
   - https://github.com/vitest-dev/vitest/blob/main/docs/config/pool.md
   - https://github.com/vitest-dev/vitest/blob/main/docs/guide/environment.md
   - https://github.com/nodejs/node/blob/main/doc/api/vm.md
   - https://github.com/nodejs/node/issues/31658
   VM-global proxy overhead is real, but a supported direct-global prototype
   made the actual suite no faster. DOM allocation/GC and real geometry dominate.
   HappyDOM21.0.4 was queried only; it was NOT installed or proved faster.
3. Capture original geometry outputs BEFORE changing production logic; first
   witness the operation-count canary fail (5658 pointAt calls vs limit100).
4. Remove redundant work in the real application offset kernel, then test exact
   output equivalence and near-threshold decisions. This is a disclosed
   production computation change, not a fake testing implementation.
5. Redesign verification into bounded pipelines with explicit execution groups,
   real child-process tests and fail-closed scheduling. Measure before selecting
   a default. Preserve serial default because overlap did not reliably help.
6. Reject unsafe/unproved lifecycle and worker experiments. Repeat complete
   warm/cold verification with unchanged lifecycle and canonical worker policy.
7. Record the failed acceptance honestly; preserve all native gates and coverage.

## What ships

### Equivalent application geometry computation

`src/lib/upload/geom/expand/offsetcheck.ts` evaluates the same Bernstein/squared-
distance arithmetic order without allocating point/weight vectors each iteration.
Independent quarter/half/three-quarter offset checks stop after failure. A
conservative cubic derivative/Lipschitz interval bound with64EPS rounding slack
may certify the tolerance decision only when the whole remaining search interval
has the same classification. Uncertain/near-threshold/nonfinite cases retain
forty original golden-search iterations. TOL0.01, depth8, subdivision, Tiller–
Hanson controls and serialized output stay unchanged.

Evidence:
-36 original deterministic/adversarial SHA256 outputs remain bit-identical.
-648 comparisons including exact threshold and +/-1e-13 neighborhoods, plus
  seven degenerate/nonfinite/negative-tolerance cases match the original oracle.
- The operation-count spy calls THROUGH the real algorithm, never supplies output.
-121 focused actual geometry tests passed; supplied SVG/EPS acceptance,37-pass
  centred fit and all native algorithms/budgets remain unchanged.
- New module100% statements/branches/functions/lines. Full src/lib retained plus
  one module:95.33/89.74/98.20/98.29 versus95.32/89.72/98.20/98.29 reference.
- Geometry file elapsed times: centred-fit16.68/19.39s reference→8.53s first
  retained run; auto-repair11.74/13.88s→6.70s. UI8.67/8.80s→9.36s did not improve.
  These hotspot observations do NOT establish a40% full-system reduction.

### Safe, opt-in execution architecture

`tools/verify-execution.mjs` owns child lifecycle and scheduling. `verify.mjs`
retains the complete canonical lane inventory and **serial default**.

`npm run verify -- --overlap` on >=2CPUs/>=3GiB constrained memory runs native
alarms ALONE, then one Types→Lint→Quality→Build queue alongside exactly one
complete coverage run. No additional Vitest concurrency/worker pool change.
`--serial` wins over overlap; inadequate resources fall back to canonical serial.
Every gate/spawn failure propagates; unknown groups throw rather than omit work.
SIGINT/SIGTERM cancel owned process trees, prevent subsequent child starts and
exit130/143. Windows taskkill cleanup is implemented, not timed on this Linux host.
Plan JSON exposes both execution groups and the selected execution mode.

Seven real-child scheduler tests cover resource limits, native quarantine, static
serialization, actual overlap, unchanged serial order, failures, spawn errors,
unknown groups, pre-cancellation and active child/grandchild cancellation.
A child barrier, not timing luck, proves concurrency. Deliberately serializing the
parallel queues makes that test FAIL; killing only the direct child makes the
grandchild test FAIL. Both mutations were reverted and retained tests pass.
Plan-mode metadata also has a genuine RED→GREEN assertion. Final focused22/4 PASS.

Existing tests/assertions, source coverage scope/thresholds, native/performance
budgets, timer lifecycle, provider, isolated pools, geometry/native inventories
and dependency versions are not weakened. UI handles do not change. No skipped tests or cached test success.
The timed retained runs contain2861tests/270files and native30/5; a final additional
plan-mode assertion brings the suite to2862/270. Last metadata/test-only reporting
changes do not alter the measured geometry or scheduler implementation.

## Rejected experiments and failure evidence

| Experiment | Actual complete-run evidence | Decision |
|---|---|---|
| Direct-global VM |2849 tests; exact173-file coverage totals; ~80.63s coverage vs~76–81s reference | reject: no real gain |
| Four workers |69.15s coverage vs~69.2s two-worker geometry candidate | reject: no gain |
| Cancel shared immediates/timeouts |291.75s, exit1;13 IndexedDB/native timeouts | reject: semantically wrong |
| Timeout-only cancellation | full suite passes, ownership and benefit unproved | reject; original helper/setup/tests restored exactly |
| Default overlap |82.05s vs82.37s serial, both with later-rejected timeout prototype | reject default change; opt-in only |

Earlier~82s candidates and88.52/90.49s final-warm prototypes still contained the
rejected timeout cleanup. They are NOT used as the retained implementation's
acceptance measurements. Lint-failing first/geometry candidates are also not valid
acceptance. No background busy-process leak was found after the retained repeats.
Both reference and retained logs contain94–95 pre-existing rejected TLS attempts
to router.requesty.ai; the sandbox rejects these before connection establishment.
No successful live-provider connection is evidenced, and no global fetch mock or
log suppression was added to improve the score. Their lifecycle/stubbing boundary
needs a separate targeted investigation, not blanket cancellation.

## Reproduction and evidence

Linux x64, Node22.22.3, two available CPUs, constrained memory4131278848B.

```sh
node tools/harness-benchmark.mjs --output /outside/repo/warm.json --label warm -- npm run verify -- --base 281edd6
node tools/harness-benchmark.mjs --output /outside/repo/cold.json --label cold -- npm run verify -- --base 281edd6 --cold
node tools/harness-benchmark.mjs --compare baseline-warm1.json shipped-warm1.json shipped-warm2.json --required-reduction 40
```

`evidence/` contains raw recorder JSON/logs for the reference and retained warm/
cold runs, the three failed target comparisons, actual rejected lifecycle/
scheduling controls, and focused RED/GREEN/negative controls. Recorder reports
measure real commands; raw timings remain available, not just rounded tables.
Logs are losslessly compressed as `.log.gz` (read with `gzip -dc`);
`log-integrity.json` records uncompressed SHA256/size.
Prototype source/config/profile scratch files remain outside Git. No generated
build, dependency/cache, coverage or CPU-profile artifacts are part of the change.

Release checkpoint: the first final fast run failed two assertions: the router
was5002B against its strict<5000B cap (fixed by shortening its route label), and
one metadata-terminal-toast readiness assertion timed out. No feature assertion
or budget was changed. Focused real upload UI83tests plus docs4tests then PASS.
The unexplained intermittent metadata failure is retained in evidence, NOT counted
as successful speed evidence. Final fast AND full reruns PASS,2862tests/270files, native30/5, full coverage
95.33/89.74/98.20/98.29, types/lint/changed-quality/build PASS. Standalone tsc,
lint (0errors/23existing warnings) and changed-quality also PASS. Final full
release recheck86.37687s, recorded separately rather than replacing the planned
pair. Including all THREE retained warm runs gives median90.31s (~3.92% lower);
both all-retained40%-required comparisons also FAIL. No deadline or assertion
was relaxed to address the intermittent failure.

## Remaining work to meet the request

The request is NOT complete. Remaining gap is approximately34.83s versus the
warm target. Another resource/pool rearrangement is not supported by these
measurements. A follow-on must profile and reduce actual UI-render/DOM allocation
and remaining computation costs, establish output/state-equivalence canaries,
then repeat matched complete warm/cold baselines. Do not weaken readiness,
coverage, isolation or native alarms to manufacture a passing percentage.
