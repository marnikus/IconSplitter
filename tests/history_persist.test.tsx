// history_persist.test.tsx — D4: the timeline is persisted OUTSIDE the gesture.
// A burst of pushes writes storage once, afterwards; the in-memory timeline (and
// undo) is exact and immediate; a pending write is flushed by pagehide, by the
// provider unmounting, and by any read; a refusing storage is survivable.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HistoryProvider, useHistoryActions, type HistoryActions } from "../src/state/HistoryProvider";
import { HISTORY_KEY, loadHistory } from "../src/state/historystore";
import { resetAppStore } from "../src/state/appstore";
import { settle } from "./helpers/quiet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let hist: HistoryActions | null = null;
const raw = () => localStorage.getItem(HISTORY_KEY);

/** Counts the writes that reach the history key (other stores keep writing). */
function spyWrites(): { writes: string[]; restore: () => void } {
  const writes: string[] = [];
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key: string, value: string) {
    if (key === HISTORY_KEY) writes.push(value);
    return original.call(this, key, value);
  };
  return { writes, restore: () => { Storage.prototype.setItem = original; } };
}

function Probe(): null {
  hist = useHistoryActions();
  return null;
}

const entry = (n: number) => ({
  type: "checked", label: `Toggle ${n}`, origin: "selectionV2",
  ids: [`row-${n}`], before: [], after: [`row-${n}`],
});

beforeEach(() => {
  localStorage.clear();
  resetAppStore();
  hist = null;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  localStorage.clear();
  resetAppStore();
});

async function mount(): Promise<void> {
  await act(async () => root.render(<HistoryProvider><Probe /></HistoryProvider>));
}

describe("history persistence is deferred but never lost", () => {
  it("writes once per burst, after the gesture, not inside it", async () => {
    await mount();
    const spy = spyWrites();
    // synchronous act: the pushes commit, but no timer of ours may have run yet
    act(() => {
      hist!.push(entry(1));
      hist!.push(entry(2));
      hist!.push(entry(3));
    });
    // the gesture itself wrote nothing…
    expect(spy.writes).toHaveLength(0);
    await settle(0);
    // …and the burst became ONE write that holds all three entries
    expect(spy.writes).toHaveLength(1);
    expect(JSON.parse(spy.writes[0]).entries).toHaveLength(3);
    spy.restore();
  });

  it("flushes a pending write on pagehide", async () => {
    await mount();
    act(() => { hist!.push(entry(1)); });
    expect(raw()).toBeNull(); // nothing yet
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    expect(JSON.parse(raw() ?? "{}").entries).toHaveLength(1);
  });

  it("flushes a pending write when the provider unmounts", async () => {
    await mount();
    act(() => { hist!.push(entry(1)); });
    expect(raw()).toBeNull();
    act(() => root.unmount());
    expect(JSON.parse(raw() ?? "{}").entries).toHaveLength(1);
    root = createRoot(host); // afterEach unmounts something
  });

  it("a read sees the pending timeline, so a reload never loses it", async () => {
    await mount();
    act(() => { hist!.push(entry(1)); });
    expect(raw()).toBeNull();
    expect(loadHistory().entries).toHaveLength(1); // read-through flushes
    expect(JSON.parse(raw() ?? "{}").entries).toHaveLength(1);
  });

  it("keeps working in memory when storage refuses the write", async () => {
    await mount();
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
      if (key === HISTORY_KEY) throw new Error("QuotaExceededError");
      return original.call(this, key, value);
    };
    act(() => { hist!.push(entry(1)); });
    await expect(settle(0)).resolves.toBeUndefined(); // the refusal never reaches the gesture
    Storage.prototype.setItem = original;
    // the timeline itself is intact: the next flush persists all of it
    act(() => { hist!.push(entry(2)); });
    await settle(0);
    expect(JSON.parse(raw() ?? "{}").entries).toHaveLength(2);
  });

  it("does not rewrite storage when nothing new was recorded", async () => {
    await mount();
    await settle(0);
    expect(raw()).toBeNull(); // an empty session writes nothing at all
    act(() => { hist!.push(entry(1)); });
    await settle(0);
    const first = raw();
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    expect(raw()).toBe(first); // flush with no pending write is a no-op
  });
});
