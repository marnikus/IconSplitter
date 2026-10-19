// upload_live_preview.test.tsx — SVG to upload: "default" for every visual
// export setting, the live export preview and the ONE stroke (user request
// 2026-10-19; plan: docs/archive/2026-10-19-upload-default-settings). The bar's
// STROKE field IS the export strokePx (it replaced the preview-only override of
// archive/2026-10-19-upload-preview-stroke); every row previews the exact export
// text; the box fits the artboard's ratio inside the zoom square.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializePairMeta } from "../src/lib/pairmeta";
import { pairId } from "../src/lib/pairing";
import { clearKnownRoots } from "../src/lib/knownroots";
import { DEFAULT_UPLOAD_SETTINGS, type UploadSettings } from "../src/lib/upload/settings";
import { ZOOM_DEFAULT } from "../src/lib/zoom";
import { resetAppStore } from "../src/state/appstore";
import { HistoryProvider } from "../src/state/HistoryProvider";
import UploadPanel from "../src/upload/UploadPanel";
import { loadUploadSettings, saveUploadSettings } from "../src/upload/settingsstore";
import { BinDir, BinFile } from "./helpers/binfakefs";
import { pairFile } from "./helpers/pairfile";
import { settle as quietSettle, waitUntil } from "./helpers/quiet";
import { svgVersion } from "./helpers/svgpair";

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

const DIR = "architecture";
const FOG = pairId(DIR, "fog", "");
const SAVED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z" fill="none" stroke="#000" stroke-width="1"/></svg>`;
const AS_IS: Partial<UploadSettings> = { paddingPct: null, background: "default", strokePx: 0, strokeColor: "artwork", artboard: { mode: "source", size: 512, width: 512, height: 512 } };

let host: HTMLDivElement;
let ui: Root | null = null;
const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const settle = (ms = 0) => quietSettle(ms);
const preview = () => q(`[data-testid=upload-prev-${FOG}]`)!;
const art = () => preview().shadowRoot!.innerHTML;
const frame = () => q(`[data-testid=upload-prev-${FOG}-frame]`)!;

function makeRoot(): BinDir {
  const root = new BinDir("split_root");
  const dir = new BinDir(DIR);
  const meta = pairFile(DIR, "fog_AI.png", { id: FOG, versions: [svgVersion(`${DIR}/fog_AI.svg`, { version: 1, review: "approved" })] });
  dir.children.set("fog_AI.png", new BinFile("fog_AI.png", "ai", 3100));
  dir.children.set("fog_AI.svg", new BinFile("fog_AI.svg", SAVED_SVG, 3400));
  dir.children.set("fog_AI.svg.json", new BinFile("fog_AI.svg.json", serializePairMeta(meta), 3300));
  root.children.set(DIR, dir);
  return root;
}

async function mount(defaults: Partial<UploadSettings> = {}): Promise<void> {
  saveUploadSettings({ defaults: { ...DEFAULT_UPLOAD_SETTINGS, ...defaults }, overrides: {} });
  stored.set("__upload__", { source: makeRoot() });
  await act(async () => {
    ui = createRoot(host);
    ui.render(<HistoryProvider><UploadPanel /></HistoryProvider>);
  });
  await waitUntil(() => q(`[data-testid=upload-prev-${FOG}]`)?.shadowRoot != null, "the row preview", 8000);
  await settle(250); // past the preview debounce
}

async function unmount(): Promise<void> {
  const r = ui;
  ui = null;
  if (r !== null) await act(async () => r.unmount());
}

