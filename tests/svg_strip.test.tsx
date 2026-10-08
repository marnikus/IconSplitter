// svg_strip.test.tsx — the live run strip must PROVE a long request is alive
// (prompt 2026-10-05, D7): a ticking elapsed time next to Cancel while the
// request is in flight, a frozen final time when it ends, and a finished
// request whose outcome was never confirmed reported as "outcome unknown" with
// its own elapsed time — never as a plain failure.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { batchOutcome } from "../src/lib/svgbatch";
import { fmtElapsed } from "../src/lib/svgclock";
import type { Usage } from "../src/lib/svgrequest";
import Elapsed from "../src/svg/Elapsed";
import SvgBatchStrip from "../src/svg/SvgBatchStrip";
import type { RunProgress } from "../src/svg/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let ui: Root;

const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
/** Flushes React's work without touching real timers (these tests fake them). */
const settle = async () => { await act(async () => { await Promise.resolve(); }); };

const USAGE: Usage = { input: 100, output: 200, total: 300, cost: 0.01, currency: "USD" };

function progress(over: Partial<RunProgress> = {}): RunProgress {
  return {
    batchId: "batch_1_2", index: 1, batches: 1, count: 2, cols: 2, rows: 1,
    composite: "data:,", hash: "h1", saved: 0, failed: 0, missing: 0,
    runId: "run_1", perRequest: 2, startedAt: Date.now(), images: 2, outcomes: [], ...over,
  };
}

async function render(p: RunProgress, running: boolean, onCancel = vi.fn()): Promise<void> {
  await act(async () => {
    ui.render(<SvgBatchStrip progress={p} running={running} onCancel={onCancel} />);
  });
  await settle();
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  ui?.unmount();
  host.remove();
  vi.useRealTimers();
});

describe("SvgBatchStrip — elapsed time and Cancel while a request runs", () => {
  it("ticks the elapsed time once a second, and Cancel is there", async () => {
    vi.useFakeTimers();
    const onCancel = vi.fn();
    ui = createRoot(host);
    await render(progress(), true, onCancel);
    expect(q("[data-testid=svg-batch-elapsed]")?.textContent).toBe("elapsed 0s");
    expect(q("[data-testid=svg-batch-cancel]")).not.toBeNull();

    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(q("[data-testid=svg-batch-elapsed]")?.textContent).toBe("elapsed 5s");
    await act(async () => { await vi.advanceTimersByTimeAsync(115_000); });
    // two minutes in: a long medium request is still visibly moving, not frozen
    expect(q("[data-testid=svg-batch-elapsed]")?.textContent).toBe("elapsed 2:00");

    await act(async () => { (q("[data-testid=svg-batch-cancel]") as HTMLButtonElement).click(); });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("shares the same clock with the bulk bar, so both surfaces agree", async () => {
    vi.useFakeTimers();
    ui = createRoot(host);
    const startedAt = Date.now();
    await act(async () => { ui.render(<Elapsed startedAt={startedAt} running testid="svg-bulk-elapsed" />); });
    expect(q("[data-testid=svg-bulk-elapsed]")?.textContent).toBe("elapsed 0s");
    await act(async () => { await vi.advanceTimersByTimeAsync(65_000); });
    expect(q("[data-testid=svg-bulk-elapsed]")?.textContent).toBe("elapsed 1:05");
  });

  it("freezes the time when the run ends and names an unconfirmed outcome", async () => {
    vi.useFakeTimers();
    ui = createRoot(host);
    const stalled = batchOutcome({
      plan: { id: "batch_1_2", items: [], cols: 2, rows: 1, emptyCells: 0 },
      index: 1, model: "openai/gpt-6.1-sol", saved: 0, failed: 2, missing: 0,
      usage: { input: null, output: null, total: null, cost: null, currency: "USD" },
      error: "no data for 600s at effort high — the connection looks dead, so the outcome is unknown",
      unknown: true, elapsedMs: 620_000,
    });
    await act(async () => {
      ui.render(<SvgBatchStrip progress={progress({ outcomes: [stalled] })} running={false} onCancel={vi.fn()} />);
    });
    await settle();

    expect(q(`[data-testid=svg-batch-report-1]`)?.textContent).toContain("outcome unknown");
    expect(q(`[data-testid=svg-batch-report-1]`)?.textContent).toContain("10:20");
    expect(q("[data-testid=svg-batch-elapsed]")?.textContent).toContain("(ended)");
    // nothing can be cancelled once the run is over
    expect(q("[data-testid=svg-batch-cancel]")).toBeNull();
  });
});

describe("fmtElapsed", () => {
  it("says seconds, then m:ss, then h:mm:ss — never a negative or rounded-up lie", () => {
    expect(fmtElapsed(0)).toBe("0s");
    expect(fmtElapsed(7_400)).toBe("7s");
    expect(fmtElapsed(59_400)).toBe("59s");
    // 59.6s rounds UP to the next whole second, which is already a minute
    expect(fmtElapsed(59_600)).toBe("1:00");
    expect(fmtElapsed(60_000)).toBe("1:00");
    expect(fmtElapsed(72_000)).toBe("1:12");
    expect(fmtElapsed(3_725_000)).toBe("1:02:05");
    expect(fmtElapsed(-5_000)).toBe("0s");
    expect(USAGE.total).toBe(300);
  });
});
