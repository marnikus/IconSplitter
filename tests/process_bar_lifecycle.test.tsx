// process_bar_lifecycle.test.tsx — ONE progress-bar lifecycle for every process
// of every tab (2026-11-03). The shared bar owns the behaviour; a feature only
// says which state its run is in:
//   running   → Cancel; no sound
//   completed → green ✓, Review results + ✕, one sound
//   failed    → red !,  Review results + ✕, one sound (it ended — the user must hear it)
//   cancelled → ■,      Review results + ✕, no sound, the real percentage kept
// and a finished bar STAYS until its ✕ or the next run of that process — no
// process closes its bar on a timer. Each feature's mapping obeys the same rules.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProcessProgressBar, { type ProcessProgressBarProps } from "../src/ui/ProcessProgressBar";
import { armCompletionSound, setCompletionSound } from "../src/ui/completionSound";
import { batchStatusOf, makeBatchProgress } from "../src/batch/BatchProgress";
import { imageStatusOf, type ImageProcess } from "../src/svg/imgprogress";
import { stockStatusOf } from "../src/stockupload/progressmodel";
import { svgRunStatusOf } from "../src/svg/jobprogress";
import { beginRegister, cancelRegister, registerSlot, registerStatusOf } from "../src/svg/registerprogress";
import SvgRegisterProgress from "../src/svg/SvgRegisterProgress";
import type { SvgRefs } from "../src/svg/types";
import { completionAudio, flushCompletionAudio, recordCompletionAudio } from "./helpers/completionAudio";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let ui: Root;
const q = <T extends HTMLElement = HTMLElement>(sel: string): T | null => host.querySelector<T>(sel);

const props = (patch: Partial<ProcessProgressBarProps> = {}): ProcessProgressBarProps => ({
  prefix: "task", theme: "svg", title: "Working", detail: "fog.svg", runId: "run",
  done: 1, total: 2, remaining: 1, percent: 50, status: "running", leading: <i data-testid="thumb" />,
  onCancel: vi.fn(), onReview: vi.fn(), onDismiss: vi.fn(), ...patch,
});

const render = (node: React.ReactNode) => act(async () => { ui.render(<>{node}</>); });

beforeEach(() => {
  localStorage.clear();
  setCompletionSound(true);
  recordCompletionAudio();
  armCompletionSound();
  host = document.createElement("div");
  document.body.append(host);
  ui = createRoot(host);
});

