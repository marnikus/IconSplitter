// @vitest-environment happy-dom
// tabroot_every_tab.test.tsx — after a reload EVERY folder tab behaves the same
// (2026-11-28). The browser hands a remembered folder back without read access
// until the user clicks. Each tab must: show the folder at once, offer
// 🔓 Restore access instead of failing a scan silently, and on that click ask
// the browser once and scan. Before: only Generate SVG did; the SVG builder
// showed no folder at all.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Workbench from "../src/ui/Workbench";
import { resetAppStore } from "../src/state/appstore";
import { clearKnownRoots } from "../src/lib/knownroots";
import { ROOT_KEYS, type RootTab } from "../src/state/tabroot";
import { FakeDir } from "./helpers/fakefs";
import { settle, waitUntil } from "./helpers/quiet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const stored = vi.hoisted(() => new Map<string, unknown>());
vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return { ...actual,
    saveHandles: vi.fn(async (name: string, handles: unknown) => { stored.set(name, handles); }),
    loadHandles: vi.fn(async (name: string) => stored.get(name) ?? null) };
});

/** A remembered folder as a reload returns it: unreadable until the browser is asked on a click. */
function lockedFolder(name: string) {
  const root = new FakeDir(name);
  let state = "prompt";
  const request = vi.fn(async () => { state = "granted"; return state; });
  const entries = root.entries.bind(root);
  Object.assign(root, {
    queryPermission: async () => state,
    requestPermission: request,
    entries: () => { if (state !== "granted") throw new DOMException("not allowed", "NotAllowedError"); return entries(); },
  });
  return { root, request };
}

/** `asksOnOpen`: Generate SVG rescans whenever its tab is opened again — that click already asks the browser. */
const TABS: { tab: RootTab; open: string; rescan: string; path: string; asksOnOpen?: boolean }[] = [
  { tab: "selection", open: "tab-selection-v2", rescan: "v2-rescan", path: "v2-folder-path" },
  { tab: "svg", open: "tab-generate-svg", rescan: "svg-rescan", path: "svg-folder-path", asksOnOpen: true },
  { tab: "upload", open: "tab-upload", rescan: "upload-rescan", path: "upload-folder-path" },
  { tab: "builder", open: "tab-svg-builder", rescan: "builder-rescan", path: "builder-folder-path" },
  { tab: "stock", open: "tab-stock-upload", rescan: "stock-rescan", path: "stock-folder-path" },
];

let host: HTMLDivElement;
let ui: Root;
const q = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const text = (id: string) => q(id)?.textContent ?? "";
const click = async (id: string) => {
  const el = q(id);
  if (el === null) throw new Error(`missing ${id}`);
  await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle(0);
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })));
  (window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = () => Promise.reject(new Error("no picker"));
  localStorage.clear();
  stored.clear();
  clearKnownRoots();
  resetAppStore();
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => ui.unmount());
  host.remove();
  delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  vi.unstubAllGlobals();
});

async function reload(): Promise<void> {
  ui = createRoot(host);
  act(() => { ui.render(<Workbench />); });
  await settle();
}

describe.each(TABS)("$tab tab after a reload, its folder still locked by the browser", ({ tab, open, rescan, path, asksOnOpen }) => {
  it("shows the folder and offers Restore access; the click asks once and scans", async () => {
    const { root, request } = lockedFolder("my_icons");
    stored.set(ROOT_KEYS[tab], { source: root });
    await reload();
    if (asksOnOpen !== true) await click(open);
    await waitUntil(() => text(path).includes("my_icons"), "the remembered folder is on screen");
    await waitUntil(() => text(rescan).includes("Restore access"), "Restore access is offered");
    expect(request).not.toHaveBeenCalled();
    await click(asksOnOpen === true ? open : rescan);
    await waitUntil(() => request.mock.calls.length === 1, "the browser was asked");
    await waitUntil(() => text(rescan).includes("Rescan"), "the folder is open again");
    expect(text(rescan)).not.toContain("Restore access");
    expect(request).toHaveBeenCalledTimes(1);
  });
});
