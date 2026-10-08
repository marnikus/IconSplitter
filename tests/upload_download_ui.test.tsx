// upload_download_ui.test.tsx — "Download all" (2026-10-08) on the real "SVG to
// upload" panel (RULE 8): the real export pipeline commits a package, then the
// bulk bar's button copies every CHECKED icon's committed files into the folder
// the user picked. Only what a DOM cannot provide is stubbed: the canvas encoder,
// the image decoder and the folder dialog (a fake folder stands in for the OS).
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializePairMeta } from "../src/lib/pairmeta";
import { pairId } from "../src/lib/pairing";
import { getLogState, resetLogStore } from "../src/log/logstore";
import { resetAppStore } from "../src/state/appstore";
import { HistoryProvider } from "../src/state/HistoryProvider";
import UploadPanel from "../src/upload/UploadPanel";
import { BinDir, BinFile } from "./helpers/binfakefs";
import { minimalJpeg } from "./helpers/minijpeg";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// No IndexedDB in this DOM: an in-memory handle store keeps the boot real.
const stored = new Map<string, unknown>();
vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return {
    ...actual,
    saveHandles: vi.fn(async (name: string, handles: unknown) => { stored.set(name, handles); }),
    loadHandles: vi.fn(async (name: string) => stored.get(name) ?? null),
  };
});

const DIR = "architecture";
const FOG = pairId(DIR, "fog", "");
const ARCH = pairId(DIR, "arch", "");
const SAVED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>`;

let host: HTMLDivElement;
let ui: Root;
const win = window as unknown as { showDirectoryPicker?: () => Promise<unknown> };

const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const text = (sel: string) => q(sel)?.textContent ?? "";
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

async function waitFor(fn: () => boolean, label: string, ms = 12000): Promise<void> {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${label}`);
    await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
  }
}

async function waitForEl(sel: string): Promise<HTMLElement> {
  await waitFor(() => q(sel) !== null, sel);
  return q(sel) as HTMLElement;
}

async function click(sel: string): Promise<void> {
  const el = await waitForEl(sel);
  await waitFor(() => (el as HTMLButtonElement).disabled !== true, `${sel} to be enabled`);
  await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle();
}

async function check(id: string): Promise<void> {
  const el = (await waitForEl(`[data-testid=upload-check-${id}]`)) as HTMLInputElement;
  await act(async () => { el.click(); });
  await settle();
}

/** The fixture: fog and arch are approved; both have an AI image and an SVG source. */
function makeRoot(): BinDir {
  const root = new BinDir("split_root");
  const dir = new BinDir(DIR);
  for (const [id, name] of [[FOG, "fog"], [ARCH, "arch"]] as const) {
    dir.children.set(`${name}_AI.png`, new BinFile(`${name}_AI.png`, "ai", 3100));
    dir.children.set(`${name}_AI.svg`, new BinFile(`${name}_AI.svg`, SAVED_SVG, 3400));
    const meta = pairFile(DIR, `${name}_AI.png`, { id, versions: [svgVersion(`${DIR}/${name}_AI.svg`, { version: 1, review: "approved" })] });
    dir.children.set(`${name}_AI.svg.json`, new BinFile(`${name}_AI.svg.json`, serializePairMeta(meta), 3300));
  }
  root.children.set(DIR, dir);
  return root;
}

/** The canvas stub the export needs to encode a JPEG; the SVG is never altered. */
function stubCanvas(): void {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => (
    { fillStyle: "", fillRect: () => undefined, drawImage: () => undefined } as never
  ));
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback) {
    cb(new Blob([minimalJpeg(this.width, this.height) as BlobPart], { type: "image/jpeg" }));
  });
  class FakeImage {
    src = "";
    naturalWidth = 24;
    naturalHeight = 24;
    decode(): Promise<void> { return Promise.resolve(); }
  }
  vi.stubGlobal("Image", FakeImage);
  const url = URL as unknown as { createObjectURL?: (b: Blob) => string; revokeObjectURL?: (u: string) => void };
  url.createObjectURL = () => "blob:download-test";
  url.revokeObjectURL = () => undefined;
}

async function mount(root: BinDir): Promise<void> {
  stored.set("__upload__", { source: root });
  await act(async () => {
    ui = createRoot(host);
    ui.render(<HistoryProvider><UploadPanel /></HistoryProvider>);
  });
  await waitFor(() => q("[data-testid=upload-row-count]") !== null, "the list to render");
  await settle();
}

/** Exports one icon with its row button (no metadata, so no paid call). */
async function exportOne(id: string): Promise<void> {
  await click(`[data-testid=upload-export-${id}]`);
  await waitFor(() => text(`[data-testid=upload-status-${id}]`).includes("Processed"), `${id} to commit`);
}

/** Points the folder dialog at `dest` — the one thing a DOM cannot show. */
function pickerReturns(dest: BinDir): void {
  win.showDirectoryPicker = () => Promise.resolve(dest);
}