async function type(sel: string, value: string): Promise<void> {
  await act(async () => {
    const el = q(sel) as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle(250);
}

async function click(sel: string): Promise<void> {
  await act(async () => { q(sel)!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle(250);
}

beforeEach(() => {
  localStorage.clear();
  stored.clear();
  clearKnownRoots();
  resetAppStore();
  (window as unknown as { showDirectoryPicker?: () => Promise<unknown> }).showDirectoryPicker = () => Promise.reject(new Error("no picker"));
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(async () => {
  await unmount();
  host.remove();
});

describe("the bar's STROKE is the export stroke width", () => {
  it("typing a width writes the defaults' strokePx and the live preview shows it in the export", async () => {
    await mount();
    expect((q("[data-testid=upload-stroke]") as HTMLInputElement).value).toBe("");
    expect(art()).not.toContain('stroke-width="3"');
    await type("[data-testid=upload-stroke]", "3");
    expect(loadUploadSettings().defaults.strokePx).toBe(3);
    expect(art()).toContain('stroke-width="3"');
    await type("[data-testid=upload-stroke]", "45"); // the bar's 0–50 range is the export range
    expect(loadUploadSettings().defaults.strokePx).toBe(45);
    await click("[data-testid=upload-stroke-reset]");
    expect(loadUploadSettings().defaults.strokePx).toBe(0);
  });

  it("the settings dialog has no stroke-width row any more", async () => {
    await mount();
    await click("[data-testid=upload-settings-open]");
    expect(q("[data-testid=upload-dialog-backdrop]")).not.toBeNull();
    expect(q("[data-testid=upload-set-stroke]")).toBeNull();
  });
});

describe("default for every visual setting", () => {
  it("the dialog offers Default on padding, background, stroke colour and artboard", async () => {
    await mount();
    await click("[data-testid=upload-settings-open]");
    expect(q("[data-testid=upload-set-padding-default]")).not.toBeNull();
    expect(q("[data-testid=upload-set-bg-default]")).not.toBeNull();
    expect(q("[data-testid=upload-set-stroke-color-artwork]")?.textContent).toBe("Default");
    const options = [...(q("[data-testid=upload-set-artboard]") as HTMLSelectElement).options].map((o) => o.value);
    expect(options[0]).toBe("source");
  });

  it("All default: the row previews the approved SVG itself and says 'as is'", async () => {
    await mount();
    expect(art()).toContain("<rect"); // the factory defaults add the artboard object
    await click("[data-testid=upload-settings-open]");
    await click("[data-testid=upload-set-as-is]");
    expect(loadUploadSettings().defaults).toMatchObject(AS_IS);
    expect(art()).not.toContain("<rect");
    expect(q(`[data-testid=upload-settings-${FOG}]`)?.textContent).toContain("as is");
  });

  it("padding Default toggles null and back to a number", async () => {
    await mount();
    await click("[data-testid=upload-settings-open]");
    await click("[data-testid=upload-set-padding-default]");
    expect(loadUploadSettings().defaults.paddingPct).toBeNull();
    expect((q("[data-testid=upload-set-padding]") as HTMLInputElement).value).toBe("");
    await click("[data-testid=upload-set-padding-default]");
    expect(loadUploadSettings().defaults.paddingPct).toBe(8);
  });
});

describe("the preview box: the artboard's ratio inside the zoom square", () => {
  it("a 2:1 artboard draws full zoom width and half height", async () => {
    await mount({ artboard: { mode: "custom", size: 512, width: 200, height: 100 } });
    expect([frame().style.width, frame().style.height]).toEqual([`${ZOOM_DEFAULT}px`, `${ZOOM_DEFAULT / 2}px`]);
  });

  it("16 px and 2048 px artboards draw the same box — no tiny or giant thumbnails", async () => {
    await mount({ artboard: { mode: "custom", size: 512, width: 16, height: 16 } });
    const small = [frame().style.width, frame().style.height];
    await unmount();
    await mount({ artboard: { mode: "preset", size: 2048, width: 512, height: 512 } });
    expect([frame().style.width, frame().style.height]).toEqual(small);
    expect(small).toEqual([`${ZOOM_DEFAULT}px`, `${ZOOM_DEFAULT}px`]);
  });
});
