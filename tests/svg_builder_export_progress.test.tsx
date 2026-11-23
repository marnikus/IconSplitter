// @vitest-environment happy-dom
// svg_builder_export_progress.test.tsx — TDD contract for SVG builder artboard
// export live progress bar (completed count, remaining/"left" count, %, current
// artboard, mid-run Cancel, completed vs failed terminal states, Review & ✕).
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Workbench from "../src/ui/Workbench";
import { resetAppStore } from "../src/state/appstore";
import { serializePairMeta } from "../src/lib/pairmeta";
import { loadBuilderFormats, saveBuilderFormats } from "../src/svgBuilder/formatstore";
import { setIndexRuntime } from "../src/svgBuilder/indexer/runtime";
import SvgBuilderExportProgress from "../src/svgBuilder/SvgBuilderExportProgress";
import {
  beginBuilderExport,
  builderExportSlot,
  cancelBuilderExport,
  dismissBuilderExport,
} from "../src/svgBuilder/exportprogress";
import * as exporter from "../src/svgBuilder/exporter";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";
import { settle, waitUntil } from "./helpers/quiet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return { ...actual, saveHandles: vi.fn(async () => undefined), loadHandles: vi.fn(async () => null) };
});

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18v18H3z"/></svg>';
const STEMS = ["apple", "bread", "cake", "donut", "egg", "home", "gear", "bell"];

interface Deferred<T> { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void }
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function makeLibrary(): FakeDir {
  const root = new FakeDir("icons");
  const sub = new FakeDir("set");
  root.children.set("set", sub);
  for (const stem of STEMS) {
    const meta = serializePairMeta(pairFile("set", `${stem}_AI.png`, { versions: [svgVersion(`set/${stem}_AI.svg`, { version: 1, review: "approved" })] }));
    sub.children.set(`${stem}_AI.png`, new FakeFile(`${stem}_AI.png`, 20, 3100, "ai"));
    sub.children.set(`${stem}_AI.svg`, new FakeFile(`${stem}_AI.svg`, SVG.length, 3400, SVG));
    sub.children.set(`${stem}_AI.svg.json`, new FakeFile(`${stem}_AI.svg.json`, meta.length, 3500, meta));
  }
  return root;
}

let host: HTMLDivElement;
let ui: Root;
const q = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const text = (id: string) => q(id)?.textContent ?? "";

async function click(id: string): Promise<void> {
  const el = q(id);
  if (el === null) throw new Error(`missing ${id}`);
  await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle(0);
}

async function setupThreeCheckedArtboards(): Promise<string[]> {
  await click("tab-svg-builder");
  await click("builder-open-folder");
  await waitUntil(() => text("builder-library-count") === String(STEMS.length), "library scanned");
  await waitUntil(() => q("builder-artboard") !== null, "sheet composed");
  await click("builder-template-save");
  const tplBtn = host.querySelector('[data-testid^="builder-template-add-artboard-"]') as HTMLElement | null;
  if (tplBtn === null) throw new Error("missing add-artboard button");
  const addId = tplBtn.getAttribute("data-testid")!;
  await click(addId);
  await click(addId);
  await click(addId);
  await click("builder-artboards-check-all");
  const rows = [...host.querySelectorAll('[data-testid^="builder-artboard-ab-"]')];
  return rows.map((r) => r.getAttribute("data-testid")!.replace("builder-artboard-", ""));
}

function savePngOnlySettings(): void {
  saveBuilderFormats({
    ...loadBuilderFormats(), includeSvg: true, includeJpeg: true, includeEps: false, expandText: false,
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })));
  localStorage.clear();
  resetAppStore();
  const dir = makeLibrary();
  (window as unknown as { showDirectoryPicker: () => Promise<FakeDir> }).showDirectoryPicker = async () => dir;
  host = document.createElement("div");
  document.body.appendChild(host);
  ui = createRoot(host);
  act(() => { ui.render(<Workbench />); });
});

afterEach(() => {
  setIndexRuntime(null);
  vi.restoreAllMocks();
  act(() => ui.unmount());
  host.remove();
  delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  vi.unstubAllGlobals();
});

