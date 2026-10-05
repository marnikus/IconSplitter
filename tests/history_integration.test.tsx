// history_integration.test.tsx — the acceptance path end to end, on the real
// panel: bulk reset is ONE history entry, undo restores every affected pair,
// undo from another tab (panel unmounted) still reaches each pair's OWN file
// beside its images (I-41), no global file is ever created, and a restart
// brings the session back. Nothing here re-implements a rule.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pairId } from "../src/lib/pairing";
import { DEFAULT_SESSION } from "../src/lib/session";
import { parsePairMeta } from "../src/lib/pairfile";
import type { PairMeta } from "../src/lib/pairmeta";
import { LEGACY_FILE } from "../src/selection/pairstore";
import SelectionV2Panel from "../src/selectionv2/SelectionV2Panel";
import { getAppState, resetAppStore } from "../src/state/appstore";
import { bootStores } from "../src/state/boot";
import { HistoryProvider, useHistory, type HistoryApi } from "../src/state/HistoryProvider";
import { loadHistory } from "../src/state/historystore";
import { saveSessionState } from "../src/state/sessionstore";
import HistoryBar from "../src/ui/HistoryBar";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { dropDb } from "./helpers/idb";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The remembered folder handle lives in IndexedDB, which this DOM has none of.
// Everything else here is real: the offline apply path, the atomic writer, the
// decision file itself.
let remembered: { source?: FakeDir } | null = null;
vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return { ...actual, loadHandles: vi.fn(async () => remembered) };
});

const FOG = pairId("architecture", "fog", "");
const COURT = pairId("architecture", "court", "");

let host: HTMLDivElement;
let ui: Root;
let api: HistoryApi;

function Probe() {
  api = useHistory();
  return null;
}

/** architecture/{fog,court} + coastal/{harbor,dunes(unpaired)} — 3 complete pairs. */
function makeRoot(): FakeDir {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  arch.children.set("fog.png", new FakeFile("fog.png", 12, 3000, "a"));
  arch.children.set("fog_AI.png", new FakeFile("fog_AI.png", 20, 3100, "b"));
  arch.children.set("court.png", new FakeFile("court.png", 12, 2000, "c"));
  arch.children.set("court_AI.png", new FakeFile("court_AI.png", 20, 2100, "d"));
  const coast = new FakeDir("coastal");
  coast.children.set("harbor.png", new FakeFile("harbor.png", 12, 1000, "e"));
  coast.children.set("harbor_AI.png", new FakeFile("harbor_AI.png", 20, 1100, "f"));
  coast.children.set("dunes.png", new FakeFile("dunes.png", 12, 900, "g"));
  root.children.set("architecture", arch);
  root.children.set("coastal", coast);
  return root;
}

