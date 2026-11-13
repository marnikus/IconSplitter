# Test harness — execution, isolation and measured speed

Harness configuration, verification runner and quiet-helper contracts.
Commands/gates: [Code Verification](CODE_VERIFICATION.md).
Feature tests: [test index](sor/TESTS.md).

## 1. Current evidence (2026-10-30)

**Both 40% attempts failed; the second measures 7.5%.** `verify:fast` medians
117.44s -> 108.61s (clean runs 109.80/107.42) on 2 vCPU/Node22.22.3: the Getty bridge shed ~30s of real
production sleep (22.65s->0.25s, 7.98s->0.63s), but the suite is CPU-bound --
167s CPU for a 93s run (85-90% packing), 132.6s of it real test bodies that
render the actual panel (react-dom dev 23%, DOM 16%, GC 13% of samples).
`isolate:false` (106s), other pools, group merges and optimizer bundling were
slower. 40% needs fewer/scaled-down rendering tests or 4 vCPU:
[plan and rejected experiments](../archive/2026-10-30-harness-speed/README.md).

2026-10-25 attempt: warm 94.00s -> 91.23s (2.95%), cold 129.92 -> 117.85; target
was <=56.40s ([plan](../archive/2026-10-25-harness-40/README.md),
[results](../archive/2026-10-25-harness-40/results.md)). Host variation is
large -- **never advertise a guaranteed multiplier**; opt-in `--overlap`
(82.05s vs 82.37s) is noise, not the default. No Windows guarantee.

## 2. Isolated projects and resource budget

| Project | Inventory | Pool/group |
|---|---|---|
| `main` | all tests except the two inventories below | `vmThreads`, group0 |
| `geometry` | `GEOMETRY_TESTS`: centred-fit/auto-repair and isolation canaries | `threads`, group1 |
| `native` | unchanged five `NATIVE_TESTS` | `threads`, one worker, group2 |

- Every file belongs to exactly one project. Groups run sequentially, not
  competing pools. Native files also run serially. All retain `isolate:true`.
- Main/geometry inherit min(4,available CPUs,75%RAM/768MiB) workers, floor1.
  Do not add workers on a two-core host without complete-run measurements.
- Main VMs reuse external DOM/React imports, but give each file a fresh module
  graph, global context and DOM. Native realms support Buffer/typed-array checks.
- A **first-line** `// @vitest-environment node` skips all DOM/React setup.
  Use it for files that do not touch document/window.
- `fsModuleCache:true` reuses transforms in `node_modules/.vitest-cache`.
  First transforms after config changes are not fully warmed measurements.
- Mixed pool types in one group cause costly worker respawning.
  Add timing/realm files to `NATIVE_TESTS`, measured CPU files to `GEOMETRY_TESTS`.

## 3. Verification architecture

Default `npm run verify` retains canonical sequential commands: types, lint,
changed-quality, native uninstrumented performance alarms, one complete coverage
suite, build. `verify:fast` omits only the additional uninstrumented native lane.
No test/coverage/build success is cached. Every native algorithm/budget still runs.

`npm run verify -- --overlap` (>=2CPUs, >=3GiB) runs native alarms alone first,
then the serial Types→Lint→Quality→Build queue beside one coverage run: at most
one static command and one Vitest live, own worker budget. Not a speed promise.

- `--serial` overrides overlap. Inadequate resources fall back to serial.
- `--plan [--json]` lists commands with `executionGroup`/`executionMode`;
  canonical order is not overlapping start order.
- Coverage gets `PERF_BUDGETS=coverage`; native alarms do not. No verifier lane
  overlaps the uninstrumented native stage.
- All gate failures propagate, including executable-start errors; other gates
  still diagnose failures. Unknown groups fail closed, never silently skip work.
- SIGINT/SIGTERM cancel owned child process trees and prevent subsequent starts.
  Windows uses taskkill tree cleanup; Windows timing is not validated here.
- Overlap interleaves logs; named start/finish records identify lanes.

## 4. DOM setup and readiness

`tests/setup/harness.ts` loads DOM setup only when document exists. DOM setup:

1. Disables React19 dev-only owner-stack capture (Error per JSX element).
   `REACT_OWNER_STACKS=1` restores warning component-stack diagnostics.
2. Installs quiet tracking before application modules capture timers/immediates.
3. Tracks actual createRoot results, unmounts leftovers after each test, clears
   document.body. Leaked roots otherwise render throughout the rest of a file.

