// folder_ui.test.tsx — RULE 8: the folder-control contract for Selection V2 and
// Generate SVG (design docs/archive/2026-10-05-folder-ui-fix/design.md). Both
// tabs drive their REAL panels against in-memory FS fakes: one green Open folder
// button, one full-width read-only path row below, no watcher / copied-path UI
// in V2 or SVG, and an unchanged Rescan. Selection V1 keeps its watcher.
// The pick-level contract (bug-1): the split output, its month folder and its
// stamp folder all list the same run. The path contract (bug-2): the full path
// shows after a pick — captured from a paste when the clipboard read gave
// nothing — and a re-pick updates the row.
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pairId } from "../src/lib/pairing";
import { newPairMeta, serializePairMeta, withDecision } from "../src/lib/pairmeta";
import { saveRootPathInfo } from "../src/lib/rootpath";
import SelectionPanel from "../src/selection/SelectionPanel";
import SelectionV2Panel from "../src/selectionv2/SelectionV2Panel";
import SvgPanel from "../src/svg/SvgPanel";
import { HistoryProvider } from "../src/state/HistoryProvider";
import { resetAppStore } from "../src/state/appstore";
import { usePrefsAutosave } from "../src/state/usePrefsAutosave";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { dropDb } from "./helpers/idb";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PickerWindow = { showDirectoryPicker?: () => Promise<unknown> };

const FOG = pairId("architecture", "fog", "");
const FULL = "F:\\Work\\icons\\split_root";

function PrefsHost({ children }: { children: ReactNode }) {
  usePrefsAutosave();
  return <>{children}</>;
}

/** split_root/architecture/{fog,court} — two complete pairs. */
function v2Root(): FakeDir {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  arch.children.set("fog.png", new FakeFile("fog.png", 12, 3000, "a"));
  arch.children.set("fog_AI.png", new FakeFile("fog_AI.png", 20, 3100, "b"));
  arch.children.set("court.png", new FakeFile("court.png", 12, 2000, "c"));
  arch.children.set("court_AI.png", new FakeFile("court_AI.png", 20, 2100, "d"));
  root.children.set("architecture", arch);
  return root;
}

/** split_root/architecture/fog, approved via the legacy decision file. */
function svgRoot(): FakeDir {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  arch.children.set("fog.png", new FakeFile("fog.png", 12, 3000, "a"));
  arch.children.set("fog_AI.png", new FakeFile("fog_AI.png", 20, 3100, "b"));
  root.children.set("architecture", arch);
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, decisions([FOG])));
  return root;
}

function decisions(ids: string[]): string {
  return JSON.stringify({
    records: ids.map((id) => ({
      pair_id: id, source: `${id}.png`, ai_result: `${id}_AI.png`,
      decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z",
    })),
  });
}

function v1Root(): FakeDir {
  const root = new FakeDir("test_processing");
  const camp = new FakeDir("camp");
  camp.children.set("a.png", new FakeFile("a.png", 5, 111, "x"));
  camp.children.set("a_AI.png", new FakeFile("a_AI.png", 9, 222, "y"));
  root.children.set("camp", camp);
  return root;
}

function otherRoot(): FakeDir {
  const root = new FakeDir("other");
  const arch = new FakeDir("architecture");
  arch.children.set("fog.png", new FakeFile("fog.png", 12, 3000, "a"));
  arch.children.set("fog_AI.png", new FakeFile("fog_AI.png", 20, 3100, "b"));
  root.children.set("architecture", arch);
  return root;
}

const STAMP_NAME = "2026-10-05_18-45-20";

/**
 * test_processing_2: one unsplit input pair plus a two-piece run, the pair
 * files' approvals framed for the `_split_output` pick (as a real run writes).
 */