const click = async (el: Element | null) => {
  await act(async () => { (el as HTMLButtonElement).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
};
const q = (sel: string) => host.querySelector(sel);
const text = (sel: string) => q(sel)?.textContent ?? "";
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

/** Every pair file in the fake folder, as a read of the tree really sees it. */
function pairFiles(dir: FakeDir, prefix = ""): { path: string; meta: PairMeta }[] {
  const out: { path: string; meta: PairMeta }[] = [];
  for (const [name, child] of dir.children.entries()) {
    if (child instanceof FakeDir) out.push(...pairFiles(child, `${prefix}${name}/`));
    else if (name.endsWith(".svg.json")) {
      const parsed = parsePairMeta((child as FakeFile).text);
      if (parsed.ok) out.push({ path: `${prefix}${name}`, meta: parsed.meta });
    }
  }
  return out;
}

/** The stored decisions, read back from the fake folder — the cross-tab truth. */
function storedDecisions(root: FakeDir): string[] {
  return pairFiles(root).map(({ meta }) => `${meta.id}:${meta.decision}`).sort();
}

async function mountPanel(root: FakeDir): Promise<void> {
  (window as unknown as { showDirectoryPicker?: () => Promise<unknown> }).showDirectoryPicker = () => Promise.resolve(root);
  host = document.createElement("div");
  document.body.appendChild(host);
  ui = createRoot(host);
  await act(async () => {
    ui.render(
      <HistoryProvider>
        <SelectionV2Panel />
        <HistoryBar />
        <Probe />
      </HistoryProvider>,
    );
  });
  await click(q("[data-testid='v2-root']"));
  await settle();
}

function unmountPanel(): void {
  act(() => ui.unmount());
  host.remove();
}

beforeEach(async () => {
  localStorage.clear();
  resetAppStore();
  remembered = null;
  await dropDb();
});

describe("reset to pending", () => {
  it("resets the visible list in one action that one undo restores", async () => {
    const root = makeRoot();
    await mountPanel(root);
    await click(q("[data-testid='v2-select-visible']"));
    await click(q("[data-testid='v2-approve-selected']"));
    await click(q("[data-testid='v2-approve-selected']")); // arm, then confirm
    await settle();
    expect(storedDecisions(root)).toHaveLength(3);
    expect(root.children.has(LEGACY_FILE)).toBe(false); // never the global file (I-42)
    expect(api.entries.at(-1)?.label).toBe("Approve 3 pairs");

    await click(q("[data-testid='v2-reset-selected']"));
    await click(q("[data-testid='v2-reset-selected']"));
    await settle();
    // a reset is written, not deleted: every pair's own file says pending (I-41)
    expect(storedDecisions(root).map((r) => r.split(":")[1])).toEqual(["pending", "pending", "pending"]);
    expect(text("[data-testid='v2-toast']")).toContain("3 pairs reset to pending");
    expect(api.entries.at(-1)?.label).toBe("Reset 3 pairs"); // ONE entry, not three
    expect(api.entries.at(-1)?.ids).toHaveLength(3);

    await click(q("[data-testid='hist-undo']")); // undo the reset
    await settle();
    expect(storedDecisions(root).map((r) => r.split(":")[1])).toEqual(["approved", "approved", "approved"]);
    expect(root.children.has(LEGACY_FILE)).toBe(false);
    expect(text(`[data-testid='v2-status-${FOG}']`)).toContain("Approved");
  });

  it("resets a single pair from the comparison view", async () => {
    const root = makeRoot();
    await mountPanel(root);
    await click(q(`[data-testid='v2-approve-row-${FOG}']`));
    await settle();
    expect(storedDecisions(root)).toEqual([`${FOG}:approved`]);
    await click(q(`[data-testid='v2-row-${FOG}']`)); // auto-next moved on; go back to FOG
    await click(q("[data-testid='v2-mode-compare']"));
    await settle();
    await click(q("[data-testid='sel-reset']"));
    await settle();
    expect(storedDecisions(root)).toEqual([`${FOG}:pending`]);
    expect(api.entries.at(-1)?.label).toBe("Reset 1 pair");
  });
});

describe("cross-tab undo", () => {
  it("reaches the decision file after the panel that made the change is gone", async () => {
    const root = makeRoot();
    await mountPanel(root);
    await click(q("[data-testid='v2-select-visible']"));
    await click(q("[data-testid='v2-approve-selected']"));
    await click(q("[data-testid='v2-approve-selected']"));
    await settle();
    expect(storedDecisions(root)).toHaveLength(3);

    remembered = { source: root }; // what a browser would hand back from IndexedDB
    unmountPanel(); // the user is on another tab now
    host = document.createElement("div");
    document.body.appendChild(host);
    ui = createRoot(host);
    await act(async () => {
      ui.render(<HistoryProvider><HistoryBar /><Probe /></HistoryProvider>);
    });
    expect(q("[data-testid='hist-undo']")).not.toBeNull();

    await click(q("[data-testid='hist-undo']"));
    await settle();
    // written without any panel mounted — into the pair files, never a global one
    expect(storedDecisions(root).map((r) => r.split(":")[1])).toEqual(["pending", "pending", "pending"]);
    expect(root.children.has(LEGACY_FILE)).toBe(false);
    const back = loadHistory();
    expect(back.index).toBe(back.entries.length - 2); // one step back from the tip
    expect(back.entries[back.index].type).toBe("checked"); // the selection is what an undo would take next

    await click(q("[data-testid='hist-redo']"));
    await settle();
    expect(storedDecisions(root).map((r) => r.split(":")[1])).toEqual(["approved", "approved", "approved"]); // redo re-applies it just as truly
    unmountPanel();
  });
});

describe("restart", () => {
  it("boots into the saved tab with the saved sheets settings", () => {
    saveSessionState({
      ...DEFAULT_SESSION, tab: "selectionV2",
      sheets: { padding: 12, size: 1024, transparent: true },
    }, "2026-10-01T12:00:00.000Z");
    bootStores();
    expect(getAppState().tab).toBe("selectionV2");
    expect(getAppState().sheets).toEqual({ padding: 12, size: 1024, transparent: true });
  });

  it("keeps a remembered checkbox selection and filter for the V2 list", () => {
    saveSessionState({
      ...DEFAULT_SESSION, tab: "selectionV2",
      selection: { ...DEFAULT_SESSION.selection, filter: { ...DEFAULT_SESSION.selection.filter, status: "approved" } },
      selectionV2: { checked: [FOG, COURT], scrollY: 80, anchorId: COURT },
    }, "2026-10-01T12:00:00.000Z");
    bootStores();
    expect(getAppState().v2.checked).toEqual([FOG, COURT]);
    expect(getAppState().v2.scrollY).toBe(80);
    expect(getAppState().v2.anchorId).toBe(COURT);
    expect(getAppState().view.filter.status).toBe("approved");
  });
});
