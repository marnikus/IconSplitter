// bar_stack.test.tsx — one progress bar on top at a time (2026-11-09). Every bar
// (activity or job) registers in lib/barstack. The OLDEST running bar is the
// main one; the rest are hidden but reachable with ▲/▼ on the main bar, which
// also says how many others run and how far they are. Closing the main bar
// shows the next one.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activities, beginActivity } from "../src/lib/activity";
import { barStack } from "../src/lib/barstack";
import ActivityBars from "../src/ui/ActivityBars";
import ProcessProgressBar from "../src/ui/ProcessProgressBar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let ui: Root;
const all = (sel: string) => Array.from(host.querySelectorAll<HTMLElement>(sel));
const shown = () => all("[data-testid$=-progress-header]").filter((h) => !h.hidden);
const titleOf = (h: HTMLElement) => h.querySelector("strong")?.textContent;
const click = (el: Element | null | undefined) => act(async () => { (el as HTMLElement).click(); });

beforeEach(() => {
  activities.clear();
  barStack.clear();
  host = document.createElement("div");
  document.body.append(host);
  ui = createRoot(host);
});

afterEach(() => {
  act(() => ui.unmount());
  host.remove();
  activities.clear();
  barStack.clear();
});

describe("the bar stack store", () => {
  it("makes the oldest bar main, follows a pick, falls back when the pick closes", () => {
    barStack.add("a"); barStack.add("b"); barStack.add("c");
    expect(barStack.view().main).toBe("a");
    barStack.select("c");
    expect(barStack.view().main).toBe("c");
    barStack.remove("c");
    expect(barStack.view().main).toBe("a");
    barStack.remove("a");
    expect(barStack.view().main).toBe("b");
  });

  it("steps through the list with wrap-around", () => {
    barStack.add("a"); barStack.add("b"); barStack.add("c");
    expect(barStack.step("a", 1)).toBe("b");
    expect(barStack.step("a", -1)).toBe("c");
    expect(barStack.step("c", 1)).toBe("a");
  });

  it("does not republish an unchanged update", () => {
    barStack.add("a");
    const before = barStack.view();
    barStack.update("a", "T", 10);
    const changed = barStack.view();
    barStack.update("a", "T", 10);
    expect(changed).not.toBe(before);
    expect(barStack.view()).toBe(changed);
  });
});

describe("only one bar shows", () => {
  it("shows the longest running activity and hides the rest", async () => {
    beginActivity("batch", "Saving 1/10…");
    beginActivity("batch", "Saving 5/10…");
    beginActivity("svg", "Rendering…");
    await act(async () => { ui.render(<ActivityBars />); });
    expect(all("[data-testid$=-progress-header]")).toHaveLength(3);
    expect(shown().map(titleOf)).toEqual(["Saving 1/10…"]);
  });

  it("tells how many others run and how far they are", async () => {
    beginActivity("batch", "Saving 1/10…");
    beginActivity("batch", "Saving 5/10…");
    beginActivity("svg", "Rendering…");
    await act(async () => { ui.render(<ActivityBars />); });
    const note = host.querySelector("[data-testid=bar-stack-note]");
    expect(note?.textContent).toContain("+2");
    expect(note?.textContent).toContain("50%");
    expect(note?.textContent).toContain("…");
  });

  it("switches the main bar with the arrows", async () => {
    beginActivity("batch", "First 1/10…");
    beginActivity("svg", "Second 2/10…");
    await act(async () => { ui.render(<ActivityBars />); });
    await click(host.querySelector("[data-testid=bar-stack-next]"));
    expect(shown().map(titleOf)).toEqual(["Second 2/10…"]);
    await click(host.querySelector("[data-testid=bar-stack-prev]"));
    expect(shown().map(titleOf)).toEqual(["First 1/10…"]);
  });

  it("shows the next bar when the main one closes, and no arrows for a single bar", async () => {
    const first = beginActivity("batch", "First 1/10…");
    beginActivity("svg", "Second 2/10…");
    await act(async () => { ui.render(<ActivityBars />); });
    await act(async () => { first.end(); });
    expect(shown().map(titleOf)).toEqual(["Second 2/10…"]);
    expect(host.querySelector("[data-testid=bar-stack-next]")).toBeNull();
    expect(host.querySelector("[data-testid=bar-stack-note]")).toBeNull();
  });

  it("stacks job bars and activity bars together, oldest first", async () => {
    const noop = () => {};
    const job = (
      <ProcessProgressBar prefix="batch-preview" theme="batch" title="Previewing splits" detail="a.png" done={5} total={10} remaining={5}
        percent={50} status="running" runId="r1" onCancel={noop} onReview={noop} onDismiss={noop} />
    );
    await act(async () => { ui.render(<>{job}<ActivityBars /></>); });
    beginActivity("batch", "Saving review outcomes · 3 files…");
    await act(async () => { ui.render(<>{job}<ActivityBars /></>); });
    expect(shown().map(titleOf)).toEqual(["Previewing splits"]);
    expect(host.querySelector("[data-testid=bar-stack-note]")?.textContent).toContain("+1");
  });
});
