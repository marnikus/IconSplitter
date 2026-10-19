// svg_pinned_bulkbar.test.tsx — the Generate SVG bulk bar (selection, preview
// background, zoom, the bulk actions) pins to the top while the user scrolls the
// rows (user request 2026-10-19, screenshot) — the Batch tab's pinned bar
// (batch_pinned_bulkbar.test.tsx) is the precedent. CSS does the pinning (the
// scroll container is .app-main); these gates pin the CONTRACT: the sticky rule
// exists, and the bar sits in the pin as a direct child of the tab's full-height
// .svg column, between the controls and the rows.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { installSvgPanelHooks, makeRoot, mount, q } from "./helpers/svgpanel";

installSvgPanelHooks();

const css = () => readFileSync(join(process.cwd(), "src/index.css"), "utf8");

/** Declarations of `selector`'s rule block, whitespace removed. */
function decls(sheet: string, selector: string): string[] {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const out: string[] = [];
  for (const m of sheet.matchAll(new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`, "g"))) {
    for (const d of m[1].split(";")) if (d.trim()) out.push(d.replace(/\s/g, ""));
  }
  return out;
}

describe("pinned SVG bulk bar — the CSS contract", () => {
  it(".svg-bulkbar-pin is sticky at the top of the scroll container, above the rows", () => {
    const rule = decls(css(), ".svg-bulkbar-pin");
    expect(rule).toContain("position:sticky");
    expect(rule).toContain("top:0");
    // above row content and the sticky column header (z-index 2), below modals (30)
    const z = Number(rule.find((d) => d.startsWith("z-index:"))?.slice(8));
    expect(z).toBeGreaterThan(2);
    expect(z).toBeLessThan(30);
  });
});

describe("pinned SVG bulk bar — the DOM contract", () => {
  it("the pin wraps the whole bulk bar: selection, zoom and the bulk actions", async () => {
    await mount(await makeRoot());
    const pin = q("[data-testid=svg-bulkbar-pin]");
    expect(pin).not.toBeNull();
    expect(pin!.querySelector("[data-testid=svg-bulk]")).not.toBeNull();
    expect(pin!.querySelector("[data-testid=svg-check-all]")).not.toBeNull();
  });

  it("the pin is a direct child of the full-height tab column (a sticky box must span the list)", async () => {
    await mount(await makeRoot());
    const pin = q("[data-testid=svg-bulkbar-pin]")!;
    expect(pin.parentElement).toBe(q("[data-testid=svg-panel]"));
  });

  it("visual order preserved: controls, then the pin, then the rows", async () => {
    await mount(await makeRoot());
    const pin = q("[data-testid=svg-bulkbar-pin]")!;
    const controls = q(".svg-controls")!;
    const list = q("[data-testid=svg-list]")!;
    expect(controls.compareDocumentPosition(pin) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(pin.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });
});
