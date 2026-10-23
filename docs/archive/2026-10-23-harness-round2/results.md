# Round-two research results — 2026-10-23

## Outcome: additional 50% NOT achieved

The user requested another 50% improvement from the already-redesigned harness.
We used the stricter interpretation: halve complete verification wall time, not
merely improve throughput 1.5x or reuse the old pre-redesign baseline.

Current passing warm baselines: **76.2973s and 73.4715s**, median **74.8844s**.
The target is therefore **<=37.4422s**, including ALL six gates. None of the
measured configurations meets it. The user explicitly chose **harness-only /
application unchanged** after reviewing the profiling findings. We did not
change application rendering, production compilation, test assertions, coverage
scope, isolation or native timing limits to manufacture a win.

**No execution-architecture optimization is shipped this round.** The small
shipped code change makes the benchmark comparator accept a requested target
(`--required-reduction 50`, still 60 by default). It is measurement tooling,
NOT a speedup. [Plan](README.md), [pre-code decision/steps](design.md),
[compact evidence](measurements.json).

## Baseline and method

Reference 0fa074c, Node22.22.3 / Linux x64 / two available Xeon2.60GHz CPUs /
4,131,278,848 bytes RAM. All measurements sequential; no overlapping benchmark.
Restored sandbox Git metadata was synchronized with the same branch's remote
using a file-preserving mixed reset. Initially supplied dependencies lacked
native Rollup: discarded that failed run, then normal `npm run setup` installed
309 pinned packages. Initial cache population took115.94s, all six gates PASS;
it is not a warm reference or an explicit cache-bypass measurement.

Warm references run `npm run verify -- --base 0fa074c` and include types, lint,
changed quality/ratchet, idle uninstrumented native performance, all tests with
coverage, and build. Current coverage lane is ~57–60s; the other gates add
~16s. No failed run, partial suite or test-only result is full-workflow acceptance.

## Experiments (unshipped, source/fixture assertions retained)

The following are **suite + coverage** timings, not complete verification:

| Experiment | Wall seconds | Outcome / decision |
|---|---:|---|
| Larger V8 young generation, `NODE_OPTIONS=--max-semi-space-size=64` |57.59|All2561 PASS; no demonstrated gain against current lane; retain defaults |
| Four VM workers, warm |58.66|All2561 PASS; oversubscribes two CPUs, no gain |
| Isolated plain threads + Istanbul |115.64|All2561 PASS; substantially slower |
| Dependency optimizer for React/DOM/IndexedDB |83.04|2559 PASS,2 FAIL; root cleanup canary and SelectionV2 behavior fail; REJECT |
| Vitest4.1.12/Istanbul4.1.12, first complete run |75.45|All2561 PASS; separate temporary install, same Vite7.3.2 |
| Same Vitest4, warm |64.30|All2561 PASS; slower than retained Vitest5 lane; REJECT downgrade |
| Main-only vmForks/Istanbul, native pool preserved, first |71.67|All2563 PASS; transforms populating |
| Same main-only vmForks, warm |56.57|All2563 PASS; no material gain vs retained pool; no switch |

The four-worker probe used **105.80 user +7.59 system CPU-seconds** in58.66
wall seconds, peak child RSS ~2.32GiB. This directly supports saturation on two
CPUs rather than a large idle scheduling opportunity. Even perfect overlap
cannot halve that *unchanged* amount of work; reducing computation itself would
require a new proven optimization. This is not proof that every possible future
harness design is impossible.

Additional diagnostic probes:

- An inspector CPU profile of Upload UI placed prominent CPU in React element
  creation/reconciliation, happy-dom nodes and GC. Total sampled14.09s included
  ~5.41s idle during cold transforms/imports and ~1.25s GC. It also triggered
  one timing-sensitive interrupted-journal assertion (72/73 PASS), so it is
  **directional profiling only**, not passing speed/equivalence evidence.
- `jsxDev:false` with development React retained:73/73 Upload cases PASS;
  warm focused8.34s, but no demonstrated full-workflow50% gain. Not shipped.
- CLI cpu-prof attempt produced no worker profile and focused coverage fell
  below the unchanged global80% threshold; not accepted as a passing benchmark.
