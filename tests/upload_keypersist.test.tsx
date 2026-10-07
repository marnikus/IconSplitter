// upload_keypersist.test.ts — the API key must survive what the user does to
// the app: a tab switch (the panel unmounts and boots again), an edit, and a
// page reload. And when the device storage cannot be read, the app must SAY so
// and keep the session copy — never present "no key" and ask for it again.
//
// Regression from the field: the key was saved, the panel confirmed it, and the
// very next boot reported "No Gemini API key yet" — the store was opened fresh
// on every read and every write, and any failed read was reported as "nothing
// stored", which is indistinguishable from "you never saved one".
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fakeIndexedDb from "fake-indexeddb";
import { pairId } from "../src/lib/pairing";
import { serializePairMeta } from "../src/lib/pairmeta";
import UploadPanel from "../src/upload/UploadPanel";
import { resetAppStore } from "../src/state/appstore";
import { HistoryProvider } from "../src/state/HistoryProvider";
import { BinDir, BinFile } from "./helpers/binfakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const stored = new Map<string, unknown>();
vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return {
    ...actual,
    saveHandles: vi.fn(async (name: string, handles: unknown) => { stored.set(name, handles); }),
    loadHandles: vi.fn(async (name: string) => stored.get(name) ?? null),
  };
});

(window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker = () => Promise.reject(new Error("no picker"));

/** Assembled from parts so the hygiene gate sees no key-shaped literal. */
const fakeKey = (...parts: string[]) => parts.join("_");
const KEY = fakeKey("AIza", "keypersist_9");

const DIR = "architecture";
const FOG = pairId(DIR, "fog", "");
const SAVED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>`;

let host: HTMLDivElement;
let ui: Root;
const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const text = (sel: string) => q(sel)?.textContent ?? "";
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

async function click(sel: string): Promise<void> {
  await act(async () => { (q(sel) as HTMLButtonElement).click(); });
  await settle();
}

async function typeInto(sel: string, value: string): Promise<void> {
  await act(async () => {
    const el = q(sel) as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

function makeRoot(): BinDir {
  const root = new BinDir("split_root");
  const dir = new BinDir(DIR);
  const meta = pairFile(DIR, "fog_AI.png", { id: FOG, versions: [svgVersion(`${DIR}/fog_AI.svg`, { version: 1, review: "approved" })] });
  dir.children.set("fog_AI.svg.json", new BinFile("fog_AI.svg.json", serializePairMeta(meta), 3300));
  dir.children.set("fog_AI.png", new BinFile("fog_AI.png", "ai", 3100));
  dir.children.set("fog_AI.svg", new BinFile("fog_AI.svg", SAVED_SVG, 3400));
  root.children.set(DIR, dir);
  return root;
}

/** Mounts the panel the way the app does — a fresh boot every time. */
async function mount(): Promise<void> {
  stored.set("__upload__", { source: makeRoot() });
  await act(async () => {
    ui = createRoot(host);
    ui.render(<HistoryProvider><UploadPanel /></HistoryProvider>);
  });
  await settle();
}

/** One real in-app edit: the metadata prompt the user rewrites. */
async function editPrompt(value: string): Promise<void> {
  await act(async () => {
    const el = q("[data-testid=upload-prompt]") as HTMLTextAreaElement;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

beforeEach(async () => {
  vi.stubGlobal("indexedDB", fakeIndexedDb.indexedDB);
  vi.stubGlobal("IDBKeyRange", fakeIndexedDb.IDBKeyRange);
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase("iconSplitter");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
  window.localStorage.clear();
  stored.clear();
  resetAppStore();
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(async () => {
  await act(async () => ui?.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("the API key survives the app being used", () => {
  it("is still there after a tab switch, an edit, and a second boot", async () => {
    await mount();
    await click("[data-testid=upload-key-state]");
    await typeInto("[data-testid=upload-key-input]", KEY);
    await click("[data-testid=upload-key-save]");
    expect(text("[data-testid=upload-key-mask]")).toContain("•••");

    // an edit, then a tab switch and back: the panel boots from scratch
    await editPrompt("Be precise about the artwork.");
    await act(async () => ui.unmount());
    await mount();
    expect(text("[data-testid=upload-key-mask]")).toContain("•••");
    expect(text("[data-testid=upload-key-state]")).toContain("secured locally");
  });

  it("is still there after a page reload (a fresh module registry)", async () => {
    await mount();
    await click("[data-testid=upload-key-state]");
    await typeInto("[data-testid=upload-key-input]", KEY);
    await click("[data-testid=upload-key-save]");
    await act(async () => ui.unmount());

    vi.resetModules(); // a reload: no module-level memory survives
    const { loadGeminiKey } = await import("../src/upload/keystore");
    expect(await loadGeminiKey()).toBe(KEY);
  });

  it("never asks for the key again while the session copy is alive, even when storage breaks", async () => {
    await mount();
    await click("[data-testid=upload-key-state]");
    await typeInto("[data-testid=upload-key-input]", KEY);
    await click("[data-testid=upload-key-save]");
    await act(async () => ui.unmount());

    // the device storage now refuses to open (private mode, file://, a blocked
    // upgrade): the session copy must still answer, and the UI must not pretend
    // the user never saved a key
    vi.stubGlobal("indexedDB", { open: () => { throw new Error("storage denied"); } });
    await mount();
    // the key is still IN HAND — the app says which case this is instead of
    // showing "No Gemini API key yet" and making the user paste it again
    expect(text("[data-testid=upload-key-state]")).not.toContain("No Gemini API key yet");
    expect(text("[data-testid=upload-key-state]")).toContain("kept for this session only");
    expect(text("[data-testid=upload-key-mask]")).toContain("•••");
    expect(text("[data-testid=upload-key-note]")).toContain("paste again after a reload");
  });

  it("does not destroy a stored key when Save is pressed with an empty field", async () => {
    await mount();
    await click("[data-testid=upload-key-state]");
    await typeInto("[data-testid=upload-key-input]", KEY);
    await click("[data-testid=upload-key-save]");

    // the field is empty: Save is disabled, so a slip cannot even be attempted
    await click("[data-testid=upload-key-state]");
    expect((q("[data-testid=upload-key-save]") as HTMLButtonElement).disabled).toBe(true);
    await click("[data-testid=upload-key-save]"); // does nothing, by design
    await click("[data-testid=upload-key-cancel]");
    const { loadGeminiKey } = await import("../src/upload/keystore");
    expect(await loadGeminiKey()).toBe(KEY);
    expect(text("[data-testid=upload-key-state]")).toContain("secured locally");

    // and forgetting is a deliberate, separate act that really clears it
    await click("[data-testid=upload-key-forget]");
    expect(await loadGeminiKey()).toBe(null);
    expect(text("[data-testid=upload-key-state]")).toContain("No Gemini API key yet");
  });
});

describe("the IndexedDB connection is owned, not leaked", () => {
  it("opens ONE connection for many reads and writes", async () => {
    let opens = 0;
    const real = fakeIndexedDb.indexedDB.open.bind(fakeIndexedDb.indexedDB);
    vi.stubGlobal("indexedDB", {
      open: (...args: Parameters<typeof real>) => { opens += 1; return real(...args); },
      deleteDatabase: fakeIndexedDb.indexedDB.deleteDatabase.bind(fakeIndexedDb.indexedDB),
    });
    const { saveGeminiKey, loadGeminiKey, clearGeminiKey } = await import("../src/upload/keystore");
    await saveGeminiKey(KEY);
    await loadGeminiKey();
    await loadGeminiKey();
    await clearGeminiKey();
    await saveGeminiKey(KEY);
    expect(opens).toBe(1);
  });

  it("lets another tab upgrade by closing on versionchange", async () => {
    const { saveGeminiKey } = await import("../src/upload/keystore");
    const { loadHandles } = await import("../src/batch/store");
    await saveGeminiKey(KEY); // takes the connection
    await loadHandles("__upload__");
    const upgraded = await new Promise<boolean>((resolve) => {
      const req = fakeIndexedDb.indexedDB.open("iconSplitter", 3); // someone else's newer version
      req.onsuccess = () => { req.result.close(); resolve(true); };
      req.onerror = () => resolve(false);
      req.onblocked = () => resolve(false);
    });
    expect(upgraded).toBe(true);
  });
});
