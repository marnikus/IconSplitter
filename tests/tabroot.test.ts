// tabroot.test.ts — the ONE way a tab gets its remembered folder back after a
// reload (2026-11-28). Every tab used its own boot: only Generate SVG knew that
// the browser returns a remembered folder WITHOUT read access until a click,
// so the SVG builder (and the others) scanned anyway, failed and showed an
// empty tab. These tests run the same contract for every tab.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DirHandleLike } from "../src/lib/fs";

const store = vi.hoisted(() => ({
  map: new Map<string, unknown>(),
  mode: "ok" as "ok" | "hang" | "throw",
  saveFails: false,
}));
vi.mock("../src/batch/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/batch/store")>()),
  loadHandles: vi.fn((key: string) => {
    if (store.mode === "hang") return new Promise(() => undefined);
    if (store.mode === "throw") return Promise.reject(new Error("idb"));
    return Promise.resolve(store.map.get(key) ?? null);
  }),
  saveHandles: vi.fn(async (key: string, handles: unknown) => {
    if (store.saveFails) throw new Error("idb");
    store.map.set(key, handles);
  }),
}));

import { LOCKED_NOTE, ROOT_KEYS, TAB_ROOTS, bootTabRoot, openTabRoot, rememberTabRoot, storedRoot, type RootTab } from "../src/state/tabroot";

type Access = "granted" | "prompt" | "denied";

/** A folder as the browser hands it back: `state` is what it answers until asked on a click. */
function folder(name: string, state: Access | "silent" = "granted", onAsk: Access = "granted") {
  let now: Access | "silent" = state;
  const request = vi.fn(async () => { now = onAsk; return onAsk; });
  const handle = {
    kind: "directory", name,
    queryPermission: () => (now === "silent" ? new Promise<string>(() => undefined) : Promise.resolve(now)),
    requestPermission: request,
  } as unknown as DirHandleLike;
  return { handle, request };
}

const hooks = () => ({ show: vi.fn(), scan: vi.fn(async () => undefined), say: vi.fn() });

beforeEach(() => { store.map.clear(); store.mode = "ok"; store.saveFails = false; });
afterEach(() => { vi.useRealTimers(); });

describe.each(TAB_ROOTS)("the remembered folder of the %s tab", (tab: RootTab) => {
  it("comes back, is shown, and is scanned when the browser still allows it", async () => {
    const { handle } = folder("icons");
    store.map.set(ROOT_KEYS[tab], { source: handle });
    const on = hooks();
    const got = await bootTabRoot(tab, on);
    expect(got).toEqual({ handle, access: "open" });
    expect(on.show).toHaveBeenCalledWith(handle);
    expect(on.scan).toHaveBeenCalledWith(handle);
    expect(on.show.mock.invocationCallOrder[0]).toBeLessThan(on.scan.mock.invocationCallOrder[0]);
  });

  it("is shown but NOT scanned while the browser wants a click first — and says so", async () => {
    const { handle, request } = folder("icons", "prompt");
    store.map.set(ROOT_KEYS[tab], { source: handle });
    const on = hooks();
    const got = await bootTabRoot(tab, on);
    expect(got?.access).toBe("locked");
    expect(on.show).toHaveBeenCalledWith(handle);
    expect(on.scan).not.toHaveBeenCalled();
    expect(on.say).toHaveBeenCalledWith(LOCKED_NOTE);
    expect(request).not.toHaveBeenCalled(); // a page load has no click to spend
  });

  it("is scanned anyway when the browser does not answer about access", async () => {
    vi.useFakeTimers();
    const { handle } = folder("icons", "silent");
    store.map.set(ROOT_KEYS[tab], { source: handle });
    const on = hooks();
    const run = bootTabRoot(tab, on);
    await vi.advanceTimersByTimeAsync(5000);
    expect((await run)?.access).toBe("open");
    expect(on.scan).toHaveBeenCalledTimes(1);
  });

  it("gives up on a store that never answers instead of holding the tab", async () => {
    vi.useFakeTimers();
    store.mode = "hang";
    const on = hooks();
    let done: unknown = "pending";
    void bootTabRoot(tab, on).then((v) => { done = v; });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(done).toBeNull();
    expect(on.show).not.toHaveBeenCalled();
  });

  it("reads a failing store as no folder, never as an error", async () => {
    store.mode = "throw";
    await expect(bootTabRoot(tab, hooks())).resolves.toBeNull();
  });

  it("keeps a picked folder under the tab's own key, and a failed save never throws", async () => {
    const { handle } = folder("picked");
    await expect(rememberTabRoot(tab, handle)).resolves.toBe(true);
    expect(await storedRoot(ROOT_KEYS[tab])).toBe(handle);
    store.saveFails = true;
    await expect(rememberTabRoot(tab, handle)).resolves.toBe(false);
  });

  it("a failing scan never fails the boot", async () => {
    const { handle } = folder("icons");
    store.map.set(ROOT_KEYS[tab], { source: handle });
    const on = { ...hooks(), scan: vi.fn(async () => { throw new Error("unreadable"); }) };
    await expect(bootTabRoot(tab, on)).resolves.toEqual({ handle, access: "open" });
  });
});

