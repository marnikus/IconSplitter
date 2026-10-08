// upload_eps_settings_ui.test.tsx — the EPS converter drop list, the Inkscape
// helper row and the Expand-strokes toggle in the export settings dialog
// (2026-10-09). The real panel over a fake folder; the helper is a fake fetch.
// Every change is live (RULE 24): the defaults store, the row's settings line
// and the helper state move at the moment of the gesture.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializePairMeta } from "../src/lib/pairmeta";
import { pairId } from "../src/lib/pairing";
import { resetLogStore } from "../src/log/logstore";
import { forgetRestoreNote } from "../src/upload/jobstore";
import UploadPanel from "../src/upload/UploadPanel";
import { resetAppStore } from "../src/state/appstore";
import { HistoryProvider } from "../src/state/HistoryProvider";
import { BinDir, BinFile } from "./helpers/binfakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";
import { PACKAGE_SVG as SVG } from "./helpers/uploadpackage";
import { minimalJpeg } from "./helpers/minijpeg";

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

const DIR = "ui";
const FOG = pairId(`${DIR}/fog`, "fog", "");

let host: HTMLDivElement;
let ui: Root;
const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const text = (sel: string) => q(sel)?.textContent ?? "";
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const storedDefaults = () => JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}").defaults ?? {};

