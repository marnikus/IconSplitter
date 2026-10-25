// upload_rowbadge_ui.test.tsx — SVG-to-upload named row badges (I-79): settings
// popup, per-row apply, multi-apply via selection, filter.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializePairMeta } from "../src/lib/pairmeta";
import { pairId } from "../src/lib/pairing";
import { clearKnownRoots } from "../src/lib/knownroots";
import { resetAppStore } from "../src/state/appstore";
import { forgetRestoreNote } from "../src/upload/jobstore";
import { getRowBadgeState, resetRowBadges } from "../src/upload/rowbadgestore";
import { loadUploadSettings } from "../src/upload/settingsstore";
import UploadPanel from "../src/upload/UploadPanel";
import { HistoryProvider } from "../src/state/HistoryProvider";
import HistoryBar from "../src/ui/HistoryBar";
import { BinDir, BinFile } from "./helpers/binfakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";
import { settle, waitUntil } from "./helpers/quiet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DIR = "architecture";
const FOG = pairId(DIR, "fog", "");
const COURT = pairId(DIR, "court", "");
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

function makeRoot(): BinDir {
  const root = new BinDir("split_root");
  const dir = new BinDir(DIR);
  for (const name of ["fog", "court"] as const) {
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
  resetRowBadges();
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("No provider calls in row badge tests"); }));
  vi.stubGlobal("showDirectoryPicker", () => Promise.reject(new Error("picker not needed")));
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => ui.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetRowBadges();
});

async function mount(): Promise<void> {
  stored.set("__upload__", { source: makeRoot() });
  await act(async () => {
    ui = createRoot(host);
    ui.render(<HistoryProvider><UploadPanel /><HistoryBar /></HistoryProvider>);
  });
  await waitUntil(() => q(`upload-row-${FOG}`) !== null, "upload rows");
  await settle(0);
}

async function click(id: string): Promise<void> {
  await act(async () => { q(id)!.click(); });
  await settle(0);
}

function nativeValue(el: HTMLInputElement | HTMLSelectElement, value: string): void {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
}

