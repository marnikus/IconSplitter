// upload_pinned_bulkbar.test.tsx — the "SVG to upload" bulk bar (selection,
// preview background, stroke, zoom, the bulk actions) pins to the top while the
// rows scroll (user request 2026-10-19, screenshot). It reuses the Generate SVG
// pin (svg_pinned_bulkbar.test.tsx): the same sticky `.svg-bulkbar-pin` rule,
// wrapped around the bar as a direct child of the full-height tab column.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializePairMeta } from "../src/lib/pairmeta";
import { pairId } from "../src/lib/pairing";
import { clearKnownRoots } from "../src/lib/knownroots";
import { resetAppStore } from "../src/state/appstore";
import { HistoryProvider } from "../src/state/HistoryProvider";
import UploadPanel from "../src/upload/UploadPanel";
import { BinDir, BinFile } from "./helpers/binfakefs";
import { pairFile } from "./helpers/pairfile";
import { settle, waitUntil } from "./helpers/quiet";
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
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>`;

let host: HTMLDivElement;
let ui: Root | null = null;
const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;

function makeRoot(): BinDir {
  const root = new BinDir("split_root");
  const dir = new BinDir(DIR);
  const meta = pairFile(DIR, "fog_AI.png", { id: FOG, versions: [svgVersion(`${DIR}/fog_AI.svg`, { version: 1, review: "approved" })] });
  dir.children.set("fog_AI.png", new BinFile("fog_AI.png", "ai", 3100));
  dir.children.set("fog_AI.svg", new BinFile("fog_AI.svg", SVG, 3400));
  dir.children.set("fog_AI.svg.json", new BinFile("fog_AI.svg.json", serializePairMeta(meta), 3300));
  root.children.set(DIR, dir);
  return root;
}

async function mount(): Promise<void> {
  stored.set("__upload__", { source: makeRoot() });
  await act(async () => {
    ui = createRoot(host);
    ui.render(<HistoryProvider><UploadPanel /></HistoryProvider>);
  });
  await waitUntil(() => q("[data-testid=upload-bulk]") !== null, "the bulk bar", 8000);
  await settle(0);
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
  const r = ui;
  ui = null;
  if (r !== null) await act(async () => r.unmount());
  host.remove();
});

describe("pinned Upload bulk bar", () => {
  it("the pin wraps the whole bar: selection, stroke and the bulk actions", async () => {
    await mount();
    const pin = q("[data-testid=upload-bulkbar-pin]");
    expect(pin).not.toBeNull();
    expect(pin!.classList.contains("svg-bulkbar-pin")).toBe(true); // the shared sticky rule
    expect(pin!.querySelector("[data-testid=upload-bulk]")).not.toBeNull();
    expect(pin!.querySelector("[data-testid=upload-stroke]")).not.toBeNull();
  });

  it("the pin is a direct child of the full-height tab column, above the rows", async () => {
    await mount();
    const pin = q("[data-testid=upload-bulkbar-pin]")!;
    expect(pin.parentElement).toBe(q("[data-testid=upload-panel]"));
    const list = q("[data-testid=upload-list]")!;
    expect(pin.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });
});
