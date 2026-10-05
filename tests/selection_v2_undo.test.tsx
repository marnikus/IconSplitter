// selection_v2_undo.test.tsx — the reported defects: the zoom slider and the
// row checkboxes were not reversible. Everything here drives the real panel plus
// the real history bar, so a store/DOM change is what proves the fix.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pairId } from "../src/lib/pairing";
import SelectionV2Panel from "../src/selectionv2/SelectionV2Panel";
import { resetAppStore } from "../src/state/appstore";
import { HistoryProvider, useHistory, type HistoryApi } from "../src/state/HistoryProvider";
import { usePrefsAutosave } from "../src/state/usePrefsAutosave";
import HistoryBar from "../src/ui/HistoryBar";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { dropDb } from "./helpers/idb";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// No IndexedDB in this DOM; nothing here needs a remembered folder.
vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return { ...actual, loadHandles: vi.fn(async () => null) };
});

const FOG = pairId("architecture", "fog", "");
const COURT = pairId("architecture", "court", "");
const HARBOR = pairId("coastal", "harbor", "");

let host: HTMLDivElement;
let ui: Root;
let api: HistoryApi;

function Probe() {
  api = useHistory();
  return null;
}

function PrefsHost({ children }: { children: React.ReactNode }) {
  usePrefsAutosave();
  return <>{children}</>;
}

/** architecture/{fog,court} + coastal/harbor — three complete pairs. */
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
  root.children.set("architecture", arch);
  root.children.set("coastal", coast);
  return root;
}

const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const input = (sel: string) => q(sel) as HTMLInputElement;
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const click = async (sel: string) => {
  await act(async () => { q(sel)!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
};
const rowClick = async (id: string, init: MouseEventInit = {}) => {
  await act(async () => { q(`[data-testid='v2-row-${id}']`)!.dispatchEvent(new MouseEvent("click", { bubbles: true, ...init })); });
};
const undo = async () => { await click("[data-testid='hist-undo']"); await settle(); };
const redo = async () => { await click("[data-testid='hist-redo']"); await settle(); };

/** React tracks input values, so set them the way a browser would. */
async function slide(sel: string, value: string): Promise<void> {
  const el = input(sel);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

async function mountPanel(): Promise<void> {
  const root = makeRoot();
  (window as unknown as { showDirectoryPicker?: () => Promise<unknown> }).showDirectoryPicker = () => Promise.resolve(root);
  host = document.createElement("div");
  document.body.appendChild(host);
  ui = createRoot(host);
  await act(async () => {
    ui.render(
      <HistoryProvider>
        <PrefsHost>
          <SelectionV2Panel />
        </PrefsHost>
        <HistoryBar />
        <Probe />
      </HistoryProvider>,
    );
  });
  await click("[data-testid='v2-open-folder']");
  await settle();
}

beforeEach(async () => {
  localStorage.clear();
  resetAppStore();
  await dropDb();
  await mountPanel();
});

describe("the zoom slider is undoable", () => {
  it("one drag is one entry, and undo puts the value back", async () => {
    expect(input("[data-testid='v2-thumb']").value).toBe("84");
    await slide("[data-testid='v2-thumb']", "128");
    await slide("[data-testid='v2-thumb']", "160");
    expect(q("[data-testid='v2-thumb-value']")?.textContent).toBe("160 px");
    expect(api.entries.filter((e) => e.type === "prefs")).toHaveLength(1); // one gesture

    await undo();
    expect(input("[data-testid='v2-thumb']").value).toBe("84");
    expect(q("[data-testid='v2-thumb-value']")?.textContent).toBe("84 px");

    await redo();
    expect(input("[data-testid='v2-thumb']").value).toBe("160");
  });
});

describe("row checkboxes are undoable", () => {
  it("undo unchecks what a click checked, redo checks it again", async () => {
    await click(`[data-testid='v2-check-${FOG}']`);
    expect(input(`[data-testid='v2-check-${FOG}']`).checked).toBe(true);

    await undo();
    expect(input(`[data-testid='v2-check-${FOG}']`).checked).toBe(false);

    await redo();
    expect(input(`[data-testid='v2-check-${FOG}']`).checked).toBe(true);
  });

  it("undo restores the whole previous selection, not one row", async () => {
    await click(`[data-testid='v2-check-${FOG}']`);
    await click(`[data-testid='v2-check-${COURT}']`);
    await click("[data-testid='v2-select-visible']");
    expect(input(`[data-testid='v2-check-${HARBOR}']`).checked).toBe(true);

    await undo();
    expect(input(`[data-testid='v2-check-${HARBOR}']`).checked).toBe(false);
    expect(input(`[data-testid='v2-check-${FOG}']`).checked).toBe(true);

    await undo();
    expect(input(`[data-testid='v2-check-${COURT}']`).checked).toBe(false);
  });
});

describe("Ctrl+Z still works with focus left on a control", () => {
  // the reported defect: both controls keep focus after use, and the shortcut
  // was swallowed because every <input> counted as a text field
  it("undoes a zoom change while the slider has focus", async () => {
    await slide("[data-testid='v2-thumb']", "200");
    expect(input("[data-testid='v2-thumb']").value).toBe("200");
    await act(async () => {
      input("[data-testid='v2-thumb']").dispatchEvent(
        new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }),
      );
    });
    await settle();
    expect(input("[data-testid='v2-thumb']").value).toBe("84");
  });

  it("undoes a checkbox change while that checkbox has focus", async () => {
    await click(`[data-testid='v2-check-${FOG}']`);
    await act(async () => {
      input(`[data-testid='v2-check-${FOG}']`).dispatchEvent(
        new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }),
      );
    });
    await settle();
    expect(input(`[data-testid='v2-check-${FOG}']`).checked).toBe(false);
  });
});

