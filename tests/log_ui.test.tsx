// log_ui.test.tsx — the global log dock through the REAL Workbench (RULE 8): on
// every tab, minimise/restore, Copy all, Clear, the max choice, and the
// follow-scroll behaviour. happy-dom has no layout, so scroll geometry is stubbed
// on the prototype (the rules themselves are unit-tested as numbers in
// log_scroll.test.ts); everything else — store, storage, clipboard — is real or
// an in-memory stand-in.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TAB_IDS } from "../src/lib/session";
import { log } from "../src/log/logger";
import { LOG_KEY, PREFS_KEY } from "../src/log/logstorage";
import { copyAllText, flushLog, getLog, hydrate, resetLog } from "../src/log/logstore";
import { resetBoot } from "../src/log/boot";
import { resetAppStore } from "../src/state/appstore";
import Workbench from "../src/ui/Workbench";
import { FakeStorage } from "./helpers/fakestorage";
import { entry, input } from "./helpers/logfix";
import { stubOffline } from "./helpers/svgrun";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let ui: Root;
let disk: FakeStorage;
/** Every value written to any element's scrollTop, and the values read back. */
const writes: number[] = [];
const tops = new WeakMap<object, number>();
const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const all = (sel: string) => [...host.querySelectorAll(sel)] as HTMLElement[];
const text = (sel: string) => q(sel)?.textContent ?? "";
const say = (message: string, level: "info" | "warn" | "error" = "info") => act(() => { log(input({ message, level })); });

async function click(sel: string): Promise<void> {
  await act(async () => { (q(sel) as HTMLElement).click(); });
}

async function mount(): Promise<void> {
  host = document.createElement("div");
  document.body.appendChild(host);
  ui = createRoot(host);
  await act(async () => { ui.render(<Workbench />); });
}

function stubGeometry(): void {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => 1000 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 200 });
  Object.defineProperty(HTMLElement.prototype, "scrollTop", {
    configurable: true,
    get() { return tops.get(this) ?? 0; },
    set(v: number) { tops.set(this, v); writes.push(v); },
  });
}

function scrollTo(el: HTMLElement, top: number): void {
  tops.set(el, top);
  act(() => { el.dispatchEvent(new Event("scroll")); });
}

beforeEach(async () => {
  disk = new FakeStorage();
  vi.stubGlobal("localStorage", disk);
  stubOffline();
  writes.length = 0;
  stubGeometry();
  resetLog();
  resetBoot();
  resetAppStore();
  document.documentElement.style.removeProperty("--log-dock-h");
  await mount();
});

afterEach(async () => {
  await act(async () => { ui.unmount(); });
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const prop of ["scrollHeight", "clientHeight", "scrollTop"]) Reflect.deleteProperty(HTMLElement.prototype, prop);
});

describe("the dock on every tab", () => {
  it("exists on each tab and shows the same entries after each switch (L-7)", async () => {
    await say("written before any switch");
    const tabs = { sheets: "tab-sheets", batch: "tab-batch", selection: "tab-selection", selectionV2: "tab-selection-v2", generateSvg: "tab-generate-svg" };
    expect(Object.keys(tabs).sort()).toEqual([...TAB_IDS].sort());
    for (const id of TAB_IDS) {
      await click(`[data-testid=${tabs[id]}]`);
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
      expect(q("[data-testid=log-dock]"), id).not.toBeNull();
      expect(all("[data-testid=log-row]").some((r) => r.textContent?.includes("written before any switch")), id).toBe(true);
    }
  });

  it("keeps logging while the panel that started a thing is gone, and shows it when it is back", async () => {
    await click("[data-testid=tab-batch]");
    await say("from the batch tab");
    await click("[data-testid=tab-sheets]");
    expect(all("[data-testid=log-row]").map((r) => r.textContent).join("\n")).toContain("from the batch tab");
  });

  it("is a labelled region and a polite-by-silence log: role=log, aria-live=off", () => {
    expect(q("[data-testid=log-dock]")?.getAttribute("aria-label")).toBe("Application log");
    const list = q("[data-testid=log-list]");
    expect(list?.getAttribute("role")).toBe("log");
    expect(list?.getAttribute("aria-live")).toBe("off");
    expect(list?.getAttribute("tabindex")).toBe("0");
  });
});

