# Test harness — how the suite runs fast and stays honest

Owner of `vitest.config.ts`, `tools/test-harness-policy.ts`,
`tests/setup/{harness,dom}.ts` and `tests/helpers/quiet.ts`. Commands and gates: [Code Verification](CODE_VERIFICATION.md).
Which test covers what: [test index](sor/TESTS.md).

Measured 2026-10-25, Linux / 2 CPUs / 3.85 GiB / Node22.22.3:
full warm reference **118.14s**; new warm runs **91.02/91.47s**, median91.24s.
Cold reference142.69s; candidate122.60s. **+430% speed (5.3x) is NOT met**:
warm target22.29s. The apparent warm comparison is 1.295x, not 5.3x.
Two original-harness repeats failed at88.95/91.28s: substantial timing variation
means the single successful warm reference does not establish a stable speedup.
[Plan/research](../archive/2026-10-25-harness-430/README.md),
[complete evidence and limitations](../archive/2026-10-25-harness-430/results.md).
Older ~80s vs255s results apply to the older suite, not today's baseline.
These are hardware-local observations, not a Windows timing guarantee.

## 1. Layout: three projects, three groups

| Project | Files | Pool | Why |
|---|---|---|---|
| `main` | every test except the two policy inventories below | `vmThreads`, group0 | reuse external DOM/React imports, fresh VM/module graph per file |
| `geometry` | `GEOMETRY_TESTS`: centred-fit, auto-repair and isolation canaries | `threads`, group1 | measured CPU-heavy geometry benefits from the native realm; no algorithm changes |
| `native` | unchanged `NATIVE_TESTS` | `threads`, 1 worker, group2 | uninstrumented timing alarms and Node Buffer/typed-array realm checks |

- Groups run sequentially, not competing pools. Native files also run serially;
  the uninstrumented full-verification perf lane runs without other gates.
  Add a file to `NATIVE_TESTS` only for timing/realm requirements; move geometry
  files only with equivalent full-suite measurements, not a focused win alone.
- A file whose **first line** is `// @vitest-environment node` gets no DOM.
  Use it whenever the file does not touch `document`/`window`.
- Main/geometry inherit available CPUs, capped at four and 75% RAM /768MiB per
  worker (two here). All three retain `isolate: true`; inventory tests prove
  every discovered file belongs to exactly one project.
- `fsModuleCache: true` reuses transforms in `node_modules/.vitest-cache`.
  First runs after configuration changes pay transform cost; do not call those
  fully warm or compare them with cache-bypassed runs.

## 2. Environment-specific setup

`tests/setup/harness.ts` dispatches before every file. A Node file never imports
React or quiet tracking; DOM files load `tests/setup/dom.ts`, which:

1. Turns off React 19's dev-only owner-stack capture (an `Error` built per JSX
   element, ~20% of DOM-test CPU). `REACT_OWNER_STACKS=1` restores it when
   chasing a warning's component stack.
2. DOM files only: installs quiet tracking (§3) before any app module
   captures `setTimeout`/`setImmediate`.
3. Tracks every `createRoot` and unmounts roots a test left mounted, then
   empties `document.body`. A leaked root kept its listeners and timers alive
   and re-rendered in every later test of the file.

## 3. Settle until quiet, not for a fixed time (`tests/helpers/quiet.ts`)

| Helper | Replaces | Contract |
|---|---|---|
| `settle(maxMs = 80)` | `act(() => sleep(maxMs))` | steps the app inside `act()` until three calm turns; timers due within `maxMs` are fast-forwarded and fire now; never longer than `max(maxMs, 250)` real ms |
| `waitUntil(pred, what, budgetMs = 4000)` | polling loops | steps the app until `pred()` holds; throws `never reached: <what>` after the budget of app time |

- `waitUntil` first flushes ready Promise/React/immediate work and rechecks the
  predicate before selecting a future timer. Otherwise a queued completion can
  be observed only after its toast has already expired. Budgets remain unchanged;
  an unreachable predicate still throws. `harness_quiet` exercises both paths.
