// What the Getty web upload tells the user while it waits (2026-11-12): the
// helper's reading says what it waits for (a page reload, a re-save, a
// re-upload), which attempt that is and how long is left; the bar shows it with
// a live counter, and "Retry now" asks the helper to skip the wait.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gettyWebProgress, gettyWebSkipWait } from "../src/lib/stockupload/gettyprogress";
import { GettyWaitNote, GettyWaitSkip, waitClock, waitText } from "../src/stockupload/GettyWaitInfo";
import type { UploadProgressStep } from "../src/stockupload/batchtypes";
import ProcessProgressBar from "../src/ui/ProcessProgressBar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const WAIT = {
  kind: "files", reason: "Getty has listed 3 of 10 file(s) and nothing new has appeared",
  next: "reload the Getty page and attach the missing files", remainingMs: 23_000, attempt: 1, of: 2, skippable: true,
};
const reading = (extra: Record<string, unknown> = {}) => ({ ok: true, progress: { phase: "uploading", total: 10, uploaded: 3, failed: 0, listed: 3, reloads: 0, ...extra } });
const respond = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

describe("reading the helper's wait", () => {
  it("passes the wait and what the helper is doing on from the progress reading", async () => {
    const p = await gettyWebProgress("http://h", "k", respond(reading({ wait: WAIT, activity: "Reloading…" })));
    expect(p?.wait).toEqual(WAIT);
    expect(p?.activity).toBe("Reloading…");
  });

  it("a reading without them stays as it was", async () => {
    const p = await gettyWebProgress("http://h", "k", respond(reading()));
    expect(p).not.toHaveProperty("wait");
    expect(p).not.toHaveProperty("activity");
  });

  it("a damaged wait is ignored; the time left is never negative or fractional junk", async () => {
    expect((await gettyWebProgress("http://h", "k", respond(reading({ wait: { kind: 4 } }))))).not.toHaveProperty("wait");
    const p = await gettyWebProgress("http://h", "k", respond(reading({ wait: { ...WAIT, remainingMs: -5 } })));
    expect(p?.wait?.remainingMs).toBe(0);
  });
});

describe("skipping the wait", () => {
  it("asks the helper (POST /getty-web/skip-wait with the run's key) and says whether it skipped", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const fetchImpl = (async (url: string, init: { body: string }) => {
      calls.push({ url, body: init.body });
      return { ok: true, json: async () => ({ ok: true, skipped: true }) };
    }) as unknown as typeof fetch;
    expect(await gettyWebSkipWait("http://127.0.0.1:47391/", "run-7", fetchImpl)).toBe(true);
    expect(calls[0].url).toBe("http://127.0.0.1:47391/getty-web/skip-wait");
    expect(JSON.parse(calls[0].body)).toEqual({ sessionKey: "run-7" });
  });

  it("false when nothing was waiting, the helper is gone or too old to know the route", async () => {
    expect(await gettyWebSkipWait("http://h", "k", respond({ ok: true, skipped: false }))).toBe(false);
    expect(await gettyWebSkipWait("http://h", "k", respond({ ok: false }, false))).toBe(false);
    expect(await gettyWebSkipWait("http://h", "k", (async () => { throw new Error("down"); }) as unknown as typeof fetch)).toBe(false);
  });
});

describe("the words", () => {
  it("a clock as m:ss", () => {
    expect([0, 999, 1_000, 23_400, 59_999, 83_000, 600_000].map(waitClock)).toEqual(["0:00", "0:00", "0:01", "0:23", "0:59", "1:23", "10:00"]);
  });

  it("while waiting: the time left, what comes next and which attempt", () => {
    expect(waitText(WAIT, 23_000)).toBe("Waiting 0:23 — then: reload the Getty page and attach the missing files (1 of 2)");
  });

  it("when the time is up the next step is said as happening now; no attempt, no brackets", () => {
    expect(waitText({ ...WAIT, attempt: undefined, of: undefined }, 0)).toBe("Now: reload the Getty page and attach the missing files");
  });
});

