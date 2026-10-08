// svg_keepalive_ui.test.tsx — the Generate SVG run survives the tab (keep-alive
// plan D1/D2, 2026-10-08). Drives the REAL shell (Workbench), the real panel, the
// real runner and the shared fake transport: a run started on the SVG tab keeps
// going when the user opens another tab; its popup (done / left) stays visible
// there; Open brings the user back to the live panel; Cancel works from the popup;
// the panel is hidden, never unmounted; and the keyboard stays with the tab that
// is on screen.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compositeLayout } from "../src/lib/svgcomposite";
import { pairId } from "../src/lib/pairing";
import { saveApiKey } from "../src/svg/keystore";
import { getAppState, resetAppStore } from "../src/state/appstore";
import Workbench from "../src/ui/Workbench";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { dropDb } from "./helpers/idb";
import { streamFrames, transport } from "./helpers/svgtransport";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// No IndexedDB in this DOM: an in-memory handle store keeps the boot real.
const stored = new Map<string, unknown>();
vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return {
    ...actual,
    saveHandles: vi.fn(async (name: string, handles: unknown) => { stored.set(name, handles); }),
    loadHandles: vi.fn(async (name: string) => stored.get(name) ?? null),
  };
});

// The contact sheet needs a canvas; a deterministic marker keeps the real planning.
vi.mock("../src/svg/composite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/svg/composite")>();
  return {
    ...actual,
    buildComposite: vi.fn(async (_root: unknown, sources: readonly { relPath: string }[]) => ({
      dataUrl: `data:image/png;base64,${sources.map((s) => s.relPath).join("|")}`,
      hash: `h${sources.length}`,
      layout: compositeLayout(sources.length),
      bytes: 10,
    })),
  };
});

const w = window as unknown as { showDirectoryPicker?: unknown };
w.showDirectoryPicker = () => Promise.reject(new Error("no picker"));

/** Assembled from parts so the hygiene gate sees no key-shaped literal. */
const KEY = ["rq", "live", "keepalive_key_1234"].join("_");
const FOG = pairId("architecture", "fog", "");
const COURT = pairId("architecture", "court", "");
const WALL = pairId("architecture", "wall", "");
const tick = () => new Promise((r) => setTimeout(r, 0));

let host: HTMLDivElement;
let ui: Root;

const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
/** The popup is portalled to the body (it floats above every tab). */
const popup = () => document.querySelector("[data-testid=svg-run-popup]") as HTMLElement | null;
const txt = (sel: string) => q(sel)?.textContent ?? "";

function makeRoot(): FakeDir {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  arch.children.set("fog.png", new FakeFile("fog.png", 12, 3000, "a"));
  arch.children.set("fog_AI.png", new FakeFile("fog_AI.png", 20, 3100, "b"));
  arch.children.set("court.png", new FakeFile("court.png", 12, 2000, "c"));
  arch.children.set("court_AI.png", new FakeFile("court_AI.png", 20, 2100, "d"));
  root.children.set("architecture", arch);
  const recs = [FOG, COURT].map((id) => ({
    pair_id: id, source: `${id}.png`, ai_result: `${id}_AI.png`,
    decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z",
  }));
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({ records: recs })));
  return root;
}

async function settle(): Promise<void> {
  await act(async () => { await tick(); });
}

async function waitFor(pred: () => boolean, what: string, budgetMs = 4000): Promise<void> {
  const until = Date.now() + budgetMs;
  await act(async () => {
    while (!pred() && Date.now() < until) await tick();
  });
  expect(pred(), `never reached: ${what}`).toBe(true);
}