function batchRoot(): FakeDir {
  const root = new FakeDir("test_processing_2");
  root.children.set("icon-sheet.png", new FakeFile("icon-sheet.png", 12, 100, "e"));
  root.children.set("icon-sheet_AI.png", new FakeFile("icon-sheet_AI.png", 20, 110, "f"));
  const hier = new FakeDir("icon-sheet_AI");
  for (const n of ["01", "02"]) {
    const split = new FakeDir(`split_${n}`);
    const frame = `2026-10/${STAMP_NAME}/icon-sheet_AI/split_${n}`;
    split.children.set("icon-sheet.png", new FakeFile("icon-sheet.png", 12, 900, "c"));
    split.children.set(`icon-sheet_AI_${n}.png`, new FakeFile(`icon-sheet_AI_${n}.png`, 20, 960, "d"));
    const text = serializePairMeta(withDecision(newPairMeta({
      id: pairId(frame, "icon-sheet", `_${n}`), base: "icon-sheet", suffix: `_${n}`, dirPath: frame,
      ai: { relPath: `${frame}/icon-sheet_AI_${n}.png`, name: `icon-sheet_AI_${n}.png`, fingerprint: "20:960" },
      source: { relPath: `${frame}/icon-sheet.png`, name: "icon-sheet.png", fingerprint: "12:900" },
    }), "approved", "2026-10-05T17:02:11.000Z"));
    split.children.set(`icon-sheet_AI_${n}.svg.json`, new FakeFile(`icon-sheet_AI_${n}.svg.json`, text.length, 500, text));
    hier.children.set(`split_${n}`, split);
  }
  const stamp = new FakeDir(STAMP_NAME);
  stamp.children.set("icon-sheet_AI", hier);
  const month = new FakeDir("2026-10");
  month.children.set(STAMP_NAME, stamp);
  const output = new FakeDir("_split_output");
  output.children.set("2026-10", month);
  root.children.set("_split_output", output);
  return root;
}

function subdir(root: FakeDir, ...names: string[]): FakeDir {
  let dir = root;
  for (const name of names) dir = dir.children.get(name) as FakeDir;
  return dir;
}

let mounted: { el: HTMLElement; ui: Root }[] = [];

beforeEach(async () => {
  await dropDb();
  window.localStorage.clear();
  resetAppStore();
  mounted = [];
});

afterEach(async () => {
  vi.useRealTimers();
  for (const m of mounted) {
    await act(async () => { m.ui.unmount(); });
    m.el.remove();
  }
  mounted = [];
});

