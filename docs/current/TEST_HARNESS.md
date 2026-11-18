# Test harness — execution, isolation and measured speed

Harness configuration, verification runner and quiet-helper contracts.
Commands/gates: [Code Verification](CODE_VERIFICATION.md).
Feature tests: [test index](sor/TESTS.md).

## 1. Current evidence (2026-11-17)

**Production React cut the complete suite by 15%.** Warm run, 2 vCPU/3.8 GiB,
472 files / 4761 tests green: 117.2 s → 100.1 s wall, 190.4 s → 160.8 s CPU, and
the 40-file `tests/svg_*` slice -21%. React-heavy files gain, pure-logic ones do
not: 160.8 s of CPU over 2 cores leaves an 80 s wall floor, so CPU work alone
cannot reach -80%.

The everyday retest is therefore scoped: `npm run test:affected` walks the real
import graph and runs only the tests a change can observe, and the COMPLETE suite
whenever it cannot prove a test unaffected — a harness-wide change, a path
outside `src|tests|tools|docs`, a deletion, an unresolvable base, or a docs edit
(routed to the tests that read docs). Gates never scope. Measured cuts and
escalations: [CODE_VERIFICATION.md](CODE_VERIFICATION.md) §5;
`tests/affected_scope.test.ts` pins the graph and every escalation.

Archived: [2026-10-30](../archive/2026-10-30-harness-speed/README.md) measured
7.5% against a 40% target and [2026-10-25](../archive/2026-10-25-harness-40/README.md)
2.95% warm — CPU-bound, and `isolate:false`, other pools, merges and bundling
were all slower. Host variation is large — **never advertise a guaranteed
multiplier**; `--overlap` (82.05 s vs 82.37 s) is noise, not the default; no
Windows guarantee.

## 2. Isolated projects and resource budget

| Project | Inventory | Pool/group |
|---|---|---|
| `main` | all tests except the two inventories below | `vmThreads`, group 0 |
| `geometry` | `GEOMETRY_TESTS`: centred-fit/auto-repair and isolation canaries | `threads`, group 1 |
| `native` | the unchanged five `NATIVE_TESTS` | `threads`, one worker, group 2 |

- Each file belongs to exactly one project; groups run sequentially, not as
  competing pools, native files serially, all with `isolate:true`.
- Main/geometry inherit min(4, CPUs, 75% RAM/768 MiB) workers, floor 1; add none
  on a two-core host without complete-run measurements.
- Main VMs reuse external DOM/React imports while giving each file a fresh module
  graph, context and DOM; native realms support Buffer checks.
- A **first-line** `// @vitest-environment node` skips all DOM/React setup; use it
  for files that touch no document/window.
- `fsModuleCache:true` reuses transforms in `node_modules/.vitest-cache`; a first
  run after a config change is not a warmed measurement.
- Mixed pools in one group respawn workers costily: timing/realm files go to
  `NATIVE_TESTS`, measured CPU files to `GEOMETRY_TESTS`.
- Rejected, measured: custom VM (faster in a microbenchmark, not in the suite),
  global threads/V8, four-worker oversubscription, pending-work cancellation; no
  custom DOM/provider/pool switch ships.

### Production React, and the one harness `act`

Tests run the PRODUCTION react/react-dom/scheduler the app ships; dev-only
validation, owner stacks and warnings were about two thirds of React's CPU.
`tests/harness_prod_react.test.tsx` pins every fact;
[the archive](../archive/2026-11-17-harness-production-react/README.md) records
the measurements, what failed, and the flake this exposed.

- `test.env.NODE_ENV="production"` in the WORKER only: the packages pick their
  build from NODE_ENV and require each other natively, where aliases do not
  reach, so only a worker-wide value lands them on ONE copy. The config process
  stays `test` — production there breaks vite's `node:` resolution.
- `esbuild.jsxDev:false` compiles test JSX with the production transform
  `npm run build` uses.
- `react` resolves to `tests/setup/reactprod.ts`: the real module plus ONE `act`
  (production ships none; 162 files import it). SYNC callbacks commit before
  `act` returns (`flushSync`), so an un-awaited `act(() => render(...))` still
  shows DOM; ASYNC ones resolve after three `node:timers` turns — never global
  timers, which `quiet.ts` counts as app work (25.3 s → 53.9 s). With no
  synchronous passive-effect flush in production, an effect lands on the NEXT
  turn: the one intentional difference from dev `act`.
- Wait for the outcome an assertion checks; a signal true before the action
  starts passes on harness speed alone.

