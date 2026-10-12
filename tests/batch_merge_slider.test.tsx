// batch_merge_slider.test.tsx — TDD for the ONE Batch merge control (design D2/T7).
// It lives in the preset row, it writes `preset.split.mergeFrac`, it survives a
// save/load round trip, and the split that runs afterwards receives exactly the
// value the slider shows (I-66, RULE 10/13/24).

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { dropDb } from "./helpers/idb";
import { clearKnownRoots } from "../src/lib/knownroots";
import BatchPanel from "../src/batch/BatchPanel";

const splitCalls: { mergeFrac: number | null }[] = [];
vi.mock("../src/lib/dom", () => ({
  loadImageFile: async () => ({ naturalWidth: 40, naturalHeight: 20 }) as HTMLImageElement,
}));
vi.mock("../src/lib/batchsplit", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/lib/batchsplit")>();
  return {
    ...real,
    splitSheet: async (_img: HTMLImageElement, split: { mergeFrac: number | null }) => {
      splitCalls.push({ mergeFrac: split.mergeFrac });
      return [new Blob(["png"], { type: "image/png" })];
    },
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
type PickerWindow = { showDirectoryPicker?: () => Promise<unknown> };
const PRESETS_KEY = "iconSplitter.presets.v1";

let host: HTMLDivElement;
let root: Root;

function makeRoot(): FakeDir {
  const dir = new FakeDir("merge_root");
  dir.children.set("icon-a_AI_1.png", new FakeFile("icon-a_AI_1.png", 10, 1000, "a"));
  dir.children.set("icon-a_1.png", new FakeFile("icon-a_1.png", 5, 1000, "ref"));
  return dir;
}

async function mount(dir: FakeDir) {
  (window as unknown as PickerWindow).showDirectoryPicker = async () => dir as unknown;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<BatchPanel />);
  });
  await settle(60);
  const btn = host.querySelector("[data-testid=batch-open-folder]") as HTMLElement | null;
  await click(btn!);
  await settle(400);
  return host;
}

function q(sel: string): HTMLElement | null {
  return host.querySelector(sel) as HTMLElement | null;
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

async function setRange(el: HTMLInputElement, value: string) {
  // Through the prototype setter, or React's value tracker swallows the event
  // (the repo's own convention for range/colour inputs).
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

function presetJson(): { split: { mergeFrac: number | null } }[] {
  return JSON.parse(localStorage.getItem(PRESETS_KEY) ?? "[]");
}

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  await dropDb();
  clearKnownRoots();
  splitCalls.length = 0;
  if (host) {
    await act(async () => root.unmount());
    host.remove();
  }
  // @ts-ignore
  delete (window as any).showDirectoryPicker;
});

describe("batch merge slider — one control, saved with the preset", () => {
  it("offers the same bounds and step as Single sheets, and starts on Auto", async () => {
    await mount(makeRoot());
    const slider = q("[data-testid=batch-merge]") as HTMLInputElement | null;
    expect(slider).not.toBeNull();
    expect(Number(slider!.min)).toBe(0);
    expect(Number(slider!.max)).toBe(0.15);
    expect(Number(slider!.step)).toBe(0.0025);
    expect(slider!.value).toBe("0");
    expect(q("[data-testid=batch-merge-value]")!.textContent).toMatch(/Auto/);
    expect((q("[data-testid=batch-merge-reset]") as HTMLButtonElement).disabled).toBe(true);
  });

  it("moving it switches to the manual value in state and in the saved preset", async () => {
    await mount(makeRoot());
    await setRange(q("[data-testid=batch-merge]") as HTMLInputElement, "0.0475");
    expect(q("[data-testid=batch-merge-value]")!.textContent).toContain("0.0475");
    expect((q("[data-testid=batch-merge-reset]") as HTMLButtonElement).disabled).toBe(false);
    await click(q("[data-testid=preset-save]")!);
    await settle();
    const saved = presetJson();
    expect(saved.some((p) => p.split.mergeFrac === 0.0475)).toBe(true);
  });

  it("the reset button returns it to auto and disables itself", async () => {
    await mount(makeRoot());
    await setRange(q("[data-testid=batch-merge]") as HTMLInputElement, "0.05");
    await click(q("[data-testid=batch-merge-reset]")!);
    await settle();
    expect(q("[data-testid=batch-merge-value]")!.textContent).toMatch(/Auto/);
    expect((q("[data-testid=batch-merge-reset]") as HTMLButtonElement).disabled).toBe(true);
  });

  it("a saved preset with a manual value shows that value on load (RULE 24)", async () => {
    localStorage.setItem(
      PRESETS_KEY,
      JSON.stringify([{ name: "manual", split: { padding: 6, size: 0, transparent: false, mergeFrac: 0.0475 } }]),
    );
    localStorage.setItem("iconSplitter.lastPreset.v1", "manual");
    await mount(makeRoot());
    expect(q("[data-testid=batch-merge-value]")!.textContent).toContain("0.0475");
    expect((q("[data-testid=batch-merge]") as HTMLInputElement).value).toBe("0.0475");
  });

  it("a corrupt fraction reads back as auto, never as a weird radius (RULE 13)", async () => {
    localStorage.setItem(
      PRESETS_KEY,
      JSON.stringify([{ name: "bad", split: { padding: 6, size: 0, transparent: false, mergeFrac: 0.9 } }]),
    );
    localStorage.setItem("iconSplitter.lastPreset.v1", "bad");
    await mount(makeRoot());
    expect(q("[data-testid=batch-merge-value]")!.textContent).toMatch(/Auto/);
  });

  it("the split receives the slider's value, not an earlier one (I-66)", async () => {
    await mount(makeRoot());
    // Selection is the app store's (V2): check the eligible row, then split it.
    await click(q('[data-testid="row-select-icon-a_AI_1.png"]')!);
    await settle();
    expect((q('[data-testid="row-select-icon-a_AI_1.png"]') as HTMLInputElement).checked).toBe(true);
    await setRange(q("[data-testid=batch-merge]") as HTMLInputElement, "0.05");
    await click(q("[data-testid=batch-process]")!);
    await settle(300);
    expect(splitCalls.at(-1)).toEqual({ mergeFrac: 0.05 });
  });

  it("keeps exactly one merge control in the whole Batch tab (D2/RULE 10)", async () => {
    await mount(makeRoot());
    expect(host.querySelectorAll("[data-testid=batch-merge]")).toHaveLength(1);
  });
});