afterEach(() => {
  act(() => ui.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the shared bar owns the lifecycle", () => {
  it("running: Cancel only, the feature's thumbnail, silent", async () => {
    const p = props({ runId: "r-run" });
    await render(<ProcessProgressBar {...p} />);
    expect(q("[data-testid=task-progress-cancel]")).not.toBeNull();
    expect(q("[data-testid=task-progress-review]")).toBeNull();
    expect(q("[data-testid=task-progress-dismiss]")).toBeNull();
    expect(q("[data-testid=thumb]")).not.toBeNull();
    q<HTMLButtonElement>("[data-testid=task-progress-cancel]")?.click();
    expect(p.onCancel).toHaveBeenCalledOnce();
    await flushCompletionAudio();
    expect(completionAudio.starts).toHaveLength(0);
  });

  it.each([
    ["completed", "complete", "✓", 1],
    ["failed", "failed", "!", 1],
    ["cancelled", "cancelled", "■", 0],
  ] as const)("%s: Review results + ✕, its own mark, %#", async (status, cls, icon, sounds) => {
    const p = props({ runId: `r-${status}`, status, done: 1, total: 2, remaining: 1, percent: 50 });
    await render(<ProcessProgressBar {...p} />);
    expect(q("[data-testid=task-progress-header]")?.className).toContain(cls);
    expect(q("[data-testid=task-progress-icon]")?.textContent).toBe(icon);
    expect(q("[data-testid=thumb]")).toBeNull();
    expect(q("[data-testid=task-progress-cancel]")).toBeNull();
    q<HTMLButtonElement>("[data-testid=task-progress-review]")?.click();
    q<HTMLButtonElement>("[data-testid=task-progress-dismiss]")?.click();
    expect(p.onReview).toHaveBeenCalledOnce();
    expect(p.onDismiss).toHaveBeenCalledOnce();
    // the bar shows what it was given: a stopped run keeps its real 50 %
    expect(q("[data-testid=task-progress-percent]")?.textContent).toBe("50%");
    await flushCompletionAudio();
    expect(completionAudio.starts).toHaveLength(sounds);
    await render(<ProcessProgressBar {...p} />);
    await flushCompletionAudio();
    expect(completionAudio.starts).toHaveLength(sounds); // a re-render is not a second end
  });

  it("can disable Cancel while a stop is already on its way", async () => {
    await render(<ProcessProgressBar {...props({ cancelDisabled: true, cancelLabel: "Stop image run" })} />);
    const cancel = q<HTMLButtonElement>("[data-testid=task-progress-cancel]");
    expect(cancel?.disabled).toBe(true);
    expect(cancel?.textContent).toBe("Stop image run");
  });
});

/** Every feature's mapping, held to the same four answers. */
describe("each feature maps its run onto the same four states", () => {
  const image = (patch: Partial<ImageProcess>): ImageProcess => ({
    id: "i", total: 4, requests: 1, request: 1, saved: 4, failed: 0, discarded: 0, stopping: false, phase: "complete", ...patch,
  });
  const batch = (patch: Partial<ReturnType<typeof makeBatchProgress>>) => ({ ...makeBatchProgress(4, "b"), done: 4, saved: 4, ...patch });
  const stock = (patch: Record<string, unknown>) => ({ runId: "s", done: 4, total: 4, label: "", complete: true, failed: 0, ...patch });

  it("running", () => {
    expect(imageStatusOf(image({ phase: "review" }))).toBe("running");
    expect(batchStatusOf(batch({ done: 2 }), true)).toBe("running");
    expect(stockStatusOf(stock({ complete: false, done: 2, phase: "uploading" }))).toBe("running");
    expect(svgRunStatusOf(true, { cancelled: false, failed: false })).toBe("running");
    expect(registerStatusOf({ phase: "running" })).toBe("running");
  });

  it("completed", () => {
    expect(imageStatusOf(image({}))).toBe("completed");
    expect(batchStatusOf(batch({}), false)).toBe("completed");
    expect(stockStatusOf(stock({}))).toBe("completed");
    expect(svgRunStatusOf(false, { cancelled: false, failed: false })).toBe("completed");
    expect(registerStatusOf({ phase: "complete" })).toBe("completed");
  });

  it("failed: it ended, but not everything worked", () => {
    expect(imageStatusOf(image({ saved: 3, failed: 1 }))).toBe("failed");
    expect(batchStatusOf(batch({ saved: 3, failed: 1 }), false)).toBe("failed");
    expect(stockStatusOf(stock({ failed: 2 }))).toBe("failed");
    expect(svgRunStatusOf(false, { cancelled: false, failed: true })).toBe("failed");
    expect(registerStatusOf({ phase: "failed" })).toBe("failed");
  });

  it("cancelled: the user stopped it — wins over failures", () => {
    expect(imageStatusOf(image({ phase: "stopped", failed: 1 }))).toBe("cancelled");
    expect(batchStatusOf(batch({ done: 2, failed: 1 }), false)).toBe("cancelled");
    expect(stockStatusOf(stock({ stopped: true, failed: 1 }))).toBe("cancelled");
    expect(svgRunStatusOf(false, { cancelled: true, failed: true })).toBe("cancelled");
    expect(registerStatusOf({ phase: "cancelled" })).toBe("cancelled");
  });
});

describe("register passes: cancellable, never stuck, never auto-hidden", () => {
  const refs = (): SvgRefs => ({ root: { current: null }, metas: new Map() } as unknown as SvgRefs);

  it("a Cancel reaches the running pass and ends it as cancelled", () => {
    const r = refs();
    const bar = beginRegister(r, "svg", 3);
    expect(bar.cancelled()).toBe(false);
    expect(cancelRegister(r)).toBe(true);
    expect(bar.cancelled()).toBe(true);
    bar.finish();
    expect(registerSlot(r).value?.phase).toBe("cancelled");
    expect(cancelRegister(r)).toBe(false); // nothing left to stop
  });

  it("a pass that crashed ends as failed instead of spinning forever", () => {
    const r = refs();
    beginRegister(r, "images", 2).fail();
    expect(registerSlot(r).value?.phase).toBe("failed");
  });

  it("a finished bar is still there ten minutes later", async () => {
    vi.useFakeTimers();
    const r = refs();
    beginRegister(r, "svg", 1).finish();
    await render(<SvgRegisterProgress refs={r} onReview={vi.fn()} />);
    await act(async () => { vi.advanceTimersByTime(10 * 60_000); });
    expect(q("[data-testid=register-svg-progress-header]")).not.toBeNull();
    expect(registerSlot(r).value).not.toBeNull();
  });
});

describe("an SVG run that ended before its first request still leaves a bar", () => {
  it("gets a terminal progress of its own run, counting what it carried", async () => {
    const { endedProgress } = await import("../src/svg/jobprogress");
    const job = { id: "job-1", ids: ["a", "b", "c"], progress: null };
    const p = endedProgress(job);
    expect(p).toMatchObject({ runId: "job-1", images: 3, saved: 0, outcomes: [] });
    const real = { ...p, runId: "kept", images: 9 };
    expect(endedProgress({ ...job, progress: real })).toBe(real); // a real progress is never replaced
  });
});
