// scroll_memory.test.tsx — after a reload the user is back where they were
// (2026-11-06): every tab's scroll position is remembered (and restored when
// the rows have loaded, or when the tab is opened again); a list scrolls its
// restored active row into view the first time that row appears; opening a row
// in the SVG edit mode makes it the active row, so the last edited row is the
// one the user comes back to.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCROLL_MEMORY_KEY, useScrollMemory } from "../src/ui/scrollmemory";
import { useCheckedRows } from "../src/ui/checkedrows";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let ui: Root;
beforeEach(() => { localStorage.removeItem(SCROLL_MEMORY_KEY); host = document.createElement("div"); document.body.append(host); ui = createRoot(host); });
afterEach(() => { act(() => ui.unmount()); host.remove(); vi.restoreAllMocks(); });

/** A scroll box with room to scroll (happy-dom has no layout). */
function Main({ tab }: { tab: string }) {
  const ref = { current: null as HTMLElement | null };
  return <Inner tab={tab} refBox={ref} />;
}
function Inner({ tab, refBox }: { tab: string; refBox: { current: HTMLElement | null } }) {
  useScrollMemory(refBox, tab);
  return (
    <main data-testid="main" ref={(el) => {
      refBox.current = el;
      if (el) Object.defineProperty(el, "scrollHeight", { configurable: true, value: 5000 });
    }} />
  );
}
const main = () => host.querySelector("[data-testid=main]") as HTMLElement;
const scrollTo = async (y: number) => { await act(async () => { main().scrollTop = y; main().dispatchEvent(new Event("scroll")); await new Promise((r) => setTimeout(r, 260)); }); };
const frames = () => act(async () => { await new Promise((r) => setTimeout(r, 120)); });

describe("scroll position per tab", () => {
  it("is saved as the user scrolls and restored after a reload", async () => {
    await act(async () => { ui.render(<Main tab="generateSvg" />); });
    await scrollTo(1234);
    expect(JSON.parse(localStorage.getItem(SCROLL_MEMORY_KEY) ?? "{}").generateSvg).toBe(1234);
    act(() => ui.unmount());
    ui = createRoot(host); // the reload
    await act(async () => { ui.render(<Main tab="generateSvg" />); });
    await frames();
    expect(main().scrollTop).toBe(1234);
  });

  it("each tab keeps its own position when switching tabs", async () => {
    await act(async () => { ui.render(<Main tab="generateSvg" />); });
    await scrollTo(800);
    await act(async () => { ui.render(<Main tab="upload" />); });
    await frames();
    expect(main().scrollTop).toBe(0);
    await scrollTo(300);
    await act(async () => { ui.render(<Main tab="generateSvg" />); });
    await frames();
    expect(main().scrollTop).toBe(800);
  });
});

describe("the restored active row", () => {
  function List({ ids, active }: { ids: string[]; active: string }) {
    const register = useCheckedRows([], active, true);
    return <>{ids.map((id) => <div key={id} data-id={id} ref={(n) => register(id, n)}><input type="checkbox" /></div>)}</>;
  }

  it("is scrolled into view the first time it appears (rows load after the reload)", async () => {
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scroll });
    await act(async () => { ui.render(<List ids={[]} active="b" />); });
    expect(scroll).not.toHaveBeenCalled();
    await act(async () => { ui.render(<List ids={["a", "b", "c"]} active="b" />); });
    await frames();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect((scroll.mock.contexts[0] as HTMLElement).dataset.id).toBe("b");
    await act(async () => { ui.render(<List ids={["a", "b", "c", "d"]} active="b" />); });
    await frames();
    expect(scroll).toHaveBeenCalledTimes(1); // only once
  });
});

describe("wired", () => {
  const src = (p: string) => readFileSync(p, "utf8");
  it("the shell remembers the scroll; the edit mode marks the row it opens as active", () => {
    expect(src("src/ui/Workbench.tsx")).toContain("useScrollMemory(");
    expect(src("src/svg/pathedit/SvgEditModal.tsx")).toContain("patchSvg({ activeId");
  });
});