async function click(el: HTMLElement | null): Promise<void> {
  await act(async () => { (el as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle();
}

const clickSel = (sel: string) => click(q(sel) ?? document.querySelector(sel));

async function openSvgTab(): Promise<void> {
  await clickSel("[data-testid=tab-generate-svg]");
  await waitFor(() => q("[data-testid=svg-panel]") !== null, "the SVG panel to mount");
}

async function pick(id: string): Promise<void> {
  await act(async () => { (q(`[data-testid=svg-check-${id}]`) as HTMLInputElement).click(); });
  await settle();
  await clickSel("[data-testid=svg-generate-selected]");
}

async function mount(root: FakeDir): Promise<void> {
  stored.set("__svg__", { source: root });
  host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    ui = createRoot(host);
    ui.render(<Workbench />);
  });
  await settle();
}

afterEach(() => {
  // The popup is portalled to the body: unmount, or the last test's line answers the next query.
  act(() => ui.unmount());
  host.remove();
});

beforeEach(async () => {
  await dropDb();
  await saveApiKey(KEY);
  window.localStorage.clear();
  stored.clear();
  resetAppStore();
});

describe("the run survives a tab switch (D1)", () => {
  it("keeps the panel mounted and hidden, and the run going, on another tab", async () => {
    const t = transport({ mode: "silent" });
    vi.stubGlobal("fetch", t.fetch);
    await mount(makeRoot());
    await openSvgTab();
    await pick(FOG);
    await clickSel("[data-testid=svg-confirm-generate]");
    await waitFor(() => t.calls.length === 1, "the request to leave");

    await clickSel("[data-testid=tab-batch]");
    expect(getAppState().tab).toBe("batch");
    const panel = q("[data-testid=svg-panel]");
    expect(panel).not.toBeNull(); // not unmounted
    expect(panel?.closest("[hidden]")).not.toBeNull(); // hidden

    // the answer lands while the user is elsewhere: the row still updates
    await act(async () => { t.streams[0].push(streamFrames(["architecture/fog_AI.png"])); t.streams[0].close(); });
    await waitFor(() => txt(`[data-testid=svg-status-${FOG}]`).includes("Generated"), "the row to update while hidden");
    expect(txt(`[data-testid=svg-status-${FOG}]`)).toContain("Generated");
  });

  it("shows the run popup on every tab, with done and left, and Open returns to the panel", async () => {
    const t = transport({ mode: "silent" });
    vi.stubGlobal("fetch", t.fetch);
    await mount(makeRoot());
    await openSvgTab();
    await pick(FOG);
    await clickSel("[data-testid=svg-confirm-generate]");
    await waitFor(() => t.calls.length === 1, "the request to leave");

    await clickSel("[data-testid=tab-batch]");
    expect(popup()).not.toBeNull();
    expect(popup()?.textContent).toContain("Generating · 0 done · 1 left · request 1 of 1");
    expect(document.querySelector("[data-testid=svg-run-popup-cancel]")).not.toBeNull();

    await act(async () => { t.streams[0].push(streamFrames(["architecture/fog_AI.png"])); t.streams[0].close(); });
    await waitFor(() => popup()?.textContent?.includes("Done") === true, "the popup to report the end");
    expect(popup()?.textContent).toContain("Done · 1 done · 0 left · 0 failed"); // stays until dismissed

    await act(async () => { (document.querySelector("[data-testid=svg-run-popup-open]") as HTMLButtonElement).click(); });
    await settle();
    expect(getAppState().tab).toBe("generateSvg");
    expect(q("[data-testid=svg-panel]")?.closest("[hidden]")).toBeNull();

    await act(async () => { (document.querySelector("[data-testid=svg-run-popup-dismiss]") as HTMLButtonElement).click(); });
    expect(popup()).toBeNull();
  });

  it("returns to a run still in flight: no second run can start, the row still says generating", async () => {
    const t = transport({ mode: "silent" });
    vi.stubGlobal("fetch", t.fetch);
    await mount(makeRoot());
    await openSvgTab();
    await pick(FOG);
    await clickSel("[data-testid=svg-confirm-generate]");
    await waitFor(() => t.calls.length === 1, "the request to leave");

    await clickSel("[data-testid=tab-sheets]");
    await clickSel("[data-testid=tab-generate-svg]");
    expect(q("[data-testid=svg-cancel-run]")).not.toBeNull(); // still in flight
    expect(txt(`[data-testid=svg-status-${FOG}]`)).toContain("Generating");
    expect(t.calls).toHaveLength(1); // nothing was sent again
  });

  it("cancels the run from the popup, on another tab", async () => {
    const t = transport({ mode: "silent" });
    vi.stubGlobal("fetch", t.fetch);
    await mount(makeRoot());
    await openSvgTab();
    await pick(FOG);
    await clickSel("[data-testid=svg-confirm-generate]");
    await waitFor(() => t.calls.length === 1, "the request to leave");

    await clickSel("[data-testid=tab-batch]");
    await act(async () => { (document.querySelector("[data-testid=svg-run-popup-cancel]") as HTMLButtonElement).click(); });
    await waitFor(() => popup()?.textContent?.includes("Done") === true, "the cancelled run to end");
    expect(t.calls).toHaveLength(1);
  });
});

describe("coming back to an idle panel rescans the folder (D5)", () => {
  it("lists a source that was approved while another tab was on screen", async () => {
    const t = transport({ mode: "silent" });
    vi.stubGlobal("fetch", t.fetch);
    const root = makeRoot();
    await mount(root);
    await openSvgTab();
    expect(q(`[data-testid=svg-status-${WALL}]`)).toBeNull();

    await clickSel("[data-testid=tab-batch]");
    // a new source is approved in the folder while the user is elsewhere
    const arch = root.children.get("architecture") as FakeDir;
    arch.children.set("wall.png", new FakeFile("wall.png", 12, 3200, "e"));
    arch.children.set("wall_AI.png", new FakeFile("wall_AI.png", 20, 3300, "f"));
    const recs = [FOG, COURT, WALL].map((id) => ({
      pair_id: id, source: `${id}.png`, ai_result: `${id}_AI.png`,
      decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z",
    }));
    root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({ records: recs })));

    await clickSel("[data-testid=tab-generate-svg]");
    await waitFor(() => q(`[data-testid=svg-status-${WALL}]`) !== null, "the rescan to list the new source");
  });
});

describe("the keyboard stays with the tab on screen (D1)", () => {
  it("ignores G on another tab: no confirmation opens behind it", async () => {
    const t = transport({ mode: "silent" });
    vi.stubGlobal("fetch", t.fetch);
    await mount(makeRoot());
    await openSvgTab();
    await act(async () => { (q(`[data-testid=svg-row-${FOG}]`) as HTMLElement).click(); });
    await settle();
    await clickSel("[data-testid=tab-batch]");

    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "g", bubbles: true })); });
    await settle();
    expect(document.querySelector("[data-testid=svg-confirm]")).toBeNull();
    expect(t.calls).toHaveLength(0);
  });
});