describe("rows", () => {
  it("shows an append in the same tick, with the level as a word and a glyph", async () => {
    await say("hello");
    await say("careful", "warn");
    await say("broken", "error");
    const rows = all("[data-testid=log-row]");
    expect(rows.map((r) => r.getAttribute("data-entry-id"))).toEqual(getLog().entries.map((e) => e.id));
    expect(rows[0].textContent).toContain("ⓘ INFO");
    expect(rows[1].textContent).toContain("▲ WARN");
    expect(rows[2].textContent).toContain("✖ ERROR");
    expect(rows[2].textContent).toContain("broken");
  });

  it("shows the time as local HH:mm:ss.SSS with the ISO time as its tooltip, and a folded repeat as ×N", async () => {
    await say("again");
    await say("again");
    const row = q("[data-testid=log-row]") as HTMLElement;
    expect(row.querySelector("time")?.textContent).toMatch(/^\d\d:\d\d:\d\d\.\d{3}$/);
    expect(row.querySelector("time")?.getAttribute("title")).toBe(getLog().entries[0].at);
    expect(row.textContent).toContain("×2");
  });

  it("draws a break where the session changes", async () => {
    await act(async () => { hydrate({ entries: [entry({ id: "old-1", sid: "old", message: "from an earlier session" })], status: "ok" }, getLog().prefs); });
    await say("this session");
    const breaks = all("[data-testid=log-session]").map((b) => b.textContent ?? "");
    expect(breaks).toHaveLength(2);
    expect(breaks[0]).toContain("session old");
    expect(breaks[1]).toContain(`session ${getLog().entries[1].sid}`);
  });

  it("says what an empty log means, and not the same thing as a log that could not be read or saved", async () => {
    expect(text("[data-testid=log-empty]")).toBe("No entries yet");
    expect(q("[data-testid=log-persist]")).toBeNull();
    expect(q("[data-testid=log-restore]")).toBeNull();
    disk.failSet = true;
    await say("boom", "error");
    expect(text("[data-testid=log-persist]")).toContain("Not saved to this browser");
    expect(q("[data-testid=log-empty]")).toBeNull();
  });

  it("says when the previous log could not be read", async () => {
    await act(async () => { ui.unmount(); });
    host.remove();
    disk.setItem(LOG_KEY, "{oops");
    resetLog();
    resetBoot();
    const { bootLog } = await import("../src/log/boot");
    bootLog();
    await mount();
    expect(text("[data-testid=log-restore]")).toContain("could not be read");
  });
});

describe("minimise and restore", () => {
  it("flips aria-expanded, hides the list, keeps the count and publishes its height", async () => {
    await say("one");
    const toggle = q("[data-testid=log-toggle]") as HTMLElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-controls")).toBeTruthy();
    expect(document.documentElement.style.getPropertyValue("--log-dock-h")).toMatch(/clamp/);
    await click("[data-testid=log-toggle]");
    expect((q("[data-testid=log-toggle]") as HTMLElement).getAttribute("aria-expanded")).toBe("false");
    expect(q("[data-testid=log-list]")).toBeNull();
    expect(text("[data-testid=log-count]")).toContain("1");
    expect(document.documentElement.style.getPropertyValue("--log-dock-h")).toBe("32px");
    await click("[data-testid=log-toggle]");
    expect(q("[data-testid=log-list]")).not.toBeNull();
  });

  it("offers the same button names whichever state it is in", async () => {
    expect((q("[data-testid=log-toggle]") as HTMLElement).textContent).toContain("Minimize log");
    await click("[data-testid=log-toggle]");
    expect((q("[data-testid=log-toggle]") as HTMLElement).textContent).toContain("Restore log");
  });

  it("remembers the choice across a remount", async () => {
    await click("[data-testid=log-toggle]");
    flushLog();
    await act(async () => { ui.unmount(); });
    host.remove();
    resetLog();
    resetBoot();
    const { bootLog } = await import("../src/log/boot");
    bootLog();
    await mount();
    expect(q("[data-testid=log-list]")).toBeNull();
    expect(JSON.parse(disk.getItem(PREFS_KEY) ?? "{}")).toMatchObject({ minimized: true });
  });

  it("removes its clearance when it goes away", async () => {
    await act(async () => { ui.unmount(); });
    expect(document.documentElement.style.getPropertyValue("--log-dock-h")).toBe("0px");
    await mount();
  });

  it("keeps showing unseen errors while minimised — minimising never hides an error", async () => {
    await click("[data-testid=log-toggle]");
    await say("fine");
    await say("bad", "error");
    expect(text("[data-testid=log-badge]")).toContain("2");
    expect(text("[data-testid=log-errors]")).toContain("1");
  });
});

