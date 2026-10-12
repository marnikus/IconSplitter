// batch_preview_ui.test.tsx — TDD for "Preview splits" in the Batch tab (design
// D3/D6/D9/D10, T8). The panel runs the REAL session (queue, cache, per-row state)
// with an injected per-row work function, so the pixels stay deterministic while
// the machinery under test is the shipped one. The write guard is the point:
// previewing must never touch the disk, the JSON, the statuses or the undo history.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { dropDb } from "./helpers/idb";
import { clearKnownRoots } from "../src/lib/knownroots";
import BatchPanel from "../src/batch/BatchPanel";
import type { PreviewDeps } from "../src/batch/preview/previewdeps";
import type { QueueToken, RowResult } from "../src/lib/previewqueue";
import type { StripResult } from "../src/batch/preview/previewdeps";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PickerWindow = { showDirectoryPicker?: () => Promise<unknown> };

let host: HTMLDivElement;
let root: Root;

/**
 * A fake root that screams if the PREVIEW writes anything. The scan itself does
 * write (the per-reference state JSON is existing behaviour), so the guard is armed
 * after the scan: from there on, any write attempt is counted and refused (I-67).
 */
class GuardedDir extends FakeDir {
  armed = false;
  attempts = 0;
  async getFileHandle(name: string, opts?: { create?: boolean }) {
    if (opts?.create) {
      this.attempts++;
      if (this.armed) throw new Error("preview must not create files");
    }
    return super.getFileHandle(name, opts);
  }
}

function guardedFile(f: FakeFile, dir: GuardedDir): FakeFile {
  const write = f.createWritable.bind(f);
  f.createWritable = async () => {
    if (!dir.armed) return write();
    dir.attempts++;
    throw new Error("preview must not write files");
  };
  return f;
}

function makeRoot(files: string[]): GuardedDir {
  const dir = new GuardedDir("preview_root");
  for (const name of files) dir.children.set(name, guardedFile(new FakeFile(name, 10, 1000, "x"), dir));
  return dir;
}

/** Arms the guard and returns the write-attempt counter as it is from here on. */
function arm(dir: GuardedDir): () => number {
  dir.armed = true;
  const before = dir.attempts;
  return () => dir.attempts - before;
}

let workCalls: string[] = [];
let workDelay = 0;
let failing = new Set<string>();
/** Rows that take their time, so a Stop lands on a row that is still in flight. */
let slow = new Set<string>();

const slowMs = 600;

function makeDeps(): PreviewDeps {
  return {
    pause: async () => {
      await new Promise((r) => setTimeout(r, 0));
    },
    work: async (ctx: { relPath: string; split: { mergeFrac: number | null }; token: QueueToken }): Promise<RowResult<StripResult>> => {
      workCalls.push(ctx.relPath);
      const wait = slow.has(ctx.relPath) ? slowMs : workDelay;
      if (wait) await new Promise((r) => setTimeout(r, wait));
      if (failing.has(ctx.relPath)) return { kind: "error", message: "decode failed" };
      return {
        kind: "ok",
        value: { blobs: [new Blob([`png-${ctx.relPath}`], { type: "image/png" })], count: 3, usedFrac: ctx.split.mergeFrac ?? 0.01 },
      };
    },
  };
}

async function mount(dir: GuardedDir, deps: PreviewDeps = makeDeps()) {
  (window as unknown as PickerWindow).showDirectoryPicker = async () => dir as unknown;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<BatchPanel preview={deps} />);
  });
  await settle(60);
  await click(host.querySelector("[data-testid=batch-open-folder]")!);
  await settle(400);
  if (host.querySelectorAll(".batch-row").length === 0) throw new Error("scan found no rows in the fake root");
  return host;
}

function q(sel: string): HTMLElement | null {
  return host.querySelector(sel) as HTMLElement | null;
}

function byTestId(id: string): string {
  return `[data-testid="${id}"]`;
}

