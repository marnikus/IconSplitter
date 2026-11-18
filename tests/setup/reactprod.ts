// reactprod.ts — the test environment's React (2026-11-17 harness redesign):
// the PRODUCTION react/react-dom builds, which skip the dev-only validation,
// owner stacks and warning machinery that measured ~2/3 of the suite's CPU.
// React 19 ships no `act` in production builds and 162 test files import it,
// so this shim re-exports the production module and adds ONE harness `act`.
//
// The contract `act` must keep (tests rely on both halves):
//   sync callback  -> work is committed BEFORE act returns, so a caller that
//                     does not await (`act(() => root.render(...))` in a
//                     beforeEach) still sees the rendered DOM on the next line.
//                     `flushSync` gives exactly that: it batches the callback
//                     at the sync lane and flushes it in its own finally block.
//   async callback -> act resolves only after the awaited work AND the
//                     scheduler turns that work scheduled have run, so
//                     settle()/waitUntil() keep polling a DOM that is moving.
//
// The drain turns use node:timers, never the global setTimeout/setImmediate:
// tests/helpers/quiet.ts counts global timers as app work, and a turn it can
// see would reset its "quiet" accounting (that made settle spin to its ceiling
// and starved the elapsed-clock tests). Flagged `__harnessAct` so a canary test
// can prove WHICH act a run got.
import { setImmediate as nodeImmediate } from "node:timers";
import { flushSync } from "react-dom";

// @ts-expect-error — react's own types are `export = React`, which an ESM
// `export *` cannot re-export (TS2498). Runtime-only alias: vite re-exports
// every name of the real production module, and tests keep type-checking
// against @types/react through the unaliased "react" specifier, so no caller
// loses types. tests/harness_prod_react.test.tsx asserts the re-export is
// COMPLETE, so a new React export can never go missing silently.
export * from "react-prod";

type ActCallback = () => unknown;

/** Scheduler turns to let run after an awaited callback (effects -> promises
 *  -> setState -> another commit). Cheap: an immediate is a check-phase turn,
 *  and React's scheduler callback is already due in the timers phase before it. */
const TURNS = 3;

/** One real macrotask turn that quiet.ts cannot observe. */
function turn(): Promise<void> {
  return new Promise((resolve) => { nodeImmediate(() => resolve()); });
}

export function act(callback: ActCallback): Promise<void> {
  const out = flushSync(() => callback());
  if (!(out instanceof Promise)) return Promise.resolve();
  return (async () => {
    await out;
    for (let i = 0; i < TURNS; i++) await turn();
  })();
}

(act as unknown as { __harnessAct: boolean }).__harnessAct = true;