describe("SVG builder artboard export live progress bar", () => {
  it("mounts builder-progress-mount empty at idle and steps completed, remaining (left), % and current artboard live across 3 artboards", async () => {
    savePngOnlySettings();
    const gates: Deferred<Blob>[] = [];
    vi.spyOn(exporter, "sheetPngBlob").mockImplementation(() => {
      const g = deferred<Blob>();
      gates.push(g);
      return g.promise;
    });
    await setupThreeCheckedArtboards();
    expect(q("builder-progress-mount")).not.toBeNull();
    expect(q("builder-export-progress-header")).toBeNull();

    await click("builder-export-selected");
    await waitUntil(() => gates.length === 1, "artboard 1 started");
    expect(q("builder-progress-mount")?.contains(q("builder-export-progress-header"))).toBe(true);
    expect(q("builder-export-progress-header")?.getAttribute("data-status")).toBe("running");
    expect(text("builder-export-progress-completed")).toBe("0 completed / 3");
    expect(text("builder-export-progress-remaining")).toBe("3 remaining");
    expect(text("builder-export-progress-percent")).toBe("0%");
    expect(q("builder-export-progress-track")?.getAttribute("aria-valuenow")).toBe("0");
    expect(text("builder-export-progress-title")).toContain("3 left");
    expect(text("builder-export-progress-file")).toContain("#1");
    expect(text("builder-export-selected")).toContain("0/3");
    expect(text("builder-export-selected")).toContain("3 left");
    expect(text("builder-busy")).toContain("3 left");

    await act(async () => { gates[0].resolve(new Blob(["png1"], { type: "image/png" })); });
    await waitUntil(() => gates.length === 2, "artboard 2 started");
    expect(text("builder-export-progress-completed")).toBe("1 completed / 3");
    expect(text("builder-export-progress-remaining")).toBe("2 remaining");
    expect(text("builder-export-progress-percent")).toBe("33%");
    expect(q("builder-export-progress-track")?.getAttribute("aria-valuenow")).toBe("33");
    expect(text("builder-export-progress-title")).toContain("2 left");
    expect(text("builder-export-progress-file")).toContain("#2");
    expect(text("builder-export-selected")).toContain("1/3");
    expect(text("builder-export-selected")).toContain("2 left");

    await act(async () => { gates[1].resolve(new Blob(["png2"], { type: "image/png" })); });
    await waitUntil(() => gates.length === 3, "artboard 3 started");
    expect(text("builder-export-progress-completed")).toBe("2 completed / 3");
    expect(text("builder-export-progress-remaining")).toBe("1 remaining");
    expect(text("builder-export-progress-percent")).toBe("67%");
    expect(text("builder-export-progress-title")).toContain("1 left");
    expect(text("builder-export-progress-file")).toContain("#3");

    await act(async () => { gates[2].resolve(new Blob(["png3"], { type: "image/png" })); });
    await waitUntil(() => q("builder-export-progress-header")?.getAttribute("data-status") === "completed", "export completed");
    expect(text("builder-export-progress-completed")).toBe("3 completed / 3");
    expect(text("builder-export-progress-remaining")).toBe("0 remaining");
    expect(text("builder-export-progress-percent")).toBe("100%");
    expect(text("builder-export-progress-icon")).toBe("✓");
    expect(text("builder-export-selected")).toBe("⇪ Export all selected (3)");
  });

  it("cancelling mid-run stops before remaining artboards and preserves exact partial completed and remaining counts", async () => {
    savePngOnlySettings();
    const gates: Deferred<Blob>[] = [];
    vi.spyOn(exporter, "sheetPngBlob").mockImplementation(() => {
      const g = deferred<Blob>();
      gates.push(g);
      return g.promise;
    });
    await setupThreeCheckedArtboards();
    await click("builder-export-selected");
    await waitUntil(() => gates.length === 1, "artboard 1 started");
    await act(async () => { gates[0].resolve(new Blob(["png1"], { type: "image/png" })); });
    await waitUntil(() => gates.length === 2, "artboard 2 started");

    await click("builder-export-progress-cancel");
    await act(async () => { gates[1].reject(new DOMException("Aborted", "AbortError")); });
    await waitUntil(() => q("builder-export-progress-header")?.getAttribute("data-status") === "cancelled", "cancelled");

    expect(gates).toHaveLength(2);
    expect(text("builder-export-progress-completed")).toBe("1 completed / 3");
    expect(text("builder-export-progress-remaining")).toBe("2 remaining");
    expect(text("builder-export-progress-percent")).toBe("33%");
    expect(text("builder-export-progress-icon")).toBe("■");
    expect(text("builder-export-progress-file")).toContain("2 left");
  });

  it("marks terminal status failed on part problems, supports Review results across tabs, and dismisses on ✕", async () => {
    savePngOnlySettings();
    vi.spyOn(exporter, "sheetPngBlob").mockRejectedValue(new Error("canvas unavailable"));
    await setupThreeCheckedArtboards();
    await click("builder-export-selected");
    await waitUntil(() => q("builder-export-progress-header")?.getAttribute("data-status") === "failed", "failed bar");

    expect(text("builder-export-progress-completed")).toBe("3 completed / 3");
    expect(text("builder-export-progress-remaining")).toBe("0 remaining");
    expect(text("builder-export-progress-icon")).toBe("!");
    expect(text("builder-export-progress-file")).toContain("canvas unavailable");
    expect(text("builder-toast")).toMatch(/exported/i);

    await click("tab-upload");
    expect(q("builder-shell")?.hasAttribute("hidden")).toBe(true);
    await click("builder-export-progress-review");
    expect(q("builder-shell")?.hasAttribute("hidden")).toBe(false);

    await click("builder-export-progress-dismiss");
    expect(q("builder-export-progress-header")).toBeNull();
  });

  it("ignores late updates, duplicate cancel, running dismiss, and renders inline without a portal mount", async () => {
    act(() => ui.unmount());
    host.innerHTML = "";
    const inlineRoot = createRoot(host);
    act(() => { inlineRoot.render(<SvgBuilderExportProgress />); });
    const run = beginBuilderExport(2);
    await settle(0);
    expect(q("builder-export-progress-header")).not.toBeNull();
    dismissBuilderExport();
    expect(builderExportSlot.value?.status).toBe("running");
    act(() => { cancelBuilderExport(); });
    cancelBuilderExport();
    expect(builderExportSlot.value?.cancelling).toBe(true);
    expect(text("builder-export-progress-title")).toBe("Stopping artboard export…");
    expect((q("builder-export-progress-cancel") as HTMLButtonElement | null)?.disabled).toBe(true);
    let run2!: ReturnType<typeof beginBuilderExport>;
    act(() => { run2 = beginBuilderExport(1); });
    act(() => {
      run.finish();
      run2.advance([]);
      run2.finish();
      run2.startItem("ignored");
    });
    expect(builderExportSlot.value?.status).toBe("completed");
    act(() => inlineRoot.unmount());
  });
});
