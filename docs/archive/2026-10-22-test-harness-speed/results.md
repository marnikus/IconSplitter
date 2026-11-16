# Measured verification results — 2026-10-22

## Outcome and limitation

**Normal repeat full verification is 68.66% faster: 254.95 s → 79.89 s median.**
This exceeds the requested 60% on this machine, with every gate and original
test retained. **Cold/cache-bypassed verification is 117.34 s (53.97% faster),
so the design's additional cold-run aspiration is NOT met.** A first run after
`npm run setup` can likewise need cache population; do not advertise a 60%
first-install or all-hardware guarantee. That stricter objective remains open.

Plan and research preceded implementation: [plan](README.md),
[research](research.md), [selected design](design.md).
Machine-readable successful command records, all six lane timings, comparison
results, test inventory and coverage differences: [measurements.json](measurements.json).

## Fair baseline and conditions

Linux x64, kernel 6.1.158+, Node 22.22.3, two available CPUs (Xeon 2.60 GHz),
4,131,278,848 bytes RAM. All measurements sequential; no competing benchmark.
Production `src/` is unchanged from ecc5ffa (tree hash in measurements.json).
Both architectures use the same installed pinned toolchain and source inputs.
The old architecture already reuses Vitest transforms; new static caches are
an explicitly measured part of the redesign, not a cached test result.

The untouched initial `npm run verify -- --base ecc5ffa` took 242.80 s but
**failed** two native timing alarms because four native workers contended on
two CPUs. Its coverage stage passed all 2544 tests. Failed runs are not accepted
as performance proof. The conservative comparison against its elapsed time is
still 67.10% for the new warm median, but is not our passing acceptance baseline.

For a passing reference, replayed the ORIGINAL config, bootstrap, runner,
Upload fixture and runner tests, retaining the original 237-file inventory and
all 2544 runtime cases. **Only native maxWorkers changed 4 → 1**, preserving
strict 400/200 ms budgets. The ignored replay needed absolute-root/setup-import
rebasing; it did not change algorithms, coverage scope, thresholds or asserts.
The static lanes still see new harness regression files in both architectures.
The corrected full reference runs six gates, with original V8 coverage and
implicit one main worker. An earlier replay omitted `--full`; it was discarded
and is not included in comparison evidence. Current tests were restored in a
`finally` block after the accepted replay.

## Full-workflow measurements

Commands below include shell/process startup; component timings are rounded.

| Run | Wall seconds | Result |
|---|---:|---|
| Passing original architecture, native serial calibration | 254.9463 | All six gates PASS; 237 files / 2544 tests |
| Final redesign, `--cold` | 117.3432 | All six gates PASS; 244 files / 2561 tests |
| Final redesign, warm repeat 1 | 80.3061 | All six gates PASS; 244 files / 2561 tests |
| Final redesign, warm repeat 2 | 79.4787 | All six gates PASS; 244 files / 2561 tests |
| Warm median | **79.8924** | **68.6630% reduction; >=60% PASS** |
| Cold comparison | **117.3432** | **53.9734% reduction; >=60% FAIL** |

| Gate | Old architecture | Cold redesign | Warm repeat 1 | Warm repeat 2 |
|---|---:|---:|---:|---:|
| Types | 15.4 | 14.0 | 3.9 | 3.7 |
| Lint | 12.8 | 12.1 | 1.5 | 1.4 |
| Quality changed/ratchet | 0.6 | 0.6 | 0.6 | 0.6 |
| Native performance, uninstrumented/idle | 4.6 | 4.1 | 3.9 | 4.0 |
| ALL tests + coverage | 214.5 | 78.9 | 62.7 | 62.4 |
| Production build | 7.0 | 7.6 | 7.6 | 7.2 |

Warm coverage alone improves ~70.8%; cold coverage ~63.2%. Static checking and
build costs explain why that does not imply a 60% cold *whole-workflow* win.

## Correctness/equivalence

