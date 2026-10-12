// batch_progress.test.tsx — TDD for persistent batch progress bar (same as SVG bar)
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BatchProgressHeader from "../src/batch/BatchProgressHeader";
import type { BatchProgress } from "../src/batch/BatchProgress";
import type { Row } from "../src/batch/useBatchTypes";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeRow(relPath: string, name: string): Row {
  return {
    relPath,
    name,
    dirPath: "",
    refRelPath: null,
    status: "unprocessed",
    selected: true,
  } as unknown as Row;
}

function makeProgress(over: Partial<BatchProgress> = {}): BatchProgress {
  return {
    runId: "run-1",
    startedAt: Date.now(),
    total: 3,
    done: 1,
    currentRelPath: "a.png",
    currentName: "a.png",
    saved: 1,
    failed: 0,
    skipped: 0,
    ...over,
  };
}

let host: HTMLDivElement;
let mountDiv: HTMLDivElement;
let root: Root;

async function mount(progress: BatchProgress | null, running: boolean, rows: Row[], thumbFor: (p: string) => Promise<string>, onCancel: () => void, onDismiss: () => void, onReview: () => void) {
  host = document.createElement("div");
  mountDiv = document.createElement("div");
  mountDiv.id = "batch-progress-mount";
  mountDiv.setAttribute("data-testid", "batch-progress-mount");
  document.body.appendChild(mountDiv);
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <BatchProgressHeader progress={progress} running={running} rows={rows} thumbFor={thumbFor} onCancel={onCancel} onDismiss={onDismiss} onReview={onReview} />,
    );
  });
  // wait for portal and thumb effects
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
}

function q(sel: string): Element | null {
  return document.body.querySelector(sel);
}

async function click(el: Element | null) {
  if (!el) throw new Error("element not found");
  await act(async () => {
    (el as HTMLElement).click();
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
}

beforeEach(async () => {
  vi.restoreAllMocks();
  if (host) {
    await act(async () => root.unmount());
    host.remove();
    mountDiv.remove();
  }
});

describe("batch progress bar — persistent across tabs", () => {
  it("renders null when progress is null", async () => {
    await mount(null, false, [], async () => "", () => {}, () => {}, () => {});
    expect(q("[data-testid=batch-progress-header]")).toBeNull();
  });

  it("shows running bar with title, file, percent, track, cancel", async () => {
    const progress = makeProgress({ done: 1, total: 3, currentName: "a.png", currentRelPath: "a.png" });
    const rows = [makeRow("a.png", "a.png"), makeRow("b.png", "b.png")];
    const thumbFor = vi.fn(async () => "data:image/png;base64,xxx");

    await mount(progress, true, rows, thumbFor, () => {}, () => {}, () => {});

    const header = q("[data-testid=batch-progress-header]");
    expect(header).not.toBeNull();
    expect(q("[data-testid=batch-progress-title]")?.textContent).toContain("Splitting icons");
    expect(q("[data-testid=batch-progress-file]")?.textContent).toContain("a.png");
    expect(q("[data-testid=batch-progress-percent]")?.textContent).toContain("33%");
    expect(q("[data-testid=batch-progress-track]")).not.toBeNull();
    expect(q("[data-testid=batch-progress-cancel]")).not.toBeNull();
    expect(q("[data-testid=batch-progress-completed]")?.textContent).toContain("1 completed");
  });

  it("shows complete bar with 100%, review and dismiss", async () => {
    const progress = makeProgress({ done: 3, total: 3, saved: 3 });
    await mount(progress, false, [], async () => "", () => {}, () => {}, () => {});

    expect(q("[data-testid=batch-progress-header]")).not.toBeNull();
    expect(q("[data-testid=batch-progress-title]")?.textContent).toContain("Batch split complete");
    expect(q("[data-testid=batch-progress-review]")).not.toBeNull();
    expect(q("[data-testid=batch-progress-dismiss]")).not.toBeNull();
  });

  it("cancel button opens dialog with stats and confirm", async () => {
    const progress = makeProgress({ done: 1, total: 3 });
    const onCancel = vi.fn();

    await mount(progress, true, [makeRow("a.png", "a.png")], async () => "", onCancel, () => {}, () => {});

    await click(q("[data-testid=batch-progress-cancel]"));

    expect(q("[data-testid=batch-cancel-dialog]")).not.toBeNull();
    expect(q("[data-testid=batch-cancel-stats]")?.textContent).toContain("1 completed");
    expect(q("[data-testid=batch-cancel-keep]")).not.toBeNull();
    expect(q("[data-testid=batch-cancel-confirm]")).not.toBeNull();

    await click(q("[data-testid=batch-cancel-keep]"));
    expect(q("[data-testid=batch-cancel-dialog]")).toBeNull();

    await click(q("[data-testid=batch-progress-cancel]"));
    await click(q("[data-testid=batch-cancel-confirm]"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("dismiss calls onDismiss and hides bar for same runId", async () => {
    const progress = makeProgress({ done: 3, total: 3 });
    const onDismiss = vi.fn();

    await mount(progress, false, [], async () => "", () => {}, onDismiss, () => {});

    await click(q("[data-testid=batch-progress-dismiss]"));
    expect(onDismiss).toHaveBeenCalled();

    // After dismiss internal state hides same runId
    expect(q("[data-testid=batch-progress-header]")).toBeNull();
  });

  it("persists when batch tab hidden — portal outside hidden container", async () => {
    // Simulate Workbench hidden pattern: batch panel hidden but mount outside stays
    const progress = makeProgress({ done: 1, total: 3 });
    await mount(progress, true, [], async () => "", () => {}, () => {}, () => {});

    // header is in mountDiv which is outside batch-shell-outer
    expect(mountDiv.querySelector("[data-testid=batch-progress-header]")).not.toBeNull();

    // Even if we hide a fake batch outer, mount still visible
    const fakeOuter = document.createElement("div");
    fakeOuter.setAttribute("hidden", "");
    fakeOuter.id = "batch-shell-outer";
    document.body.appendChild(fakeOuter);
    expect(mountDiv.querySelector("[data-testid=batch-progress-header]")).not.toBeNull();
    fakeOuter.remove();
  });
});
