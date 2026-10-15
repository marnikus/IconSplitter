// batch_preview_restart.test.tsx — TDD for stored split previews (2026-10-15):
// previews survive a page restart and render without any user action; only
// "Regenerate splits" re-renders and REWRITES the stored record; "Preview
// splits" never touches rows that already have a preview; re-picking the same
// folder does not blank the previews; restoring writes nothing in a loop.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fakeIndexedDb from "fake-indexeddb";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { dropDb } from "./helpers/idb";
import { clearKnownRoots } from "../src/lib/knownroots";
import { setImageDecodeTimeout } from "../src/lib/dom";
import BatchPanel from "../src/batch/BatchPanel";
import { BATCH_PREFS_KEY } from "../src/lib/batchprefs";
import { MERGES_KEY } from "../src/lib/batchmerges";
import { defaultPreset } from "../src/lib/presets";
import { idbGet, idbPut, PREVIEW_STORE, savePresets } from "../src/batch/store";
import type { DirHandleLike, FileHandleLike, WritableLike } from "../src/lib/fs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PickerWindow = { showDirectoryPicker?: () => Promise<unknown> };

// happy-dom has no IndexedDB: the real store runs against fake-indexeddb so the
// preview records round-trip exactly as in the browser.
vi.stubGlobal("indexedDB", fakeIndexedDb.indexedDB);
// The handle store keeps LIVE objects (in the browser a restored handle works;
// a structured clone of the in-memory fake would not) — the preview records
// below still travel through the REAL IndexedDB.
const handlesByName = new Map<string, { source?: unknown; dest?: unknown }>();
vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return {
    ...actual,
    saveHandles: vi.fn(async (name: string, handles: { source?: unknown; dest?: unknown }) => { handlesByName.set(name, handles); }),
    loadHandles: vi.fn(async (name: string) => handlesByName.get(name) ?? null),
  };
});

function makeBatchRoot(name: string): FakeDir {
  const root = new FakeDir(name);
  root.children.set("icon-a_AI.png", new FakeFile("icon-a_AI.png", 10, Date.now(), "a"));
  root.children.set("icon-a.png", new FakeFile("icon-a.png", 5, 1000, "ref"));
  root.children.set("icon-b_AI.png", new FakeFile("icon-b_AI.png", 10, Date.now(), "b"));
  root.children.set("icon-b.png", new FakeFile("icon-b.png", 5, 1000, "ref"));
  return root;
}

/** A second handle to the SAME folder — what a re-pick hands back. */
class RepickedHandle implements DirHandleLike {
  kind = "directory" as const;
  constructor(private inner: FakeDir, public name = inner.name) {}
  getDirectoryHandle(n: string, opts?: { create?: boolean }) { return this.inner.getDirectoryHandle(n, opts); }
  getFileHandle(n: string, opts?: { create?: boolean }) { return this.inner.getFileHandle(n, opts); }
  async *entries() { for await (const [k, v] of this.inner.entries()) yield [k, v] as [string, DirHandleLike | FileHandleLike]; }
}

/** Counts `<base>.json` writes — the restore loop must not churn the disk. */
class WatchedDir implements DirHandleLike {
  kind = "directory" as const;
  jsonWrites = 0;
  constructor(private inner: FakeDir) {}
  get name(): string { return this.inner.name; }
  async getDirectoryHandle(n: string, opts?: { create?: boolean }): Promise<DirHandleLike> {
    const d = await this.inner.getDirectoryHandle(n, opts);
    return d instanceof FakeDir ? new WatchedDir(d) : d;
  }
  async getFileHandle(n: string, opts?: { create?: boolean }): Promise<FileHandleLike> {
    const fh = await this.inner.getFileHandle(n, opts);
    if (!n.endsWith(".json")) return fh;
    return {
      kind: "file" as const,
      name: fh.name,
      getFile: () => fh.getFile(),
      createWritable: async (): Promise<WritableLike> => { this.jsonWrites += 1; return fh.createWritable(); },
    };
  }
  async *entries() { for await (const [k, v] of this.inner.entries()) yield [k, v] as [string, DirHandleLike | FileHandleLike]; }
}