async function settle(ms = 60) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function click(el: Element) {
  await act(async () => {
    (el as HTMLElement).click();
  });
}

async function checkAll() {
  await click(q("[data-testid=batch-select-visible]")!);
  await settle();
}

function stripState(rel: string): string | null {
  return host.querySelector(byTestId(`batch-preview-strip-${rel}`))?.getAttribute("data-state") ?? null;
}

function countText(rel: string): string {
  return host.querySelector(byTestId(`batch-preview-count-${rel}`))?.textContent ?? "";
}

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  await dropDb();
  clearKnownRoots();
  workCalls = [];
  workDelay = 0;
  failing = new Set();
  slow = new Set();
  if (host) {
    await act(async () => root.unmount());
    host.remove();
  }
  delete (window as Partial<PickerWindow>).showDirectoryPicker;
  vi.restoreAllMocks();
});

describe("Preview splits — a view that never writes", () => {
  it("offers the button beside Split selected and disables it with nothing selected", async () => {
    await mount(makeRoot(["icon-a_AI_1.png", "icon-a_1.png"]));
    const preview = q("[data-testid=batch-preview]") as HTMLButtonElement;
    const split = q("[data-testid=batch-process]") as HTMLButtonElement;
    expect(preview).not.toBeNull();
    expect(preview.parentElement).toBe(split.parentElement);
    expect(preview.disabled).toBe(true);
    expect(preview.textContent).toContain("Preview splits (0)");
  });

  it("gives every selected row a strip and a count, and stops when told", async () => {
    const dir = makeRoot(["icon-a_AI_1.png", "icon-b_AI_2.png", "icon-a_1.png", "icon-b_2.png"]);
    await mount(dir);
    await checkAll();
    expect(q("[data-testid=batch-selected-count]")?.textContent).toContain("2 selected");
    const writes = arm(dir);
    await click(q("[data-testid=batch-preview]")!);
    await settle(300);
    expect(workCalls).toEqual(["icon-a_AI_1.png", "icon-b_AI_2.png"]);
    for (const rel of ["icon-a_AI_1.png", "icon-b_AI_2.png"]) {
      expect(stripState(rel)).toBe("ready");
      expect(countText(rel)).toBe("3 icons");
      expect(host.querySelector(byTestId(`batch-preview-img-${rel}`))).not.toBeNull();
    }
    expect(q("[data-testid=batch-preview-progress]")?.textContent).toContain("2/2");
    expect(writes()).toBe(0); // the guard: no file created, no writable opened
  });

  it("leaves rows that cannot be processed alone (no strip, no work)", async () => {
    const dir = makeRoot(["icon-a_AI_1.png", "icon-a_1.png"]);
    await mount(dir);
    await checkAll();
    await click(q("[data-testid=batch-preview]")!);
    await settle(300);
    expect(stripState("icon-a_1.png")).toBeNull(); // the reference, not an eligible source
  });

  it("reports a failing row honestly and carries on with the rest (I-68)", async () => {
    const dir = makeRoot(["icon-a_AI_1.png", "icon-b_AI_2.png", "icon-a_1.png", "icon-b_2.png"]);
    failing.add("icon-a_AI_1.png");
    await mount(dir);
    await checkAll();
    await click(q("[data-testid=batch-preview]")!);
    await settle(300);
    expect(stripState("icon-a_AI_1.png")).toBe("error");
    expect(countText("icon-a_AI_1.png")).toContain("decode failed");
    expect(stripState("icon-b_AI_2.png")).toBe("ready");
  });

  it("Stop ends the session, keeps what is done and says the rest was not previewed", async () => {
    const dir = makeRoot(["icon-a_AI_1.png", "icon-b_AI_2.png", "icon-a_1.png", "icon-b_2.png"]);
    slow = new Set(["icon-b_AI_2.png"]); // the second row is still reading when Stop lands
    await mount(dir);
    await checkAll();
    await click(q("[data-testid=batch-preview]")!);
    await settle(200); // the first row finishes, the second is still reading
    await click(q("[data-testid=batch-preview-stop]")!);
    await settle(800); // past the slow row's own delay: it must not finish the session
    expect(q("[data-testid=batch-preview-stop]")).toBeNull();
    expect(stripState("icon-a_AI_1.png")).toBe("ready");
    expect(stripState("icon-b_AI_2.png")).toBe("stopped");
    expect(countText("icon-b_AI_2.png")).toContain("Not previewed");
  });

  it("unchecking a row mid-session removes its strip and stops its job", async () => {
    const dir = makeRoot(["icon-a_AI_1.png", "icon-b_AI_2.png", "icon-a_1.png", "icon-b_2.png"]);
    workDelay = 60;
    await mount(dir);
    await checkAll();
    await click(q("[data-testid=batch-preview]")!);
    await settle(30);
    await click(q('[data-testid="row-select-icon-b_AI_2.png"]')!);
    await settle(400); // the strip goes at once; the debounced replan lands after
    expect(stripState("icon-b_AI_2.png")).toBeNull();
    expect(workCalls.filter((c) => c === "icon-b_AI_2.png")).toHaveLength(1); // no restart
  });

  it("a merge-slider change replans the preview with the new value", async () => {
    const dir = makeRoot(["icon-a_AI_1.png", "icon-a_1.png"]);
    await mount(dir);
    await checkAll();
    await click(q("[data-testid=batch-preview]")!);
    await settle(200);
    workCalls = [];
    const slider = q("[data-testid=batch-merge]") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(slider, "0.05");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle(600); // debounce + replan
    expect(workCalls).toContain("icon-a_AI_1.png");
    expect(stripState("icon-a_AI_1.png")).toBe("ready");
  });

  it("leaving the tab ends the session and revokes every strip URL (D9/D10)", async () => {
    const dir = makeRoot(["icon-a_AI_1.png", "icon-a_1.png"]);
    const revoked: string[] = [];
    const realRevoke = URL.revokeObjectURL.bind(URL);
    vi.spyOn(URL, "revokeObjectURL").mockImplementation((u: string) => {
      revoked.push(u);
      realRevoke(u);
    });
    await mount(dir);
    await checkAll();
    await click(q("[data-testid=batch-preview]")!);
    await settle(200);
    const urls = host.querySelectorAll("[data-testid^=batch-preview-img-]").length;
    expect(urls).toBeGreaterThan(0);
    await act(async () => root.unmount());
    host.remove();
    host = undefined as unknown as HTMLDivElement;
    expect(revoked.length).toBeGreaterThanOrEqual(urls);
  });

  it("plans 1000 rows in list order, keeps the counter live, and writes nothing", async () => {
    const names = Array.from({ length: 1000 }, (_, i) => `icon-${String(i).padStart(4, "0")}_AI_1.png`);
    const dir = makeRoot(names);
    await mount(dir);
    const writes = arm(dir);
    await checkAll();
    expect(q("[data-testid=batch-selected-count]")?.textContent).toContain("1000 selected");
    // happy-dom has no layout, so every rect is 0 — which the window math reads as
    // "everything is near" (the window itself is covered by preview_viewport.test).
    await click(q("[data-testid=batch-preview]")!);
    await settle(150);
    const line = q("[data-testid=batch-preview-progress]")?.textContent ?? "";
    expect(line).toMatch(/\/1000 rows/);
    const done = Number(line.match(/Previewed (\d+)\//)?.[1] ?? -1);
    expect(done).toBeGreaterThan(0);
    expect(workCalls[0]).toBe("icon-0000_AI_1.png"); // the user's own list order (D4)
    expect(writes()).toBe(0);
    await click(q("[data-testid=batch-preview-stop]")!);
    const started = workCalls.length;
    await settle(250);
    expect(workCalls.length).toBe(started); // no new row starts after Stop (I-68)
  });
});
