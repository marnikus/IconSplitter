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

  it("renders the full metadata/Gemini controls without a second key store", async () => {
    await click('[data-testid="tab-svg-builder"]');
    expect(q('[data-testid="builder-prompt-panel"]')).not.toBeNull();
    expect(q('[data-testid="builder-prompt"]')).not.toBeNull();
    expect(q('[data-testid="builder-provider-card"]')).not.toBeNull();
    expect(q('[data-testid="builder-key-state"]')).not.toBeNull();
    expect(q('[data-testid="builder-model"]')).not.toBeNull();
    expect(q('[data-testid="builder-endpoint"]')).not.toBeNull();
  });
});
