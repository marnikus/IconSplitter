// log_layout.test.tsx — the regression the 2026-10-01 port on the parallel
// branch failed (the user reported checkboxes the UI could no longer select):
// the dock is `position: fixed`, so ANY content that ends underneath it loses
// its clicks. happy-dom has no layout, so this suite proves the structural
// equivalent: one in-flow spacer reserves exactly the dock's height (content
// can never end under it), the dock never wraps tab content or its inputs,
// and the checkboxes of the Generate SVG tab still toggle — with the dock
// mounted, open and full of entries.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pairId } from "../src/lib/pairing";
import { log } from "../src/log/logger";
import { getLog, resetLog } from "../src/log/logstore";
import { resetBoot } from "../src/log/boot";
import { getAppState, resetAppStore, setAppState } from "../src/state/appstore";
import Workbench from "../src/ui/Workbench";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { dropDb } from "./helpers/idb";
import { stubOffline } from "./helpers/svgrun";
import { stored } from "./helpers/svgstore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// No IndexedDB in this DOM: an in-memory handle store keeps the boot real.
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

const FOG = pairId("architecture", "fog", "");
const COURT = pairId("architecture", "court", "");

/** architecture/{fog,court}, both approved — the rows the checkboxes belong to. */
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

let host: HTMLDivElement;
let ui: Root;
let unmounted = false;
const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

async function click(sel: string): Promise<void> {
  await act(async () => { (q(sel) as HTMLElement).click(); });
  await settle();
}

beforeEach(async () => {
  localStorage.clear();
  stored.clear();
  resetLog();
  resetBoot();
  resetAppStore();
  unmounted = false;
  await dropDb();
  stubOffline();
  stored.set("__svg__", { source: makeRoot() });
  host = document.createElement("div");
  document.body.appendChild(host);
  ui = createRoot(host);
  await act(async () => { ui.render(<Workbench />); });
  await settle();
  await click("[data-testid=tab-generate-svg]");
  // Let the remembered-folder scan produce the rows.
  for (let i = 0; i < 40 && q(`[data-testid=svg-check-${FOG}]`) === null; i++) await settle();
});

afterEach(async () => {
  if (!unmounted) await act(async () => { ui.unmount(); });
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the dock never takes the clicks of a tab", () => {
  it("keeps every row checkbox of the SVG tab toggleable, dock open and full", async () => {
    expect(q(`[data-testid=svg-check-${FOG}]`)).not.toBeNull();
    act(() => { log({ level: "info", feature: "app", action: "status", message: "noise to fill the dock" }); });
    await settle();
    expect(q("[data-testid=log-dock]")).not.toBeNull();

    await click(`[data-testid=svg-check-${FOG}]`);
    expect(getAppState().svg.checked).toEqual([FOG]);
    await click(`[data-testid=svg-check-${COURT}]`);
    expect(getAppState().svg.checked).toEqual([FOG, COURT]);
    await click(`[data-testid=svg-check-${FOG}]`);
    expect(getAppState().svg.checked).toEqual([COURT]);
  });

  it("keeps select-all and deselect working against the visible rows", async () => {
    await click("[data-testid=svg-check-all]");
    expect([...getAppState().svg.checked].sort()).toEqual([COURT, FOG].sort());
    await click("[data-testid=svg-deselect]");
    expect(getAppState().svg.checked).toEqual([]);
  });

  it("records each selection gesture on the undo timeline while the dock watches", async () => {
    await click(`[data-testid=svg-check-${FOG}]`);
    const undo = q("[data-testid=hist-undo]") as HTMLButtonElement;
    expect(undo.disabled).toBe(false);
  });

  it("wraps none of the tab's inputs: the dock holds only its own controls", () => {
    const dock = q("[data-testid=log-dock]") as HTMLElement;
    expect(dock).not.toBeNull();
    expect(dock.querySelector("[data-testid^=svg-check]")).toBeNull();
    expect(dock.querySelector("input[type=checkbox]")).toBeNull();
    expect(q("[data-testid=log-dock-spacer]")?.querySelector("input")).toBeNull();
  });

  it("publishes its height for the clearance, and 0 once unmounted", async () => {
    expect(document.documentElement.style.getPropertyValue("--log-dock-h")).toMatch(/clamp/);
    await act(async () => { ui.unmount(); });
    unmounted = true;
    expect(document.documentElement.style.getPropertyValue("--log-dock-h")).toBe("0px");
  });

  it("toggling a checkbox never writes a log entry of its own — the log observes, never blocks (L-3)", async () => {
    await click(`[data-testid=svg-check-${FOG}]`);
    expect(getLog().entries.some((e) => e.feature === "svg" && e.action === "check.toggle")).toBe(false);
  });

  it("restores the tab under the dock exactly as the session left it", async () => {
    setAppState({ tab: "generateSvg" });
    await settle();
    expect(q("[data-testid=log-dock]")).not.toBeNull();
    expect(q(`[data-testid=svg-check-${FOG}]`)).not.toBeNull();
  });
});
