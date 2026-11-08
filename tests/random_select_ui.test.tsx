// Select random through both real upload panels (2026-11-08): whole-list pool,
// checked-only pool, cap at the pool size, hidden rows included, one undo entry.
// In-memory files only; every fetch is blocked (no provider calls).
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializePairMeta } from "../src/lib/pairmeta";
import { pairId } from "../src/lib/pairing";
import { clearKnownRoots } from "../src/lib/knownroots";
import { getAppState, resetAppStore } from "../src/state/appstore";
import { HistoryProvider } from "../src/state/HistoryProvider";
import HistoryBar from "../src/ui/HistoryBar";
import UploadPanel from "../src/upload/UploadPanel";
import StockUploadPanel from "../src/stockupload/StockUploadPanel";
import { forgetRestoreNote } from "../src/upload/jobstore";
import { resetRowBadges } from "../src/upload/rowbadgestore";
import { resetStockPresets } from "../src/stockupload/presetstore";
import { resetStockHistory } from "../src/stockupload/historystore";
import { resetUploadJournal } from "../src/stockupload/journal";
import { resetFtpCredentialsForTests } from "../src/stockupload/keystore";
import { BinDir, BinFile } from "./helpers/binfakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";
import { commitPackage } from "./helpers/uploadpackage";
import { settle, waitUntil } from "./helpers/quiet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NAMES = ["arch", "court", "fog", "zen"] as const;
const IDS = NAMES.map((name) => pairId(name, name, ""));
const [ARCH, COURT, FOG, ZEN] = IDS;
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>';

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
const q = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

/** One workspace both tabs can scan: approved pairs plus committed packages. */
function makeRoot(): BinDir {
  const root = new BinDir("random_ws");
  for (const name of NAMES) {
    const dir = new BinDir(name);
    const id = pairId(name, name, "");
    const meta = pairFile(name, `${name}_AI.png`, {
      id, versions: [svgVersion(`${name}/${name}_AI.svg`, { version: 1, review: "approved" })],
    });
    dir.children.set(`${name}_AI.png`, new BinFile(`${name}_AI.png`, "ai", 3100));
    dir.children.set(`${name}_AI.svg`, new BinFile(`${name}_AI.svg`, SVG, 3400));
    dir.children.set(`${name}_AI.svg.json`, new BinFile(`${name}_AI.svg.json`, serializePairMeta(meta), 3400));
    commitPackage({ dir, dirPath: name, name, kinds: ["svg"] });
    const exp = dir.children.get("export") as BinDir;
    const record = JSON.parse((exp.children.get("export.json") as BinFile).text) as { timestamps: { committedAt: string | null } };
    record.timestamps.committedAt = "2026-11-08T10:00:00.000Z";
    exp.children.set("export.json", new BinFile("export.json", JSON.stringify(record), 5001));
    root.children.set(name, dir);
  }
  return root;
}

beforeEach(async () => {
  localStorage.clear();
  stored.clear();
  clearKnownRoots();
  forgetRestoreNote();
  resetAppStore();
  resetRowBadges();
  resetStockPresets();
  resetStockHistory();
  resetUploadJournal();
  await resetFtpCredentialsForTests();
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("No provider calls in random-selection tests"); }));
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

async function mount(tab: "upload" | "stockUpload"): Promise<void> {
  stored.set(tab === "upload" ? "__upload__" : "__stock_upload__", { source: makeRoot() });
  await act(async () => {
    ui = createRoot(host);
    ui.render(
      <HistoryProvider>
        {tab === "upload" ? <UploadPanel /> : <StockUploadPanel active />}
        <HistoryBar />
      </HistoryProvider>,
    );
  });
  const prefix = tab === "upload" ? "upload" : "stock";
  await waitUntil(() => q(`${prefix}-selected-count`) !== null, "bulk bar");
  await waitUntil(() => IDS.every((id) => q(`${prefix}-check-${id}`) !== null), "four listed rows");
  await settle(0);
}

async function click(id: string): Promise<void> {
  await act(async () => { (q(id) as HTMLElement).click(); });
  await settle(0);
}

async function setCount(prefix: string, value: string): Promise<void> {
  const el = q(`${prefix}-random-count`) as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  await settle(0);
}

async function search(prefix: string, value: string): Promise<void> {
  const el = q(prefix === "upload" ? "upload-search" : "stock-filter-search") as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle(0);
}

const checkedOf = (tab: "upload" | "stockUpload") => getAppState()[tab].checked;

describe.each([
  ["upload", "upload"],
  ["stockUpload", "stock"],
] as const)("%s — Select random", (tab, prefix) => {
  it("offers an integer field defaulting to 2 and a random button", async () => {
    await mount(tab);
    const field = q(`${prefix}-random-count`) as HTMLInputElement;
    expect(field.type).toBe("number");
    expect(field.min).toBe("2");
    expect(field.step).toBe("1");
    expect(field.value).toBe("2");
    expect(q(`${prefix}-select-random`)).not.toBeNull();
    expect(q(`${prefix}-random-scope`)?.textContent).toContain("4");
  });

  it("draws from the whole list even when filters hide most rows, and undo/redo is one step", async () => {
    await mount(tab);
    await click(`${prefix}-row-${ARCH}`);
    const before = { checked: checkedOf(tab), active: getAppState()[tab].activeId, anchor: getAppState()[tab].anchorId };
    expect(before.checked).toEqual([]);
    await search(prefix, "arch");
    await setCount(prefix, "3");
    await click(`${prefix}-select-random`);
    const drawn = checkedOf(tab);
    expect(drawn).toHaveLength(3);
    expect(new Set(drawn).size).toBe(3);
    for (const id of drawn) expect(IDS).toContain(id);
    expect(drawn.some((id) => id !== ARCH)).toBe(true); // hidden rows were eligible
    expect(getAppState()[tab].activeId).toBe(before.active);
    expect(getAppState()[tab].anchorId).toBe(before.anchor);
    expect(q("hist-label")?.textContent).toContain("Select random");
    await click("hist-undo");
    expect(checkedOf(tab)).toEqual(before.checked);
    await click("hist-redo");
    expect(checkedOf(tab)).toEqual(drawn);
  });

  it("draws only from preselected items and caps the count at that pool", async () => {
    await mount(tab);
    for (const id of [ARCH, COURT, FOG]) await click(`${prefix}-check-${id}`);
    await setCount(prefix, "10");
    await click(`${prefix}-select-random`);
    expect([...checkedOf(tab)].sort()).toEqual([ARCH, COURT, FOG].sort());
    expect(checkedOf(tab)).not.toContain(ZEN);
    await setCount(prefix, "2");
    await click(`${prefix}-select-random`);
    const drawn = checkedOf(tab);
    expect(drawn).toHaveLength(2);
    for (const id of drawn) expect([ARCH, COURT, FOG]).toContain(id);
    await click("hist-undo");
    expect([...checkedOf(tab)].sort()).toEqual([ARCH, COURT, FOG].sort());
  });

  it("normalizes an invalid typed count back to 2", async () => {
    await mount(tab);
    await setCount(prefix, "1");
    expect((q(`${prefix}-random-count`) as HTMLInputElement).value).toBe("2");
    await click(`${prefix}-select-random`);
    expect(checkedOf(tab)).toHaveLength(2);
  });
});
