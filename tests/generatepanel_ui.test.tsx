// generatepanel_ui.test.tsx — the Generate SVG tab against the real panel and
// an in-memory folder: only approved AI sources are listed, sidecar state is
// shown, selection gates the bulk buttons, and generation refuses to run
// without a locally stored key (never hardcoded).
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pairId } from "../src/lib/pairing";
import { HistoryProvider } from "../src/state/HistoryProvider";
import GeneratePanel from "../src/svggen/GeneratePanel";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { dropDb } from "./helpers/idb";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let ui: Root | null = null;
let el: HTMLElement | null = null;

type PickerWindow = { showDirectoryPicker?: () => Promise<unknown> };

const FOG = pairId("architecture", "fog", "");
const HARBOR = pairId("coastal", "harbor", "");

function makeRoot(): FakeDir {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  arch.children.set("fog.png", new FakeFile("fog.png", 12, 3000, "a"));
  arch.children.set("fog_AI.png", new FakeFile("fog_AI.png", 20, 3100, "b"));
  arch.children.set("court.png", new FakeFile("court.png", 12, 2000, "c"));
  arch.children.set("court_AI.png", new FakeFile("court_AI.png", 20, 2100, "d"));
  root.children.set("architecture", arch);
  const coast = new FakeDir("coastal");
  coast.children.set("harbor.png", new FakeFile("harbor.png", 12, 1000, "e"));
  coast.children.set("harbor_AI.png", new FakeFile("harbor_AI.png", 20, 1100, "f"));
  coast.children.set("dunes.png", new FakeFile("dunes.png", 12, 500, "g")); // no AI side
  root.children.set("coastal", coast);
  const decisions = {
    records: [
      { pair_id: FOG, source: "architecture/fog.png", ai_result: "architecture/fog_AI.png", decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z" },
      { pair_id: HARBOR, source: "coastal/harbor.png", ai_result: "coastal/harbor_AI.png", decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z" },
      { pair_id: pairId("architecture", "court", ""), source: "architecture/court.png", ai_result: "architecture/court_AI.png", decision: "pending", reviewed_at: "2026-10-01T09:00:00.000Z" },
    ],
  };
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 1, JSON.stringify(decisions)));
  return root;
}

describe("Generate SVG panel", () => {
  beforeEach(async () => {
    localStorage.clear();
    await dropDb();
  });

  afterEach(() => {
    const u = ui;
    if (u) act(() => u.unmount());
    el?.remove();
    ui = null;
    el = null;
  });

  it("lists only approved sources that have an AI image", async () => {
    const { el } = await mount(makeRoot());
    expect(q(el, `[data-testid='sg-row-${FOG}']`)).not.toBeNull();
    expect(q(el, `[data-testid='sg-row-${HARBOR}']`)).not.toBeNull();
    expect(q(el, `[data-testid='sg-row-${pairId("architecture", "court", "")}']`)).toBeNull(); // pending
    expect(q(el, `[data-testid='sg-row-${pairId("coastal", "dunes", "")}']`)).toBeNull(); // no AI side
    expect(text(el, `[data-testid='sg-gen-${FOG}']`)).toContain("not-generated");
    expect(text(el, `[data-testid='sg-row-${FOG}']`)).toContain("Missing sidecar");
  });

  it("selection gates the bulk buttons and the confirm dialog precedes any send", async () => {
    const { el } = await mount(makeRoot());
    const gen = q(el, "[data-testid='sg-generate-selected']") as HTMLButtonElement;
    expect(gen.disabled).toBe(true);
    await click(q(el, `[data-testid='sg-check-${FOG}']`)!);
    expect(text(el, "[data-testid='sg-selected-count']")).toContain("1 selected");
    expect(gen.disabled).toBe(false);
    await click(gen);
    expect(q(el, "[data-testid='sg-confirm-modal']")).not.toBeNull();
    expect(text(el, "[data-testid='sg-confirm-count']")).toBe("1");
  });

  it("without a stored key, confirming generation asks for one instead of sending", async () => {
    const { el } = await mount(makeRoot());
    await click(q(el, `[data-testid='sg-check-${FOG}']`)!);
    await click(q(el, "[data-testid='sg-generate-selected']")!);
    await click(q(el, "[data-testid='sg-confirm-go']")!);
    expect(text(el, "[data-testid='sg-toast']")).toContain("API key");
  });

  it("the prompt is editable, saved locally and resettable", async () => {
    const { el } = await mount(makeRoot());
    const ta = q(el, "[data-testid='sg-prompt']") as HTMLTextAreaElement;
    expect(ta.value).toContain("split SVG icons");
    await act(async () => { setValue(ta, "custom rules"); });
    expect(localStorage.getItem("iconSplitter.svggen.prompt.v1")).toBe("custom rules");
    await click(q(el, "[data-testid='sg-reset-prompt']")!);
    expect((q(el, "[data-testid='sg-prompt']") as HTMLTextAreaElement).value).toContain("split SVG icons");
  });

  it("the key is stored locally and displayed masked only", async () => {
    const { el } = await mount(makeRoot());
    const input = q(el, "[data-testid='sg-key-input']") as HTMLInputElement;
    await act(async () => { setValue(input, "rq_live_abcdef1234A2F"); });
    await click(q(el, "[data-testid='sg-key-save']")!);
    const masked = text(el, "[data-testid='sg-key']");
    expect(masked).toContain("••••");
    expect(masked).not.toContain("abcdef1234");
    expect(el.innerHTML).not.toContain("abcdef1234A2F");
  });
});

function PrefsHost({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

async function mount(root: FakeDir): Promise<{ el: HTMLElement; ui: Root }> {
  (window as unknown as PickerWindow).showDirectoryPicker = () => Promise.resolve(root);
  el = document.createElement("div");
  document.body.appendChild(el);
  const rt = createRoot(el);
  ui = rt;
  await act(async () => { rt.render(<HistoryProvider><PrefsHost><GeneratePanel /></PrefsHost></HistoryProvider>); });
  await settle();
  await click(q(el, "[data-testid='sg-pick-root']")!);
  return { el, ui };
}

function q(el: HTMLElement, sel: string): HTMLElement | null {
  return el.querySelector(sel);
}

function text(el: HTMLElement, sel: string): string {
  return q(el, sel)?.textContent ?? "";
}

async function click(node: HTMLElement): Promise<void> {
  await act(async () => { node.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle();
}

function setValue(node: HTMLTextAreaElement | HTMLInputElement, value: string): void {
  const proto = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (!setter) throw new Error("no value setter");
  setter.call(node, value);
  node.dispatchEvent(new Event("input", { bubbles: true }));
}

async function settle(): Promise<void> {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
