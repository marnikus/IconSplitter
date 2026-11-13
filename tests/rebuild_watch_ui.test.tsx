// The rebuilt page reloads itself, says so in one line, and holds the reload
// while an upload is in flight. Driven through the real hook + toast.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markRunning } from "../src/lib/runbusy";
import { NOTICE_KEY, rememberNotice } from "../src/lib/updatewatch";
import RebuildToast, { useRebuildWatch, type WatchOpts } from "../src/ui/rebuildwatch";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OWN = "own-stamp";
const NEW = "new-stamp";

let host: HTMLDivElement | null = null;
let root: Root | null = null;

function health(served: string): Response {
  return {
    ok: true,
    json: async () => ({
      ok: true,
      update: { watching: true, commit: "2ca183c9f0", restarts: 1, served: { stamp: served, builtAt: "2026-10-31T23:41:12.000Z" } },
    }),
  } as unknown as Response;
}

interface Harness { reloads: number; reload: () => void }

function Harness({ opts }: { opts: WatchOpts }) {
  const w = useRebuildWatch(opts);
  return <RebuildToast notice={w.notice} onDismiss={w.dismiss} onAction={w.reloadNow} />;
}

async function mount(opts: WatchOpts): Promise<Harness> {
  const h: Harness = {
    reloads: 0,
    reload: () => { h.reloads += 1; },
  };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root!.render(<Harness opts={{ ...opts, reload: h.reload }} />); });
  return h;
}

function toast(): HTMLElement | null {
  return document.querySelector("[data-testid=rebuild-toast]");
}

function text(id: string): string | null {
  return document.querySelector(`[data-testid=${id}]`)?.textContent ?? null;
}

async function tick(ms = 100): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

beforeEach(() => {
  vi.useFakeTimers();
  document.head.innerHTML = `<meta name="iconsplitter-src-hash" content="${OWN}" />`;
  globalThis.sessionStorage.clear();
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = null;
  host?.remove();
  host = null;
  document.head.innerHTML = "";
  markRunning("stock-upload", false);
  vi.useRealTimers();
});

describe("the page swaps bundles by itself", () => {
  it("reloads when the helper serves a new bundle and shows the confirmation line", async () => {
    const fetchImpl = vi.fn(async (_url: string) => health(NEW));
    const h = await mount({ pollMs: 100, fetchImpl });
    await tick();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(`${globalThis.location.origin}/health`);
    expect(text("rebuild-toast-detail")).toMatch(/reloading this page now/i);
    expect(h.reloads).toBe(0); // the line is readable for a moment first
    await tick(1000);
    expect(h.reloads).toBe(1);
  });

  it("leaves the page alone when the helper serves the bundle this tab already runs", async () => {
    const h = await mount({ pollMs: 100, fetchImpl: vi.fn(async () => health(OWN)) });
    await tick();
    await tick(1000);
    expect(toast()).toBeNull();
    expect(h.reloads).toBe(0);
  });

  it("does nothing on a page that carries no build stamp (the dev server)", async () => {
    document.head.innerHTML = "";
    const fetchImpl = vi.fn(async () => health(NEW));
    const h = await mount({ pollMs: 100, fetchImpl });
    await tick();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(h.reloads).toBe(0);
  });

  it("asks again after a failed poll instead of giving up", async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error("helper restarting"))
      .mockResolvedValueOnce(health(NEW));
    const h = await mount({ pollMs: 100, fetchImpl });
    await tick();
    expect(h.reloads).toBe(0);
    await tick(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await tick(1000);
    expect(h.reloads).toBe(1);
  });
});

describe("the reload never lands inside a run", () => {
  it("holds the reload while an upload is in flight, then goes once it ends", async () => {
    markRunning("stock-upload", true);
    const h = await mount({ pollMs: 100, fetchImpl: vi.fn(async () => health(NEW)) });
    await tick();
    expect(text("rebuild-toast-title")).toBe("New build ready");
    expect(text("rebuild-toast-detail")).toMatch(/when this run finishes/i);
    await tick(2000);
    expect(h.reloads).toBe(0); // still uploading: the transfer is not cut
    markRunning("stock-upload", false);
    await tick(200);
    await tick(1000);
    expect(h.reloads).toBe(1);
  });

  it("lets the reader start the held reload early", async () => {
    markRunning("stock-upload", true);
    const h = await mount({ pollMs: 100, fetchImpl: vi.fn(async () => health(NEW)) });
    await tick();
    const action = document.querySelector("[data-testid=rebuild-toast-action]") as HTMLButtonElement;
    await act(async () => { action.click(); });
    expect(h.reloads).toBe(1);
  });

  it("stops asking once the reader waves the notice away", async () => {
    markRunning("stock-upload", true);
    const h = await mount({ pollMs: 100, fetchImpl: vi.fn(async () => health(NEW)) });
    await tick();
    expect(toast()).not.toBeNull();
    await act(async () => { (document.querySelector("[data-testid=rebuild-toast-dismiss]") as HTMLButtonElement).click(); });
    expect(toast()).toBeNull();
    await tick(3000);
    expect(h.reloads).toBe(0);
  });
});

describe("the confirmation after the swap", () => {
  it("shows the build the previous page left behind, once", async () => {
    globalThis.sessionStorage.setItem(NOTICE_KEY, rememberNotice({ commit: "2ca183c9f0", builtAt: "2026-10-31T23:41:12.000Z" }));
    const h = await mount({ pollMs: 100, fetchImpl: vi.fn(async () => health(OWN)) });
    await tick();
    expect(text("rebuild-toast-title")).toBe("New build is running");
    expect(text("rebuild-toast-detail")).toContain("2ca183c");
    expect(globalThis.sessionStorage.getItem(NOTICE_KEY)).toBeNull(); // shown once only
    await tick(9000);
    expect(toast()).toBeNull();
    expect(h.reloads).toBe(0);
  });
});