describe("explorer-style multi-selection", () => {
  it("a plain click selects that row alone", async () => {
    await click(`[data-testid='v2-check-${FOG}']`);
    await rowClick(COURT);
    expect(input(`[data-testid='v2-check-${COURT}']`).checked).toBe(true);
    expect(input(`[data-testid='v2-check-${FOG}']`).checked).toBe(false);
  });

  it("shift+click selects the continuous range between the anchor and the row", async () => {
    await rowClick(FOG);
    await rowClick(HARBOR, { shiftKey: true });
    for (const id of [FOG, COURT, HARBOR]) {
      expect(input(`[data-testid='v2-check-${id}']`).checked).toBe(true);
    }
  });

  it("ctrl/alt+click adds and removes single rows without touching the rest", async () => {
    await rowClick(FOG);
    await rowClick(HARBOR, { ctrlKey: true });
    expect(input(`[data-testid='v2-check-${FOG}']`).checked).toBe(true);
    expect(input(`[data-testid='v2-check-${HARBOR}']`).checked).toBe(true);

    await rowClick(FOG, { altKey: true });
    expect(input(`[data-testid='v2-check-${FOG}']`).checked).toBe(false);
    expect(input(`[data-testid='v2-check-${HARBOR}']`).checked).toBe(true);
  });

  it("keeps the header checkbox in step with the selection", async () => {
    await rowClick(FOG);
    expect(input("[data-testid='v2-check-all']").indeterminate).toBe(true);
    await click("[data-testid='v2-select-visible']");
    expect(input("[data-testid='v2-check-all']").checked).toBe(true);
  });

  it("every selection gesture is one undoable action", async () => {
    await rowClick(FOG);
    await rowClick(HARBOR, { shiftKey: true });
    await undo();
    expect(input(`[data-testid='v2-check-${COURT}']`).checked).toBe(false);
    expect(input(`[data-testid='v2-check-${FOG}']`).checked).toBe(true);
    await undo();
    expect(input(`[data-testid='v2-check-${FOG}']`).checked).toBe(false);
  });
});