describe("a tab without a folder of its own", () => {
  it("borrows another tab's folder, in a fixed order", async () => {
    const sel = folder("from-selection").handle;
    const svg = folder("from-svg").handle;
    store.map.set(ROOT_KEYS.selection, { source: sel });
    expect((await bootTabRoot("svg", hooks()))?.handle).toBe(sel);
    store.map.set(ROOT_KEYS.svg, { source: svg });
    for (const tab of ["upload", "builder", "stock"] as const) expect((await bootTabRoot(tab, hooks()))?.handle).toBe(svg);
    expect(await bootTabRoot("selection", hooks())).toEqual({ handle: sel, access: "open" });
  });

  it("Selection never borrows", async () => {
    store.map.set(ROOT_KEYS.svg, { source: folder("svg").handle });
    expect(await bootTabRoot("selection", hooks())).toBeNull();
  });

  it("the builder keeps a borrowed folder as its own (its removals find their files through it)", async () => {
    const sel = folder("from-selection").handle;
    store.map.set(ROOT_KEYS.selection, { source: sel });
    await bootTabRoot("builder", hooks());
    expect(await storedRoot(ROOT_KEYS.builder)).toBe(sel);
  });
});

describe("the click that re-opens a remembered folder", () => {
  it("asks the browser once and reports the folder open", async () => {
    const { handle, request } = folder("icons", "prompt");
    const say = vi.fn();
    expect(await openTabRoot(handle, say)).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(say).not.toHaveBeenCalled();
  });

  it("does not ask when access is already there", async () => {
    const { handle, request } = folder("icons");
    expect(await openTabRoot(handle, vi.fn())).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it("says that access was refused, naming the folder", async () => {
    const { handle } = folder("icons", "prompt", "denied");
    const say = vi.fn();
    expect(await openTabRoot(handle, say)).toBe(false);
    expect(say).toHaveBeenCalledWith(expect.stringContaining('"icons"'), true);
  });

  it("still asks when the browser does not answer the quiet check", async () => {
    vi.useFakeTimers();
    const { handle, request } = folder("icons", "silent");
    const run = openTabRoot(handle, vi.fn());
    await vi.advanceTimersByTimeAsync(5000);
    expect(await run).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("no folder is no access", async () => {
    expect(await openTabRoot(null, vi.fn())).toBe(false);
  });
});

describe("one folder system", () => {
  it("no tab reads or writes the folder store by itself — only state/tabroot (and Batch's two-folder presets)", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const allowed = ["src/state/tabroot.ts", "src/batch/store.ts", "src/batch/useBatch.ts"];
    const files = (readdirSync("src", { recursive: true }) as string[])
      .map((f) => `src/${f.split("\\").join("/")}`)
      .filter((f) => /\.tsx?$/.test(f) && !allowed.includes(f));
    const own = files.filter((f) => /\b(loadHandles|saveHandles)\b/.test(readFileSync(f, "utf8")));
    expect(own).toEqual([]);
  });
});