| Helper | Contract |
|---|---|
| `settle(maxMs=80)` | three calm turns inside act; accelerate timers due within maxMs, bounded by max(maxMs,250) real ms |
| `waitUntil(pred,what,budgetMs=4000)` | flush queued Promise/React/immediate work, recheck readiness BEFORE advancing a future timer; throw `never reached: what` on timeout |

A step drains immediates first (IndexedDB/React) and only advances an eligible
timer when otherwise idle; a timer beyond the window is left alone. A
fast-forward never consumes `waitUntil`'s app window. `settle(0)` is a
one-tick-style settle; never poll inside one long act callback, since React
cannot commit until it returns. Wait for state, not a guessed turn count.

**Do not indiscriminately cancel pending work between cases.** Cancel the
shared IndexedDB immediates and later transactions deadlock; blanket timeout
cancellation has no proved benefit. Both prototypes were rejected.

**Real production pacing is injectable, never deleted.** Getty's 700ms Complete
settle, 1500ms bulk Save and 1000ms poll are options (`settleMs`,
`bulkSaveSettleMs`, `pollMs`) that tests set to single digits;
`getty_web_finalize` proves the real defaults still apply under fake timers.
Never zero a default to win time, and never fake-timer a whole suite file.

## 5. Real computation, not cheaper fake tests

`src/lib/upload/geom/expand/offsetcheck.ts` optimizes actual shipped geometry,
not a testing substitute. It keeps the same Bernstein arithmetic order without
allocating vector/weight arrays in every distance iteration; independent offset
checks short-circuit on failure. A conservative derivative interval bound may
certify the unchanged tolerance decision, with rounding slack. Uncertain,
near-threshold and nonfinite cases retain the original forty-step search.
TOL0.01, check positions, subdivision/depth8 and output geometry are unchanged.

This **is application computational code**, not merely harness configuration.
Original281edd6 hashes for36 deterministic cases and648 near-threshold
comparisons guard equivalence; real SVG/EPS regressions stay intact. A focused
geometry speedup is never overall verification evidence.

Rejected: non-contextified custom VM (microbenchmark faster, actual suite not),
global threads/V8, four-worker oversubscription, automatic pending-work cancellation.
No custom DOM/provider/dependency/pool switch ships.

## 6. Coverage and caches

- Official Istanbul5.0.3, unchanged `src/lib/**`, line threshold80%. Current
  aggregate95.33%stmt/89.74%branch/98.20%fn/98.29%line; all new kernel functions
  and lines100%. The reference95.32/89.72/98.20/98.29 scope gains one real module;
  no source omission, assertion deletion or uncovered-code waiver.
- Independent audit: `PERF_BUDGETS=coverage npx vitest run --coverage
  --coverage.provider=v8` (set/remove the variable around it; never leave it set
  for native budgets). Provider branch accounting can differ.
- Compiler-owned TypeScript incremental and content-keyed ESLint caches live in
  `node_modules/.cache/verify`. Source/config/tool edits invalidate them.
- `npm run verify -- --cold` bypasses these and filesystem transforms, not gates.
  `npm run setup` also clears installed caches with npm ci.
- Policy/Node/isolation canaries guard exact-once inventory, realms and teardown;
  real coverage canaries reject uncovered branches/functions. Static-cache
  canaries prove edits invalidate cached checking, including restored timestamps.
- `verify_execution` uses real child fixtures to test resource fallback, order,
  native quarantine, overlap, cancellation, spawn errors and failure propagation.

## 7. Reproduce and profile

```sh
node tools/harness-benchmark.mjs --output /path/outside/repo/run.json --label warm -- npm run verify
node tools/harness-benchmark.mjs --compare before.json after1.json after2.json --required-reduction 40
npx vitest run --reporter=default --reporter=json --outputFile.json=report.json
```

The recorder measures the actual command/exit/environment. The comparator uses
candidate median, rejects failed/incompatible evidence, defaults to60% reduction.
Use exactly one finite target: `--required-reduction` in(0,100), or
`--required-speedup` >1 (e.g.1.4 means40% throughput gain, not40% less time).
Compare each reference run when multiple baseline reports exist; do not forge a
single schema1 "median run". Keep all failures and cache states, not a best run.
JSON reporter exposes per-file start/end and per-test durations. Phase percentages
sum tracked worker time, NOT wall-time shares. CPU profiles distinguish real work
from setup; actual complete-run evidence is required to accept any optimization.
