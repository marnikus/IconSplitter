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

// DOM tests never use the live network: unmocked model discovery gets a tiny
// offline catalog; other external requests fail closed. A test's own
// vi.stubGlobal("fetch", …) still overrides this transport.
{
  const real = globalThis.fetch?.bind(globalThis);
  const HELPER_ONLY = /\/(open-folder|find-folder)(\?|$)/;
  const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1"]);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (HELPER_ONLY.test(url)) return new Response(JSON.stringify({ ok: false, reason: "tests never open or search real folders" }), { status: 200 });
    const target = new URL(url, globalThis.location.href);
    if (target.origin !== globalThis.location.origin && !LOOPBACK.has(target.hostname)) {
      if (target.hostname === "router.requesty.ai" && target.pathname.endsWith("/models") && (init?.method ?? "GET") === "GET") return new Response(JSON.stringify({ data: [] }), { status: 200 });
      return new Response(JSON.stringify({ error: "external requests are disabled in tests" }), { status: 503 });
    }
    if (real === undefined) throw new TypeError("fetch is not available");
    return real(input, init);
  }) as typeof fetch;
}
