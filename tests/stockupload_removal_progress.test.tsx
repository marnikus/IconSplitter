// stockupload_removal_progress.test.tsx — "Remove unsuccessful uploads" gets a
// job bar (2026-11-09): it shows the stock while badges, history files and site
// statuses are removed, and the finished bar says how many were removed for
// which stock. It stays until ✕ like every job bar.
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { barStack } from "../src/lib/barstack";
import StockRemovalProgress from "../src/stockupload/StockRemovalProgress";
import { beginRemoval, dismissRemoval, removalSlot } from "../src/stockupload/removalprogress";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RESULT = { items: 5, badges: 4, historyFiles: 6, statuses: 3, unmatched: ["x.eps"] };
let host: HTMLDivElement;
let ui: Root;
const q = (sel: string) => host.querySelector<HTMLElement>(sel);

beforeEach(() => {
  dismissRemoval();
  barStack.clear();
  host = document.createElement("div");
  document.body.append(host);
  ui = createRoot(host);
});

afterEach(() => {
  act(() => ui.unmount());
  host.remove();
  dismissRemoval();
  barStack.clear();
});

describe("the removal process", () => {
  it("runs through three steps for one stock, then ends with the counts", () => {
    const run = beginRemoval("Adobe Stock");
    expect(removalSlot.value).toMatchObject({ stockName: "Adobe Stock", done: 0, total: 3, status: "running" });
    run.step("Removing history files");
    expect(removalSlot.value).toMatchObject({ done: 1, phase: "Removing history files" });
    run.finish(RESULT);
    expect(removalSlot.value).toMatchObject({ done: 3, status: "completed", result: RESULT });
  });

  it("a failed removal ends as failed and keeps what is known", () => {
    const run = beginRemoval("Adobe Stock");
    run.step("Removing history files");
    run.fail();
    expect(removalSlot.value).toMatchObject({ status: "failed", done: 1, result: null });
  });

  it("dismiss clears the slot", () => {
    beginRemoval("Adobe Stock").finish(RESULT);
    dismissRemoval();
    expect(removalSlot.value).toBeNull();
  });
});

describe("the removal bar", () => {
  it("shows nothing without a process", async () => {
    await act(async () => { ui.render(<StockRemovalProgress />); });
    expect(q("[data-testid=stock-removal-progress-header]")).toBeNull();
  });

  it("names the stock while running", async () => {
    beginRemoval("Adobe Stock").step("Removing history files");
    await act(async () => { ui.render(<StockRemovalProgress />); });
    expect(q("[data-testid=stock-removal-progress-title]")?.textContent).toBe("Removing rejected uploads · Adobe Stock");
    expect(q("[data-testid=stock-removal-progress-file]")?.textContent).toBe("Removing history files");
    expect(q("[data-testid=stock-removal-progress-percent]")?.textContent).toBe("33%");
  });

  it("finishes with how many were removed for which stock, until dismissed", async () => {
    beginRemoval("Adobe Stock").finish(RESULT);
    await act(async () => { ui.render(<StockRemovalProgress />); });
    expect(q("[data-testid=stock-removal-progress-title]")?.textContent).toBe("Adobe Stock · rejected uploads removed");
    const detail = q("[data-testid=stock-removal-progress-file]")?.textContent ?? "";
    expect(detail).toContain("4 badge(s) removed");
    expect(detail).toContain("6 history file(s) removed");
    expect(detail).toContain("1 name(s) not found");
    expect(q("[data-testid=stock-removal-progress-percent]")?.textContent).toBe("100%");
    await act(async () => { q("[data-testid=stock-removal-progress-dismiss]")?.click(); });
    expect(q("[data-testid=stock-removal-progress-header]")).toBeNull();
  });
});

describe("wired in", () => {
  const src = (p: string) => readFileSync(p, "utf8");

  it("the Process click runs under the removal process", () => {
    expect(src("src/stockupload/selectionactions.ts")).toContain("beginRemoval(");
  });

  it("the stock tab renders the bar", () => {
    expect(src("src/stockupload/StockUploadDialogs.tsx")).toContain("<StockRemovalProgress />");
  });
});
