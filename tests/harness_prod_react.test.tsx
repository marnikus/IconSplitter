// harness_prod_react.test.tsx — the canary for the test environment's React
// (TEST_HARNESS.md §2): the suite runs the PRODUCTION react/react-dom the app
// ships, with ONE harness `act` standing in for the dev-only export React 19
// strips from production builds. These assertions are the contract every DOM
// test in the repo relies on; if one fails, the harness has silently drifted
// back to dev React (slow) or to an `act` that no longer commits.
import { createRequire } from "node:module";
import { useEffect, useState } from "react";
import * as ReactNS from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { settle, trackedTimerCount } from "./helpers/quiet";

function Effectful({ tag }: { tag: string }) {
  const [n, setN] = useState(0);
  useEffect(() => { setN(7); }, []);
  return <div data-testid="canary">{tag + n}</div>;
}

let mounted: { el: HTMLDivElement; root: Root } | undefined;

/** Mounts a root on a fresh host element and remembers it for the cleanup. */
function mountRoot(): { el: HTMLDivElement; root: Root } {
  const el = document.createElement("div");
  document.body.appendChild(el);
  mounted = { el, root: createRoot(el) };
  return mounted;
}

afterEach(() => {
  // The first assertion inspects the module only and never mounts.
  const m = mounted;
  if (m !== undefined) { act(() => { m.root.unmount(); }); m.el.remove(); }
  mounted = undefined;
});

describe("the test environment runs production React", () => {
  it("loads the production build: React's dev-only owner-stack export is gone", () => {
    // `captureOwnerStack` exists ONLY in react.development.js; `act` is the
    // other dev-only export and the harness shim supplies that one on purpose.
    expect("captureOwnerStack" in (ReactNS as object)).toBe(false);
    expect((act as unknown as { __harnessAct?: boolean }).__harnessAct).toBe(true);
  });

  it("re-exports the whole real module, so no React export can go missing", () => {
    // The shim is `export * from` the real package plus ONE act. Requiring react
    // natively (no vite alias) gives the production module's own key set; the
    // namespace every test file sees must be exactly that plus the harness act.
    const real = Object.keys(createRequire(import.meta.url)("react") as Record<string, unknown>);
    const shim = Object.keys(ReactNS);
    // Nothing the real module exports may be missing from the namespace tests
    // see; the only additions are the harness act and vite's CJS interop key.
    expect(real.filter((name) => !shim.includes(name))).toEqual([]);
    expect(shim.filter((name) => !real.includes(name)).sort()).toEqual(["act", "module.exports"]);
  });

  it("sync act commits the render before it returns, so an un-awaited render is visible", () => {
    const { el, root } = mountRoot();
    // The pattern 100+ files use in beforeEach: render without awaiting act.
    act(() => { root.render(<Effectful tag="s" />); });
    expect(el.innerHTML).toContain('data-testid="canary"');
    // "s0", not dev act's "s7": production React offers no synchronous
    // passive-effect flush (a second flushSync does not do it either), so the
    // effect lands on the next scheduler turn — which the async act below and
    // settle()/waitUntil() provide. Pinned because a drift back to dev React
    // would silently turn this into "s7".
    expect(el.textContent).toBe("s0");
  });

  it("async act resolves after the effects and scheduler turns it caused", async () => {
    const { el, root } = mountRoot();
    await act(async () => { root.render(<Effectful tag="a" />); });
    // The effect's setState is committed by the time act resolves.
    expect(el.textContent).toBe("a7");
  });

  it("drains on turns quiet.ts cannot see, so settle() still ends when idle", async () => {
    const { root } = mountRoot();
    act(() => { root.render(<Effectful tag="q" />); });
    const before = trackedTimerCount();
    await act(async () => { await Promise.resolve(); });
    await settle(0);
    // Neither act's drain nor an idle settle may register app timers: if they
    // did, settle would read them as pending work and never report quiet.
    expect(trackedTimerCount()).toBe(before);
  });
});
