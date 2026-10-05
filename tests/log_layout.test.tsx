// log_layout.test.tsx — the dock must never be able to block the app (the bug
// this port fixes). A real browser probe against arena/01a10c14 measured it:
// the dock's fixed band (y 663…900 at 1440×900) took the clicks meant for the
// row checkboxes painted underneath it, so a human click on a checkbox left it
// unselected. The gate below is what makes that impossible: the dock is a row
// of one app column, the tab area scrolls above it, and the floating toasts are
// lifted by the height the dock publishes.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetLogStore, setLogMinimized } from "../src/log/logstore";
import { resetAppStore } from "../src/state/appstore";
import Workbench from "../src/ui/Workbench";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let ui: Root;

const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const css = () => readFileSync(join(process.cwd(), "src/index.css"), "utf8");

/** One rule's declarations, so a value is asserted on the rule that owns it. */
function decls(sheet: string, selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = sheet.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
  return body.split(/[;\n]/).map((d) => d.trim()).filter(Boolean);
}
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const click = async (sel: string) => {
  await act(async () => { (q(sel) as HTMLButtonElement).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle();
};

function mount(): void {
  host = document.createElement("div");
  document.body.appendChild(host);
  ui = createRoot(host);
  act(() => { ui.render(<Workbench />); });
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
  document.documentElement.style.removeProperty("--app-dock-h");
  localStorage.clear();
  resetLogStore();
});

describe("the dock is a layout row, not an overlay (I-27)", () => {
  it("puts the scrolling tab area and the dock in one shell column, dock last", () => {
    const shell = q("[data-testid=app-shell]");
    const main = q("[data-testid=app-main]");
    const dock = q("[data-testid=log-dock]");
    expect(shell).not.toBeNull();
    expect(main).not.toBeNull();
    expect(dock).not.toBeNull();

    // The panels live in the scrolling region…
    expect(main?.contains(q("[data-testid=tabbar]"))).toBe(false);
    expect(shell?.contains(main)).toBe(true);
    // …the dock follows it as a sibling, so it can only take space, never cover.
    expect(main?.parentElement).toBe(shell);
    expect(main?.nextElementSibling).toBe(dock);
    expect(dock?.contains(main)).toBe(false);
  });

  it("never positions the dock over the content", () => {
    const dock = q("[data-testid=log-dock]") as HTMLElement;
    expect(dock.className).not.toMatch(/\bfixed\b/);
    expect(dock.className).not.toMatch(/\bsticky\b/);
    expect(dock.style.position).toBe("");
    // The dock's own wrapper paints no band of its own outside the column.
    expect(dock.className).not.toMatch(/\babsolute\b/);
  });

  it("sizes the shell as a viewport column and the panels from what is left", () => {
    const sheet = css();
    expect(sheet).toMatch(/\.app-shell\s*\{[^}]*display:\s*flex/);
    expect(sheet).toMatch(/\.app-shell\s*\{[^}]*flex-direction:\s*column/);
    expect(sheet).toMatch(/\.app-shell\s*\{[^}]*height:\s*100dvh/);
    expect(sheet).toMatch(/\.app-main\s*\{[^}]*overflow:\s*auto/);
    // The panels stop deriving their height from the viewport: they take the
    // row the shell gives them, so their inner list scrolls above the dock.
    expect(sheet).toMatch(/\.v2-shell\s*\{[^}]*height:\s*100%/);
    expect(sheet).toMatch(/\.svg-shell\s*\{[^}]*height:\s*100%/);
    // …and the panel is FLOORED at that band, never squeezed into it: with a
    // fixed height the SVG tab's list collapsed to zero rows (measured in the
    // browser at 1440x900), because its control block alone is taller than the
    // band. `min-height` lets a panel grow, and `.app-main` scrolls instead.
    expect(decls(sheet, ".v2")).toContain("min-height: 100%");
    expect(decls(sheet, ".svg")).toContain("min-height: 100%");
    expect(decls(sheet, ".v2")).not.toContain("height: 100%");
    expect(decls(sheet, ".svg")).not.toContain("height: 100%");
  });

  it("lifts the app's floating status above the dock's current height", () => {
    const sheet = css();
    // One published value (dockheight.ts) is what the fixed floats read.
    expect(sheet).toMatch(/--app-dock-h/);
    expect(sheet).toMatch(/\.svg-toast\s*\{[^}]*bottom:\s*calc\(var\(--app-dock-h/);
    expect(sheet).toMatch(/\.svg-busy\s*\{[^}]*bottom:\s*calc\(var\(--app-dock-h/);
    expect(sheet).toMatch(/\.toast-above-dock\s*\{[^}]*bottom:\s*calc\(var\(--app-dock-h/);
  });

  it("publishes its own height, and follows minimize/restore", async () => {
    const dockVar = () => document.documentElement.style.getPropertyValue("--app-dock-h");
    expect(dockVar()).toBe("236px"); // 36 head + 200 body, open by default
    await click("[data-testid=log-minimize]");
    expect(dockVar()).toBe("36px");
    act(() => setLogMinimized(false));
    expect(dockVar()).toBe("236px");
  });
});
