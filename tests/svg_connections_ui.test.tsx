// svg_connections_ui.test.tsx — the connection dropdown of the Generate SVG
// provider card: quick-switch between saved setups, the shipped Sunburst image
// connection, every image parameter control, and persistence (user request
// 2026-10-16, archive/2026-10-16-connections).
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fakeIndexedDb from "fake-indexeddb";
import SvgPanel from "../src/svg/SvgPanel";
import { resetAppStore } from "../src/state/appstore";
import { HistoryProvider } from "../src/state/HistoryProvider";
import { dropDb } from "./helpers/idb";
import { clearApiKey } from "../src/svg/keystore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.stubGlobal("indexedDB", fakeIndexedDb.indexedDB);
vi.stubGlobal("IDBKeyRange", fakeIndexedDb.IDBKeyRange);

const stored = new Map<string, unknown>();
vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return {
    ...actual,
    saveHandles: vi.fn(async (name: string, handles: unknown) => { stored.set(name, handles); }),
    loadHandles: vi.fn(async (name: string) => stored.get(name) ?? null),
  };
});
const w = window as unknown as { showDirectoryPicker?: unknown };
w.showDirectoryPicker = () => Promise.reject(new Error("no picker"));

let host: HTMLDivElement;
let ui: Root;
const q = (sel: string) => host.querySelector(sel) as HTMLSelectElement | HTMLInputElement | HTMLButtonElement | null;
const optionsOf = (sel: string): string[] => Array.from((q(sel) as HTMLSelectElement | null)?.options ?? []).map((o) => o.text);
const choose = async (sel: string, value: string) => {
  const el = q(sel) as HTMLSelectElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
};
const type = async (sel: string, value: string) => {
  const el = q(sel) as HTMLInputElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const click = async (el: HTMLElement) => { await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); };

async function mount(): Promise<void> {
  host = document.createElement("div");
  document.body.appendChild(host);
  ui = createRoot(host);
  await act(async () => { ui.render(<HistoryProvider><SvgPanel /></HistoryProvider>); });
  await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
}

beforeEach(async () => {
  localStorage.clear();
  await dropDb();
  clearApiKey();
  resetAppStore();
  stored.clear();
});

afterEach(async () => {
  await act(async () => ui.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("the connection dropdown", () => {
  it("lists both shipped setups; the text connection is active first", async () => {
    await mount();
    const names = optionsOf("[data-testid=svg-connection-select]");
    expect(names.some((t) => t.includes("GPT 6.1 Sol"))).toBe(true);
    expect(names.some((t) => t.includes("Sunburst"))).toBe(true);
    expect((q("[data-testid=svg-model]") as HTMLInputElement).value).toBe("openai/gpt-6.1-sol");
  });

  it("switching to Sunburst swaps the model, shows the image grid, hides the text rows", async () => {
    await mount();
    const active = (q("[data-testid=svg-connection-select]") as HTMLSelectElement).value;
    const sunburstOption = Array.from((q("[data-testid=svg-connection-select]") as HTMLSelectElement).options).find((o) => o.text.includes("Sunburst"))!;
    await choose("[data-testid=svg-connection-select]", sunburstOption.value);
    expect((q("[data-testid=svg-model]") as HTMLInputElement).value).toBe("openai/gpt-image-2.5-sunburst");
    expect(q("[data-testid=svg-img-quality]")).not.toBeNull();
    expect(q("[data-testid=svg-img-size]")).not.toBeNull();
    expect(q("[data-testid=svg-img-n]")).not.toBeNull();
    expect(q("[data-testid=svg-img-background]")).not.toBeNull();
    expect(q("[data-testid=svg-img-format]")).not.toBeNull();
    expect(q("[data-testid=svg-img-response]")).not.toBeNull();
    expect(q("[data-testid=svg-temperature]")).toBeNull();
    expect(q("[data-testid=svg-temperature-off]")).toBeNull();
    expect(q("[data-testid=svg-max-tokens]")).toBeNull();
    void active;
  });

  it("every image control takes a value; custom size reveals the WxH inputs", async () => {
    await mount();
    const sel = q("[data-testid=svg-connection-select]") as HTMLSelectElement;
    await choose("[data-testid=svg-connection-select]", Array.from(sel.options).find((o) => o.text.includes("Sunburst"))!.value);
    await choose("[data-testid=svg-img-quality]", "xhigh");
    await choose("[data-testid=svg-img-size]", "custom");
    expect(q("[data-testid=svg-img-w]")).not.toBeNull();
    await type("[data-testid=svg-img-w]", "1536");
    await type("[data-testid=svg-img-h]", "640");
    await choose("[data-testid=svg-img-n]", "3");
    await choose("[data-testid=svg-img-background]", "transparent");
    await choose("[data-testid=svg-img-format]", "webp");
    await choose("[data-testid=svg-img-response]", "url");
    expect((q("[data-testid=svg-img-quality]") as HTMLSelectElement).value).toBe("xhigh");
    expect((q("[data-testid=svg-img-w]") as HTMLInputElement).value).toBe("1536");
    expect((q("[data-testid=svg-img-n]") as HTMLSelectElement).value).toBe("3");
    expect((q("[data-testid=svg-img-background]") as HTMLSelectElement).value).toBe("transparent");
    expect((q("[data-testid=svg-img-format]") as HTMLSelectElement).value).toBe("webp");
    expect((q("[data-testid=svg-img-response]") as HTMLSelectElement).value).toBe("url");
  });

  it("the setup survives a remount (localStorage, RULE 6)", async () => {
    await mount();
    const sel = q("[data-testid=svg-connection-select]") as HTMLSelectElement;
    await choose("[data-testid=svg-connection-select]", Array.from(sel.options).find((o) => o.text.includes("Sunburst"))!.value);
    await choose("[data-testid=svg-img-quality]", "high");
    await act(async () => ui.unmount());
    host.remove();
    await mount();
    expect((q("[data-testid=svg-model]") as HTMLInputElement).value).toBe("openai/gpt-image-2.5-sunburst");
    expect((q("[data-testid=svg-img-quality]") as HTMLSelectElement).value).toBe("high");
  });

  it("a new connection is added and becomes active; removal keeps at least one", async () => {
    await mount();
    await click(q("[data-testid=svg-connection-add]")!);
    expect(optionsOf("[data-testid=svg-connection-select]").length).toBe(3);
    expect((q("[data-testid=svg-model]") as HTMLInputElement).value).toBe("openai/gpt-image-2.5-sunburst");
    await click(q("[data-testid=svg-connection-remove]")!);
    expect(optionsOf("[data-testid=svg-connection-select]").length).toBe(2);
    await click(q("[data-testid=svg-connection-remove]")!);
    await click(q("[data-testid=svg-connection-remove]")!);
    expect(optionsOf("[data-testid=svg-connection-select]").length).toBe(1);
    expect(q("[data-testid=svg-connection-remove]")!.hasAttribute("disabled")).toBe(true);
  });
});
