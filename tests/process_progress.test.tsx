import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { createProcessReporter, processTotals, type ProcessProgress } from "../src/lib/processprogress";
import ProcessProgressBar from "../src/ui/ProcessProgressBar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("shared batch process progress", () => {
  it("counts real settled work, retains cancelled percentage and ignores late updates", () => {
    const snapshots: ProcessProgress[] = [];
    const run = createProcessReporter(3, (p) => snapshots.push(p));
    expect(snapshots[0]).toMatchObject({ total: 3, done: 0, status: "running" });
    run.advance();
    expect(processTotals(snapshots.at(-1)!)).toEqual({ done: 1, total: 3, left: 2, percent: 33 });
    run.finish("cancelled");
    run.advance();
    run.finish("completed");
    expect(snapshots).toHaveLength(3);
    expect(snapshots.at(-1)).toMatchObject({ done: 1, status: "cancelled" });
    expect(snapshots[0].done).toBe(0);
  });

  it("clamps invalid bounds, handles empty runs and assigns distinct run identities", () => {
    expect(processTotals(null)).toEqual({ done: 0, total: 0, left: 0, percent: 0 });
    expect(processTotals({ done: 12, total: 4 })).toEqual({ done: 4, total: 4, left: 0, percent: 100 });
    expect(processTotals({ done: -1, total: Number.NaN })).toEqual({ done: 0, total: 0, left: 0, percent: 0 });
    const snapshots: ProcessProgress[] = [];
    const first = createProcessReporter(1, (p) => snapshots.push(p));
    first.advance(); first.advance(); first.finish("completed");
    expect(snapshots.at(-1)).toMatchObject({ done: 1, status: "completed" });
    const id = snapshots[0].runId;
    createProcessReporter(1, (p) => snapshots.push(p)).finish("failed");
    expect(snapshots.at(-1)).toMatchObject({ status: "failed", done: 0 });
    expect(snapshots.at(-1)!.runId).not.toBe(id);
  });

  it("renders the reusable accessible header with domain slots and preserved selectors", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => root.render(<ProcessProgressBar prefix="task" theme="svg" title="Processing icons" detail="fog.svg"
      done={1} total={4} remaining={3} percent={25} leading={<span>icon</span>} actions={<button>Cancel</button>} />));
    const bar = host.querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute("aria-label")).toBe("Processing icons");
    expect(bar.getAttribute("aria-valuenow")).toBe("25");
    expect(bar.getAttribute("aria-valuetext")).toBe("1 of 4 processed");
    expect(host.querySelector('[data-testid="task-progress-completed"]')?.textContent).toContain("1 completed / 4");
    expect(host.querySelector('[data-testid="task-progress-remaining"]')?.textContent).toBe("3 remaining");
    expect(host.querySelector('[data-testid="task-progress-file"]')?.textContent).toBe("fog.svg");
    expect(host.querySelector("button")?.textContent).toBe("Cancel");
    act(() => root.unmount());
  });
});
