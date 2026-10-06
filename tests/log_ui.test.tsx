// log_ui.test.tsx — the docked log panel (feature §2): one instance on every
// tab, minimize/restore that survives a restart, Copy all == the visible text,
// Clear, the entry cap, and the auto-scroll rule — it follows the tail only
// while the reader is at the bottom, and resumes when they come back.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatLogText } from "../src/lib/log";
import { LOG_KEY, flushLog, getLogState, log, resetLogStore } from "../src/log/logstore";
import { readKey } from "../src/state/safestorage";
import { resetAppStore } from "../src/state/appstore";
import Workbench from "../src/ui/Workbench";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const KEY = ["rq", "live", "QwErTy7UiOpAsDfGh4JkLzXcVbNm2"].join("_");
const TABS = ["tab-sheets", "tab-batch", "tab-selection", "tab-selection-v2", "tab-generate-svg"];

let host: HTMLDivElement;
let ui: Root;

const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const rows = () => Array.from(host.querySelectorAll("[data-testid=log-entry]")).map((li) => li.textContent ?? "");
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const click = async (sel: string) => {
  await act(async () => { (q(sel) as HTMLButtonElement).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle();
};
/** React reads the native value setter, so the change must go through it. */
const choose = async (sel: string, value: string) => {
  const el = q(sel) as HTMLSelectElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  await act(async () => {
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
};
/** Adds entries inside act, so the panel updates exactly as in the app. */
const write = async (...specs: Parameters<typeof log>[0][]) => {
  await act(async () => { for (const spec of specs) log(spec); });
};

/** happy-dom paints no layout: give the scroll box real metrics. */
function sizeBody(scrollHeight: number, clientHeight = 200): HTMLElement {
  const body = q("[data-testid=log-body]") ?? (() => { throw new Error("log body is not mounted"); })();
  Object.defineProperty(body, "scrollHeight", { value: scrollHeight, configurable: true });
  Object.defineProperty(body, "clientHeight", { value: clientHeight, configurable: true });
  return body;
}
const scrollTo = async (body: HTMLElement, top: number) => {
  await act(async () => {
    body.scrollTop = top;
    body.dispatchEvent(new Event("scroll"));
  });
};

function mount(): void {
  host = document.createElement("div");
  document.body.appendChild(host);
  ui = createRoot(host);
  act(() => { ui.render(<Workbench />); });
}

beforeEach(() => {
  localStorage.clear();
  resetAppStore();
  resetLogStore();
  mount();
});

afterEach(() => {
  act(() => ui.unmount());
  host.remove();
  localStorage.clear();
  resetLogStore();
  vi.restoreAllMocks();
});

describe("the log dock", () => {
  it("is docked on every tab, with its head, body and empty state", async () => {
    expect(q("[data-testid=log-dock]")).not.toBeNull();
    expect(q("[data-testid=log-empty]")).not.toBeNull();
    for (const tab of TABS) {
      await click(`[data-testid=${tab}]`);
      expect(q("[data-testid=log-dock]")).not.toBeNull();
      expect(q("[data-testid=log-head]")).not.toBeNull();
      expect(q("[data-testid=log-body]")).not.toBeNull();
    }
    // the dock lives above the panels, so the tab switches it recorded are the
    // same entries on every tab — one instance, one history (feature §2)
    const switches = getLogState().entries.filter((e) => e.action === "open-tab");
    expect(switches.map((e) => e.detail)).toEqual([
      "tab=sheets", "tab=batch", "tab=selection", "tab=selectionV2", "tab=generateSvg",
    ]);
  });

  it("records entries in order and shows level, feature and action", async () => {
    await write({ feature: "app", action: "open-tab", detail: "tab=batch" });
    await write({ level: "error", feature: "svg", action: "request-failed", ids: { batch: "batch_1_4" }, detail: "500 boom" });

    expect(rows()).toHaveLength(2);
    expect(rows()[0]).toContain("app.open-tab");
    expect(rows()[1]).toContain("svg.request-failed");
    expect(rows()[1]).toContain("batch=batch_1_4");
    expect(rows()[1]).toContain("ERROR");
    expect(q("[data-testid=log-autoscroll]")?.textContent).toContain("following");
    expect(q("[data-testid=log-body]")?.getAttribute("role")).toBe("log");
  });

  it("never shows a key, even when the entry was written with one", async () => {
    await write({ feature: "svg", action: "key-saved", detail: `stored ${KEY}`, data: { apiKey: KEY } });
    expect(rows()[0]).not.toContain(KEY);
    expect(rows()[0]).toContain("•");
    expect(readKey(LOG_KEY) ?? "").not.toContain(KEY);
  });

  it("follows the tail while the reader is at the bottom", async () => {
    await write({ feature: "app", action: "first" });
    const body = sizeBody(1_000);

    await write({ feature: "app", action: "second" });
    expect(body.scrollTop).toBe(1_000); // scrolled to the tail

    // the content grows: a following panel keeps the newest entry in view
    Object.defineProperty(body, "scrollHeight", { value: 1_400, configurable: true });
    await write({ feature: "app", action: "third" });
    expect(body.scrollTop).toBe(1_400);
  });

  it("stops following when the reader scrolls up and resumes at the bottom", async () => {
    await write({ feature: "app", action: "first" });
    const body = sizeBody(1_000);

    await scrollTo(body, 100);
    expect(q("[data-testid=log-autoscroll]")?.textContent).toContain("paused");

    Object.defineProperty(body, "scrollHeight", { value: 2_000, configurable: true });
    await write({ feature: "app", action: "while-reading" });
    expect(body.scrollTop).toBe(100); // the view was not yanked away

    await scrollTo(body, 2_000);
    expect(q("[data-testid=log-autoscroll]")?.textContent).toContain("following");
    Object.defineProperty(body, "scrollHeight", { value: 2_400, configurable: true });
    await write({ feature: "app", action: "back-at-the-bottom" });
    expect(body.scrollTop).toBe(2_400);
  });

  it("copies exactly the text the panel is built from, and says so", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await write({ feature: "svg", action: "run-start", data: { batches: 2 } });
    const shown = formatLogText(getLogState().entries);

    await click("[data-testid=log-copy]");

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(shown); // exactly the entries that were visible
    expect(q("[data-testid=log-note]")?.textContent).toContain("Copied");
  });

  it("clears down to one honest entry, and persists that", async () => {
    await write({ feature: "app", action: "a" }, { feature: "app", action: "b" });
    await click("[data-testid=log-clear]");

    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toContain("log.cleared");
    expect(readKey(LOG_KEY) ?? "").toContain('"action":"cleared"');
    expect(readKey(LOG_KEY) ?? "").not.toContain('"action":"a"');
  });

  it("trims displayed and stored entries when the cap changes", async () => {
    const specs = Array.from({ length: 120 }, (_, i) => ({ feature: "svg", action: `step-${i}` }));
    await write(...specs);
    expect(rows()).toHaveLength(120);
    expect(q("[data-testid=log-count]")?.textContent).toContain("120 of 200");

    await choose("[data-testid=log-max]", "50");

    expect(rows()).toHaveLength(50);
    // the cap change is itself the newest entry, so it pushed step-70 out
    expect(rows()[0]).toContain("step-71");
    expect(rows()[49]).toContain("log.max-entries");
    expect(getLogState().max).toBe(50);
    expect(readKey(LOG_KEY) ?? "").toContain('"max":50');
  });

  it("minimizes and restores, and remembers the choice across a restart", async () => {
    await write({ feature: "app", action: "kept" });
    await click("[data-testid=log-minimize]");
    expect(q("[data-testid=log-body]")).toBeNull();
    expect(q("[data-testid=log-minimize]")?.textContent).toContain("Restore");

    flushLog();
    act(() => ui.unmount());
    ui = createRoot(host);
    act(() => { ui.render(<Workbench />); });

    expect(q("[data-testid=log-body]")).toBeNull();
    expect(rows()).toEqual([]); // nothing is rendered while minimized
    await click("[data-testid=log-minimize]");
    expect(q("[data-testid=log-body]")).not.toBeNull();
    expect(rows()[0]).toContain("app.kept");
  });
});
