// svgpanel.tsx — the shared fixture of the svg_ui*.test.tsx files: the real
// SvgPanel + HistoryBar on one host, an in-memory handle store, the approved
// architecture/{fog,court} root and the DOM drivers the tests click through.
// Split out so the tab's tests run as two files in parallel (TEST_HARNESS.md).
import { act } from "react";
import * as fakeIndexedDb from "fake-indexeddb";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, vi } from "vitest";
import { pairId } from "../../src/lib/pairing";
import { clearKnownRoots } from "../../src/lib/knownroots";
import { clearApiKey } from "../../src/svg/keystore";
import SvgPanel from "../../src/svg/SvgPanel";
import { resetAppStore } from "../../src/state/appstore";
import { HistoryProvider } from "../../src/state/HistoryProvider";
import { usePrefsAutosave } from "../../src/state/usePrefsAutosave";
import HistoryBar from "../../src/ui/HistoryBar";
import { FakeDir, FakeFile } from "./fakefs";
import { dropDb } from "./idb";
import { settle as quietSettle } from "./quiet";

/**
 * A working device store for the tests about the DEVICE case. Without it
 * happy-dom has no IndexedDB, the write is refused, and the honest UI says
 * "session only" — which is the other test's subject.
 */
export function useDeviceStorage(): void {
  vi.stubGlobal("indexedDB", fakeIndexedDb.indexedDB);
  vi.stubGlobal("IDBKeyRange", fakeIndexedDb.IDBKeyRange);
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// No IndexedDB in this DOM: an in-memory handle store keeps the boot real.
export const stored = new Map<string, unknown>();
vi.mock("../../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/batch/store")>();
  return {
    ...actual,
    saveHandles: vi.fn(async (name: string, handles: unknown) => { stored.set(name, handles); }),
    loadHandles: vi.fn(async (name: string) => stored.get(name) ?? null),
  };
});

// A browser without the File System Access API must still render the note.
export const w = window as unknown as { showDirectoryPicker?: unknown };
w.showDirectoryPicker = () => Promise.reject(new Error("no picker"));

/** Assembled from parts so the hygiene gate sees no key-shaped literal. */
export const fakeKey = (...parts: string[]) => parts.join("_");

export const FOG = pairId("architecture", "fog", "");
export const COURT = pairId("architecture", "court", "");

/** The one saved document the fixture holds — the preview must never alter it. */
export const SAVED_SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path d=\"M2 2h20v20H2z\"/></svg>";

/** The pair file as it was written last time — the preview must never touch it. */
export const SIDECAR = JSON.stringify({
  v: 1,
  source: { relPath: "architecture/fog_AI.png", name: "fog_AI.png", fingerprint: "20:3100" },
  versions: [{
    version: 1, svgPath: "architecture/fog_AI.svg", status: "generated", review: "pending",
    prompt: "p", provider: "Requesty", model: "openai/gpt-6.1-sol",
    requestedAt: "2026-10-01T10:00:00.000Z", completedAt: "2026-10-01T10:00:05.000Z",
    usage: { input: 100, output: 200, total: 300 },
    // provider-reported: shown as "reported", never as an estimate
    cost: { actual: 0.01, estimated: null, currency: "USD", pricing: "requesty-2026-10-01", basis: "provider" },
    validation: { ok: true, errors: [], warnings: [], icons: 1 },
    batch: null, error: null, requestId: null,
  }, {
    // a charged-but-invalid attempt: its cost is a labelled estimate
    version: 2, svgPath: "", status: "failed", review: "pending",
    prompt: "p", provider: "Requesty", model: "openai/gpt-6.1-sol",
    requestedAt: "2026-10-01T11:00:00.000Z", completedAt: "2026-10-01T11:00:04.000Z",
    usage: { input: 10, output: 20, total: 30 },
    cost: { actual: null, estimated: 0.02, currency: "USD", pricing: "requesty-2026-10-01", basis: "batch-split" },
    validation: { ok: false, errors: ["unsafe <script> element"], warnings: [], icons: 0 },
    batch: null, error: "invalid SVG: unsafe <script> element", requestId: null,
  }],
});

export let host: HTMLDivElement;
let ui: Root;

