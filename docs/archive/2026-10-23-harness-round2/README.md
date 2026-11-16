# Second harness efficiency investigation — 2026-10-23

**Outcome:** [research/results](results.md), [pre-code decision/steps](design.md),
[measured evidence](measurements.json). Additional 50% target **not achieved**.
User selected harness-only / application unchanged. Only target-comparison
tooling changes ship; no execution-architecture change or speed win is claimed.

## Goal and boundaries (before new implementation)

User requests a further 50% improvement from the CURRENT harness, not from the
original slow V8 baseline. Interpret conservatively as >=50% lower end-to-end
`npm run verify` wall time on the same machine, retaining every test/assertion,
per-file module/DOM isolation, real app algorithms, full src/lib coverage scope
and thresholds, native performance alarms and all six verification gates.
No cached test results, changed-only tests, production React build, or mocks of
algorithms in place of execution. Retain failure diagnostics. Warm and cold
results are separate; do not claim either target from a failed baseline.

## Starting state

Working tree contains the prior redesign from remote commit 0fa074c. The restored
sandbox initially had older local Git metadata; fetched the SAME session branch
and synchronized HEAD/index with a mixed reset, preserving all files. No app
source changes remain against that baseline. Installed dependencies initially
lacked this platform's Rollup native package: discarded that failed measurement,
then ran the prescribed `npm run setup` (npm ci; 309 packages).

Reference hardware: Linux x64, Node22.22.3, two available CPUs, 4,131,278,848 bytes
RAM. Current initial cache-population full verification: 115.94s, all six gates
PASS. First warm full verification: 76.30s, all six PASS, 2561 tests/244 files.
A repeated baseline and formal median will set the exact <=50% acceptance bound;
approximately 38–40s, substantially harder than the first redesign.

## Research/experiment plan

1. Repeat complete warm baseline; snapshot runtime/discovery and per-file coverage.
2. Profile CPU versus waits, including large UI files, React/DOM diagnostic work,
   VM execution, coverage instrumentation and tool startup. Do not interpret
   summed worker percentages as wall-clock shares.
3. Consult pinned upstream docs/source for measured bottlenecks. Evaluate bounded
   experiments without editing shipped configuration. Likely avenues: deferred
   console diagnostics, native/global VM access, selective environment boot,
   optimized supported dependency transforms, and fixture lifetime overhead.
4. Record successful AND rejected probes. No isolation/coverage shortcuts. An
   experiment that fails a test is not speed acceptance evidence.
5. Write the selected concrete design/steps BEFORE shipping changes. TDD RED
   regressions for any changed behavior, implement only justified optimizations,
   GREEN focused tests, then complete fast/full gates.
6. Measure multiple sequential full runs, explicit cold audit, exact original
   discovery/test inventory and per-file coverage equivalence. Report whether
   the extra 50% was actually achieved; do not substitute test-only timing.
7. Update owning current docs, compact evidence, append ledger without reading,
   scoped commit/push on the fixed branch. Preserve unrelated work/generated
   artifacts; do not stage dependency/build/cache output.

Raw measurements/profiles remain outside Git in `/home/user/harness-round2/`.