/** A handle whose permission the browser "forgot" after a reload. */
class PermDir implements DirHandleLike {
  kind = "directory" as const;
  mode: "granted" | "prompt" = "granted";
  gesture = false; // whether a requestPermission call carries user activation
  requestCalls = 0;
  constructor(private inner: FakeDir) {}
  get name(): string { return this.inner.name; }
  async queryPermission(): Promise<string> { return this.mode; }
  async requestPermission(): Promise<string> {
    this.requestCalls += 1;
    if (!this.gesture) throw new DOMException("Must be handling a user gesture to show a permission request", "NotAllowedError");
    this.mode = "granted";
    return "granted";
  }
  getDirectoryHandle(n: string, opts?: { create?: boolean }) { return this.inner.getDirectoryHandle(n, opts); }
  getFileHandle(n: string, opts?: { create?: boolean }) { return this.inner.getFileHandle(n, opts); }
  async *entries() { for await (const [k, v] of this.inner.entries()) yield [k, v] as [string, DirHandleLike | FileHandleLike]; }
}

/** A handle whose walk fails until the "disk" is plugged back. */
class FlakyScan implements DirHandleLike {
  kind = "directory" as const;
  fail = true;
  constructor(private inner: FakeDir) {}
  get name(): string { return this.inner.name; }
  getDirectoryHandle(n: string, opts?: { create?: boolean }) { return this.inner.getDirectoryHandle(n, opts); }
  getFileHandle(n: string, opts?: { create?: boolean }) { return this.inner.getFileHandle(n, opts); }
  async *entries() {
    if (this.fail) throw new Error("disk unplugged");
    for await (const [k, v] of this.inner.entries()) yield [k, v] as [string, DirHandleLike | FileHandleLike];
  }
}

let host: HTMLDivElement;
let ui: Root;

async function mount(): Promise<void> {
  host = document.createElement("div");
  document.body.appendChild(host);
  ui = createRoot(host);
  await act(async () => { ui.render(<BatchPanel />); });
}

async function unmount(): Promise<void> {
  await act(async () => ui.unmount());
  host.remove();
}

const q = (sel: string): Element | null => host.querySelector(sel);
const qAll = (sel: string): NodeListOf<Element> => host.querySelectorAll(sel);

async function settle(ms = 80): Promise<void> {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
}

async function click(el: Element): Promise<void> {
  await act(async () => { (el as HTMLElement).click(); });
}

/** Session one: pick the folder, select everything, render the previews. */
async function previewSession(dir: FakeDir): Promise<void> {
  (window as unknown as PickerWindow).showDirectoryPicker = async () => dir as unknown;
  await mount();
  await settle(100);
  await click(q("[data-testid=batch-open-folder]")!);
  await settle(500);
  await click(q("[data-testid=batch-select-visible]")!);
  await settle(100);
  await click(q("[data-testid=batch-preview]")!);
  await settle(1200);
}

async function storedRecord(rootName: string, relPath: string): Promise<Record<string, unknown> | null> {
  return (await idbGet<Record<string, unknown>>(PREVIEW_STORE, `${rootName}::${relPath}`)) ?? null;
}

/** React reads the native value setter, so a range change must go through it. */
async function setRange(sel: string, value: string): Promise<void> {
  const el = q(sel) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle(30);
}