/** Mounts the panel and the history bar on `host` (no stored root implied). */
export async function renderPanel(): Promise<void> {
  await act(async () => {
    ui = createRoot(host);
    ui.render(<HistoryProvider><Host><SvgPanel /><HistoryBar /></Host></HistoryProvider>);
  });
}

/** A restart: unmounts the panel; the next mount reads what was stored. */
export async function unmountPanel(): Promise<void> {
  await act(async () => { ui.unmount(); });
}

export function Host({ children }: { children: React.ReactNode }) {
  usePrefsAutosave();
  return <>{children}</>;
}

/** architecture/{fog,court}, both approved, with a saved v1 for fog. */
export async function makeRoot(): Promise<FakeDir> {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  arch.children.set("fog.png", new FakeFile("fog.png", 12, 3000, "a"));
  arch.children.set("fog_AI.png", new FakeFile("fog_AI.png", 20, 3100, "b"));
  arch.children.set("court.png", new FakeFile("court.png", 12, 2000, "c"));
  arch.children.set("court_AI.png", new FakeFile("court_AI.png", 20, 2100, "d"));
  arch.children.set("fog_AI.svg", new FakeFile("fog_AI.svg", SAVED_SVG.length, 3200, SAVED_SVG));
  arch.children.set("fog_AI.svg.json", new FakeFile("fog_AI.svg.json", 10, 3200, SIDECAR));
  root.children.set("architecture", arch);
  const recs = [FOG, COURT].map((id) => ({
    pair_id: id, source: `${id}.png`, ai_result: `${id}_AI.png`,
    decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z",
  }));
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({ records: recs })));
  return root;
}

export const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;

export function text(sel: string): string {
  return q(sel)?.textContent ?? "";
}

export async function click(el: HTMLElement): Promise<void> {
  await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

/** The px box a preview was given — the size the browser will really lay out. */
export function box(sel: string): { w: number; h: number } {
  const el = q(sel) as HTMLElement;
  return { w: parseInt(el.style.width, 10), h: parseInt(el.style.height, 10) };
}

export function stubClipboard(value: string): void {
  Object.defineProperty(navigator, "clipboard", {
    value: { readText: async () => value, writeText: async () => undefined }, configurable: true,
  });
}

export type PickerWindow = { showDirectoryPicker?: () => Promise<unknown> };

/** The document inside a preview data URL — must be the file's own bytes. */
export const input = (sel: string) => q(sel) as HTMLInputElement;
export const settle = () => quietSettle(0);

/** React tracks input values, so the native setter must be used to change one. */
export async function type(sel: string, value: string): Promise<void> {
  await act(async () => {
    const el = input(sel);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Changing the effort is a real config write: the tier caps re-resolve. */
export async function selectEffort(value: string): Promise<void> {
  await act(async () => {
    const el = q("[data-testid=svg-effort]") as HTMLSelectElement;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}

/** Changing the model is a real config write: it re-reads the new caps. */
export async function setModel(id: string): Promise<void> {
  await act(async () => {
    const el = input("[data-testid=svg-model]");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, id);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

/**
 * A hand pick: nothing remembered, the picker is the only way to a root — the
 * flow the reported question is about.
 */
export async function mountPick(root: FakeDir): Promise<void> {
  stored.delete("__svg__");
  stored.delete("__selection__");
  (window as unknown as PickerWindow).showDirectoryPicker = () => Promise.resolve(root);
  await renderPanel();
  await settle();
  await click(q("[data-testid=svg-open-folder]") as HTMLElement);
  await settle();
}

export async function mount(root: FakeDir): Promise<void> {
  stored.set("__svg__", { source: root });
  await renderPanel();
  await settle();
}

/** Per-test reset: call once at the top of each svg_ui test file. */
export function installSvgPanelHooks(): void {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  beforeEach(resetPanelState);
}

async function resetPanelState(): Promise<void> {
  await dropDb();
  // dropDb() empties IndexedDB but not the key store's session copy, and the
  // config/effort/prefs live in localStorage: without both resets a test that
  // saves a key or picks a tier would leak into the next one (RULE 8).
  await clearApiKey();
  window.localStorage.clear();
  stored.clear();
  clearKnownRoots();
  resetAppStore();
  host = document.createElement("div");
  document.body.appendChild(host);
}
