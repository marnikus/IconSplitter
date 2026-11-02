// register_progress_ui.test.tsx — the register pass is VISIBLE (2026-11-02): a bar
// in the same stack as the generation bars, with percent, done/total and the pair
// being read, a green finished state, and the completion cue — registering folders
// used to be a silent wait that only ended in a toast.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishProcess } from "../src/lib/processslot";
import { armCompletionSound, setCompletionSound } from "../src/ui/completionSound";
import SvgRegisterProgress from "../src/svg/SvgRegisterProgress";
import { registerSlot, type RegisterProgress as Snapshot } from "../src/svg/registerprogress";
import type { SvgRefs } from "../src/svg/types";
import { completionAudio, flushCompletionAudio, recordCompletionAudio } from "./helpers/completionAudio";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let ui: Root;
const refs = (): SvgRefs => ({ root: { current: null }, metas: new Map() } as unknown as SvgRefs);

const RUNNING: Snapshot = {
  id: "run-1", kind: "svg", done: 1, total: 4, current: "fog_AI.png",
  phase: "running", registered: 1, skipped: 0,
};

function show(refsObj: SvgRefs): Promise<void> {
  return act(async () => { ui.render(<SvgRegisterProgress refs={refsObj} />); });
}

function publish(refsObj: SvgRefs, value: Snapshot | null): Promise<void> {
  return act(async () => { publishProcess(registerSlot(refsObj), value); });
}

const q = (sel: string): HTMLElement | null => host.querySelector(sel);

beforeEach(() => {
  localStorage.clear();
  setCompletionSound(true);
  recordCompletionAudio();
  host = document.createElement("div");
  document.body.append(host);
  ui = createRoot(host);
});

afterEach(() => {
  act(() => ui.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("the register progress bar", () => {
  it("shows the percent, the counts and the pair being read while the pass runs", async () => {
    const r = refs();
    publishProcess(registerSlot(r), RUNNING);
    await show(r);
    expect(q("[data-testid=register-svg-progress-title]")?.textContent).toBe("Registering existing SVGs · 4 folders");
    expect(q("[data-testid=register-svg-progress-file]")?.textContent).toBe("fog_AI.png");
    expect(q("[data-testid=register-svg-progress-percent]")?.textContent).toBe("25%");
    expect(q("[data-testid=register-svg-progress-completed]")?.textContent).toBe("1 completed / 4");
    expect(q("[data-testid=register-svg-progress-remaining]")?.textContent).toBe("3 remaining");
    const track = q("[data-testid=register-svg-progress-track]");
    expect(track?.getAttribute("role")).toBe("progressbar");
    expect(track?.getAttribute("aria-valuenow")).toBe("25");
    expect(track?.getAttribute("aria-valuetext")).toBe("1 of 4 processed");
    await flushCompletionAudio();
    expect(completionAudio.starts).toHaveLength(0); // nothing finished yet
  });

  it("says how many new files the run registered so far, beside what is left", async () => {
    const r = refs();
    publishProcess(registerSlot(r), RUNNING);
    await show(r);
    expect(q("[data-testid=register-svg-progress-note]")?.textContent).toBe("1 new file registered");
    expect(q("[data-testid=register-svg-progress-remaining]")?.textContent).toBe("3 remaining");
    await publish(r, { ...RUNNING, done: 3, registered: 5 });
    expect(q("[data-testid=register-svg-progress-note]")?.textContent).toBe("5 new files registered");
    expect(q("[data-testid=register-svg-progress-remaining]")?.textContent).toBe("1 remaining");
  });

  it("turns green at 100 % and plays the completion cue exactly once", async () => {
    const r = refs();
    publishProcess(registerSlot(r), RUNNING);
    await show(r);
    armCompletionSound(); // a click happened, as it must before any cue can play
    await publish(r, { ...RUNNING, done: 4, phase: "complete", registered: 3, skipped: 1 });
    expect(q("[data-testid=register-svg-progress-percent]")?.textContent).toBe("100%");
    expect(q("[data-testid=register-svg-progress-title]")?.textContent).toBe("Registering existing SVGs complete");
    expect(q("[data-testid=register-svg-progress-file]")?.textContent).toBe("3 registered · 1 skipped");
    expect(q("[data-testid=register-svg-progress-header]")?.className).toContain("complete");
    await flushCompletionAudio();
    expect(completionAudio.starts).toHaveLength(1);
    // A re-render of the same finished pass is not a second completion.
    await publish(r, { ...RUNNING, done: 4, phase: "complete", registered: 3, skipped: 1 });
    await flushCompletionAudio();
    expect(completionAudio.starts).toHaveLength(1);
  });

  it("names the AI-source pass and closes on its ✕", async () => {
    const r = refs();
    publishProcess(registerSlot(r), { ...RUNNING, kind: "images", total: 1, done: 0, current: "fog_AI.png" });
    await show(r);
    expect(q("[data-testid=register-images-progress-title]")?.textContent).toBe("Registering AI sources · 1 folder");
    await publish(r, { ...RUNNING, kind: "images", total: 1, done: 1, phase: "complete", registered: 1 });
    await act(async () => { q("[data-testid=register-images-progress-dismiss]")?.click(); });
    expect(q("[data-testid=register-images-progress-header]")).toBeNull();
    expect(registerSlot(r).value).toBeNull();
  });

  it("stays out of the way when nothing was registered", async () => {
    const r = refs();
    await show(r);
    expect(host.innerHTML).toBe("");
    await publish(r, RUNNING);
    expect(q("[data-testid=register-svg-progress-header]")).not.toBeNull();
    await publish(r, null);
    expect(q("[data-testid=register-svg-progress-header]")).toBeNull();
  });
});
