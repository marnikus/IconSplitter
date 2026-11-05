// lazy_previews.test.tsx — lazy row previews in every list tab (2026-11-06).
// With "Lazy previews" on (the default, a top-bar checkbox), every row is still
// there, but a row's preview (image / SVG) mounts only when the row is among the
// first 20 or comes within 15 rows of the visible area; until then it is an
// empty box of the same size, so nothing is read or decoded for it. A preview
// that loaded stays (no reload, no flicker on scroll back). One shared observer
// per scroll area watches every placeholder. Off = everything loads at once.
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LazyPreview, { EAGER_ROWS, EDGE_ROWS, withRowIndexes } from "../src/ui/LazyPreview";
import { lazyPreviewsOn, setLazyPreviews, LAZY_PREVIEWS_KEY } from "../src/ui/lazypreviews";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A controllable IntersectionObserver: tests decide when an element is near. */
class FakeObserver {
  static all: FakeObserver[] = [];
  watched = new Set<Element>();
  constructor(public cb: IntersectionObserverCallback, public options: IntersectionObserverInit = {}) { FakeObserver.all.push(this); }
  observe(el: Element) { this.watched.add(el); }
  unobserve(el: Element) { this.watched.delete(el); }
  disconnect() { this.watched.clear(); }
  /** Reports every watched element as near (or not). */
  fire(near: boolean) {
    const entries = [...this.watched].map((target) => ({ target, isIntersecting: near }) as IntersectionObserverEntry);
    this.cb(entries, this as unknown as IntersectionObserver);
  }
}

let host: HTMLDivElement;
let ui: Root;
let mounts = 0;

function Art({ id }: { id: string }) {
  useEffect(() => { mounts += 1; }, []); // a real preview starts reading its file here
  return <i data-testid={`art-${id}`} />;
}

/** `n` rows in a scrolling list, each with a lazy preview. */
function List({ n }: { n: number }) {
  const rows = Array.from({ length: n }, (_, i) => (
    <div key={`r${i}`} data-testid={`row-${i}`}>row {i}<LazyPreview size={80}><Art id={String(i)} /></LazyPreview></div>
  ));
  return <div data-testid="scroller" style={{ overflowY: "auto", height: 300 }}>{withRowIndexes(rows)}</div>;
}

const render = (node: React.ReactNode) => act(async () => { ui.render(<>{node}</>); });
const q = (sel: string) => host.querySelector(sel);

beforeEach(() => {
  localStorage.removeItem(LAZY_PREVIEWS_KEY);
  FakeObserver.all = [];
  mounts = 0;
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  host = document.createElement("div");
  document.body.append(host);
  ui = createRoot(host);
});
afterEach(() => { act(() => ui.unmount()); host.remove(); vi.unstubAllGlobals(); localStorage.removeItem(LAZY_PREVIEWS_KEY); });

describe("the global switch", () => {
  it("is on by default and remembered", () => {
    expect(lazyPreviewsOn()).toBe(true);
    setLazyPreviews(false);
    expect(lazyPreviewsOn()).toBe(false);
    expect(localStorage.getItem(LAZY_PREVIEWS_KEY)).toBe("off");
  });
});

describe("LazyPreview in a list", () => {
  it("loads the first 20 rows at once and holds every later row as a same-size empty box", async () => {
    expect(EAGER_ROWS).toBe(20);
    await render(<List n={30} />);
    expect(mounts).toBe(20);
    expect(q("[data-testid=art-19]")).not.toBeNull();
    expect(q("[data-testid=art-20]")).toBeNull();
    expect(q("[data-testid=row-25]")?.textContent).toContain("row 25"); // the row itself is there
    const box = q("[data-testid=row-25] .lazy-preview") as HTMLElement;
    expect(box.style.height).toBe("80px");
  });

  it("mounts a preview when its row comes near, and keeps it after it scrolls away", async () => {
    await render(<List n={30} />);
    const observer = FakeObserver.all[0];
    await act(async () => { observer.fire(true); });
    expect(mounts).toBe(30);
    await act(async () => { observer.fire(false); });
    expect(q("[data-testid=art-25]")).not.toBeNull(); // stays: no reload, no flicker on the way back
    expect(mounts).toBe(30);
  });

  it("uses ONE observer for the whole list, on the list's own scroll area, looking 15 rows ahead", async () => {
    await render(<List n={60} />);
    expect(FakeObserver.all).toHaveLength(1);
    const { root, rootMargin } = FakeObserver.all[0].options;
    expect(root).toBe(q("[data-testid=scroller]"));
    const ahead = Number.parseInt(String(rootMargin), 10);
    expect(ahead).toBeGreaterThanOrEqual(EDGE_ROWS * 80);
    expect(FakeObserver.all[0].watched.size).toBe(40);
  });

  it("loads everything at once when the switch is off", async () => {
    setLazyPreviews(false);
    await render(<List n={30} />);
    expect(mounts).toBe(30);
    expect(host.querySelector(".lazy-preview")).toBeNull();
  });

  it("a preview outside any list (a dialog) and a browser without the observer both load at once", async () => {
    await render(<LazyPreview size={50}><Art id="dialog" /></LazyPreview>);
    expect(q("[data-testid=art-dialog]")).not.toBeNull();
    vi.stubGlobal("IntersectionObserver", undefined);
    mounts = 0;
    await render(<List n={25} />);
    expect(mounts).toBe(25);
  });
});

describe("wired into every list tab and the top bar", () => {
  const src = (p: string) => readFileSync(p, "utf8");
  it.each([
    "src/batch/ScanTable.tsx", "src/selectionv2/ReviewList.tsx", "src/svg/SvgList.tsx", "src/upload/UploadList.tsx", "src/stockupload/StockUploadList.tsx",
  ])("%s numbers its rows", (file) => { expect(src(file)).toContain("withRowIndexes("); });
  it.each([
    "src/batch/BatchThumbInfoCell.tsx", "src/selectionv2/ReviewRow.tsx", "src/svg/SvgRow.tsx", "src/upload/UploadRow.tsx", "src/stockupload/StockUploadRow.tsx",
  ])("%s wraps its preview", (file) => { expect(src(file)).toContain("<LazyPreview"); });
  it("the top bar has the switch", () => { expect(src("src/ui/Workbench.tsx")).toContain("<LazyPreviewsToggle"); });
});
