// @vitest-environment happy-dom
// builder_export_settings_ui.test.tsx — the builder's Export settings dialog
// (2026-11-17): the SAME rows and hints the upload dialog shows (ONE shared
// sheet), opened from the Export menu as a real modal over the panel, write-
// through to the builder's own persisted options, and the package entry that
// names the formats the next export writes.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BuilderFormatSettings } from "../src/svgBuilder/SvgBuilderFormatDialog";
import SvgBuilderExportMenu from "../src/svgBuilder/SvgBuilderExportMenu";
import { DEFAULT_FORMAT_OPTIONS, type ExportFormatOptions } from "../src/lib/exportformats";
import { saveBuilderFormats } from "../src/svgBuilder/formatstore";
import type { BuilderApi } from "../src/svgBuilder/useSvgBuilder";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { localStorage.clear(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

const q = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const all = (id: string) => [...host.querySelectorAll(`[data-testid="${id}"]`)];
const click = (id: string) => act(() => { (q(id) as HTMLInputElement).click(); });

let value: ExportFormatOptions;
let patches: Partial<ExportFormatOptions>[] = [];
let closed = 0;
const ARTBOARD = { width: 5500, height: 3000 };

/** The dialog is controlled: a patch re-renders with the next value, like the store-backed wrapper does. */
function render(initial: ExportFormatOptions) {
  value = initial;
  const paint = () => act(() => root.render(
    <BuilderFormatSettings value={value} artboard={ARTBOARD} onPatch={(patch) => {
      value = { ...value, ...patch }; patches.push(patch); paint();
    }} onClose={() => { closed += 1; }} />,
  ));
  paint();
}

describe("the builder export settings dialog", () => {
  it("is the upload flow's own popup: same backdrop, card and head, aria-modal, closed three ways", () => {
    closed = 0;
    render(DEFAULT_FORMAT_OPTIONS);
    const dialog = q("builder-format-dialog")!;
    // ui/exportmodal.tsx — the exact shell the SVG to upload dialog renders.
    const backdrop = dialog.closest(".svg-backdrop");
    expect(backdrop).not.toBeNull();
    expect(dialog.classList.contains("svg-modal")).toBe(true);
    expect(dialog.querySelector(".svg-modal-head h2")?.textContent).toMatch(/Export settings/);
    expect(dialog.querySelector(".svg-modal-body")).not.toBeNull();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-labelledby")).toBe(
      dialog.querySelector(".svg-modal-head h2")?.getAttribute("id"));
    click("builder-format-close");
    expect(closed).toBe(1);
    act(() => { (q("builder-format-backdrop") as HTMLElement).click(); });
    expect(closed).toBe(2);
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(closed).toBe(3);
  });

  it("does not close when the popup's own body is clicked", () => {
    closed = 0;
    render(DEFAULT_FORMAT_OPTIONS);
    act(() => { (q("builder-format-dialog") as HTMLElement).click(); });
    expect(closed).toBe(0);
  });

  it("shows every format row once — a PNG in place of the JPEG, with its MP and the sheet's own px (2026-11-23)", () => {
    render({ ...DEFAULT_FORMAT_OPTIONS, rescaleArtboard: true });
    for (const id of ["svg", "png", "eps", "converter", "mp", "mp-match", "optimize", "clean", "expand", "expandtext", "rescale", "rescale-mp", "rescale-strokes"]) {
      expect(all(`bld-set-${id}`), id).toHaveLength(1);
    }
    for (const id of ["jpeg", "quality"]) expect(q(`bld-set-${id}`), id).toBeNull(); // PNG is lossless: no quality
    expect(host.textContent).not.toMatch(/JPEG/);
    expect(host.textContent).toContain("Export PNG");
    expect(host.textContent).toContain("PNG (MP)");
    // 5500×3000 rescaled to a 20 MP area is 6055×3302 — the note names the file it will really write
    expect(q("bld-set-mp-note")?.textContent).toBe("the PNG is the artboard itself: 6055×3302 px — untick for a bigger file");
    expect(host.textContent).toContain("Export SVG");
    expect(host.textContent).toContain("Also write EPS");
    expect(host.textContent).toContain("Expand text to fills");
    expect(host.textContent).toContain("Rescale artboard to MP");
  });

  it("patches one option per gesture and clamps the numbers it accepts", () => {
    patches = [];
    render({ ...DEFAULT_FORMAT_OPTIONS, rescaleArtboard: true });
    click("bld-set-svg");
    click("bld-set-expandtext");
    click("bld-set-rescale-strokes");
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    const type = (id: string, next: string) => act(() => {
      const input = q(id) as HTMLInputElement;
      set?.call(input, next);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    click("bld-set-png");
    type("bld-set-rescale-mp", "999");
    expect(patches).toEqual([{ includeSvg: false }, { expandText: true }, { rescaleStrokes: false }, { includeJpeg: false }, { rescaleMegapixels: 64 }]);
  });

  it("names the built-in EPS writer's live-text limit before an export would fail that stage", () => {
    render({ ...DEFAULT_FORMAT_OPTIONS, includeEps: true });
    expect(q("builder-format-eps-note")?.textContent).toMatch(/Expand text to fills/);
    expect(q("builder-format-eps-note")?.textContent).toMatch(/Inkscape/);
    click("bld-set-expandtext"); // the outlines remove the limit
    expect(q("builder-format-eps-note")).toBeNull();
    click("bld-set-eps"); // nothing is written, nothing to warn about
    expect(q("builder-format-eps-note")).toBeNull();
  });

  it("drops that warning for the Inkscape converter, whose helper writes the text itself", () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, inkscape: { found: true, version: "1.3.2" } }), { status: 200 })));
    render({ ...DEFAULT_FORMAT_OPTIONS, includeEps: true, epsConverter: "inkscape" });
    expect(q("builder-format-eps-note")).toBeNull();
    expect(q("bld-eps-helper")).not.toBeNull();
  });

  it("offers the clean pass on by default and patches it in one gesture", () => {
    render(DEFAULT_FORMAT_OPTIONS);
    const box = q("bld-set-clean") as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(host.textContent).toContain("Clean up final SVG and EPS");
    click("bld-set-clean");
    expect(patches.at(-1)).toEqual({ cleanExport: false });
    expect(q("bld-set-clean")).not.toBeNull();
  });

  it("says so when every format is unticked — that package would ship nothing (SVG, PNG or EPS)", () => {
    render({ ...DEFAULT_FORMAT_OPTIONS, includeSvg: false, includeJpeg: false });
    expect(q("bld-set-formats-warning")?.textContent).toMatch(/at least one.*SVG, PNG or EPS/i);
    click("bld-set-eps");
    expect(q("bld-set-formats-warning")).toBeNull();
  });
});