describe("Selection V2 folder control", () => {
  it("shows one green Open folder button that opens the picker", async () => {
    const { el } = await renderV2(v2Root());
    const btn = el.querySelector("[data-testid='v2-root']") as HTMLButtonElement;
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.textContent).toContain("Open folder");
    expect(btn.className).toContain("open");
    expect(el.querySelector("[data-testid='v2-path']")?.textContent).toContain("No folder selected");
    await click(btn);
    expect(el.querySelectorAll("[data-testid^='v2-row-']").length).toBe(2);
  });

  it("shows the remembered full path in a read-only row below the controls", async () => {
    saveRootPathInfo("split_root", FULL, "copied");
    const { el } = await mountV2(v2Root());
    const row = el.querySelector("[data-testid='v2-path']") as HTMLElement;
    expect(row.textContent).toContain(FULL);
    expect(row.tagName).not.toBe("INPUT");
    expect(row.querySelector("input")).toBeNull();
    const bar = el.querySelector(".v2-toolbar") as HTMLElement;
    expect(bar.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("falls back to the folder name when no full path was captured", async () => {
    const { el } = await mountV2(v2Root());
    expect(el.querySelector("[data-testid='v2-path']")?.textContent).toContain("split_root");
  });

  it("has no watcher or copied-path UI", async () => {
    const { el } = await mountV2(v2Root());
    expect(el.querySelector("[data-testid='v2-watcher']")).toBeNull();
    expect(el.querySelector("[data-testid='v2-root-path']")).toBeNull();
    expect(el.querySelector("[data-testid='v2-root-path-use']")).toBeNull();
    expect(el.querySelector("[data-testid='v2-root-path-note']")).toBeNull();
    expect(el.textContent).not.toContain("Use copied path");
    expect(el.textContent).not.toContain("Watcher");
  });

  it("rescan keeps decisions and picks up new pairs", async () => {
    const root = v2Root();
    const { el } = await mountV2(root);
    await click(el.querySelector(`[data-testid='v2-row-${FOG}']`) as HTMLElement);
    await key("a");
    expect(el.querySelector(`[data-testid='v2-status-${FOG}']`)?.textContent).toBe("✓ Approved");
    const arch = root.children.get("architecture") as FakeDir;
    arch.children.set("tide.png", new FakeFile("tide.png", 12, 900, "h"));
    arch.children.set("tide_AI.png", new FakeFile("tide_AI.png", 20, 950, "i"));
    await click(el.querySelector("[data-testid='v2-rescan']") as HTMLElement);
    expect(el.querySelector(`[data-testid='v2-status-${FOG}']`)?.textContent).toBe("✓ Approved");
    expect(el.querySelector(`[data-testid='v2-row-${pairId("architecture", "tide", "")}']`)).not.toBeNull();
  });

  it("never auto-rescans: a new pair waits for a manual rescan", async () => {
    vi.useFakeTimers();
    const root = v2Root();
    (window as unknown as PickerWindow).showDirectoryPicker = () => Promise.resolve(root);
    const el = document.createElement("div");
    document.body.appendChild(el);
    const ui = createRoot(el);
    mounted.push({ el, ui });
    await act(async () => {
      ui.render(<HistoryProvider><PrefsHost><SelectionV2Panel /></PrefsHost></HistoryProvider>);
    });
    await act(async () => {
      (el.querySelector("[data-testid='v2-root']") as HTMLElement)
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(el.querySelectorAll("[data-testid^='v2-row-']").length).toBe(2);
    const arch = root.children.get("architecture") as FakeDir;
    arch.children.set("tide.png", new FakeFile("tide.png", 12, 900, "h"));
    arch.children.set("tide_AI.png", new FakeFile("tide_AI.png", 20, 950, "i"));
    await act(async () => { await vi.advanceTimersByTimeAsync(35_000); });
    expect(el.querySelector(`[data-testid='v2-row-${pairId("architecture", "tide", "")}']`)).toBeNull();
    await act(async () => {
      (el.querySelector("[data-testid='v2-rescan']") as HTMLElement)
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(el.querySelector(`[data-testid='v2-row-${pairId("architecture", "tide", "")}']`)).not.toBeNull();
  });
});

describe("Generate SVG folder control", () => {
  it("shows one green Open folder button that opens the picker", async () => {
    const { el } = await renderSvg(svgRoot());
    const btn = el.querySelector("[data-testid=svg-choose-root]") as HTMLButtonElement;
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.textContent).toContain("Open folder");
    expect(btn.className).toContain("open");
    expect(el.querySelector("[data-testid=svg-path]")?.textContent).toContain("No folder selected");
    await click(btn);
    expect(el.querySelectorAll(".svg-row").length).toBe(1);
  });

  it("shows the remembered full path in a read-only row below the controls", async () => {
    saveRootPathInfo("split_root", FULL, "copied");
    const { el } = await mountSvg(svgRoot());
    const row = el.querySelector("[data-testid=svg-path]") as HTMLElement;
    expect(row.textContent).toContain(FULL);
    expect(row.tagName).not.toBe("INPUT");
    expect(row.querySelector("input")).toBeNull();
    const bar = el.querySelector(".svg-toolbar") as HTMLElement;
    expect(bar.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("has no copied-path UI", async () => {
    const { el } = await mountSvg(svgRoot());
    expect(el.querySelector("[data-testid=svg-root]")).toBeNull();
    expect(el.querySelector("[data-testid=svg-root-path]")).toBeNull();
    expect(el.querySelector("[data-testid=svg-root-path-use]")).toBeNull();
    expect(el.querySelector("[data-testid=svg-root-path-note]")).toBeNull();
    expect(el.textContent).not.toContain("Use copied path");
  });

  it("rescan rebuilds the approved list", async () => {
    const root = svgRoot();
    const { el } = await mountSvg(root);
    expect(el.querySelectorAll(".svg-row").length).toBe(1);
    const arch = root.children.get("architecture") as FakeDir;
    arch.children.set("court.png", new FakeFile("court.png", 12, 2000, "c"));
    arch.children.set("court_AI.png", new FakeFile("court_AI.png", 20, 2100, "d"));
    const file = root.children.get("review-decisions.json") as FakeFile;
    file.text = decisions([FOG, pairId("architecture", "court", "")]);
    await click(el.querySelector("[data-testid=svg-rescan]") as HTMLElement);
    expect(el.querySelectorAll(".svg-row").length).toBe(2);
  });
});

describe("Selection V1 keeps its watcher", () => {
  it("still offers the watcher toggle", async () => {
    (window as unknown as PickerWindow).showDirectoryPicker = () => Promise.resolve(v1Root());
    const el = document.createElement("div");
    document.body.appendChild(el);
    const ui = createRoot(el);
    mounted.push({ el, ui });
    await act(async () => { ui.render(<HistoryProvider><SelectionPanel /></HistoryProvider>); });
    await click(el.querySelector("[data-testid='sel-root']") as HTMLElement);
    expect(el.querySelector("[data-testid='sel-watcher']")?.textContent).toContain("Watcher");
  });
});

describe("Selection V2 lists the same run at every pick level (bug-1)", () => {
  it("lists the run's pieces when the picked folder IS the split output", async () => {
    const { el } = await mountV2(subdir(batchRoot(), "_split_output"));
    expect(el.querySelectorAll("[data-testid^='v2-row-']").length).toBe(2);
    expect(el.querySelector("[data-testid='v2-scan-scope']")?.textContent).toBe("Scope: this split output");
  });

  it("lists the same pieces from the stamp folder", async () => {
    const { el } = await mountV2(subdir(batchRoot(), "_split_output", "2026-10", STAMP_NAME));
    expect(el.querySelectorAll("[data-testid^='v2-row-']").length).toBe(2);
  });

  it("lists the same pieces from the month folder", async () => {
    const { el } = await mountV2(subdir(batchRoot(), "_split_output", "2026-10"));
    expect(el.querySelectorAll("[data-testid^='v2-row-']").length).toBe(2);
  });

  it("keeps the approvals when moving between pick levels", async () => {
    const root = batchRoot();
    const { el } = await mountV2(subdir(root, "_split_output"));
    expect(badges(el)).toEqual(["✓ Approved", "✓ Approved"]);
    (window as unknown as PickerWindow).showDirectoryPicker = () =>
      Promise.resolve(subdir(root, "_split_output", "2026-10", STAMP_NAME));
    await click(el.querySelector("[data-testid='v2-root']") as HTMLElement);
    expect(el.querySelectorAll("[data-testid^='v2-row-']").length).toBe(2);
    expect(badges(el)).toEqual(["✓ Approved", "✓ Approved"]);
  });
});

describe("Generate SVG lists the same run at every pick level (bug-1)", () => {
  it("lists the approved pieces when the picked folder IS the split output", async () => {
    const { el } = await mountSvg(subdir(batchRoot(), "_split_output"));
    expect(el.querySelectorAll(".svg-row").length).toBe(2);
  });

  it("lists the same pieces from the stamp folder", async () => {
    const { el } = await mountSvg(subdir(batchRoot(), "_split_output", "2026-10", STAMP_NAME));
    expect(el.querySelectorAll(".svg-row").length).toBe(2);
  });

  it("lists the same pieces from the month folder", async () => {
    const { el } = await mountSvg(subdir(batchRoot(), "_split_output", "2026-10"));
    expect(el.querySelectorAll(".svg-row").length).toBe(2);
  });
});

describe("the full path after a folder is chosen (bug-2)", () => {
  it("V2 captures a pasted full path when the clipboard read gave nothing", async () => {
    const { el } = await mountV2(v2Root());
    expect(el.querySelector("[data-testid='v2-path']")?.textContent).toContain("split_root");
    expect(el.querySelector("[data-testid='v2-path-hint']")?.textContent).toContain("then paste (Ctrl+V)");
    await firePaste(FULL);
    expect(el.querySelector("[data-testid='v2-path']")?.textContent).toContain(FULL);
    expect(el.querySelector("[data-testid='v2-toast']")?.textContent).toContain(`Full path taken from your paste: ${FULL}`);
    expect(el.querySelector("[data-testid='v2-path-hint']")).toBeNull();
  });

  it("SVG captures a pasted full path when the clipboard read gave nothing", async () => {
    const { el } = await mountSvg(svgRoot());
    expect(el.querySelector("[data-testid=svg-path]")?.textContent).toContain("split_root");
    expect(el.querySelector("[data-testid=svg-path-hint]")?.textContent).toContain("then paste (Ctrl+V)");
    await firePaste(FULL);
    expect(el.querySelector("[data-testid=svg-path]")?.textContent).toContain(FULL);
    expect(el.querySelector("[data-testid=svg-toast]")?.textContent).toContain(`Full path taken from your paste: ${FULL}`);
    expect(el.querySelector("[data-testid=svg-path-hint]")).toBeNull();
  });

  it("ignores a paste aimed at a field", async () => {
    const { el } = await mountV2(v2Root());
    await firePaste(FULL, el.querySelector("[data-testid='v2-from']") as HTMLElement);
    expect(el.querySelector("[data-testid='v2-path']")?.textContent).toContain("split_root");
    expect(el.querySelector("[data-testid='v2-path']")?.textContent).not.toContain(FULL);
    expect(el.querySelector("[data-testid='v2-toast']")?.textContent ?? "").not.toContain("taken from your paste");
  });

  it("ignores pasted text that is not a folder path", async () => {
    const { el } = await mountV2(v2Root());
    await firePaste("hello world");
    expect(el.querySelector("[data-testid='v2-path']")?.textContent).toContain("split_root");
    expect(el.querySelector("[data-testid='v2-toast']")?.textContent ?? "").not.toContain("taken from your paste");
  });

  it("V2 shows the newly picked folder after a re-pick", async () => {
    const { el } = await mountV2(v2Root());
    expect(el.querySelector("[data-testid='v2-path']")?.textContent).toContain("split_root");
    (window as unknown as PickerWindow).showDirectoryPicker = () => Promise.resolve(otherRoot());
    await click(el.querySelector("[data-testid='v2-root']") as HTMLElement);
    expect(el.querySelector("[data-testid='v2-path']")?.textContent).toContain("other");
  });

  it("SVG shows the newly picked folder after a re-pick", async () => {
    const { el } = await mountSvg(svgRoot());
    expect(el.querySelector("[data-testid=svg-path]")?.textContent).toContain("split_root");
    (window as unknown as PickerWindow).showDirectoryPicker = () => Promise.resolve(otherRoot());
    await click(el.querySelector("[data-testid=svg-choose-root]") as HTMLElement);
    expect(el.querySelector("[data-testid=svg-path]")?.textContent).toContain("other");
  });
});

function badges(el: HTMLElement): string[] {
  return [...el.querySelectorAll("[data-testid^='v2-status-']")]
    .map((b) => b.textContent ?? "").sort();
}

async function firePaste(text: string, target?: HTMLElement): Promise<void> {
  const event = new Event("paste", { bubbles: true, cancelable: true }) as
    Event & { clipboardData?: { getData: (type: string) => string } };
  event.clipboardData = { getData: () => text };
  await act(async () => { (target ?? window).dispatchEvent(event); });
  await settle();
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

async function renderV2(root: FakeDir): Promise<{ el: HTMLElement; ui: Root }> {
  (window as unknown as PickerWindow).showDirectoryPicker = () => Promise.resolve(root);
  const el = document.createElement("div");
  document.body.appendChild(el);
  const ui = createRoot(el);
  mounted.push({ el, ui });
  await act(async () => {
    ui.render(<HistoryProvider><PrefsHost><SelectionV2Panel /></PrefsHost></HistoryProvider>);
  });
  await settle();
  return { el, ui };
}

async function mountV2(root: FakeDir): Promise<{ el: HTMLElement; ui: Root }> {
  const m = await renderV2(root);
  await click(m.el.querySelector("[data-testid='v2-root']") as HTMLElement);
  return m;
}

async function renderSvg(root: FakeDir): Promise<{ el: HTMLElement; ui: Root }> {
  (window as unknown as PickerWindow).showDirectoryPicker = () => Promise.resolve(root);
  const el = document.createElement("div");
  document.body.appendChild(el);
  const ui = createRoot(el);
  mounted.push({ el, ui });
  await act(async () => {
    ui.render(<HistoryProvider><PrefsHost><SvgPanel /></PrefsHost></HistoryProvider>);
  });
  await settle();
  return { el, ui };
}

async function mountSvg(root: FakeDir): Promise<{ el: HTMLElement; ui: Root }> {
  const m = await renderSvg(root);
  await click(m.el.querySelector("[data-testid=svg-choose-root]") as HTMLElement);
  return m;
}

async function click(node: HTMLElement): Promise<void> {
  await act(async () => { node.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle();
}

async function key(k: string): Promise<void> {
  await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })); });
  await settle();
}

async function settle(): Promise<void> {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