## 3. Verification architecture

`npm run verify` keeps the canonical sequential gates: types, lint,
changed-quality, native uninstrumented performance alarms, one complete coverage
suite, build. `verify:fast` omits only the extra native lane; no success is
cached, every native algorithm/budget still runs. `--overlap` runs native alarms
alone first, then the serial Types→Lint→Quality→Build queue beside one coverage
run — one static command and one Vitest live at most, not a speed promise;
`--serial` overrides it and inadequate resources fall back to serial. Coverage
gets `PERF_BUDGETS=coverage` and native alarms do not, so no lane overlaps the
uninstrumented native stage. Every gate failure propagates, including
executable-start errors, and unknown groups fail closed. Runner mechanics,
caches, signals and the plan contract:
[CODE_VERIFICATION.md](CODE_VERIFICATION.md) §8.

## 4. DOM setup and readiness

`tests/setup/harness.ts` loads DOM setup only when document exists:

1. Installs quiet tracking before modules capture timers/immediates.
2. Tracks createRoot results, unmounts leftovers after each test, clears
   document.body; leaked roots otherwise render through the rest of a file.
3. Keeps the live network offline: unstubbed Requesty discovery gets an empty
   local catalog, other external requests fail closed (loopback tests remain);
   `vi.stubGlobal("fetch", …)` overrides per test.

| Helper | Contract |
|---|---|
| `settle(maxMs=80)` | three calm turns inside act; accelerate timers due within maxMs, bounded by max(maxMs, 250) ms |
| `waitUntil(pred, what, budgetMs=4000)` | flush queued Promise/React/immediate work, recheck BEFORE advancing a future timer; `never reached: what` on timeout |

A step drains immediates first (IndexedDB/React) and advances an eligible timer
only when idle; a timer beyond the window is left alone, and a fast-forward never
consumes `waitUntil`'s app window. Never poll inside one long act callback —
React cannot commit until it returns.

**Do not indiscriminately cancel pending work between cases.** Cancel the shared
IndexedDB immediates and later transactions deadlock; blanket cancellation has no
proved benefit.

**Real production pacing is injectable, never deleted.** Getty's 700 ms Complete
settle, 1500 ms bulk Save and 1000 ms poll are options (`settleMs`,
`bulkSaveSettleMs`, `pollMs`) that tests set to single digits; `getty_web_finalize`
proves the defaults still apply. Never zero a default to win time, never
fake-timer a whole file.

## 5. Real computation, not cheaper fake tests

Speed may come from real shipped code, never from a cheaper test. The
`offsetcheck.ts` geometry optimization (order, tolerance and output unchanged,
guarded by equivalence hashes over 684 cases) is in
[the 2026-10-30 archive](../archive/2026-10-30-harness-speed/README.md); a
focused geometry speedup is never overall evidence.

## 6. Coverage and caches

- Istanbul 5.0.3 over `src/lib/**`, line threshold 80%; aggregate
  95.33% stmt / 89.74% branch / 98.20% fn / 98.29% line, never lower. No source
  omission, assertion deletion or uncovered-code waiver. Audit with
  `PERF_BUDGETS=coverage npx vitest run --coverage --coverage.provider=v8`
  (never leave it set for native budgets); branch accounting can differ.
- TypeScript incremental and content-keyed ESLint caches live in
  `node_modules/.cache/verify`; source/config/tool edits invalidate them and
  static-cache canaries prove it. `verify -- --cold` bypasses caches, not gates;
  `npm run setup` clears them.
- Policy/Node/isolation canaries guard exact-once inventory, realms and teardown,
  coverage canaries reject uncovered branches/functions, and `verify_execution`
  uses real child fixtures for fallback, order, native quarantine, overlap,
  cancellation and propagation.

## 7. Reproduce and profile

```sh
node tools/harness-benchmark.mjs --output /path/outside/repo/run.json --label warm -- npm run verify
node tools/harness-benchmark.mjs --compare before.json after1.json after2.json --required-reduction 40
npx vitest run --reporter=default --reporter=json --outputFile.json=report.json
```

The recorder measures the actual command/exit/environment; the comparator uses
medians (60% default), rejecting failed or incompatible evidence. Use exactly
one finite target: `--required-reduction` in (0,100) or `--required-speedup` > 1
(1.4 = a 40% throughput gain, not 40% less time). Compare every baseline, never
keep only the best, and accept an optimization only on complete-run evidence.
Phase percentages sum tracked worker time, NOT wall-time shares.
