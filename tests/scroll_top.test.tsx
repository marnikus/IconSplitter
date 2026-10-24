// scroll_top.test.tsx — the corner "back to top" button: one control, rendered
// by the shell so it exists on every tab. Hidden while the scrolling tab area
// (app-main) sits at the top; appears after scrolling down; click returns the
// list to the top (feature §scroll-top, UI_SELECTORS §Q `scroll-top-btn`).
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAppStore } from "../src/state/appstore";
import Workbench from "../src/ui/Workbench";
import { settle as quietSettle } from "./helpers/quiet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TABS = ["tab-sheets", "tab-batch", "tab-selection-v2", "tab-generate-svg", "tab-upload"];

let host: HTMLDivElement;
let ui: Root;

const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const settle = () => quietSettle(0);
const click = async (sel: string) => {
  await act(async () => { (q(sel) as HTMLButtonElement).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle();
};
/** happy-dom paints no layout: give the scroll box real metrics. */
const sizeMain = (main: HTMLElement): void => {
  Object.defineProperty(main, "scrollHeight", { value: 2000, configurable: true });
  Object.defineProperty(main, "clientHeight", { value: 400, configurable: true });
};
const scrollTo = async (main: HTMLElement, top: number) => {
  await act(async () => {
    main.scrollTop = top;
    main.dispatchEvent(new Event("scroll"));
  });
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
  mount();
});

afterEach(() => {
  act(() => ui.unmount());
  host.remove();
  localStorage.clear();
});

describe("the scroll-to-top button", () => {
  it("exists on every tab and hides while the list is at the top", async () => {
    for (const tab of TABS) {
      await click(`[data-testid=${tab}]`);
      const btn = q("[data-testid=scroll-top-btn]");
      expect(btn, `button missing on ${tab}`).not.toBeNull();
      expect(btn?.hasAttribute("hidden"), `visible at the top on ${tab}`).toBe(true);
    }
  });

  it("appears after scrolling down and returns app-main to the top on click", async () => {
    const main = q("[data-testid=app-main]")!;
    sizeMain(main);
    await scrollTo(main, 600);
    const btn = q("[data-testid=scroll-top-btn]");
    expect(btn).not.toBeNull();
    expect(btn?.hasAttribute("hidden")).toBe(false);
    await click("[data-testid=scroll-top-btn]");
    expect(q("[data-testid=app-main]")!.scrollTop).toBe(0);
    expect(q("[data-testid=scroll-top-btn]")?.hasAttribute("hidden")).toBe(true);
  });
});
