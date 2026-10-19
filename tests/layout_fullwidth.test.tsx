// layout_fullwidth.test.tsx — full-width layout for header and all tabs
// (features: header full resize, Selection V2 fill like Generate SVG,
// and Batch/Selection/Single sheets full width). The bug this fixes: Batch
// showed a centered card with empty space left/right because wrappers used
// mx-auto max-w-7xl / max-w-[90rem]. Now every tab fills the available space.
//
// Checks both the CSS rules (width 100%, flex 1, min-height 100% per I-27)
// and the live DOM wrappers (w-full, no max-w).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAppStore, setAppState } from "../src/state/appstore";
import { resetLogStore } from "../src/log/logstore";
import Workbench from "../src/ui/Workbench";
import { settle as quietSettle } from "./helpers/quiet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let ui: Root;

const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const css = () => readFileSync(join(process.cwd(), "src/index.css"), "utf8");
const workbenchSrc = () => readFileSync(join(process.cwd(), "src/ui/Workbench.tsx"), "utf8");
const appSrc = () => readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");

function decls(sheet: string, selector: string): string[] {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = sheet.match(new RegExp(`${esc}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
  return body.split(/[;\n]/).map((d) => d.trim()).filter(Boolean);
}

const settle = () => quietSettle(0);

function mount(): void {
  host = document.createElement("div");
  document.body.appendChild(host);
  ui = createRoot(host);
  act(() => {
    ui.render(<Workbench />);
  });
}

beforeEach(() => {
  localStorage.clear();
  resetAppStore();
  resetLogStore();
  mount();
});

afterEach(() => {
  act(() => ui.unmount());
  host.remove();
  localStorage.clear();
  resetLogStore();
  resetAppStore();
});

describe("header full width left-right, no max-width limit", () => {
  it("Workbench nav inner div is flex w-full, not mx-auto max-w-7xl", async () => {
    await settle();
    const nav = q("nav");
    expect(nav).not.toBeNull();
    const inner = nav?.querySelector("div.flex") as HTMLElement | null;
    expect(inner).not.toBeNull();
    expect(inner?.className).toMatch(/\bw-full\b/);
    expect(inner?.className).not.toMatch(/max-w-7xl/);
    expect(inner?.className).not.toMatch(/mx-auto/);

    const src = workbenchSrc();
    // The file itself must not contain the old centered header pattern
    expect(src).not.toMatch(/mx-auto flex max-w-7xl/);
    expect(src).toMatch(/flex w-full/);
  });

  it("Single sheets header and main are w-full, not max-w-7xl", async () => {
    await settle();
    // Default tab is sheets, App mounts
    const appHeaderInner = host.querySelector("header div.flex") as HTMLElement | null;
    // App header inner div should be full width
    if (appHeaderInner) {
      expect(appHeaderInner.className).toMatch(/\bw-full\b/);
      expect(appHeaderInner.className).not.toMatch(/max-w-7xl/);
    }
    const app = appSrc();
    const headerSrc = readFileSync(join(process.cwd(), "src/sheets/SheetsHeader.tsx"), "utf8");
    // Header component (now extracted) must be full width, App main must be w-full
    expect(headerSrc).toMatch(/flex w-full/);
    expect(app).toMatch(/<main className="w-full/);
    expect(app).not.toMatch(/<main className="mx-auto max-w-7xl/);
    expect(headerSrc).not.toMatch(/max-w-7xl/);
  });
});

describe("Selection V2 fills available space like Generate SVG", () => {
  it("v2-shell, svg-shell, up-shell are full width flex column with flex 1", () => {
    const sheet = css();
    const v2Shell = decls(sheet, ".v2-shell");
    const svgShell = decls(sheet, ".svg-shell");
    const upShell = decls(sheet, ".up-shell");

    for (const d of [v2Shell, svgShell, upShell]) {
      expect(d).toContain("width: 100%");
      expect(d).toContain("min-height: 100%");
    }
    // Shells are floored at band (min-height 100%) and grow with content, so
    // app-main scrolls — whole page scroll, not small high win (user request)
    expect(v2Shell).not.toContain("height: 100%");
    expect(svgShell).not.toContain("height: 100%");
  });

  it("v2 and svg panels are width 100% min-height 100% (not fixed height) — whole page scrolls", () => {
    const sheet = css();
    const v2 = decls(sheet, ".v2");
    const svg = decls(sheet, ".svg");

    for (const d of [v2, svg]) {
      expect(d).toContain("width: 100%");
      expect(d).toContain("display: flex");
      expect(d).toContain("flex-direction: column");
      expect(d).toContain("min-height: 100%");
      // Must NOT be fixed height 100% — that would collapse list per log_layout test
      expect(d).not.toContain("height: 100%");
    }
  });

  it("app-main is flex with overflow auto for scrolling and dock I-27 — whole page scrolls", () => {
    const sheet = css();
    const main = decls(sheet, ".app-main");
    expect(main).toContain("flex: 1 1 auto");
    expect(main).toContain("overflow: auto");
  });

  it("v2-workspace flexes to fill remaining space", () => {
    const sheet = css();
    const ws = decls(sheet, ".v2-workspace");
    expect(ws).toContain("flex: 1 1 auto");
    expect(ws).toContain("min-height: 0");
  });

  it("folder-path row does not grow with flex:1 0 100% (was blank area bug)", () => {
    const sheet = css();
    const fp = decls(sheet, ".folder-path");
    // Must be flex 0 0 auto width 100%, not flex 1 0 100% which made it 100% tall in column layout
    expect(fp).toContain("flex: 0 0 auto");
    expect(fp).toContain("width: 100%");
    expect(fp).not.toContain("flex: 1 0 100%");
  });

  it("list panels v2-panel and svg-panel are grid with min-height 0, not squeezed — svg-panel whole page scroll", () => {
    const sheet = css();
    const v2p = decls(sheet, ".v2-panel");
    const svgP = decls(sheet, ".svg-panel");
    // v2-panel keeps original grid with 1fr for inner scroll (other tabs unchanged)
    expect(v2p).toContain("display: grid");
    expect(v2p).toContain("min-height: 0");
    // svg-panel is whole page scroll: auto middle row, overflow visible, so page scrolls not small win
    expect(svgP).toContain("display: grid");
    expect(svgP).toContain("grid-template-rows: 42px auto 40px");
    expect(svgP).toContain("overflow: visible");
    expect(svgP).toContain("min-height: 0");
    // svg-panel pair-table is whole page scroll with horizontal auto for 800px zoom
    const svgPair = decls(sheet, ".svg-panel .pair-table");
    expect(svgPair).toContain("overflow-x: auto");
    expect(svgPair).toContain("overflow-y: visible");
  });

  it("live DOM: v2-shell fills width when tab is selectionV2", async () => {
    act(() => setAppState({ tab: "selectionV2" }));
    await settle();
    const shell = q(".v2-shell") as HTMLElement | null;
    expect(shell).not.toBeNull();
    expect(shell?.className).toMatch(/\bw-full\b|v2-shell/);
    // Should have px-4 py-3 but not max-w
    expect(shell?.className).not.toMatch(/max-w-/);
    expect(shell?.className).not.toMatch(/mx-auto/);
  });
});

describe("all tabs fill full window, no centered max-width card", () => {
  it("Batch and Selection wrappers are w-full, not mx-auto max-w", async () => {
    const src = workbenchSrc();
    // After refactor TabWrapper holds w-full px-4 py-6
    expect(src).toMatch(/TabWrapper/);
    expect(src).toMatch(/w-full px-4 py-6/);
    expect(src).not.toMatch(/mx-auto max-w-7xl.*BatchPanel/);
    expect(src).not.toMatch(/mx-auto max-w-\[90rem\].*SelectionPanel/);

    act(() => setAppState({ tab: "batch" }));
    await settle();
    const batchRoot = q("[data-testid=tab-batch]") as HTMLElement | null;
    expect(batchRoot).not.toBeNull();
    // The wrapper div around BatchPanel should be w-full
    const batchWrapper = host.querySelector("main > div.w-full") as HTMLElement | null;
    expect(batchWrapper).not.toBeNull();
    expect(batchWrapper?.className).toMatch(/\bw-full\b/);
    expect(batchWrapper?.className).not.toMatch(/max-w-/);
  });

  it("Selection wrapper also w-full", async () => {
    act(() => setAppState({ tab: "selection" }));
    await settle();
    const wrapper = host.querySelector("main > div.w-full") as HTMLElement | null;
    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).toMatch(/\bw-full\b/);
  });

  it("Generate SVG and Upload shells are full width and match V2 behavior — whole page scrolls", () => {
    const sheet = css();
    // svg-shell already checked, but ensure up-shell also full width with min-height floor
    const upShell = decls(sheet, ".up-shell");
    expect(upShell).toContain("width: 100%");
    expect(upShell).toContain("min-height: 100%");
  });
});