describe("actions", () => {
  it("copies exactly what copyAllText says and reports it", async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t: string) => { written.push(t); } } });
    await say("one");
    await say("two");
    await click("[data-testid=log-copy]");
    expect(written).toHaveLength(1);
    expect(written[0].split("\n").slice(1)).toEqual(copyAllText().split("\n").slice(1).slice(0, written[0].split("\n").length - 1));
    expect(written[0].split("\n")[0]).toContain("entries");
    expect(text("[data-testid=log-status]")).toMatch(/^Copied \d+ entries$/);
  });

  it("says so when the browser blocks the clipboard, and tells the log", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } });
    await say("one");
    await click("[data-testid=log-copy]");
    expect(text("[data-testid=log-status]")).toBe("Clipboard is blocked by the browser — select the log text and copy it");
    expect(getLog().entries.some((e) => e.action === "copy" && e.data.ok === false)).toBe(true);
  });

  it("clears at once, with no confirmation, and leaves one breadcrumb", async () => {
    await say("one");
    await say("two");
    await click("[data-testid=log-clear]");
    expect(all("[data-testid=log-row]")).toHaveLength(1);
    expect(q("[data-testid=log-row]")?.textContent).toContain("Log cleared");
  });

  it("lowers the maximum to 100 and shows at most 100 rows at once", async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 150; i++) {
      await say(`row ${i}`);
      vi.setSystemTime(Date.now() + 20);
    }
    const select = q("[data-testid=log-max]") as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["100", "250", "500", "1000", "2000", "5000"]);
    expect(select.value).toBe("1000");
    expect(select.getAttribute("aria-label") ?? q("label[for=log-max]")?.textContent).toMatch(/Max entries/);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, "100");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(all("[data-testid=log-row]").length).toBeLessThanOrEqual(100);
    expect(getLog().prefs.max).toBe(100);
    expect(JSON.parse(disk.getItem(PREFS_KEY) ?? "{}")).toMatchObject({ max: 100 });
  });

  it("is not on the undo timeline", async () => {
    await say("one");
    await click("[data-testid=log-clear]");
    expect((q("[data-testid=hist-undo]") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("following the newest entry", () => {
  const list = () => q("[data-testid=log-list]") as HTMLElement;

  it("starts at the bottom, and every append while following scrolls there again", async () => {
    expect(writes.at(-1)).toBe(1000);
    const before = writes.length;
    await say("a");
    expect(writes.length).toBeGreaterThan(before);
    expect(writes.at(-1)).toBe(1000);
    const after = writes.length;
    await say("b");
    expect(writes.length).toBeGreaterThan(after);
    expect(q("[data-testid=log-jump]")).toBeNull();
  });

  it("stops pinning when the user scrolls up, counts what they have not seen, and offers Jump to latest", async () => {
    await say("a");
    scrollTo(list(), 300);
    const before = writes.length;
    await say("b");
    await say("c", "error");
    expect(writes.length).toBe(before);
    expect(text("[data-testid=log-badge]")).toContain("2");
    expect(text("[data-testid=log-errors]")).toContain("1");
    expect(text("[data-testid=log-jump]")).toContain("2 new");
  });

  it("resumes following on return to the bottom, and zeroes the count", async () => {
    await say("a");
    scrollTo(list(), 300);
    await say("b");
    scrollTo(list(), 800);
    expect(q("[data-testid=log-jump]")).toBeNull();
    expect(q("[data-testid=log-badge]")).toBeNull();
    const before = writes.length;
    await say("c");
    expect(writes.length).toBeGreaterThan(before);
    expect(writes.at(-1)).toBe(1000);
  });

  it("pauses on a wheel-up BEFORE any scroll event exists", async () => {
    await say("a");
    act(() => { list().dispatchEvent(new WheelEvent("wheel", { deltaY: -120, bubbles: true })); });
    const before = writes.length;
    await say("b");
    expect(writes.length).toBe(before);
    expect(text("[data-testid=log-jump]")).toContain("1 new");
  });

  it("pauses on PageUp, ArrowUp and Home, and ignores PageDown", async () => {
    for (const key of ["PageUp", "ArrowUp", "Home"]) {
      await click("[data-testid=log-clear]");
      await say("a");
      act(() => { list().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })); });
      await say(`after ${key}`);
      expect(q("[data-testid=log-jump]"), key).not.toBeNull();
    }
    await click("[data-testid=log-clear]");
    await say("a");
    act(() => { list().dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown", bubbles: true })); });
    await say("b");
    expect(q("[data-testid=log-jump]")).toBeNull();
  });

  it("Jump to latest scrolls to the bottom and resumes following", async () => {
    await say("a");
    scrollTo(list(), 300);
    await say("b");
    await click("[data-testid=log-jump]");
    expect(writes.at(-1)).toBe(1000);
    expect(q("[data-testid=log-jump]")).toBeNull();
    expect(q("[data-testid=log-badge]")).toBeNull();
  });

  it("End key jumps to the latest", async () => {
    await say("a");
    scrollTo(list(), 300);
    await say("b");
    act(() => { list().dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })); });
    expect(q("[data-testid=log-jump]")).toBeNull();
  });

  it("does not pin while minimised, counts instead, and pins on restore when it was following", async () => {
    await say("a");
    await click("[data-testid=log-toggle]");
    const before = writes.length;
    await say("b");
    expect(writes.length).toBe(before);
    expect(text("[data-testid=log-badge]")).toContain("1");
    await click("[data-testid=log-toggle]");
    expect(writes.at(-1)).toBe(1000);
    expect(q("[data-testid=log-badge]")).toBeNull();
  });

  it("keeps a paused place on restore and keeps the count", async () => {
    await say("a");
    scrollTo(list(), 300);
    await click("[data-testid=log-toggle]");
    await say("b");
    const before = writes.length;
    await click("[data-testid=log-toggle]");
    expect(writes.slice(before).includes(1000)).toBe(false);
    expect(text("[data-testid=log-jump]")).toContain("1 new");
  });

  it("resets to following when the log is cleared", async () => {
    await say("a");
    scrollTo(list(), 300);
    await say("b");
    await click("[data-testid=log-clear]");
    expect(q("[data-testid=log-jump]")).toBeNull();
    expect(q("[data-testid=log-badge]")).toBeNull();
  });
});

describe("the status line", () => {
  it("announces the unseen count at most once a second", async () => {
    vi.useFakeTimers();
    await say("a");
    scrollTo(q("[data-testid=log-list]") as HTMLElement, 300);
    await say("b");
    const seen: string[] = [];
    const watch = () => { const t = text("[data-testid=log-status]"); if (seen.at(-1) !== t) seen.push(t); };
    watch();
    for (let i = 0; i < 5; i++) {
      await say(`burst ${i}`);
      await act(async () => { vi.advanceTimersByTime(100); });
      watch();
    }
    const burstChanges = seen.length;
    await act(async () => { vi.advanceTimersByTime(1500); });
    watch();
    expect(burstChanges).toBeLessThanOrEqual(2);
    expect(seen.at(-1)).toContain("6");
  });
});
