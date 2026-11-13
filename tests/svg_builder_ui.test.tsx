// @vitest-environment happy-dom
// svg_builder_ui.test.tsx — TDD for the seventh Workbench tab and its dark shell.
// Only the browser APIs a DOM cannot provide are stubbed; the panel, folder
// widget, prompt window and provider card are the real components.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Workbench from "../src/ui/Workbench";
import { getAppState, resetAppStore } from "../src/state/appstore";
import { settle } from "./helpers/quiet";

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
let ui: Root;
const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const click = async (sel: string) => {
  await act(async () => { q(sel)!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle(0);
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })));
  localStorage.clear();
  stored.clear();
  resetAppStore();
  host = document.createElement("div");
  document.body.appendChild(host);
  ui = createRoot(host);
  act(() => { ui.render(<Workbench />); });
});

afterEach(() => {
  act(() => ui.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("SVG builder tab", () => {
  it("appears in the global top menu exactly as SVG builder", () => {
    const tab = q('[data-testid="tab-svg-builder"]');
    expect(tab).not.toBeNull();
    expect(tab!.textContent).toBe("SVG builder");
  });

  it("opens its own workspace through the one app store tab", async () => {
    await click('[data-testid="tab-svg-builder"]');
    expect(getAppState().tab).toBe("svgBuilder");
    expect(q('[data-testid="builder-shell"]')).not.toBeNull();
    expect(q('[data-testid="builder-panel"]')).not.toBeNull();
    expect(q('[data-testid="builder-open-folder"]')).not.toBeNull();
    expect(q('[data-testid="builder-folder-path"]')).toBeNull();
  });

  it("keeps the global undo bar and shows an honest unsupported-browser note", async () => {
    await click('[data-testid="tab-svg-builder"]');
    expect(q('[data-testid="history-bar"]')).not.toBeNull();
    expect(q('[data-testid="builder-unsupported"]')).not.toBeNull();
  });

  it("renders the metadata prompt + Gemini widget right after the folder widget, on the shared config", async () => {
    await click('[data-testid="tab-svg-builder"]');
    expect(q('[data-testid="builder-folder-widget"]')!.nextElementSibling).toBe(q('[data-testid="builder-meta-widget"]'));
    expect((q('[data-testid="builder-model"]') as HTMLInputElement).value).toBe("gemini-3.1-flash-lite");
    expect(q('[data-testid="builder-prompt-panel"]')).not.toBeNull();
    expect(q('[data-testid="builder-prompt"]')).not.toBeNull();
    expect(q('[data-testid="builder-provider-card"]')).not.toBeNull();
    expect(q('[data-testid="builder-key-state"]')).not.toBeNull();
    expect(q('[data-testid="builder-model"]')).not.toBeNull();
    expect(q('[data-testid="builder-endpoint"]')).not.toBeNull();
  });

  it("the metadata widget folds and restores, and Restore height drops a dragged height", async () => {
    await click('[data-testid="tab-svg-builder"]');
    await click('[data-testid="builder-meta-toggle"]');
    expect(q('[data-testid="builder-prompt-panel"]')).toBeNull();
    expect(q('[data-testid="builder-meta-toggle"]')!.textContent).toBe("Restore");
    await click('[data-testid="builder-meta-toggle"]');
    expect(q('[data-testid="builder-prompt-panel"]')).not.toBeNull();
    const body = q('[data-testid="builder-meta-body"]')!;
    body.style.height = "420px"; // what the native resize grip writes
    await act(async () => { body.dispatchEvent(new Event("pointerup", { bubbles: true })); });
    expect(q('[data-testid="builder-meta-body"]')!.style.height).toBe("420px");
    expect(JSON.parse(localStorage.getItem("iconSplitter.svgBuilder.prefs.v1")!).metaHeight).toBe(420);
    await click('[data-testid="builder-meta-restore-height"]');
    expect(q('[data-testid="builder-meta-body"]')!.style.height).toBe("");
    expect(q('[data-testid="builder-meta-restore-height"]')).toBeNull();
  });
});
