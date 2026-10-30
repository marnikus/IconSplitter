// Batch-authoritative gestures through the real SVG-to-upload panel and global history.
// Only in-memory files are used; all fetch calls are blocked (no provider requests).
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializePairMeta } from "../src/lib/pairmeta";
import { pairId } from "../src/lib/pairing";
import { clearKnownRoots } from "../src/lib/knownroots";
import { getAppState, patchSvg, resetAppStore } from "../src/state/appstore";
import { forgetRestoreNote } from "../src/upload/jobstore";
import UploadPanel from "../src/upload/UploadPanel";
import { HistoryProvider } from "../src/state/HistoryProvider";
import HistoryBar from "../src/ui/HistoryBar";
import { BinDir, BinFile } from "./helpers/binfakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";
import { settle, waitUntil } from "./helpers/quiet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DIR = "architecture";
const NAMES = ["arch", "court", "fog", "zen"] as const;
const IDS = NAMES.map((name) => pairId(DIR, name, ""));
const [ARCH, COURT, FOG, ZEN] = IDS;
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>';
type Modifiers = Pick<MouseEventInit, "shiftKey" | "ctrlKey" | "altKey" | "metaKey">;
type GestureState = { checked: string[]; active: string | null; anchor: string | null | undefined };

// Like the other upload UI tests, only the browser's missing handle store is stubbed.
const stored = new Map<string, unknown>();
vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return {
    ...actual,
    saveHandles: vi.fn(async (name: string, handles: unknown) => { stored.set(name, handles); }),
    loadHandles: vi.fn(async (name: string) => stored.get(name) ?? null),
  };
});

let host: HTMLDivElement;
let ui: Root;
const q = (id: string) => host.querySelector(`[data-testid=${id}]`) as HTMLElement | null;
const row = (id: string) => q(`upload-row-${id}`) as HTMLElement;
const checkedIds = () => IDS.filter((id) => getAppState().upload.checked.includes(id));
const visibleIds = () => [...(q("upload-rows")?.querySelectorAll<HTMLElement>("[data-testid^=upload-row-pair_]") ?? [])]
  .map((el) => el.dataset.testid!.replace("upload-row-", ""));
const anchor = () => (getAppState().upload as { anchorId?: string | null }).anchorId;
const state = (): GestureState => ({ checked: checkedIds(), active: getAppState().upload.activeId, anchor: anchor() });

function makeRoot(): BinDir {
  const root = new BinDir("split_root");
  const dir = new BinDir(DIR);
  for (const name of NAMES) {
    const file = `${name}_AI`;
    const id = pairId(DIR, name, "");
    const meta = pairFile(DIR, `${file}.png`, { id, versions: [
      svgVersion(`${DIR}/${file}.svg`, { version: 1, review: "approved" }),
    ] });
    dir.children.set(`${file}.png`, new BinFile(`${file}.png`, "approved AI", 3100));
    dir.children.set(`${file}.svg`, new BinFile(`${file}.svg`, SVG, 3400));
    dir.children.set(`${file}.svg.json`, new BinFile(`${file}.svg.json`, serializePairMeta(meta), 3400));
  }
  root.children.set(DIR, dir);
  return root;
}