async function waitFor(fn: () => boolean, label: string, ms = 8000): Promise<void> {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${label}`);
    await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
  }
}
async function click(sel: string): Promise<void> {
  await waitFor(() => q(sel) !== null, sel);
  await act(async () => { q(sel)!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle();
}
async function choose(sel: string, value: string): Promise<void> {
  await waitFor(() => q(sel) !== null, sel);
  await act(async () => {
    const el = q(sel) as HTMLSelectElement;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}

function makeRoot(): BinDir {
  const root = new BinDir("split_root");
  const top = new BinDir(DIR);
  const dir = new BinDir("fog");
  dir.children.set("fog_AI.png", new BinFile("fog_AI.png", "ai", 3100));
  dir.children.set("fog_AI.svg", new BinFile("fog_AI.svg", SVG, 3400));
  const meta = pairFile(`${DIR}/fog`, "fog_AI.png", { id: FOG, versions: [svgVersion(`${DIR}/fog/fog_AI.svg`, { version: 1, review: "approved" })] });
  dir.children.set("fog_AI.svg.json", new BinFile("fog_AI.svg.json", serializePairMeta(meta), 3300));
  top.children.set("fog", dir);
  root.children.set(DIR, top);
  return root;
}

async function mount(): Promise<void> {
  stored.set("__upload__", { source: makeRoot() });
  await act(async () => {
    ui = createRoot(host);
    ui.render(<HistoryProvider><UploadPanel /></HistoryProvider>);
  });
  await waitFor(() => q("[data-testid=upload-row-count]") !== null, "the list to render");
  await settle();
}

/** The browser transports the DOM cannot provide: canvas encode + image decode (as upload_ui does). */
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
  url.createObjectURL = () => "blob:upload-test";
  url.revokeObjectURL = () => undefined;
}

const health = (body: unknown) => async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

beforeEach(() => {
  localStorage.clear();
  stored.clear();
  resetAppStore();
  resetLogStore();
  forgetRestoreNote();
  (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker = vi.fn();
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => ui.unmount());
  host.remove();
  vi.unstubAllGlobals();
  delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
});

describe("the EPS converter drop list", () => {
  it("lists the registry, changes the defaults live, shows on the row line, and pins per icon", async () => {
    vi.stubGlobal("fetch", vi.fn(health({ ok: true, inkscape: { found: true, version: "1.3.2", path: "x" } })));
    await mount();
    await click("[data-testid=upload-settings-open]");
    const select = q("[data-testid=upload-set-eps-converter]") as HTMLSelectElement;
    expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([
      ["builtin", "Built-in (PostScript subset)"], ["inkscape", "Inkscape CLI (local helper)"],
    ]);
    expect(select.value).toBe("builtin");
    expect(q("[data-testid=upload-eps-helper]")).toBeNull(); // the helper row belongs to the Inkscape choice only
    await choose("[data-testid=upload-set-eps-converter]", "inkscape");
    expect(storedDefaults().epsConverter).toBe("inkscape");
    expect(storedDefaults().includeEps).toBe(false); // choosing a converter never toggles EPS (RULE 10)
    expect(text(`[data-testid=upload-settings-${FOG}]`)).toContain("eps off · inkscape");
    await waitFor(() => text("[data-testid=upload-eps-helper-state]").includes("1.3.2"), "the probe");
    expect(text("[data-testid=upload-eps-helper-state]")).toBe("helper running · Inkscape 1.3.2");
    await click("[data-testid=upload-set-close]");

    await click(`[data-testid=upload-settings-btn-${FOG}]`);
    expect(text("[data-testid=upload-set-marker-eps-converter]")).toBe("inherited");
    await choose("[data-testid=upload-set-eps-converter]", "builtin");
    expect(text("[data-testid=upload-set-marker-eps-converter]")).toBe("overridden");
    expect(JSON.parse(localStorage.getItem("iconSplitter.upload.settings.v1") ?? "{}").overrides[FOG]).toEqual({ epsConverter: "builtin" });
    expect(text(`[data-testid=upload-settings-${FOG}]`)).toContain("eps off · builtin");
  });

  it("the helper row: not reachable, then Inkscape not installed, then Check re-probes live (RULE 4/24)", async () => {
    const fetchMock = vi.fn<() => Promise<Response>>(() => Promise.reject(new TypeError("Failed to fetch")));
    vi.stubGlobal("fetch", fetchMock);
    await mount();
    await click("[data-testid=upload-settings-open]");
    await choose("[data-testid=upload-set-eps-converter]", "inkscape");
    await waitFor(() => text("[data-testid=upload-eps-helper-state]").includes("not reachable"), "the first probe");
    expect(text("[data-testid=upload-eps-helper-state]")).toContain("run_inkscape_bridge.bat");
    expect((q("[data-testid=upload-eps-helper-url]") as HTMLInputElement).value).toBe("http://127.0.0.1:47391");

    fetchMock.mockImplementation(health({ ok: true, inkscape: { found: false, version: null, path: null, fix: "install Inkscape 1.x (inkscape.org) or set INKSCAPE_PATH" } }));
    await click("[data-testid=upload-eps-helper-check]");
    await waitFor(() => text("[data-testid=upload-eps-helper-state]").includes("not found"), "the second probe");
    expect(text("[data-testid=upload-eps-helper-state]")).toBe("the Inkscape helper is running but Inkscape was not found — install Inkscape 1.x (inkscape.org) or set INKSCAPE_PATH");
    expect(q("[data-testid=upload-eps-helper-state]")?.className).toContain("warn");
  });
});

describe("Expand strokes to fills", () => {
  it("is one checkbox, off by default, live in the defaults and on the row line", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    await mount();
    await click("[data-testid=upload-settings-open]");
    const box = q("[data-testid=upload-set-expand]") as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(text(`[data-testid=upload-settings-${FOG}]`)).not.toContain("strokes → fills");
    await act(async () => { box.click(); });
    await settle();
    expect(storedDefaults().expandStrokes).toBe(true);
    expect(text(`[data-testid=upload-settings-${FOG}]`)).toContain("strokes → fills");
  });
});

describe("the pre-batch probe (RULE 9: the other outputs never wait)", () => {
  it("with the Inkscape converter and no helper, the batch says so up front, every row still commits SVG + JPEG → Partial", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    stubCanvas();
    await mount();
    await click("[data-testid=upload-settings-open]");
    const eps = q("[data-testid=upload-set-eps]") as HTMLInputElement;
    await act(async () => { eps.click(); });
    await choose("[data-testid=upload-set-eps-converter]", "inkscape");
    await click("[data-testid=upload-set-close]");
    await click(`[data-testid=upload-export-${FOG}]`);
    await waitFor(() => text(`[data-testid=upload-status-${FOG}]`).includes("Partial"), "the run to end");
    const toast = text("[data-testid=upload-toast]");
    expect(toast).toContain("EPS: the Inkscape helper is not reachable at http://127.0.0.1:47391");
    expect(toast).toContain("1 row will be partial");
    expect(toast).toContain("run_inkscape_bridge.bat");
  });
});
