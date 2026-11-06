// DOM-only test setup (docs/current/TEST_HARNESS.md), before each DOM file.
// 1. Skip React's dev-only owner-stack capture: every JSX element otherwise
//    builds an `Error("react-stack-top-frame")` (~20% of a DOM test's CPU).
//    It only enriches warning text; REACT_OWNER_STACKS=1 turns it back on.
// DOM files only (a `@vitest-environment node` file has no document):
// 2. Track timers before any app module captures them (helpers/quiet.ts).
// 3. Unmount every React root a test left mounted. A forgotten root keeps its
//    window listeners, autosave timers and DOM alive, so each later test in the
//    file re-renders all earlier panels too (selectionv2_ui grew to ~800 ms/test).
import * as React from "react";
import { act } from "react";
import { afterEach, vi } from "vitest";
import { installQuietTracking } from "../helpers/quiet";

if (process.env.REACT_OWNER_STACKS !== "1") {
  const internals = (React as unknown as Record<string, object>).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  // React tracks an owner stack while this counter is below 1e4 and resets it on every commit.
  Object.defineProperty(internals, "recentlyCreatedOwnerStacks", { configurable: true, get: () => 1e4, set: () => undefined });
}

Reflect.set(globalThis, Symbol.for("iconSplitter.test.domSetup"), true);
installQuietTracking();

const roots = new Set<{ unmount(): void }>();

vi.mock("react-dom/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom/client")>();
  return {
    ...actual,
    createRoot: ((...args: Parameters<typeof actual.createRoot>) => {
      const root = actual.createRoot(...args);
      roots.add(root);
      return root;
    }) as typeof actual.createRoot,
  };
});

afterEach(async () => {
  const left = [...roots];
  roots.clear();
  if (left.length > 0) await act(async () => { for (const root of left) root.unmount(); });
  document.body.replaceChildren();
});
