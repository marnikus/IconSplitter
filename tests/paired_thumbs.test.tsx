// paired_thumbs.test.tsx — the ONE pair layout both tabs mount (I-55). The
// request asks for the same zoom/preview behaviour in Selection V2 and Generate
// SVG with one reusable implementation, so this file pins that implementation:
// two labelled slots with real px boxes, the label as an overlay (it must never
// change the box), and the stylesheet rules that make the boxes honest — no cap
// on width, no cropping, and a list that scrolls instead of squeezing an 800 px
// pair. The tab files test their own wiring on top of this.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it } from "vitest";
import PairedThumbs from "../src/ui/PairedThumbs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const css = () => readFileSync(join(process.cwd(), "src/index.css"), "utf8");

let host: HTMLDivElement;
let ui: Root;

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
  ui = createRoot(host);
});

function render(uiTree: React.ReactNode): void {
  act(() => { ui.render(uiTree); });
}

const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;

/** The px box a slot was given — the size the browser really lays out. */
function box(testid: string): { w: number; h: number } {
  const el = q(`[data-testid='${testid}']`) as HTMLElement;
  return { w: parseInt(el.style.width, 10), h: parseInt(el.style.height, 10) };
}

/** A pair at 800 px zoom: a 2:1 raster and a square vector. */
function renderPair() {
  render(<PairedThumbs slots={[
    { tag: "Original", testid: "slot-a", width: 1600, height: 800, children: <img alt="a" src="a.png" /> },
    { tag: "SVG v2", testid: "slot-b", width: 800, height: 800, className: "svg-preview-frame contrast",
      background: "#123456", attrs: { "data-bg": "#123456" }, children: <div className="svg-preview" /> },
  ]} />);
}

describe("PairedThumbs — two slots, real boxes, one layout", () => {
  it("lays the two previews out as one flex row", () => {
    renderPair();
    const row = q(".pair-thumbs") as HTMLElement;
    expect([...row.children].length).toBe(2);
    expect(css()).toMatch(/\.pair-thumbs\s*\{[^}]*display:\s*flex[^}]*gap:/);
  });

  it("gives every slot its own box in px and never squeezes it", () => {
    renderPair();
    expect(box("slot-a")).toEqual({ w: 1600, h: 800 }); // a 2:1 artwork is twice as wide as tall
    expect(box("slot-b")).toEqual({ w: 800, h: 800 });
    // flex: none — a flex item must not shrink below its own artwork's box
    expect(css()).toMatch(/\.pair-thumb\s*\{[^}]*flex:\s*none/);
  });

  it("keeps the label as an overlay inside the slot", () => {
    renderPair();
    const tags = [...host.querySelectorAll(".pair-thumb-tag")].map((t) => t.textContent);
    expect(tags).toEqual(["Original", "SVG v2"]);
    expect(css()).toMatch(/\.pair-thumb\s*\{[^}]*position:\s*relative/);
    expect(css()).toMatch(/\.pair-thumb-tag\s*\{[^}]*position:\s*absolute/);
    // the overlay must not swallow the clicks meant for the artwork behind it
    expect(css()).toMatch(/\.pair-thumb-tag\s*\{[^}]*pointer-events:\s*none/);
  });

  it("carries the tab's own frame on the slot without touching the layout", () => {
    renderPair();
    const framed = q("[data-testid='slot-b']") as HTMLElement;
    expect(framed.className).toBe("pair-thumb svg-preview-frame contrast");
    expect(framed.dataset.bg).toBe("#123456");
    expect(["#123456", "rgb(18, 52, 86)"].some((c) => framed.style.background.includes(c))).toBe(true);
    expect(box("slot-b")).toEqual({ w: 800, h: 800 }); // background is not a size
  });

  it("contains the media inside its box instead of cropping it", () => {
    renderPair();
    expect(css()).toMatch(/\.pair-thumb > img\s*\{[^}]*object-fit:\s*contain/);
    expect(css()).not.toMatch(/\.pair-thumb\s*\{[^}]*overflow:\s*hidden/);
    // one pair covers both tabs: the V2 cap that clipped wide pairs is gone
    expect(css()).not.toMatch(/max-width:\s*126px/);
  });
});

describe("the shared list scroller — 800 px is honoured, not squeezed", () => {
  it("reserves the pair's own width in both rows", () => {
    // max-content in the preview column of EVERY template that draws a preview:
    // the column is exactly as wide as the boxes I-55 computed, whatever ratio
    // they are — including the SVG-to-upload row, which shares the same rule
    const templates = css().match(/grid-template-columns:\s*34px\s*max-content[^;]*/g) ?? [];
    expect(templates.length).toBeGreaterThanOrEqual(2);
    expect(templates.some((t) => t.includes("280px"))).toBe(true); // the SVG row
    expect(templates.some((t) => t.includes("320px"))).toBe(true); // the V2 row
    expect(templates.some((t) => t.includes("240px"))).toBe(true); // the upload row
  });

  it("never sizes the preview column from the zoom value at any width", () => {
    // A breakpoint that computed the column as 2x --svg-thumb would be exactly
    // the clipping I-55 removed: at 800 px the pair is twice that wide.
    expect(css()).not.toMatch(/grid-template-columns:[^;]*calc\(var\(--svg-thumb\)/);
    expect(css()).not.toMatch(/grid-template-columns:[^;]*calc\(var\(--v2-thumb\)/);
  });

  it("scrolls the list sideways (and keeps the header) instead of clipping", () => {
    expect(css()).toMatch(/\.pair-table\s*\{[^}]*overflow:\s*auto/);
    expect(css()).toMatch(/\.pair-table > \.v2-columns,\s*\.pair-table > \.svg-columns\s*\{[^}]*position:\s*sticky/);
  });

  it("lets the row grow with the pair so neighbours cannot be painted over", () => {
    expect(css()).toMatch(/\.v2-row\s*\{[^}]*min-height:\s*calc\(var\(--v2-thumb\)/);
    expect(css()).toMatch(/\.svg-row\s*\{[^}]*min-height:\s*calc\(var\(--svg-thumb\)/);
  });
});