describe("the bar's note and button", () => {
  let host: HTMLDivElement;
  let ui: Root;
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(5_000_000); host = document.createElement("div"); document.body.append(host); ui = createRoot(host); });
  afterEach(() => { act(() => ui.unmount()); host.remove(); vi.useRealTimers(); });
  const q = (sel: string) => host.querySelector<HTMLElement>(sel);
  const step = (extra: Partial<UploadProgressStep> = {}): UploadProgressStep => ({ done: 3, total: 10, label: "Getty: 3 of 10", ...extra });
  const waiting = (extra: Record<string, unknown> = {}) => ({ wait: { ...WAIT, readAt: Date.now(), ...extra } });
  const render = (node: React.ReactNode) => act(async () => { ui.render(<>{node}</>); });

  it("shows nothing when nothing is waited for", async () => {
    await render(<GettyWaitNote step={step()} />);
    expect(q("[data-testid=stock-upload-wait]")).toBeNull();
    expect(q("[data-testid=stock-upload-activity]")).toBeNull();
  });

  it("shows the counter, the next step and the reason — and keeps counting down by itself", async () => {
    await render(<GettyWaitNote step={step(waiting())} />);
    const text = () => q("[data-testid=stock-upload-wait]")?.textContent ?? "";
    expect(text()).toContain("0:23");
    expect(text()).toContain("reload the Getty page");
    expect(text()).toContain("1 of 2");
    expect(text()).toContain("nothing new has appeared");
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(text()).toContain("0:18");
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(text()).toMatch(/Now: reload the Getty page/); // the time is up: the step is said as happening now
  });

  it("with no wait, says what the helper is doing", async () => {
    await render(<GettyWaitNote step={step({ activity: "Reloading the Getty page (reload 1 of 2)…" })} />);
    expect(q("[data-testid=stock-upload-wait]")).toBeNull();
    expect(q("[data-testid=stock-upload-activity]")?.textContent).toContain("Reloading the Getty page (reload 1 of 2)");
  });

  it("Retry now asks to skip; a deadline (not a retry timer) has no button", async () => {
    const skipWait = vi.fn();
    await render(<GettyWaitSkip step={step({ ...waiting(), skipWait })} />);
    const button = q("[data-testid=stock-upload-wait-skip]") as HTMLButtonElement;
    expect(button.textContent).toMatch(/Retry now/);
    await act(async () => { button.click(); });
    expect(skipWait).toHaveBeenCalledTimes(1);
    await render(<GettyWaitSkip step={step({ ...waiting({ skippable: false }), skipWait })} />);
    expect(q("[data-testid=stock-upload-wait-skip]")).toBeNull();
    await render(<GettyWaitSkip step={step({ skipWait })} />); // nothing is waiting
    expect(q("[data-testid=stock-upload-wait-skip]")).toBeNull();
  });

  it("a wait that gives up early says so on its button instead of Retry now (2026-11-12)", async () => {
    await render(<GettyWaitSkip step={step({ ...waiting({ kind: "reattach", skipLabel: "Skip wait" }), skipWait: vi.fn() })} />);
    expect(q("[data-testid=stock-upload-wait-skip]")?.textContent).toMatch(/Skip wait/);
  });
});

describe("the skip label travels with the reading", () => {
  it("passes skipLabel on, and drops a damaged one", async () => {
    const ok = await gettyWebProgress("http://h", "k", respond(reading({ wait: { ...WAIT, skipLabel: "Skip wait" } })));
    expect(ok?.wait?.skipLabel).toBe("Skip wait");
    const bad = await gettyWebProgress("http://h", "k", respond(reading({ wait: { ...WAIT, skipLabel: 7 } })));
    expect(bad?.wait).not.toHaveProperty("skipLabel");
  });
});

describe("in the shared bar", () => {
  let host: HTMLDivElement;
  let ui: Root;
  beforeEach(() => { host = document.createElement("div"); document.body.append(host); ui = createRoot(host); });
  afterEach(() => { act(() => ui.unmount()); host.remove(); });
  const bar = (status: "running" | "completed") => (
    <ProcessProgressBar prefix="t" theme="svg" title="Uploading" detail="d" done={3} total={10} remaining={7} percent={30}
      status={status} runId="r" onCancel={() => {}} onReview={() => {}} onDismiss={() => {}}
      note={<span data-testid="the-note">waiting 0:23</span>} runningExtra={<button data-testid="the-extra" type="button">Retry now</button>} />
  );

  it("a note and an extra button sit in the running bar next to Cancel; a finished bar drops the button", async () => {
    await act(async () => { ui.render(bar("running")); });
    const header = host.querySelector("[data-testid=t-progress-header]") as HTMLElement;
    expect(header.querySelector("[data-testid=the-note]")).not.toBeNull();
    expect(header.querySelector("[data-testid=the-extra]")).not.toBeNull();
    await act(async () => { ui.render(bar("completed")); });
    expect(host.querySelector("[data-testid=the-extra]")).toBeNull();
  });
});

describe("wired", () => {
  it("the stock upload bar shows the note and the Retry now button", () => {
    const src = readFileSync("src/stockupload/StockUploadDialogs.tsx", "utf8");
    expect(src).toContain("<GettyWaitNote");
    expect(src).toContain("<GettyWaitSkip");
    expect(src).toContain("runningExtra=");
  });
});