beforeEach(() => {
  localStorage.clear();
  stored.clear();
  clearKnownRoots();
  forgetRestoreNote();
  resetAppStore();
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("No provider calls in row gesture tests"); }));
  vi.stubGlobal("showDirectoryPicker", () => Promise.reject(new Error("picker not needed")));
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => ui.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount(): Promise<void> {
  stored.set("__upload__", { source: makeRoot() });
  await act(async () => {
    ui = createRoot(host);
    ui.render(<HistoryProvider><UploadPanel /><HistoryBar /></HistoryProvider>);
  });
  await waitUntil(() => visibleIds().length === 4, "four approved upload rows");
  await settle(0);
}
async function click(id: string): Promise<void> {
  await act(async () => { (q(id) as HTMLElement).click(); });
  await settle(0);
}
async function clickRow(id: string, modifiers: Modifiers = {}): Promise<void> {
  await act(async () => { row(id).dispatchEvent(new MouseEvent("click", { bubbles: true, ...modifiers })); });
  await settle(0);
}
async function key(name: string): Promise<void> {
  await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true })); });
  await settle(0);
}
async function search(value: string): Promise<void> {
  await act(async () => {
    const el = q("upload-search") as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle(0);
}

describe("SVG-to-upload row selection", () => {
  it("plain row click moves only active/anchor; checkbox checks without moving either", async () => {
    await mount();
    expect(visibleIds()).toEqual(IDS);
    await click(`upload-check-${FOG}`);
    expect(checkedIds()).toEqual([FOG]);
    expect(state().active).toBeNull();
    await clickRow(COURT);
    expect(state()).toEqual({ checked: [FOG], active: COURT, anchor: COURT });
    expect(q(`upload-detail-${COURT}`)).not.toBeNull();
    await click(`upload-check-${ARCH}`);
    expect(state()).toEqual({ checked: [ARCH, FOG], active: COURT, anchor: COURT });
    await clickRow(ZEN);
    expect(state()).toEqual({ checked: [ARCH, FOG], active: ZEN, anchor: ZEN });
  });

  it("Shift selects the inclusive visible sorted range and degrades to target if anchor is hidden", async () => {
    await mount();
    expect(visibleIds()).toEqual(IDS);
    await clickRow(ZEN);
    await clickRow(COURT, { shiftKey: true });
    expect(checkedIds()).toEqual([COURT, FOG, ZEN]);
    expect(state().anchor).toBe(COURT);
    await search("fog_AI");
    expect(visibleIds()).toEqual([FOG]);
    await clickRow(FOG, { shiftKey: true });
    expect(checkedIds()).toEqual([FOG]);
  });

  it.each(["ctrlKey", "altKey", "metaKey"] as const)("%s toggles just one row and keeps the Shift anchor", async (modifier) => {
    await mount();
    await clickRow(ARCH);
    await clickRow(ZEN, { [modifier]: true });
    expect(state()).toEqual({ checked: [ZEN], active: ZEN, anchor: ARCH });
    await clickRow(ZEN, { [modifier]: true });
    expect(state()).toEqual({ checked: [], active: ZEN, anchor: ARCH });
    await clickRow(COURT, { shiftKey: true });
    expect(checkedIds()).toEqual([ARCH, COURT]);
  });

  it("header off unchecks visible rows only and retains a hidden checked row", async () => {
    await mount();
    await click(`upload-check-${ARCH}`);
    await search("fog_AI");
    expect(visibleIds()).toEqual([FOG]);
    await click("upload-check-all");
    expect((q("upload-check-all") as HTMLInputElement).checked).toBe(true);
    await click("upload-check-all");
    await search("");
    expect(checkedIds()).toEqual([ARCH]);
  });

  it("E/Q check only the active row, and use visible/all fallbacks when no row is active", async () => {
    await mount();
    await key("e");
    expect(checkedIds()).toEqual(IDS);
    await key("q");
    expect(checkedIds()).toEqual([]);
    await click(`upload-check-${COURT}`);
    await clickRow(FOG);
    await key("e");
    expect(checkedIds()).toEqual([COURT, FOG]);
    await key("q");
    expect(checkedIds()).toEqual([COURT]);
    expect(state().active).toBe(FOG);
  });

  it("arrows navigate the visible active rows without changing checked or the range anchor", async () => {
    await mount();
    await key("ArrowDown");
    expect(state()).toEqual({ checked: [], active: ARCH, anchor: null });
    await key("ArrowDown");
    expect(state()).toEqual({ checked: [], active: COURT, anchor: null });
    await clickRow(ZEN);
    await search("o"); // court and fog, not the other filenames
    expect(visibleIds()).toEqual([COURT, FOG]);
    await key("ArrowDown"); // active ZEN is hidden: start at the first visible row
    expect(state()).toEqual({ checked: [], active: COURT, anchor: ZEN });
    await key("ArrowDown");
    expect(state()).toEqual({ checked: [], active: FOG, anchor: ZEN });
    await key("ArrowUp");
    expect(state()).toEqual({ checked: [], active: COURT, anchor: ZEN });
  });

  it("settings dialog blocks Q/E and arrows; shortcuts resume when it closes", async () => {
    await mount();
    await clickRow(FOG);
    await click("upload-settings-open");
    expect(q("upload-dialog-backdrop")).not.toBeNull();
    await key("e");
    await key("ArrowDown");
    expect(checkedIds()).toEqual([]);
    expect(state().active).toBe(FOG);
    await click("upload-set-close");
    await key("e");
    expect(checkedIds()).toEqual([FOG]);
  });

  it("undo/redo restores only Upload's checked/active/anchor snapshot, not Generate SVG's", async () => {
    await mount();
    await act(async () => { patchSvg({ checked: ["svg-sentinel"], activeId: "svg-sentinel", anchorId: "svg-sentinel" } as Parameters<typeof patchSvg>[0]); });
    const other = getAppState().svg;
    await clickRow(ARCH);
    const before = state();
    expect(before).toEqual({ checked: [], active: ARCH, anchor: ARCH });
    await clickRow(FOG, { ctrlKey: true });
    const after = state();
    expect(after).toEqual({ checked: [FOG], active: FOG, anchor: ARCH });
    await click("hist-undo");
    expect(state()).toEqual(before);
    expect(getAppState().svg).toEqual(other);
    await click("hist-redo");
    expect(state()).toEqual(after);
    expect(getAppState().svg).toEqual(other);
  });
});
