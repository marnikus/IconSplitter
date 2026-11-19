// @vitest-environment happy-dom
// builder_export_dialog.test.tsx — the reported defect (2026-11-19): pressing
// "Export settings…" in the builder's Export ▾ menu showed nothing, because the
// dialog was a `position: static` section appended at the bottom of the
// builder's own grid. This mounts the REAL panel over a real scanned library and
// asserts the popup lives inside `.bld-backdrop`, carries `aria-modal`, closes on
// Escape, and that one gesture lands in the builder's own store.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Workbench from "../src/ui/Workbench";
import { resetAppStore } from "../src/state/appstore";
import { serializePairMeta } from "../src/lib/pairmeta";
import { BUILDER_FORMATS_KEY, loadBuilderFormats } from "../src/svgBuilder/formatstore";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";
import { settle, waitUntil } from "./helpers/quiet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const stored = new Map<string, unknown>();
vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return { ...actual,
    saveHandles: vi.fn(async (name: string, handles: unknown) => { stored.set(name, handles); }),
    loadHandles: vi.fn(async () => null) };
});

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18v18H3z"/></svg>';

function library(): FakeDir {
  const root = new FakeDir("icons");
  const dir = new FakeDir("interface");
  for (const stem of ["home", "gear", "bell"]) {
    const meta = serializePairMeta(pairFile("interface", `${stem}_AI.png`, {
      versions: [svgVersion(`interface/${stem}_AI.svg`, { version: 1, review: "approved" })],
    }));
    dir.children.set(`${stem}_AI.png`, new FakeFile(`${stem}_AI.png`, 20, 3100, "ai"));
    dir.children.set(`${stem}_AI.svg`, new FakeFile(`${stem}_AI.svg`, SVG.length, 3400, SVG));
    dir.children.set(`${stem}_AI.svg.json`, new FakeFile(`${stem}_AI.svg.json`, meta.length, 3500, meta));
  }
  root.children.set("interface", dir);
  return root;
}

let host: HTMLDivElement;
let ui: Root;
const q = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const click = async (id: string) => {
  const el = q(id);
  if (el === null) throw new Error(`missing ${id}`);
  await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle(0);
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })));
  localStorage.clear();
  stored.clear();
  resetAppStore();
  (window as unknown as { showDirectoryPicker: () => Promise<FakeDir> }).showDirectoryPicker = async () => library();
  host = document.createElement("div");
  document.body.appendChild(host);
  ui = createRoot(host);
  act(() => { ui.render(<Workbench />); });
});

afterEach(() => {
  act(() => ui.unmount());
  host.remove();
  delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
});

async function openPopup(): Promise<void> {
  await click("tab-svg-builder");
  await click("builder-open-folder");
  await waitUntil(() => q("builder-artboard") !== null, "sheet composed");
  await click("builder-export-toggle");
  await click("builder-export-formats");
}

describe("the builder's Export settings popup", () => {
  it("opens INSIDE the builder's modal backdrop, not in the page flow", async () => {
    await openPopup();
    const dialog = q("builder-format-dialog");
    expect(dialog).not.toBeNull();
    expect(dialog!.getAttribute("role")).toBe("dialog");
    expect(dialog!.getAttribute("aria-modal")).toBe("true");
    // the reported defect: a static section appended to the panel's grid
    expect(dialog!.closest(".bld-backdrop")).not.toBeNull();
    expect(q("builder-format-backdrop")).not.toBeNull();
  });

  it("closes on Escape and on the Close button", async () => {
    await openPopup();
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    await settle(0);
    expect(q("builder-format-dialog")).toBeNull();
    await click("builder-export-toggle");
    await click("builder-export-formats");
    await click("builder-format-close");
    expect(q("builder-format-dialog")).toBeNull();
  });

  it("persists one gesture into the builder's own store, and the JPEG hint follows it", async () => {
    await openPopup();
    expect(loadBuilderFormats().jpegQuality).toBe(0.92);
    await click("bld-set-eps");
    expect(loadBuilderFormats().includeEps).toBe(true);
    expect(JSON.parse(localStorage.getItem(BUILDER_FORMATS_KEY) ?? "{}")).toMatchObject({ includeEps: true });
    await click("bld-set-rescale");
    const hint = q("bld-set-mp-match")!.closest("label")!.querySelector("small")!.textContent ?? "";
    expect(hint).toMatch(/\d+×\d+ px/);
  });
});
