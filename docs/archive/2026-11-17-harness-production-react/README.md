# 2026-11-17 — the test harness runs production React

Record for `docs/current/TEST_HARNESS.md` §2: why the suite runs the production
react/react-dom/scheduler, what was measured, what failed on the way, and the
exact contract the one harness `act` must keep.

## Measured

Host: 2 vCPU, 3.8 GiB, Node 22, warm `node_modules/.vitest-cache`.

| Run | Wall | CPU (`user`) | Result |
|---|---|---|---|
| Complete suite, dev React (baseline) | 117.2 s | 190.4 s | 471 files, 1 pre-existing failure |
| Complete suite, production React | 100.1 s | 160.8 s | 472 files / 4761 tests green |
| 40-file `tests/svg_*` slice (387 tests), dev | 31.4 s | 58.2 s | green |
| Same slice, production | 25.3 s | 46.0 s | green |

So: **-14.6 % wall / -15.5 % CPU complete, -21 % CPU on React-heavy files.** The
complete run cannot reach -80 % from CPU work alone on this host: 160.8 s CPU
over 2 cores leaves an 80 s wall floor even with perfect packing. React-heavy
files gain most; pure-logic files are untouched.

Reproduce:

```sh
time npx vitest run                                    # complete suite
time npx vitest run $(ls tests/svg_*.test.tsx | head -40)   # the slice
npx vitest run tests/harness_prod_react.test.tsx       # the canary
```

## Why production React

Dev-only validation, owner stacks and the warning machinery were the largest
single CPU item in DOM tests (`tests/setup/dom.ts` already suppressed owner-stack
capture, worth ~20 % of a DOM test's CPU; with production React that suppression
is unnecessary and was removed). Production builds are what `npm run build`
ships, so tests now exercise the same element factory (`jsx`/`jsxs`) and the same
reconciler paths as the app.

## What failed on the way (do not retry)

1. **Path-aliasing the production cjs files.** Aliasing `react`, `react-dom`,
   `react-dom/client` and `scheduler` straight to `cjs/*.production.js` produced
   `TypeError: Cannot read properties of null (reading 'useState')`. Externalised
   packages require each other **natively**, where vite aliases do not reach, so
   `react-dom-client.production.js` got the DEV react (`NODE_ENV=test`) while the
   shim got the production one: two copies, and hooks read a null dispatcher.
2. **`jsxDEV is not a function`.** `react/cjs/react-jsx-dev-runtime.production.js`
   literally sets `exports.jsxDEV = void 0` — the dev runtime must never run in
   production. Mapping `jsxDEV` onto production `jsx` works (same automatic-runtime
   contract, dev-only `source`/`self` args ignored), but it is unnecessary once
   JSX is compiled with the production transform (`esbuild.jsxDev:false`).
3. **`process.env.NODE_ENV = "production"` in `vitest.config.ts`.** Breaks vite's
   resolution of `node:` builtins in the config process: every file importing
   `node:fs`/`node:path` failed collection with `Cannot find package 'node:'`.
   The worker needs production NODE_ENV (`test.env`), the config process does not.
4. **Draining on the global timers.** The first `act` shim drained with
   `setTimeout`, which `tests/helpers/quiet.ts` tracks as app work: every drain
   turn looked like pending work, `settle()` never reported calm, and the slice
   went 25.3 s -> 53.9 s with three elapsed-clock tests timing out. The drain now
   uses `node:timers.setImmediate`, invisible to quiet.
5. **No `scheduler` alias.** The package is installed and must resolve natively so
   react-dom and the shim share one copy.

## The `act` contract (`tests/setup/reactprod.ts`)

Production React 19 exports no `act`; 162 test files import it from `react`, so
`react` resolves to a shim that re-exports the real module and adds one `act`.

- **Sync callback** — committed before `act` returns, via `flushSync`: it batches
  the callback at the sync lane and flushes in its own `finally`. That preserves
  the widespread un-awaited `act(() => root.render(<App />))` in `beforeEach`.
- **Async callback** — resolves after the awaited work plus three `node:timers`
  turns, so effects and the commits they schedule have run before `settle()` /
  `waitUntil()` observe the DOM.
- **Passive effects are not synchronous.** Production offers no flush for them (a
  second `flushSync` does not do it: measured `0`, `0`, `0`). Dev `act` showed
  post-effect DOM (`s7`) where the shim shows pre-effect DOM (`s0`). This is the
  one intentional difference, and the canary asserts both sides of it.
- **Completeness.** The shim's namespace must carry every name the real module
  exports; the canary compares it against a native `createRequire` import, so a
  future React export cannot go missing silently. Extras are exactly `act` and
  vite's `module.exports` interop key.

## The race the faster harness exposed

`tests/svg_builder_artboards.test.tsx` waited for a folder name that the
"+ Artboard" flow already stores at creation (`actions/sheetexport.ts`), while the
export's writes land behind `useSvgBuilder.ts`'s 600 ms sheet-sync debounce. Dev
`act` was slow enough that the writes had landed by the time the wait returned;
the production harness made the wait return first, and the test failed 2 runs in 5
(4 in 5 while an animation-frame drain was tried). It now settles the app's own
window instead of polling a signal that was already true. Diagnosed by recording
the stack of every timer scheduled with a 100-2000 ms delay: the only two were the
250 ms session autosave and that 600 ms debounce.

General rule: **wait for the outcome an assertion checks.** A wait on a signal
that is true before the action starts passes or fails on harness speed alone.
