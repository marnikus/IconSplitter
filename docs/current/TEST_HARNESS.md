# Test harness — how the suite runs fast and stays honest

Owner of `vitest.config.ts`, `tests/setup/harness.ts` and
`tests/helpers/quiet.ts`. Commands and gates: [Code Verification](CODE_VERIFICATION.md).
Which test covers what: [test index](sor/TESTS.md).

Measured on the reference Windows box (6 cores, repo on a synced drive),
2026-10-19: full `npx vitest run` went from 54–103 s (four runs of the old
harness, all happy-dom, one forked process per file) to ~15 s vitest duration
/ ~17 s wall, 2055 tests green; `npm run coverage` ~30 s.

## 1. Layout: two projects, two groups

| Project | Files | Pool | Why |
|---|---|---|---|
| `main` | every test except `NATIVE` | `vmThreads` | happy-dom and React load once per worker; each file still gets a fresh VM context and module graph |
| `native` | `NATIVE` list in the config | `threads`, 4 workers, `groupOrder: 1` | wall-clock budgets and cross-realm `Buffer`/typed-array code need the real Node realm and an idle CPU |

- `native` runs after `main` finishes, so a perf budget is never measured on
  a loaded machine. Add a file to `NATIVE` only when it times itself or
  compares Node buffers across realms (`vmThreads` makes those fail).
- A file whose **first line** is `// @vitest-environment node` gets no DOM.
  Use it for every test that does not touch `document`/`window`: creating a
  happy-dom window per file is the largest per-file cost.
- `fsModuleCache: true` keeps transformed modules in
  `node_modules/.vitest-cache` between runs.
- Do not mix pool types inside one group: vitest respawns workers between them.

## 2. Shared setup (`tests/setup/harness.ts`)

Runs before every file:

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

## 5. Find the slow file

```bash
npx vitest run --reporter=default --reporter=json --outputFile.json=report.json
# per file: testResults[].endTime - startTime; per test: assertionResults[].duration
```

The happy-dom `AbortError: The operation was aborted.` stacks printed at
worker teardown are pending in-DOM fetches aborted when a file's window
closes; they were printed by the old harness too and do not fail the run.