- A step runs pending immediates first (fake IndexedDB, React's scheduler);
  only when the app is otherwise idle does the clock warp to the next timer
  inside the window. A timer due after the window (a 4 s toast) is left
  alone, exactly as the old sleep left it.
- `settle(0)` is the one-tick settle the DOM files used to hand-roll.
- Never poll inside a single `act()`: React does not commit until the act
  returns, so the loop always ran its full budget. Use `waitUntil`.
- When a test needs a state that arrives asynchronously, wait for that state
  (`waitUntil`) rather than assuming a number of turns.

## 4. Keeping the critical path short

- Profile current workloads, not historical assumptions: CPU profiles of the
  new hottest files are dominated by real offset/distance geometry searches
  and allocation, while general UI suites still spend time in React/happy-dom.
  Native placement is selective: moving the whole suite to threads/V8 measured
  148.71s for coverage alone and was rejected. The longest file sets a floor. Split a DOM file that runs much longer than its peers
  along its `describe` blocks with a shared fixture in `tests/helpers/`
  (example: `svg_ui.test.tsx` + `svg_ui_config.test.tsx` over
  `helpers/svgpanel.tsx`).
- Spawned tools (`quality_base`) start their child processes concurrently and
  each test awaits its own result.
- `secret_hygiene` prefilters candidates with one `git grep --untracked`, then
  runs the real detector on the matches (it used to read ~12k files twice).
- `npm run verify` does not run the suite twice: the coverage lane runs every
  test, and `--full` adds only the `native` perf project uninstrumented.

## 5. Coverage and caches

- Official pinned Istanbul 5.0.3 instruments the unchanged `src/lib/**` scope;
  lines threshold stays 80%. V8's collection also profiles React/DOM runtime
  modules before filtering, making it substantially slower on isolated VMs.
- Current complete suite remains95.32% statements /89.72% branches /98.20%
  functions /98.29% lines, identical aggregate percentages to this task's
  original harness. Provider branch accounting can differ; neither thresholds
  nor assertions are relaxed. Audit with
  `PERF_BUDGETS=coverage npx vitest run --coverage --coverage.provider=v8`
  (PowerShell: set `$env:PERF_BUDGETS='coverage'` first, then remove that
  environment variable before running native performance budgets).
- Verify uses supported TypeScript incremental checking and ESLint content cache
  in `node_modules/.cache/verify`. Every test, coverage calculation and build
  still executes. Source/config/tool changes invalidate tool-owned caches.
- `npm run verify -- --cold` bypasses static caches and filesystem transforms;
  it does not skip any gate. `npm run setup` also clears caches with npm ci.
- `harness_policy/node/isolation_*` and `harness_geometry_isolation_*` check
  exact-once inventory, resource limits, real Node realm, isolation and teardown;
  `harness_coverage` proves actual uncovered branches/functions fail thresholds;
  `harness_static_cache` proves changed input invalidates cached success.
- `node tools/harness-benchmark.mjs --output run.json --label warm -- npm run verify`
  records wall time/exit/machine. `--compare before.json after1.json after2.json`
  checks the candidate median against >=60% by default; use
  `--required-reduction 50` for a 50% time-reduction target, or
  `--required-speedup 5.3` for +430% throughput. The latter reports both units
  and requires a finite multiplier >1; reduction percentages must be in(0,100).
  Choose exactly one target. Failed or incompatible evidence
  cannot pass. Keep generated reports outside Git and compare equal conditions.

## 6. Find the slow file

```bash
npx vitest run --reporter=default --reporter=json --outputFile.json=report.json
# per file: testResults[].endTime - startTime; per test: assertionResults[].duration
```

The happy-dom `AbortError: The operation was aborted.` stacks printed at
worker teardown are pending in-DOM fetches aborted when a file's window
closes; they were printed by the old harness too and do not fail the run.

## 7. Second-round research (2026-10-23)

Additional 50% reduction was **not achieved**: that round’s warm full baseline
73–76 s requires <=37–38 s. Extra workers, heap tuning, dependency prebundling,
real threads, previous Vitest and main-only vmForks did not justify a safe switch.
Application code/compiler remains unchanged, as explicitly requested. Retain the
then-current design rather than those rejected global changes. Selective geometry
placement above is a later, separately profiled change. [Research, measured
failures and future boundary](../archive/2026-10-23-harness-round2/results.md).
The new comparator target flag is measurement tooling, **not a speedup**.