- Runtime: original 2544 → 2561 tests; original 237 → 244 files. No skips or
  assertion deletions. Discovery multiset `(file, project, test name)` retains
  every original entry, adding 17. `vitest list` lists 2373 → 2390 entries
  because not all parameterized runtime cases are expanded at discovery time.
- Identical 167 production coverage files. Every file's covered/total line,
  function and statement counts exactly match the original V8 run. Totals:
  lines 5633/5746 **98.03%**, functions 1784/1820 **98.02%**, statements
  7467/7861 **94.98%**. Existing line threshold remains 80%.
- Branch denominator is 5486 for both providers. V8 4902 covered (**89.35%**),
  Istanbul 4898 (**89.28%**). One fewer hit each in selectshortcuts, svgregen,
  upload/cleandom and upload/xmp; details preserved in JSON. This is disclosed
  provider accounting, not an assertion/threshold/scope reduction. V8 remains
  installed; a separate full two-worker threads/V8 probe also passed.
- Regression canaries verify exact project inventory, bounded workers, fresh
  module/global/storage realms, real leaked-root unmount/body cleanup, timer
  settling and lightweight Node bootstrap. Both isolation files also pass
  together with `--maxWorkers=1`, so this is not merely separate-worker isolation.
- Real Istanbul child fixture fails 100% thresholds with an uncovered function
  and branch, then passes when both execute. Real TypeScript/ESLint edit probes
  reject stale cached success (including restored mtime for content lint cache).
- Benchmark regressions witnessed RED then GREEN: real child exit 33, positive
  elapsed time, exact 60% boundary, repeated-run median, invalid/failed/mismatched
  machine rejection. Policy/bootstrap/runner regressions also RED → GREEN.
- Standalone `tsc --noEmit`, `npm run lint` (0 errors, 23 existing warnings),
  quality changed against ecc5ffa, fast verification and full verification pass.
  Intermediate doc-router size/typecheck failures were fixed; failed measurements
  are not in the acceptance comparison. No intentional live provider request.

## Further experiments / remaining cold work

After the cold miss, tested isolated threads + V8 (132.26 s suite, PASS), four
VM workers + Istanbul with transforms bypassed (78.28 s suite, PASS; no gain),
and concurrent cold type/lint checks (~21.95 s versus ~27 s sequential, not
sufficient for the cold target). None replaces the selected bounded two-worker
VM policy. Earlier blanket vmForks was slower and failed real-realm tests.

Cold remaining cost is chiefly instrument/transform work plus full static
checks. A follow-up needs profiling and a new TDD-backed design, not exclusion
of expensive tests, shared/no-isolate state or concurrent native timing gates.
We did not introduce a more complex scheduler for a marginal/inadequate gain.

## Reproduce

```bash
# Routine full workflow; both runs execute all tests/coverage/build.
node tools/harness-benchmark.mjs --output warm1.json --label warm1 -- npm run verify -- --base ecc5ffa
node tools/harness-benchmark.mjs --output warm2.json --label warm2 -- npm run verify -- --base ecc5ffa
node tools/harness-benchmark.mjs --output cold.json --label cold -- npm run verify -- --cold --base ecc5ffa
node tools/harness-benchmark.mjs --compare before.json warm1.json warm2.json
```

Record `before.json` on the same machine using the accepted original replay
recipe above (six gates, serial native calibration, original test inventory).
Do not compare a failed baseline or disguise a warm measurement as cold.
A baseline/candidate command mismatch is intentional when replaying architecture;
the operator must retain equivalent source, scope and gates. The comparator
validates positive time, exit, schema and Node/platform/CPU/model/memory/kernel/
host identity, not semantic equivalence of arbitrary commands.

Raw session logs/replay snapshots: `/home/user/harness-bench/` and ignored
`node_modules/.cache/harness-reference/`. Generated dependency/build/cache/log
churn is not part of the scoped change. Durable compact evidence is in the JSON
beside this document; the workflow does not depend on those scratch files.