async function typeInto(id: string, value: string): Promise<void> {
  const el = q(id) as HTMLInputElement;
  await act(async () => {
    nativeValue(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle(0);
}

async function addBadge(name: string): Promise<void> {
  await click("upload-rowbadges-open");
  await typeInto("upload-rowbadge-new-name", name);
  await click("upload-rowbadge-add");
}

describe("upload row badges", () => {
  it("creates a named badge and applies it to one row", async () => {
    await mount();
    await addBadge("Priority");
    expect(q("upload-rowbadge-item-rb1")?.textContent).toContain("Remove");
    await click("upload-rowbadge-close");
    await click(`upload-rowbadge-toggle-${FOG}`);
    await click(`upload-rowbadge-option-${FOG}-rb1`);
    expect(q(`upload-rowbadge-chip-${FOG}-rb1`)?.textContent).toContain("Priority");
    expect(q(`upload-rowbadge-chip-${COURT}-rb1`)).toBeNull();
  });

  it("applies a badge to every selected row and filters by it", async () => {
    await mount();
    await addBadge("Redo");
    await click("upload-rowbadge-close");
    await click(`upload-check-${FOG}`);
    await click(`upload-check-${COURT}`);
    await click("upload-rowbadge-apply");
    await click("upload-rowbadge-apply-rb1");
    expect(q(`upload-rowbadge-chip-${FOG}-rb1`)).not.toBeNull();
    expect(q(`upload-rowbadge-chip-${COURT}-rb1`)).not.toBeNull();
    const select = q("upload-filter-badge") as HTMLSelectElement;
    await act(async () => {
      nativeValue(select, "none");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle(0);
    expect(q(`upload-row-${FOG}`)).toBeNull();
    await act(async () => {
      nativeValue(select, "rb1");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle(0);
    expect(q(`upload-row-${FOG}`)).not.toBeNull();
    expect(q(`upload-row-${COURT}`)).not.toBeNull();
  });

  it("renames and removes a badge from the settings popup", async () => {
    await mount();
    await addBadge("Old");
    await typeInto("upload-rowbadge-name-rb1", "");
    expect((q("upload-rowbadge-name-rb1") as HTMLInputElement).value).toBe("");
    await typeInto("upload-rowbadge-name-rb1", "Urgent");
    await act(async () => { q("upload-rowbadge-name-rb1")!.dispatchEvent(new Event("blur", { bubbles: true })); });
    await settle(0);
    expect((q("upload-rowbadge-name-rb1") as HTMLInputElement).value).toBe("Urgent");
    await click("upload-rowbadge-remove-rb1");
    expect(q("upload-rowbadge-item-rb1")).toBeNull();
    expect(q("upload-rowbadge-empty")).not.toBeNull();
  });

  it("applies two badges to one row, recolours, and a chip click removes one", async () => {
    await mount();
    await addBadge("Priority");
    await addBadge("Redo");
    await typeInto("upload-rowbadge-color-rb1", "#32d68b");
    await click("upload-rowbadge-close");
    await click(`upload-rowbadge-toggle-${FOG}`);
    await click(`upload-rowbadge-option-${FOG}-rb1`);
    await click(`upload-rowbadge-option-${FOG}-rb2`);
    expect(q(`upload-rowbadge-chip-${FOG}-rb1`)?.textContent).toContain("Priority");
    expect(q(`upload-rowbadge-chip-${FOG}-rb2`)?.textContent).toContain("Redo");
    expect((q(`upload-rowbadge-chip-${FOG}-rb1`) as HTMLElement).style.borderColor).toBe("#32d68b");
    await click(`upload-rowbadge-chip-${FOG}-rb1`);
    expect(q(`upload-rowbadge-chip-${FOG}-rb1`)).toBeNull();
    expect(q(`upload-rowbadge-chip-${FOG}-rb2`)).not.toBeNull();
  });

  it("toggles a bulk apply off when every selected row already has it", async () => {
    await mount();
    await addBadge("Stock");
    await click("upload-rowbadge-close");
    await click(`upload-check-${FOG}`);
    await click(`upload-check-${COURT}`);
    await click("upload-rowbadge-apply");
    await click("upload-rowbadge-apply-rb1");
    expect(q(`upload-rowbadge-chip-${FOG}-rb1`)).not.toBeNull();
    await click("upload-rowbadge-apply");
    await click("upload-rowbadge-apply-rb1");
    expect(q(`upload-rowbadge-chip-${FOG}-rb1`)).toBeNull();
    expect(q(`upload-rowbadge-chip-${COURT}-rb1`)).toBeNull();
  });

  it("filters Any badge, disables bulk apply until a row is checked, and undoes an add", async () => {
    await mount();
    expect((q("upload-rowbadge-apply") as HTMLButtonElement).disabled).toBe(true);
    await addBadge("Priority");
    await click("upload-rowbadge-close");
    expect((q("upload-rowbadge-apply") as HTMLButtonElement).disabled).toBe(true);
    await click(`upload-check-${FOG}`);
    expect((q("upload-rowbadge-apply") as HTMLButtonElement).disabled).toBe(false);
    await click(`upload-rowbadge-toggle-${FOG}`);
    await click(`upload-rowbadge-option-${FOG}-rb1`);
    const select = q("upload-filter-badge") as HTMLSelectElement;
    await act(async () => {
      nativeValue(select, "any");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle(0);
    expect(q(`upload-row-${FOG}`)).not.toBeNull();
    expect(q(`upload-row-${COURT}`)).toBeNull();
    await click("hist-undo");
    await click("hist-undo");
    expect(q(`upload-rowbadge-chip-${FOG}-rb1`)).toBeNull();
  });

  it("Escape closes the catalog, empty and duplicate names do not add, and removing a filtered badge shows the list again", async () => {
    await mount();
    await click("upload-rowbadges-open");
    await click("upload-rowbadge-add");
    expect(q("upload-rowbadge-empty")).not.toBeNull();
    await addBadge("Priority");
    await typeInto("upload-rowbadge-new-name", "priority");
    await click("upload-rowbadge-add");
    expect(host.querySelectorAll("[data-testid^=upload-rowbadge-item-]")).toHaveLength(1);
    await act(async () => {
      q("upload-rowbadge-dialog")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await settle(0);
    expect(q("upload-rowbadge-dialog")).toBeNull();
    await click(`upload-rowbadge-toggle-${FOG}`);
    await click(`upload-rowbadge-option-${FOG}-rb1`);
    const select = q("upload-filter-badge") as HTMLSelectElement;
    await act(async () => {
      nativeValue(select, "rb1");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle(0);
    expect(q(`upload-row-${COURT}`)).toBeNull();
    await click("upload-rowbadges-open");
    await click("upload-rowbadge-remove-rb1");
    await click("upload-rowbadge-close");
    expect(q(`upload-row-${FOG}`)).not.toBeNull();
    expect(q(`upload-row-${COURT}`)).not.toBeNull();
  });
});


describe("row-badge integration with the current branch", () => {
  it("bulk applies to hidden checked rows without changing their checks", async () => {
    await mount(); await addBadge("Priority"); await click("upload-rowbadge-close");
    await click(`upload-check-${FOG}`); await click(`upload-check-${COURT}`);
    await typeInto("upload-search", "fog");
    expect(q(`upload-row-${COURT}`)).toBeNull();
    await click("upload-rowbadge-apply"); await click("upload-rowbadge-apply-rb1");
    expect(getRowBadgeState().assigned[COURT]).toEqual(["rb1"]);
    expect(getRowBadgeState().assigned[FOG]).toEqual(["rb1"]);
    await typeInto("upload-search", "");
    for (const id of [FOG, COURT]) {
      expect(q(`upload-rowbadge-chip-${id}-rb1`)).not.toBeNull();
      expect((q(`upload-check-${id}`) as HTMLInputElement).checked).toBe(true);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps four-sided padding, folded decorations and independent history after dialog extraction", async () => {
    await mount(); await addBadge("Priority"); await click("upload-rowbadge-close");
    await click(`upload-rowbadge-toggle-${FOG}`); await click(`upload-rowbadge-option-${FOG}-rb1`);
    await click("upload-settings-open");
    const padding = { left: 3, right: 17, top: 7, bottom: 11 };
    for (const [side, value] of Object.entries(padding)) await typeInto(`upload-set-padding-${side}`, String(value));
    expect(loadUploadSettings().defaults.paddingPct).toEqual(padding);
    for (const name of ["badge", "sizeguide", "shadow"]) {
      expect((q(`upload-set-${name}-section`) as HTMLDetailsElement).open).toBe(false);
    }
    await click("upload-set-shadow-summary"); await typeInto("upload-set-padding-left", "5");
    expect((q("upload-set-shadow-section") as HTMLDetailsElement).open).toBe(true);
    expect(getRowBadgeState().assigned[FOG]).toEqual(["rb1"]);
    expect(loadUploadSettings().defaults.badgeEnabled).toBe(false);
    expect(loadUploadSettings().overrides).toEqual({});
    await click("upload-set-close"); await click(`upload-settings-btn-${FOG}`);
    for (const [side, value] of Object.entries({ ...padding, left: 5 })) {
      expect((q(`upload-set-padding-${side}`) as HTMLInputElement).value).toBe(String(value));
    }
    await typeInto("upload-set-padding-left", "6");
    const pinned = { paddingPct: { ...padding, left: 6 } };
    expect(loadUploadSettings().overrides[FOG]).toEqual(pinned);
    await click("upload-set-close"); await click(`upload-rowbadge-chip-${FOG}-rb1`);
    expect(getRowBadgeState().assigned[FOG]).toBeUndefined();
    await click("hist-undo");
    expect(getRowBadgeState().assigned[FOG]).toEqual(["rb1"]);
    expect(loadUploadSettings().overrides[FOG]).toEqual(pinned);
    await click("hist-undo");
    expect(loadUploadSettings().overrides[FOG]).toBeUndefined();
    expect(getRowBadgeState().assigned[FOG]).toEqual(["rb1"]);
    await click("hist-redo");
    expect(loadUploadSettings().overrides[FOG]).toEqual(pinned);
    expect(loadUploadSettings().defaults.paddingPct).toEqual({ ...padding, left: 5 });
    expect(fetch).not.toHaveBeenCalled();
  });
});
