// svg_confirm_web.test.tsx — the LIVE WEB confirmation (2026-11-03): the
// "Generate with web page" checkbox decides which popup opens; the web popup
// reuses the API popup's prompt picker, sheet pager and full-prompt preview,
// plans ONE icon per request, edits the chat URL and the waits (stored), and
// confirms only with a valid https://chatgpt.com URL — handing the queue that
// target. Nothing is sent by opening it.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compositeLayout } from "../src/lib/svgcomposite";
import { toRow } from "../src/svg/rowmodel";
import SvgConfirm from "../src/svg/SvgConfirm";
import WebModeToggle from "../src/svg/WebModeToggle";
import { loadWebChat, saveWebChat, WEBCHAT_KEY } from "../src/svg/webchatstore";
import { DEFAULT_WEBCHAT_PREFS } from "../src/lib/webchatprefs";
import { confirmProps } from "./helpers/svgconfirm";
import type { ConfirmedBatch, SvgRow } from "../src/svg/types";
import type { SvgSource } from "../src/svg/sources";
import { svgSource } from "./helpers/svgpair";
import { settle as quietSettle } from "./helpers/quiet";

vi.mock("../src/svg/composite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/svg/composite")>();
  return {
    ...actual,
    buildComposite: vi.fn(async (_root: unknown, sources: readonly SvgSource[]) => ({
      dataUrl: `data:image/png;base64,${sources.map((s) => s.relPath).join("|")}`, hash: "h", layout: compositeLayout(sources.length), bytes: 10,
    })),
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let ui: Root;
const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const settle = () => quietSettle(0);

function rows(n: number): SvgRow[] {
  return Array.from({ length: n }, (_, i) => toRow(svgSource(`pair_${i + 1}`, { name: `icon-${i + 1}_AI.png`, fingerprint: `${i + 1}:100` }), null, false));
}

async function mountWeb(count: number, onConfirm = vi.fn()): Promise<typeof onConfirm> {
  const all = rows(count);
  await act(async () => {
    ui = createRoot(host);
    ui.render(<SvgConfirm {...confirmProps({ ids: all.map((r) => r.source.id), rows: all, config: { imagesPerRequest: 4 } })} web onConfirm={onConfirm} />);
  });
  await settle();
  return onConfirm;
}

async function type(sel: string, value: string): Promise<void> {
  const input = q(sel) as HTMLInputElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

beforeEach(() => {
  localStorage.removeItem(WEBCHAT_KEY);
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  ui?.unmount();
  host.remove();
  localStorage.removeItem(WEBCHAT_KEY);
});

describe("SvgConfirm — LIVE WEB variant", () => {
  it("is marked LIVE WEB, plans one icon per request and keeps the shared parts", async () => {
    await mountWeb(3);
    expect(q("[data-testid=svg-confirm-live-web]")?.textContent).toContain("LIVE WEB");
    expect(q("[data-testid=svg-confirm-requests]")?.textContent).toBe("3 × 1 max");
    expect(q("[data-testid=svg-confirm-prompt-select]")).not.toBeNull();
    expect(q("[data-testid=svg-batch-page]")?.textContent).toContain("Request 1 of 3");
    expect(q("[data-testid=svg-confirm-streaming]")).toBeNull();
    expect(q("[data-testid=svg-confirm-generate]")?.textContent).toContain("web");
  });

  it("refuses to confirm until the chat URL is a ChatGPT page, and stores what is typed", async () => {
    const onConfirm = await mountWeb(1);
    const go = q("[data-testid=svg-confirm-generate]") as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    expect(q("[data-testid=svg-web-url-problem]")).not.toBeNull();
    await type("[data-testid=svg-web-url]", "https://chatgpt.com/c/6ae94331-8210");
    await type("[data-testid=svg-web-maxwait]", "15");
    await type("[data-testid=svg-web-step]", "2.5");
    expect(loadWebChat()).toMatchObject({ url: "https://chatgpt.com/c/6ae94331-8210", maxWaitMin: 15, stepDelaySec: 2.5 });
    expect(go.disabled).toBe(false);
    await act(async () => { go.click(); });
    const batch = onConfirm.mock.calls[0][0] as ConfirmedBatch;
    expect(batch.size).toBe(1);
    expect(batch.web).toEqual({ url: "https://chatgpt.com/c/6ae94331-8210", maxWaitMs: 900_000, readyTimeoutMs: 180_000, stepDelayMs: 2500 });
  });

  it("the API popup carries no web target", async () => {
    const all = rows(1);
    const onConfirm = vi.fn();
    saveWebChat({ ...DEFAULT_WEBCHAT_PREFS, url: "https://chatgpt.com/c/x" });
    await act(async () => {
      ui = createRoot(host);
      ui.render(<SvgConfirm {...confirmProps({ ids: all.map((r) => r.source.id), rows: all })} onConfirm={onConfirm} />);
    });
    await settle();
    expect(q("[data-testid=svg-confirm-live-web]")).toBeNull();
    await act(async () => { (q("[data-testid=svg-confirm-generate]") as HTMLButtonElement).click(); });
    expect((onConfirm.mock.calls[0][0] as ConfirmedBatch).web).toBeUndefined();
  });
});

describe("WebModeToggle", () => {
  it("switches the stored mode", async () => {
    await act(async () => { ui = createRoot(host); ui.render(<WebModeToggle />); });
    const box = q("[data-testid=svg-web-mode]") as HTMLInputElement;
    expect(box.checked).toBe(false);
    await act(async () => { box.click(); });
    expect(loadWebChat().enabled).toBe(true);
    expect((q("[data-testid=svg-web-mode]") as HTMLInputElement).checked).toBe(true);
  });
});
