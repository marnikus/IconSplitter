# Test harness — how the suite runs fast and stays honest

Owner of `vitest.config.ts`, `tools/test-harness-policy.ts`,
`tests/setup/{harness,dom}.ts` and `tests/helpers/quiet.ts`. Commands and gates: [Code Verification](CODE_VERIFICATION.md).
Which test covers what: [test index](sor/TESTS.md).

Measured on 2026-10-22, Linux / 2 CPUs / 3.85 GiB / Node 22.22.3:
full verification is ~80 s with reusable caches versus ~255 s for the old
architecture (over 60% faster). This includes all gates, not just Vitest.
A cache-bypassed full run is ~117 s: **cold runs do not yet meet 60%**.
See the [plan, research and measured results](../archive/2026-10-22-test-harness-speed/README.md).
These are hardware-local measurements, not a Windows timing guarantee.

## 1. Layout: two projects, two groups

| Project | Files | Pool | Why |
|---|---|---|---|
| `main` | every test except `NATIVE_TESTS` | `vmThreads` | happy-dom and React load once per worker; each file still gets a fresh VM context and module graph |
| `native` | `NATIVE_TESTS` in the policy | `threads`, 1 worker, `groupOrder: 1` | wall-clock budgets and cross-realm `Buffer`/typed-array code need the real Node realm and an idle CPU |

- `native` runs after `main` finishes; serial files avoid competing with each
  other. The uninstrumented full-verification perf stage runs without other gates. Add a file to `NATIVE_TESTS` only when it times itself or
  compares Node buffers across realms (`vmThreads` makes those fail).
- A file whose **first line** is `// @vitest-environment node` gets no DOM.
  Use it for every test that does not touch `document`/`window`: creating a
  happy-dom window per file is the largest per-file cost.
- Main workers explicitly use available CPUs, capped at four and by 75% RAM /
  768 MiB per worker (two here); retain `isolate: true` in both projects.
- `fsModuleCache: true` keeps transformed modules in
  `node_modules/.vitest-cache` between runs.
- Do not mix pool types inside one group: vitest respawns workers between them.

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

- The suite is CPU-bound on React + happy-dom rendering; the longest single
  file sets the floor. Split a DOM file that runs much longer than its peers
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
- Same 167 files, exactly equal per-file covered/total lines, functions and
  statements. Four branch hits differ by provider (89.28% vs 89.35%); neither
  thresholds nor assertions were relaxed. Audit with
  `PERF_BUDGETS=coverage npx vitest run --coverage --coverage.provider=v8`
  (PowerShell: set `$env:PERF_BUDGETS='coverage'` first, then remove that
  environment variable before running native performance budgets).
- Verify uses supported TypeScript incremental checking and ESLint content cache
  in `node_modules/.cache/verify`. Every test, coverage calculation and build
  still executes. Source/config/tool changes invalidate tool-owned caches.
- `npm run verify -- --cold` bypasses static caches and filesystem transforms;
  it does not skip any gate. `npm run setup` also clears caches with npm ci.
- `harness_policy/node/isolation_*` check inventory/resource limits and teardown;
  `harness_coverage` proves actual uncovered branches/functions fail thresholds;
  `harness_static_cache` proves changed input invalidates cached success.
- `node tools/harness-benchmark.mjs --output run.json --label warm -- npm run verify`
  records wall time/exit/machine. `--compare before.json after1.json after2.json`
  checks the candidate median against >=60% by default; use
  `--required-reduction 50` for a new 50% target. Targets must be finite and
  strictly between 0 and 100. Failed or incompatible evidence
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

Additional 50% reduction was **not achieved**: current warm full baseline
73–76 s requires <=37–38 s. Extra workers, heap tuning, dependency prebundling,
real threads, previous Vitest and main-only vmForks did not justify a safe switch.
Application code/compiler remains unchanged, as explicitly requested. Retain the
current architecture, not an unproven faster configuration. [Research, measured
failures and future boundary](../archive/2026-10-23-harness-round2/results.md).
The new comparator target flag is measurement tooling, **not a speedup**.