/** React reads the native value setter, so a select change must go through it. */
async function chooseSelect(sel: string, value: string): Promise<void> {
  const el = q(sel) as HTMLSelectElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  await act(async () => {
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle(400);
}

/** Applies a per-item merge override through the real row controls. */
async function applyMerge(relPath: string, value: string): Promise<void> {
  await setRange(`[data-testid="batch-row-merge-slider-${relPath}"]`, value);
  await click(q(`[data-testid="batch-row-merge-apply-${relPath}"]`)!);
  await settle(400);
}

async function seedStoredPreview(rootName: string, relPath: string, at: number, thumbs: string[]): Promise<void> {
  await idbPut(PREVIEW_STORE, `${rootName}::${relPath}`, {
    relPath, count: 3, thumbs, boxes: [{ x: 0, y: 0, w: 10, h: 10, ink: 1 }], status: "done", rootName, at,
  });
}

beforeEach(async () => {
  vi.stubGlobal("indexedDB", fakeIndexedDb.indexedDB);
  setImageDecodeTimeout(25); // the sandbox DOM never answers an image load
  localStorage.clear();
  sessionStorage.clear();
  localStorage.removeItem(BATCH_PREFS_KEY);
  handlesByName.clear();
  await dropDb();
  clearKnownRoots();
  vi.clearAllMocks(); // keep the factory implementations; history only (restoreAllMocks wipes them)
  delete (window as unknown as PickerWindow).showDirectoryPicker; // simulate a fresh profile (no picker)
  if (host) await unmount();
});

afterEach(async () => {
  if (host) await unmount();
  setImageDecodeTimeout(8000);
  vi.unstubAllGlobals();
});

describe("stored split previews (restart)", () => {
  it("restores previews after a restart — counts visible with no user action", async () => {
    const dir = makeBatchRoot("restart_restore_root");
    await previewSession(dir);
    expect(qAll("[data-testid^=batch-preview-count-]").length).toBeGreaterThan(0);
    await unmount();

    // A fresh page: no picker available — boot restores the root on its own.
    await mount();
    await settle(1200);

    const counts = qAll("[data-testid^=batch-preview-count-]");
    expect(counts.length).toBeGreaterThan(0);
    for (const c of counts) expect(c.textContent).toMatch(/icon/);
    // The restored previews kept driving the review, as session one did
    // (the fake files cannot decode, so the honest fallback count is 1 → warning).
    expect(q('[data-testid="batch-review-badge-warning"]')).not.toBeNull();
  });

  it("Regenerate splits re-renders and REWRITES the stored record after a restart", async () => {
    handlesByName.set("Default", { source: makeBatchRoot("regen_rewrite_root") });
    await seedStoredPreview("regen_rewrite_root", "icon-a_AI.png", 1000, ["data:image/png;base64,OLDTHUMB"]);
    await mount(); // no picker: boot restores the root
    await settle(800);
    const count = q('[data-testid="batch-preview-count-icon-a_AI.png"]');
    expect(count?.textContent).toContain("3 icon"); // the seeded record shows
    expect(q('[data-testid="batch-preview-thumb-icon-a_AI.png-0"]')?.getAttribute("src")).toBe("data:image/png;base64,OLDTHUMB");

    await click(q("[data-testid=batch-select-visible]")!);
    await settle(100);
    await click(q("[data-testid=batch-regenerate]")!);
    await settle(1200);

    // Re-rendered from the (undecodable fake) file: the honest fallback count.
    expect(q('[data-testid="batch-preview-count-icon-a_AI.png"]')?.textContent).toContain("1 icon");
    const rec = await storedRecord("regen_rewrite_root", "icon-a_AI.png");
    expect(rec?.count).toBe(1); // the old record was replaced, not kept
    expect(Number(rec?.at)).toBeGreaterThan(1000);
  });

  it("Regenerate splits rewrites even with a warm in-session cache", async () => {
    const dir = makeBatchRoot("regen_warm_root");
    await previewSession(dir);
    const first = await storedRecord("regen_warm_root", "icon-a_AI.png");
    expect(first?.count).toBe(1);
    await settle(60);
    await click(q("[data-testid=batch-regenerate]")!); // same session, warm LRU
    await settle(1200);
    const second = await storedRecord("regen_warm_root", "icon-a_AI.png");
    expect(Number(second?.at)).toBeGreaterThan(Number(first?.at)); // re-rendered + rewritten
  });

  it("Preview splits skips rows that already have a stored preview", async () => {
    handlesByName.set("Default", { source: makeBatchRoot("skip_done_root") });
    await seedStoredPreview("skip_done_root", "icon-a_AI.png", 1000, ["data:image/png;base64,OLDTHUMB"]);
    await mount();
    await settle(800);
    await click(q("[data-testid=batch-select-visible]")!);
    await settle(100);
    await click(q("[data-testid=batch-preview]")!);
    await settle(800);

    const rec = await storedRecord("skip_done_root", "icon-a_AI.png");
    expect(rec?.count).toBe(3); // untouched
    expect(rec?.at).toBe(1000);
    expect(q('[data-testid="batch-preview-thumb-icon-a_AI.png-0"]')?.getAttribute("src")).toBe("data:image/png;base64,OLDTHUMB");
  });

  it("re-picking the same folder (a fresh handle) keeps the previews visible", async () => {
    const dir = makeBatchRoot("repick_root");
    await previewSession(dir);
    expect(qAll("[data-testid^=batch-preview-count-]").length).toBeGreaterThan(0);
    await unmount();

    // Restart, then the user re-picks the same folder — a NEW handle object.
    (window as unknown as PickerWindow).showDirectoryPicker = async () => new RepickedHandle(dir) as unknown;
    await mount();
    await settle(600);
    await click(q("[data-testid=batch-open-folder]")!);
    await settle(1000);

    const counts = qAll("[data-testid^=batch-preview-count-]");
    expect(counts.length).toBeGreaterThan(0);
    for (const c of counts) expect(c.textContent).toMatch(/icon/);
  });

  it("a per-item merge decision survives a restart — the bar shows it, nothing regenerates", async () => {
    const dir = makeBatchRoot("merge_survive_root");
    await previewSession(dir);
    await applyMerge("icon-a_AI.png", "0.05");
    expect(q('[data-testid="batch-row-merge-label-icon-a_AI.png"]')?.textContent).toContain("overridden");
    await settle(200);
    const before = await storedRecord("merge_survive_root", "icon-a_AI.png");
    await unmount();

    await mount(); // fresh page, no picker
    await settle(1200);

    // The decision is back, scoped to the preset, and the stored preview of
    // that row was NOT re-rendered (same record, same write time).
    expect(q('[data-testid="batch-row-merge-label-icon-a_AI.png"]')?.textContent).toContain("overridden");
    const saved = JSON.parse(localStorage.getItem(MERGES_KEY) ?? "{}");
    expect(saved.Default["icon-a_ai.png"]).toBe(0.05);
    const after = await storedRecord("merge_survive_root", "icon-a_AI.png");
    expect(after?.at).toBe(before?.at);
  });

  it("two presets keep separate merge decisions", async () => {
    savePresets([defaultPreset("Default"), defaultPreset("Wide")]);
    handlesByName.set("Default", { source: makeBatchRoot("preset_scope_root") });
    await mount();
    await settle(1200);
    await applyMerge("icon-a_AI.png", "0.05");

    await chooseSelect("[data-testid=preset-list]", "Wide");
    expect(q('[data-testid="batch-row-merge-label-icon-a_AI.png"]')?.textContent).not.toContain("overridden");
    await applyMerge("icon-a_AI.png", "0.1");

    await chooseSelect("[data-testid=preset-list]", "Default");
    await settle(800);
    expect(q('[data-testid="batch-row-merge-label-icon-a_AI.png"]')?.textContent).toContain("Merge 0.0500");
    const saved = JSON.parse(localStorage.getItem(MERGES_KEY) ?? "{}");
    expect(saved.Default["icon-a_ai.png"]).toBe(0.05);
    expect(saved.Wide["icon-a_ai.png"]).toBe(0.1);
  });

  it("a scan prunes merge decisions of deleted rows and persists the prune", async () => {
    localStorage.setItem(MERGES_KEY, JSON.stringify({ Default: { "gone_ai.png": 0.05, "icon-a_ai.png": 0.05 } }));
    handlesByName.set("Default", { source: makeBatchRoot("prune_root") });
    await mount();
    await settle(1200);
    const saved = JSON.parse(localStorage.getItem(MERGES_KEY) ?? "{}");
    expect(saved.Default["gone_ai.png"]).toBeUndefined();
    expect(saved.Default["icon-a_ai.png"]).toBe(0.05);
  });

  it("a preview stored under other settings is stale: shown, but Preview re-renders it", async () => {
    const dir = makeBatchRoot("stale_key_root");
    await previewSession(dir);
    const before = await storedRecord("stale_key_root", "icon-a_AI.png");
    expect(typeof before?.key).toBe("string"); // records carry their settings fingerprint

    // The user changes a split setting, then restarts.
    await setRange("[data-testid=batch-padding]", "12");
    await settle(200);
    await unmount();
    await mount();
    await settle(1200);

    // The restored preview is honest about being stale…
    const count = q('[data-testid="batch-preview-count-icon-a_AI.png"]');
    expect(count?.getAttribute("data-stale")).toBe("true");
    // …and Preview does NOT treat it as done: the row re-renders and rewrites.
    await click(q("[data-testid=batch-select-visible]")!);
    await settle(100);
    await click(q("[data-testid=batch-preview]")!);
    await settle(1200);
    const after = await storedRecord("stale_key_root", "icon-a_AI.png");
    expect(Number(after?.at)).toBeGreaterThan(Number(before?.at));
    expect(after?.key).not.toBe(before?.key); // new settings, new fingerprint
    expect(q('[data-testid="batch-preview-count-icon-a_AI.png"]')?.getAttribute("data-stale")).toBe("false");
  });

  it("a reload with permission 'prompt' never auto-prompts; one Restore-access click returns rows and previews", async () => {
    const dir = new PermDir(makeBatchRoot("grant_root"));
    await previewSession(dir as unknown as FakeDir);
    const before = await storedRecord("grant_root", "icon-a_AI.png");
    await unmount();

    dir.mode = "prompt"; // the reload dropped the permission
    delete (window as unknown as PickerWindow).showDirectoryPicker;
    await mount();
    await settle(1000);

    expect(dir.requestCalls).toBe(0); // boot must never spend (or waste) the gesture
    expect(q("[data-testid=batch-grant]")).not.toBeNull(); // the one-click affordance
    expect(q('[data-testid="batch-row-icon-a_AI.png"]')).toBeNull(); // honest: no access, no rows

    dir.gesture = true; // the click IS the user activation
    await click(q("[data-testid=batch-grant]")!);
    await settle(1500);

    expect(dir.requestCalls).toBe(1);
    expect(q("[data-testid=batch-grant]")).toBeNull();
    const counts = qAll("[data-testid^=batch-preview-count-]");
    expect(counts.length).toBeGreaterThan(0); // previews are back…
    const after = await storedRecord("grant_root", "icon-a_AI.png");
    expect(after?.at).toBe(before?.at); // …restored, NOT regenerated
  });

  it("a refused grant is honest: the banner stays and says why", async () => {
    const dir = new PermDir(makeBatchRoot("refuse_root"));
    dir.mode = "prompt";
    handlesByName.set("Default", { source: dir });
    await mount();
    await settle(800);
    expect(q("[data-testid=batch-grant]")).not.toBeNull();

    dir.gesture = false; // the browser refuses a gesture-less request
    await click(q("[data-testid=batch-grant]")!);
    await settle(600);

    expect(dir.requestCalls).toBe(1);
    expect(q("[data-testid=batch-grant]")).not.toBeNull(); // still no access
    expect(q('[data-testid="batch-toast"]')?.textContent ?? "").toMatch(/refused|denied|access/i);
  });

  it("previews restore even while the scan fails, and a later rescan shows them untouched", async () => {
    const dir = new FlakyScan(makeBatchRoot("flaky_root"));
    handlesByName.set("Default", { source: dir });
    await seedStoredPreview("flaky_root", "icon-a_AI.png", 1000, ["data:image/png;base64,OLDTHUMB"]);
    await mount();
    await settle(1000);
    expect(q('[data-testid="batch-toast"]')?.textContent ?? "").toContain("disk unplugged"); // honest failure
    expect(q('[data-testid="batch-row-icon-a_AI.png"]')).toBeNull();

    dir.fail = false;
    await click(q("[data-testid=batch-rescan]")!);
    await settle(1500);

    // The record restored during the failed-scan period renders untouched.
    expect(q('[data-testid="batch-preview-thumb-icon-a_AI.png-0"]')?.getAttribute("src")).toBe("data:image/png;base64,OLDTHUMB");
    const rec = await storedRecord("flaky_root", "icon-a_AI.png");
    expect(rec?.at).toBe(1000);
  });

  it("restoring runs once — no IndexedDB read storm, no state-JSON write churn", async () => {
    const inner = makeBatchRoot("storm_root");
    const watched = new WatchedDir(inner);
    await previewSession(watched as unknown as FakeDir);
    await unmount();

    (window as unknown as PickerWindow).showDirectoryPicker = async () => watched as unknown;
    await mount();
    await settle(1500); // restore + scan + review sync settle here

    const writesAtRestore = watched.jsonWrites;
    await settle(900); // ...and the page keeps rendering afterwards

    // The writes during the second window: a stable page rewrites nothing.
    expect(watched.jsonWrites - writesAtRestore).toBe(0);
  });
});
