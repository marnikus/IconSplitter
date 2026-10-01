import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pairId } from "../src/lib/pairing";
import { saveDecisions } from "../src/selection/reviewstore";
import { HistoryProvider } from "../src/state/HistoryProvider";
import { resetAppStore } from "../src/state/appstore";
import { reloadSvgPreferences } from "../src/svg/prefsstore";
import GenerateSvgPanel from "../src/svg/ui/GenerateSvgPanel";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { dropDb } from "./helpers/idb";

vi.mock("../src/svg/keyvault", () => ({
  hasRequestyKey: async () => true,
  getRequestyKey: async () => "test-key-not-a-real-credential",
  saveRequestyKey: async () => undefined,
  clearRequestyKey: async () => undefined,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let ui: Root;

beforeEach(async () => {
  localStorage.clear();
  resetAppStore();
  reloadSvgPreferences();
  await dropDb();
});

afterEach(async () => {
  act(() => ui.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await dropDb();
});

describe("Generate SVG consent boundary", () => {
  it("keeps preflight local and calls Requesty only after Generate now", async () => {
    const root = await approvedRoot();
    (window as unknown as { showDirectoryPicker: () => Promise<FakeDir> }).showDirectoryPicker = async () => root;
    const fetcher = deferredFetcher();
    vi.stubGlobal("fetch", fetcher.fetch);
    stubContactSheetCanvas();
    mountPanel();

    await click(button("Choose folder"));
    await settle();
    const row = host.querySelector(`[data-testid='svg-row-${pairId("icons", "leaf", "")}']`);
    expect(row).not.toBeNull();
    expect(fetcher.fetch).not.toHaveBeenCalled();

    await click(button("Generate"));
    const dialog = await waitForDialog();
    expect(dialog, host.textContent).not.toBeNull();
    expect(dialog?.textContent ?? "").toContain("Nothing has been uploaded yet.");
    expect(dialog?.textContent ?? "").toContain("Exact prompt to be sent");
    expect(fetcher.fetch).not.toHaveBeenCalled();

    await act(async () => {
      button("Generate now").click();
      await fetcher.started;
    });
    expect(fetcher.fetch).toHaveBeenCalledTimes(1);
    expect(fetcher.fetch.mock.calls[0][0]).toBe("https://router.requesty.ai/v1/chat/completions");

    await act(async () => {
      fetcher.resolve(new Response("", { status: 401 }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();
  });
});

async function approvedRoot(): Promise<FakeDir> {
  const root = new FakeDir("local-library");
  const folder = new FakeDir("icons");
  folder.children.set("leaf.png", new FakeFile("leaf.png", 12, 1, "original"));
  folder.children.set("leaf_AI.png", new FakeFile("leaf_AI.png", 16, 2, "approved AI source"));
  root.children.set(folder.name, folder);
  await saveDecisions(root, [{ pair_id: pairId("icons", "leaf", ""), source: "icons/leaf.png",
    ai_result: "icons/leaf_AI.png", decision: "approved", reviewed_at: "2026-10-01T12:00:00.000Z" }]);
  return root;
}

function mountPanel(): void {
  host = document.createElement("div");
  document.body.appendChild(host);
  ui = createRoot(host);
  act(() => { ui.render(<HistoryProvider><GenerateSvgPanel /></HistoryProvider>); });
}

function button(label: string): HTMLButtonElement {
  const match = [...host.querySelectorAll("button")].find((item) => item.textContent?.trim() === label);
  if (!match) throw new Error(`Could not find button: ${label}`);
  return match as HTMLButtonElement;
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}

async function settle(): Promise<void> {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

async function waitForDialog(): Promise<HTMLElement | null> {
  for (let attempt = 0; attempt < 50; attempt++) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    const dialog = host.querySelector<HTMLElement>("[role='dialog']");
    if (dialog) return dialog;
  }
  return null;
}

function deferredFetcher() {
  let release!: (response: Response) => void;
  let announce!: () => void;
  const started = new Promise<void>((resolve) => { announce = resolve; });
  const fetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>((resolve) => {
    release = resolve;
    announce();
  }));
  return { fetch, started, resolve: (response: Response) => release(response) };
}

function stubContactSheetCanvas(): void {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(),
    fillStyle: "", font: "", textAlign: "", textBaseline: "",
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
    callback(new Blob(["contact-sheet"], { type: "image/png" }));
  });
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 80, height: 60, close: vi.fn() })));
  let sequence = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:consent-${++sequence}`);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
}