describe("the Export menu", () => {
  function api(over: Record<string, unknown> = {}): BuilderApi {
    return {
      busy: null,
      root: { name: "icons" },
      config: { artboard: { width: 1080, height: 660 } },
      artboards: [{ id: "a1" }],
      artboardSel: { checked: [], activeId: null, anchorId: null },
      editingArtboardId: "a1",
      actions: {},
      ...over,
    } as unknown as BuilderApi;
  }

  const openMenu = () => act(() => { (q("builder-export-toggle") as HTMLButtonElement).click(); });

  it("opens the settings dialog from its own item", () => {
    let opened = 0;
    act(() => root.render(<SvgBuilderExportMenu b={api({ actions: { openExportFormats: () => { opened += 1; } } })} />));
    openMenu();
    expect(q("builder-export-formats")).not.toBeNull();
    click("builder-export-formats");
    expect(opened).toBe(1);
  });

  it("offers the package with the formats it will really write — EPS named when it is on", () => {
    let exported = 0;
    saveBuilderFormats({ ...DEFAULT_FORMAT_OPTIONS, includeEps: true, epsConverter: "inkscape" });
    act(() => root.render(<SvgBuilderExportMenu b={api({ actions: { exportSelectedArtboards: () => { exported += 1; } } })} />));
    openMenu();
    const item = q("builder-export-package")!;
    expect(item.textContent).toContain("SVG");
    expect(item.textContent).toContain("PNG"); // a PNG instead of the JPEG (2026-11-23)
    expect(item.textContent).not.toContain("JPEG");
    expect(item.textContent).toContain("EPS (Inkscape CLI (local helper))");
    expect(item.getAttribute("title") ?? "").toContain("_artboard_sheets");
    click("builder-export-package");
    expect(exported).toBe(1);
  });

  it("names the formats that are off instead of pretending the package has them", () => {
    saveBuilderFormats({ ...DEFAULT_FORMAT_OPTIONS, includeSvg: false, includeJpeg: false });
    act(() => root.render(<SvgBuilderExportMenu b={api()} />));
    openMenu();
    const text = q("builder-export-package")!.textContent ?? "";
    expect(text).toContain("SVG off");
    expect(text).not.toContain("JPEG"); // the builder writes a PNG instead (2026-11-23)
    expect(text).toContain("PNG off");
    expect(text).toContain("EPS off");
  });
});
