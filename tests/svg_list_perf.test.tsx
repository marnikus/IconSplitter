// TDD response & work-budget suite for the Generate SVG list panel:
// verifies warm-gesture isolation, zero warm boot storage reads, preview parse
// deduplication, zero-reparse zoom/bg changes, targeted file-bump & tail-review
// subscriptions, and instant synchronous modal opening on already-loaded SVGs.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SvgPanel from "../src/svg/SvgPanel";
import { HistoryProvider } from "../src/state/HistoryProvider";
import { resetAppStore } from "../src/state/appstore";
import { SVG_HANDLE_KEY } from "../src/state/handlekeys";
import { clearKnownRoots } from "../src/lib/knownroots";
import { pairId } from "../src/lib/pairing";
import { serializePairMeta } from "../src/lib/pairmeta";
import { setLazyPreviews } from "../src/ui/lazypreviews";
import { saveSvgPrefs } from "../src/svg/prefsstore";
import { bumpSvgFile } from "../src/svg/usesvgtext";
import { closeSvgEditor } from "../src/svg/pathedit/editmodalstore";
import * as svgfiles from "../src/svg/svgfiles";
import * as safestorage from "../src/state/safestorage";
import * as rowmodel from "../src/svg/rowmodel";
import * as svgdoc from "../src/lib/pathedit/svgdoc";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";
import { waitUntil } from "./helpers/quiet";

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

let host: HTMLDivElement;
let root: Root;

function iconSvg(index: number): string {
  const r = 4 + (index % 7);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">`
    + `<path d="M8 8L56 8L56 56L8 56Z" fill="none" stroke="#111" stroke-width="2"/>`
    + `<circle cx="32" cy="32" r="${r}" fill="#111"/>`
    + `<path d="M12 ${16 + (index % 20)}C24 8 40 56 52 24" fill="none" stroke="#111" stroke-width="2"/>`
    + `</svg>`;
}

function makeSvgFixture(count: number): { dir: FakeDir; ids: string[] } {
  const dir = new FakeDir("svg-perf-root");
  const sub = new FakeDir("icons");
  const ids: string[] = [];
  const records: object[] = [];
  for (let i = 0; i < count; i++) {
    const stem = `icon_${String(i).padStart(4, "0")}`;
    const id = pairId("icons", stem, "");
    ids.push(id);
    const svg = iconSvg(i);
    sub.children.set(`${stem}.png`, new FakeFile(`${stem}.png`, 16, 1000 + i, "orig"));
    sub.children.set(`${stem}_AI.png`, new FakeFile(`${stem}_AI.png`, 20, 2000 + i, "ai"));
    sub.children.set(`${stem}_AI.svg`, new FakeFile(`${stem}_AI.svg`, svg.length, 3000 + i, svg));
    const meta = pairFile("icons", `${stem}_AI.png`, {
      id,
      versions: [svgVersion(`icons/${stem}_AI.svg`, { review: i % 3 === 0 ? "approved" : "pending" })],
    });
    sub.children.set(`${stem}_AI.svg.json`, new FakeFile(`${stem}_AI.svg.json`, 64, 3100 + i, serializePairMeta(meta)));
    records.push({
      pair_id: id, source: `icons/${stem}.png`, ai_result: `icons/${stem}_AI.png`,
      decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z",
    });
  }
  dir.children.set("icons", sub);
  dir.children.set("review-decisions.json", new FakeFile("review-decisions.json", 64, 50, JSON.stringify({ records })));
  stored.set(SVG_HANDLE_KEY, { source: dir });
  return { dir, ids };
}

const q = <T extends HTMLElement = HTMLElement>(id: string) =>
  host.querySelector<T>(`[data-testid="${id}"]`)!;

function setControlValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

beforeEach(() => {
  localStorage.clear();
  stored.clear();
  resetAppStore();
  clearKnownRoots();
  closeSvgEditor();
  setLazyPreviews(false);
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("no network"); }));
  Object.defineProperty(window, "showDirectoryPicker", { configurable: true, value: async () => null });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  closeSvgEditor();
  setLazyPreviews(true);
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetAppStore();
});

async function mountReady(count: number): Promise<string[]> {
  const { ids } = makeSvgFixture(count);
  await act(async () => root.render(<HistoryProvider><SvgPanel /></HistoryProvider>));
  await waitUntil(() => q("svg-shown")?.textContent === `Showing ${count} of ${count}`, "rows loaded", 20000);
  await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
  return ids;
}