- First private Vitest4 attempt could not resolve happy-dom, executing only94
  files and producing150 unhandled errors. Rejected as incomplete; supplied the
  SAME happy-dom dependency and reran the full244 files successfully as above.
- Scratch dependency install initially hit npm's peer resolver error; isolated
  probe-only install used legacy-peer-deps and pinned Vite. Project manifest,
  lockfile and final installed Vitest/provider remain5.0.3 unchanged.

## Final verification / no claimed performance gain

| Retained architecture after comparison-tool changes | Wall seconds | Gates |
|---|---:|---|
| Post-experiment static-cache revalidation |81.0645|All six PASS; type lane10.5s, not a clean warm comparison |
| Final normal warm run |73.9280|All six PASS |
| Explicit `--cold` run |108.6925|All six PASS; static and transform caches bypassed |

The negative control compares a real passing73.4715s baseline to the real
73.9280s warm result with target50: **passed=false** (correct). We do not
attribute ordinary noise or changing cache state to an optimization. The cold
run is reported separately, not contrasted with a warm reference for a win.
All full runs before changes had2561 tests; final runs have**2563/244**, adding
two comparator regressions. Every original discovery entry is preserved:
2390 ->2392 listed entries, zero missing. Runtime parameterized cases expand
beyond that discovery count. All167 production coverage JSON entries and the
total are **exactly identical** before/after: lines98.03%, functions98.02%,
statements94.98%, branches89.28%. Production source/config/dependencies unchanged.

Standalone `tsc --noEmit`, lint (0errors /23 existing warnings), changed quality,
focused comparator RED ->GREEN, fast verification and full verification PASS.
Original native30 cases still pass separately with unchanged strict budgets.
Existing suites still emit blocked-network/TLS/teardown diagnostics; no new
intentional provider call was introduced. Do not confuse those logs with an
accepted live external-service ingestion test.

## Research sources and retained rationale

Upstream documentation retrieved via GitHub API; recorded upstream main SHA
`e02db0869895fc57b7381f3a5fd5663b688e3c80`:

- https://github.com/vitest-dev/vitest/blob/e02db0869895fc57b7381f3a5fd5663b688e3c80/docs/guide/profiling-test-performance.md
  — separate transform/setup/import/test/environment costs; profile workers and
  main process separately. Summed parallel durations are not wall-time shares.
- https://github.com/vitest-dev/vitest/blob/e02db0869895fc57b7381f3a5fd5663b688e3c80/docs/config/deps.md
  — supported dependency optimization is off by default; client optimizer applies
  to happy-dom, SSR optimizer to Node. Bundling can change module/mock boundaries;
  our cleanup canary detected that risk rather than accepting a fast broken run.
- https://github.com/vitest-dev/vitest/blob/e02db0869895fc57b7381f3a5fd5663b688e3c80/docs/config/pool.md
  — native/VM realm distinctions, slower VM globals, VM memory retention and
  recycling costs; vmForks can recycle more cheaply. Tested the correct
  main-only change while retaining native real-realm execution.
- Installed Vitest5.0.3 source is authoritative for this toolchain: VM executor
  closes module runners, strips disposed context properties, maintains code
  caches and disables V8 compilation cache to avoid retaining complete worlds.
  We did not patch dependency internals or re-enable unsafe global VM flags.

## Next harness-only research boundary

A follow-up can profile ALL workers with lower-overhead phase attribution,
measure supported VM recycling limits, investigate upstream compilation-cache
behavior with a minimal reproduction, and inspect fixture waits for provably
redundant scheduling (not removed assertions/lifecycles). No such unmeasured
change is represented as a50% solution here. More compute/distributed shards
would need an explicitly different hardware/cost comparison and approval.
Application/compiler memoization is outside the user's selected scope.

Raw logs/profiles/private probe configs remain outside Git in
`/home/user/harness-round2/` and ignored`node_modules/.cache/round2/`.
Compact durable command/timing/exit/machine/resource/equivalence evidence lives
beside this report. Failed/partial/profiling runs remain explicitly classified.