const exportDirOf = (root: BinDir): BinDir => (root.children.get(DIR) as BinDir).children.get("export") as BinDir;
const bytesOf = (dir: BinDir, name: string): number[] => Array.from((dir.children.get(name) as BinFile).bytes);

beforeEach(() => {
  // The tab shows its unsupported screen unless the folder API exists: a default
  // dialog that is cancelled keeps every test's first render honest.
  pickerReturns(new BinDir("unused"));
  localStorage.clear();
  stored.clear();
  resetAppStore();
  resetLogStore();
  stubCanvas();
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => ui.unmount());
  host.remove();
  delete win.showDirectoryPicker;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const itSlow = (name: string, fn: () => Promise<void>) => it(name, fn, 30000);

describe("Download all — the button", () => {
  itSlow("sits in the bulk bar and needs at least one checked icon", async () => {
    await mount(makeRoot());
    const button = await waitForEl("[data-testid=upload-download-all]") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await check(FOG);
    expect((q("[data-testid=upload-download-all]") as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("Download all — the folder dialog", () => {
  itSlow("a cancelled dialog saves nothing and says so", async () => {
    const root = makeRoot();
    await mount(root);
    await exportOne(FOG);
    await check(FOG);
    const dest = new BinDir("Exports");
    win.showDirectoryPicker = () => Promise.reject(new DOMException("closed", "AbortError"));
    await click("[data-testid=upload-download-all]");
    await waitFor(() => text("[data-testid=upload-toast]").includes("cancelled"), "the cancel toast");
    expect(dest.children.size).toBe(0);
  });

  it("a browser without the folder API is told to use Chrome or Edge — no dead button", async () => {
    delete win.showDirectoryPicker; // before the first render: the tab reads the API then
    await act(async () => {
      ui = createRoot(host);
      ui.render(<HistoryProvider><UploadPanel /></HistoryProvider>);
    });
    await waitFor(() => q("[data-testid=upload-unsupported]") !== null, "the unsupported screen");
    expect(text("[data-testid=upload-unsupported]")).toContain("Chrome or Edge");
    expect(q("[data-testid=upload-download-all]")).toBeNull();
  });
});

describe("Download all — what lands in the folder", () => {
  itSlow("copies every checked icon's committed package, byte for byte, and skips the one never exported", async () => {
    const root = makeRoot();
    await mount(root);
    await exportOne(FOG);
    await check(FOG);
    await check(ARCH); // checked but never exported: skipped and named
    const dest = new BinDir("Exports");
    pickerReturns(dest);
    await click("[data-testid=upload-download-all]");
    await waitFor(() => dest.children.has("fog.jpg"), "the copy to land");

    const exp = exportDirOf(root);
    for (const name of ["fog.svg", "fog.jpg"]) {
      expect(bytesOf(dest, name)).toEqual(bytesOf(exp, name));
    }
    expect(dest.children.has("arch.svg")).toBe(false);
    expect(text("[data-testid=upload-toast]")).toContain("1 without an export skipped");
    // the approved source and the export folder are untouched
    expect(bytesOf(root.children.get(DIR) as BinDir, "fog_AI.svg")).toEqual(Array.from(new TextEncoder().encode(SAVED_SVG)));
  });

  itSlow("never overwrites a name the folder already holds — the package is numbered whole", async () => {
    const root = makeRoot();
    await mount(root);
    await exportOne(FOG);
    await check(FOG);
    const dest = new BinDir("Exports");
    dest.children.set("fog.svg", new BinFile("fog.svg", "mine, keep me", 1));
    pickerReturns(dest);
    await click("[data-testid=upload-download-all]");
    await waitFor(() => dest.children.has("fog_2.jpg"), "the numbered copy to land");

    expect((dest.children.get("fog.svg") as BinFile).text).toBe("mine, keep me");
    expect(dest.children.has("fog_2.svg")).toBe(true);
    expect(text("[data-testid=upload-toast]")).toContain("1 renamed");
  });

  itSlow("every checked icon reaches the log, one entry each, and none carries the file bytes", async () => {
    await mount(makeRoot());
    await exportOne(FOG);
    await check(FOG);
    await check(ARCH);
    pickerReturns(new BinDir("Exports"));
    await click("[data-testid=upload-download-all]");
    await waitFor(() => getLogState().entries.some((e) => e.action === "downloaded" && (e.detail ?? "").includes("Exports")), "the log");
    const entries = getLogState().entries.filter((e) => e.feature === "upload" && e.action === "downloaded");
    expect(entries.map((e) => e.ids?.base)).toEqual(expect.arrayContaining(["fog", "arch"]));
    expect(entries.find((e) => e.ids?.base === "arch")?.level).toBe("warn");
    expect(JSON.stringify(entries)).not.toContain(SAVED_SVG);
  });
});