describe("Generate SVG list performance & response isolation", () => {
  it("loads freshly persisted prefs on remount without retaining a stale boot cache", async () => {
    makeSvgFixture(0);
    await act(async () => root.render(<HistoryProvider><SvgPanel /></HistoryProvider>));
    const initialThumb = (q<HTMLInputElement>("svg-thumb")).value;
    await act(async () => root.unmount());
    saveSvgPrefs({ thumbHeight: 164, providerOpen: false, previewBg: { preset: "black", custom: "#000000" }, previewStroke: null });
    root = createRoot(host);
    await act(async () => root.render(<HistoryProvider><SvgPanel /></HistoryProvider>));
    expect(initialThumb).not.toBe("164");
    expect((q<HTMLInputElement>("svg-thumb")).value).toBe("164");
  });

  it("performs zero boot localStorage reads and zero redundant list/DOM-parse passes on warm list gestures", async () => {
    const COUNT = 150;
    const parseSpy = vi.spyOn(DOMParser.prototype, "parseFromString");
    const ids = await mountReady(COUNT);
    const initialParses = parseSpy.mock.calls.length;

    parseSpy.mockClear();
    const readKeySpy = vi.spyOn(safestorage, "readKey");
    const toListRowSpy = vi.spyOn(rowmodel, "toListRow");
    const pathTagsSpy = vi.spyOn(svgdoc, "pathTags");
    const readSvgSpy = vi.spyOn(svgfiles, "readSvgText");

    const t0 = performance.now();
    // 1) Active row navigation across 10 rows
    for (let i = 0; i < 10; i++) await act(async () => { q(`svg-row-${ids[i]}`).click(); });
    // 2) Single checkbox toggles across 8 rows + bulk select/deselect
    for (let i = 0; i < 8; i++) await act(async () => { q(`svg-check-${ids[i]}`).click(); });
    await act(async () => { q("svg-select-visible").click(); });
    await act(async () => { q("svg-deselect").click(); });
    // 3) Zoom slider steps (5 ticks) + background switches (3 presets)
    for (const px of ["112", "128", "144", "160", "96"]) {
      await act(async () => { setControlValue(q<HTMLInputElement>("svg-thumb"), px); });
    }
    for (const preset of ["black", "gray", "white"]) {
      await act(async () => { q(`svg-bg-${preset}`).click(); });
    }
    // 4) Prompt edits (4 keystrokes)
    for (let i = 0; i < 4; i++) {
      await act(async () => { setControlValue(q<HTMLTextAreaElement>("svg-prompt"), `Custom prompt ${i}`); });
    }
    const elapsedMs = performance.now() - t0;
    const bootKeys = new Set([
      "iconSplitter.svg.prefs.v1", "iconSplitter.svg.config.v1",
      "iconSplitter.svg.connections.v1", "iconSplitter.svg.prompt.v1", "iconSplitter.svg.prompts.v1",
    ]);
    const bootReads = readKeySpy.mock.calls.filter(([k]) => bootKeys.has(k));
    console.info(`[svg_list_perf] 150-row warm gesture suite: ${elapsedMs.toFixed(1)} ms | initialParses=${initialParses} warmParses=${parseSpy.mock.calls.length} bootReads=${bootReads.length} toListRow=${toListRowSpy.mock.calls.length} pathTags=${pathTagsSpy.mock.calls.length}`);

    expect(initialParses).toBeLessThanOrEqual(COUNT);
    expect(bootReads).toHaveLength(0);
    expect(parseSpy).not.toHaveBeenCalled();
    expect(toListRowSpy).not.toHaveBeenCalled();
    expect(pathTagsSpy).not.toHaveBeenCalled();
    expect(readSvgSpy).not.toHaveBeenCalled();

    // 5) Bumping 1 file re-reads ONLY that 1 file, and opening Edit on a loaded row reads 0 files from disk.
    await act(async () => { bumpSvgFile("icons/icon_0000_AI.svg"); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(readSvgSpy).toHaveBeenCalledTimes(1);

    readSvgSpy.mockClear();
    await act(async () => { q(`svg-edit-btn-${ids[1]}`).click(); });
    expect(q(`svg-edit-${ids[1]}-editor`)).not.toBeNull();
    expect(readSvgSpy).not.toHaveBeenCalled();
  });
});
